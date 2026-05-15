/**
 * BoneScript Capability Body Emitter
 *
 * Translates IR effects and preconditions into real TypeScript + SQL.
 *
 * Performance strategies applied (PERF-003):
 *
 * 1. Entity fetches — same-table fetches batched into WHERE id = ANY($1::uuid[])
 *    and resolved with a Map lookup. Different-table fetches run in parallel via
 *    Promise.all rather than sequentially.
 *
 * 2. Effect batching — multiple effects targeting the same entity+table are
 *    collapsed into a single UPDATE ... SET a=$1, b=$2 ... WHERE id = $n
 *    instead of one UPDATE per field.
 *
 * 3. LIST queries — combined with COUNT(*) OVER() window function to avoid a
 *    separate COUNT(*) round-trip (handled in emit_router.ts).
 */

import * as IR from "./ir";

// ─── Expression Parser ────────────────────────────────────────────────────────

type ExprKind =
  | { kind: "literal"; value: string; raw: string }
  | { kind: "field"; path: string[] }
  | { kind: "binop"; op: string; left: Expr; right: Expr }
  | { kind: "call"; name: string; args: Expr[] };

type Expr = ExprKind;

function parseExprStr(s: string): Expr {
  s = s.trim();
  if (s.startsWith("(") && s.endsWith(")")) return parseExprStr(s.slice(1, -1));
  if (s.startsWith('"') && s.endsWith('"')) return { kind: "literal", value: s.slice(1, -1), raw: s };
  if (/^-?\d+(\.\d+)?$/.test(s)) return { kind: "literal", value: s, raw: s };
  if (s === "true" || s === "false") return { kind: "literal", value: s, raw: s };

  const binOps = [" or ", " and ", " == ", " != ", " >= ", " <= ", " > ", " < ", " in ", " contains ", " + ", " - ", " * ", " / "];
  for (const op of binOps) {
    const idx = findBinOp(s, op);
    if (idx !== -1) {
      return { kind: "binop", op: op.trim(), left: parseExprStr(s.slice(0, idx)), right: parseExprStr(s.slice(idx + op.length)) };
    }
  }

  const callMatch = s.match(/^(\w+)\((.*)?\)$/);
  if (callMatch) {
    const args = callMatch[2] ? splitArgs(callMatch[2]).map(parseExprStr) : [];
    return { kind: "call", name: callMatch[1], args };
  }

  if (/^[\w.]+$/.test(s)) return { kind: "field", path: s.split(".") };
  return { kind: "literal", value: s, raw: s };
}

function findBinOp(s: string, op: string): number {
  let depth = 0;
  for (let i = 0; i <= s.length - op.length; i++) {
    const ch = s[i];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (depth === 0 && s.slice(i, i + op.length) === op) return i;
  }
  return -1;
}

function splitArgs(s: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) { args.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

// ─── Entity Resolution ────────────────────────────────────────────────────────

interface EntityFetch {
  paramName: string;
  entityType: string;
  tableName: string;
  idField: string;
}

function toSnakeCase(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

function getEntityFetches(method: IR.IRMethod, mod: IR.IRModule, system: IR.IRSystem): EntityFetch[] {
  const fetches: EntityFetch[] = [];
  const seen = new Set<string>();

  const allModels = new Map<string, string>();
  for (const m of system.modules) {
    for (const model of m.models) {
      allModels.set(model.name, toSnakeCase(model.name) + "s");
      allModels.set(model.name.toLowerCase(), toSnakeCase(model.name) + "s");
    }
  }

  for (const param of method.input) {
    const tableName = allModels.get(param.type) || allModels.get(param.type.toLowerCase());
    if (tableName && !seen.has(param.name)) {
      seen.add(param.name);
      fetches.push({ paramName: param.name, entityType: param.type, tableName, idField: param.name + "_id" });
    }
  }

  return fetches;
}

// ─── Precondition Compiler ────────────────────────────────────────────────────

function compilePrecondition(expr: Expr, indent: string): string {
  const condition = exprToTs(expr, true);
  const description = exprToDescription(expr).replace(/"/g, '\\"');
  return [
    `${indent}if (${condition}) {`,
    `${indent}  return res.status(422).json({ error: { code: "PRECONDITION_FAILED", message: ${JSON.stringify(description)} } });`,
    `${indent}}`,
  ].join("\n");
}

function exprToTs(expr: Expr, negate = false): string {
  const inner = exprToTsInner(expr);
  return negate ? `!(${inner})` : inner;
}

function exprToTsInner(expr: Expr): string {
  switch (expr.kind) {
    case "literal":
      if (expr.value === "true") return "true";
      if (expr.value === "false") return "false";
      if (/^"/.test(expr.raw)) return expr.raw;
      return expr.value;
    case "field":
      return expr.path.join("?.");
    case "binop": {
      const l = exprToTsInner(expr.left);
      const r = exprToTsInner(expr.right);
      switch (expr.op) {
        case "==": return `${l} === ${r}`;
        case "!=": return `${l} !== ${r}`;
        case "and": return `(${l} && ${r})`;
        case "or":  return `(${l} || ${r})`;
        case "in":  return `[${r}].flat().includes(${l})`;
        case "contains": return `${l}?.includes(${r})`;
        default: return `${l} ${expr.op} ${r}`;
      }
    }
    case "call":
      if (expr.name === "now") return "new Date()";
      return `${expr.name}(${expr.args.map(exprToTsInner).join(", ")})`;
  }
}

function exprToDescription(expr: Expr): string {
  switch (expr.kind) {
    case "literal": return expr.raw;
    case "field":   return expr.path.join(".");
    case "binop": return `${exprToDescription(expr.left)} ${expr.op} ${exprToDescription(expr.right)}`;
    case "call":  return `${expr.name}(${expr.args.map(exprToDescription).join(", ")})`;
  }
}

// ─── Effect Compiler ──────────────────────────────────────────────────────────

interface CompiledEffect {
  tableName: string;
  entityParam: string;
  idParam: string;
  // For batched UPDATE: list of (column, paramPlaceholder, tsValue) tuples
  assignments: { column: string; placeholder: string; tsValue: string }[];
  description: string;
  // For non-batchable effects (JSONB, array ops) — emitted as standalone query
  standalone?: { sql: string; params: string[] };
}

/**
 * Compile a single effect into a structured form.
 * Returns null if the effect target can't be resolved.
 */
function compileEffect(
  effect: IR.IREffect,
  mod: IR.IRModule,
  system: IR.IRSystem,
  paramIdx: { n: number },
  method?: IR.IRMethod,
): CompiledEffect | null {
  const targetParts = effect.target.split(".");
  if (targetParts.length < 2) return null;

  const entityParam = targetParts[0];
  const fieldName   = targetParts[1];
  const nestedPath  = targetParts.slice(2);

  // Resolve the model: first try matching by param name → entity type via method inputs,
  // then fall back to matching by entity name directly.
  const model = (() => {
    // If we have method context, resolve the param name to its entity type
    if (method) {
      const param = method.input.find(p => p.name === entityParam);
      if (param) {
        for (const m of system.modules) {
          const found = m.models.find(mdl => mdl.name === param.type || mdl.name.toLowerCase() === param.type.toLowerCase());
          if (found) return found;
        }
      }
    }
    // Fall back to matching by entity name directly
    for (const m of system.modules) {
      const found = m.models.find(mdl =>
        toSnakeCase(mdl.name) === entityParam || mdl.name.toLowerCase() === entityParam.toLowerCase()
      );
      if (found) return found;
    }
    return mod.models.find(m =>
      toSnakeCase(m.name) === entityParam || m.name.toLowerCase() === entityParam.toLowerCase()
    );
  })();
  if (!model) return null;

  const tableName = toSnakeCase(model.name) + "s";
  const valueTs   = exprToTsInner(parseExprStr(effect.value));
  const idParam   = `req.body.${entityParam}_id || req.params.id`;

  // JSONB nested path — must be standalone (jsonb_set can't be batched cleanly)
  if (nestedPath.length > 0) {
    const p1 = `$${paramIdx.n++}`;
    const p2 = `$${paramIdx.n++}`;
    const jsonbPathLiteral = `'{${nestedPath.join(",")}}'`;
    // Use to_jsonb($1) directly — casting via ::text loses type information for
    // non-string values (numbers, booleans, objects). to_jsonb() handles all
    // PostgreSQL types correctly without an intermediate text cast.
    return {
      tableName, entityParam, idParam,
      assignments: [],
      description: `${effect.target} = ${effect.value}`,
      standalone: {
        sql: `UPDATE ${tableName} SET ${fieldName} = jsonb_set(COALESCE(${fieldName}, '{}'), ${jsonbPathLiteral}, to_jsonb(${p1}), true), updated_at = NOW() WHERE id = ${p2} RETURNING *`,
        params: [valueTs, idParam],
      },
    };
  }

  const fieldType = model.fields.find(f => f.name === fieldName)?.type || "";
  const isNumeric = ["uint", "int", "float"].includes(fieldType);

  switch (effect.op) {
    case "assign": {
      const p1 = `$${paramIdx.n++}`;
      return {
        tableName, entityParam, idParam,
        assignments: [{ column: fieldName, placeholder: p1, tsValue: valueTs }],
        description: `${effect.target} = ${effect.value}`,
      };
    }
    case "add": {
      const p1 = `$${paramIdx.n++}`;
      if (isNumeric) {
        return {
          tableName, entityParam, idParam,
          assignments: [{ column: `${fieldName} = ${fieldName} + `, placeholder: p1, tsValue: valueTs }],
          description: `${effect.target} += ${effect.value}`,
        };
      }
      // Array append — standalone
      const p2 = `$${paramIdx.n++}`;
      return {
        tableName, entityParam, idParam,
        assignments: [],
        description: `${effect.target} += ${effect.value}`,
        standalone: {
          sql: `UPDATE ${tableName} SET ${fieldName} = ${fieldName} || jsonb_build_array(${p1}::jsonb), updated_at = NOW() WHERE id = ${p2} RETURNING *`,
          params: [valueTs, idParam],
        },
      };
    }
    case "remove": {
      const p1 = `$${paramIdx.n++}`;
      if (isNumeric) {
        return {
          tableName, entityParam, idParam,
          assignments: [{ column: `${fieldName} = ${fieldName} - `, placeholder: p1, tsValue: valueTs }],
          description: `${effect.target} -= ${effect.value}`,
        };
      }
      // Array remove — standalone
      const p2 = `$${paramIdx.n++}`;
      return {
        tableName, entityParam, idParam,
        assignments: [],
        description: `${effect.target} -= ${effect.value}`,
        standalone: {
          sql: `UPDATE ${tableName} SET ${fieldName} = (SELECT jsonb_agg(elem) FROM jsonb_array_elements(${fieldName}) elem WHERE elem != ${p1}::jsonb), updated_at = NOW() WHERE id = ${p2} RETURNING *`,
          params: [valueTs, idParam],
        },
      };
    }
  }
}

// ─── Effect Batching ──────────────────────────────────────────────────────────
// Groups effects targeting the same (tableName, entityParam) into a single UPDATE.

interface BatchedUpdate {
  tableName: string;
  entityParam: string;
  idParam: string;
  setClauses: string[];   // e.g. ["hp = $1", "xp = xp + $2"]
  paramValues: string[];  // TypeScript expressions for each $n
  descriptions: string[];
}

function batchEffects(compiled: (CompiledEffect | null)[]): {
  batches: BatchedUpdate[];
  standalones: { sql: string; params: string[]; description: string }[];
} {
  const batches = new Map<string, BatchedUpdate>(); // key: `${tableName}::${entityParam}::${idParam}`
  const standalones: { sql: string; params: string[]; description: string }[] = [];

  // Re-number parameters globally across all batches
  let globalParamN = 1;

  for (const effect of compiled) {
    if (!effect) continue;

    if (effect.standalone) {
      // Re-number the standalone params
      let sql = effect.standalone.sql;
      const params = effect.standalone.params;
      const renumbered: string[] = [];
      let localN = 1;
      for (const p of params) {
        sql = sql.replace(`$${localN}`, `$${globalParamN}`);
        renumbered.push(p);
        globalParamN++;
        localN++;
      }
      standalones.push({ sql, params: renumbered, description: effect.description });
      continue;
    }

    if (effect.assignments.length === 0) continue;

    const key = `${effect.tableName}::${effect.entityParam}::${effect.idParam}`;
    if (!batches.has(key)) {
      batches.set(key, {
        tableName: effect.tableName,
        entityParam: effect.entityParam,
        idParam: effect.idParam,
        setClauses: [],
        paramValues: [],
        descriptions: [],
      });
    }
    const batch = batches.get(key)!;

    for (const { column, placeholder, tsValue } of effect.assignments) {
      // column may be "fieldName" (assign) or "fieldName = fieldName + " (numeric add/remove)
      if (column.includes(" = ")) {
        // Numeric add/remove: column is already "field = field + " — append placeholder
        batch.setClauses.push(`${column}$${globalParamN}`);
      } else {
        batch.setClauses.push(`${column} = $${globalParamN}`);
      }
      batch.paramValues.push(tsValue);
      globalParamN++;
    }
    batch.descriptions.push(effect.description);
  }

  return { batches: Array.from(batches.values()), standalones };
}

// ─── Main Capability Body Emitter ─────────────────────────────────────────────

export function emitCapabilityBody(
  method: IR.IRMethod,
  mod: IR.IRModule,
  system: IR.IRSystem,
  indent: string = "    ",
): string {
  const lines: string[] = [];
  const fetches = getEntityFetches(method, mod, system);

  // 0. Destructure primitive params
  const primitiveParams = method.input.filter(p => {
    const isPrimitive = ["string", "uint", "int", "float", "bool", "timestamp", "uuid", "bytes", "json"].includes(p.type);
    const isListOrSet = p.type.startsWith("list<") || p.type.startsWith("set<");
    return (isPrimitive || isListOrSet) && !fetches.some(f => f.paramName === p.name);
  });
  if (primitiveParams.length > 0) {
    lines.push(`${indent}const { ${primitiveParams.map(p => p.name).join(", ")} } = req.body;`);
    lines.push(``);
  }

  // 1. Fetch entities — batch same-table fetches, parallelize different-table fetches
  if (fetches.length > 0) {
    lines.push(`${indent}// Fetch entities`);

    // Group fetches by table
    const byTable = new Map<string, EntityFetch[]>();
    for (const f of fetches) {
      if (!byTable.has(f.tableName)) byTable.set(f.tableName, []);
      byTable.get(f.tableName)!.push(f);
    }

    const fetchGroups = Array.from(byTable.entries());

    if (fetchGroups.length === 1 && fetchGroups[0][1].length === 1) {
      // Single fetch — simple queryOne
      const f = fetchGroups[0][1][0];
      const idExpr = `req.body.${f.idField} || req.params.id`;
      lines.push(`${indent}const ${f.paramName} = await queryOne(\`SELECT * FROM ${f.tableName} WHERE id = $1\`, [${idExpr}]);`);
      lines.push(`${indent}if (!${f.paramName}) {`);
      lines.push(`${indent}  return res.status(404).json({ error: { code: "NOT_FOUND", message: "${f.paramName} not found" } });`);
      lines.push(`${indent}}`);

    } else if (fetchGroups.length === 1 && fetchGroups[0][1].length > 1) {
      // Multiple fetches from the SAME table — batch into WHERE id = ANY($1::uuid[])
      const [tableName, group] = fetchGroups[0];
      const idExprs = group.map(f => `req.body.${f.idField} || req.params.id`);
      lines.push(`${indent}// Batch fetch: ${group.map(f => f.paramName).join(", ")} from ${tableName} in one query`);
      lines.push(`${indent}const __ids_${tableName} = [${idExprs.join(", ")}];`);
      lines.push(`${indent}const __rows_${tableName} = await query(\`SELECT * FROM ${tableName} WHERE id = ANY($1::uuid[])\`, [__ids_${tableName}]);`);
      lines.push(`${indent}const __map_${tableName} = new Map(__rows_${tableName}.map((r: any) => [r.id, r]));`);
      for (const f of group) {
        const idExpr = `req.body.${f.idField} || req.params.id`;
        lines.push(`${indent}const ${f.paramName} = __map_${tableName}.get(${idExpr}) ?? null;`);
        lines.push(`${indent}if (!${f.paramName}) {`);
        lines.push(`${indent}  return res.status(404).json({ error: { code: "NOT_FOUND", message: "${f.paramName} not found" } });`);
        lines.push(`${indent}}`);
      }

    } else {
      // Multiple fetches from DIFFERENT tables — run in parallel with Promise.all
      lines.push(`${indent}// Parallel fetch from ${fetchGroups.length} tables`);
      const resultVars: string[] = [];
      const fetchExprs: string[] = [];

      for (const [tableName, group] of fetchGroups) {
        if (group.length === 1) {
          const f = group[0];
          const idExpr = `req.body.${f.idField} || req.params.id`;
          resultVars.push(`__r_${f.paramName}`);
          fetchExprs.push(`queryOne(\`SELECT * FROM ${tableName} WHERE id = $1\`, [${idExpr}])`);
        } else {
          // Same-table batch within a multi-table parallel fetch
          const idExprs = group.map(f => `req.body.${f.idField} || req.params.id`);
          resultVars.push(`__rows_${tableName}`);
          fetchExprs.push(`query(\`SELECT * FROM ${tableName} WHERE id = ANY($1::uuid[])\`, [[${idExprs.join(", ")}]])`);
        }
      }

      lines.push(`${indent}const [${resultVars.join(", ")}] = await Promise.all([`);
      for (const expr of fetchExprs) lines.push(`${indent}  ${expr},`);
      lines.push(`${indent}]);`);

      // Unpack results
      let resultIdx = 0;
      for (const [tableName, group] of fetchGroups) {
        if (group.length === 1) {
          const f = group[0];
          lines.push(`${indent}const ${f.paramName} = ${resultVars[resultIdx]};`);
          lines.push(`${indent}if (!${f.paramName}) {`);
          lines.push(`${indent}  return res.status(404).json({ error: { code: "NOT_FOUND", message: "${f.paramName} not found" } });`);
          lines.push(`${indent}}`);
        } else {
          const mapVar = `__map_${tableName}`;
          lines.push(`${indent}const ${mapVar} = new Map((${resultVars[resultIdx]} as any[]).map((r: any) => [r.id, r]));`);
          for (const f of group) {
            const idExpr = `req.body.${f.idField} || req.params.id`;
            lines.push(`${indent}const ${f.paramName} = ${mapVar}.get(${idExpr}) ?? null;`);
            lines.push(`${indent}if (!${f.paramName}) {`);
            lines.push(`${indent}  return res.status(404).json({ error: { code: "NOT_FOUND", message: "${f.paramName} not found" } });`);
            lines.push(`${indent}}`);
          }
        }
        resultIdx++;
      }
    }
    lines.push(``);
  }

  // 2. Precondition checks
  if (method.preconditions.length > 0) {
    lines.push(`${indent}// Preconditions`);
    for (const pre of method.preconditions) {
      try {
        lines.push(compilePrecondition(parseExprStr(pre.expression), indent));
      } catch {
        lines.push(`${indent}// CHECK: ${pre.description}`);
      }
    }
    lines.push(``);
  }

  // 3. Effects — batch same-entity updates into single UPDATEs
  if (method.effects.length > 0) {
    lines.push(`${indent}// Effects (batched by entity to minimise round-trips)`);

    const paramIdx = { n: 1 };
    const compiled = method.effects.map(e => compileEffect(e, mod, system, paramIdx, method));
    const { batches, standalones } = batchEffects(compiled);

    // Emit batched UPDATEs
    for (const batch of batches) {
      if (batch.setClauses.length === 0) continue;
      const idParamN = paramIdx.n++;
      const setClauses = batch.setClauses.join(", ");
      const sql = `UPDATE ${batch.tableName} SET ${setClauses}, updated_at = NOW() WHERE id = $${idParamN} RETURNING *`;
      const params = [...batch.paramValues, batch.idParam].join(", ");
      const resultVar = `__upd_${batch.entityParam}`;
      lines.push(`${indent}// ${batch.descriptions.join("; ")}`);
      lines.push(`${indent}const ${resultVar} = await query(\`${sql}\`, [${params}]);`);
      lines.push(`${indent}if (!${resultVar} || ${resultVar}.length === 0) {`);
      lines.push(`${indent}  throw new Error("Update failed for ${batch.entityParam}");`);
      lines.push(`${indent}}`);
    }

    // Emit standalone effects (JSONB, array ops)
    for (const s of standalones) {
      const resultVar = `__eff_${standalones.indexOf(s)}`;
      lines.push(`${indent}// ${s.description}`);
      lines.push(`${indent}const ${resultVar} = await query(\`${s.sql}\`, [${s.params.join(", ")}]);`);
      lines.push(`${indent}if (!${resultVar} || ${resultVar}.length === 0) {`);
      lines.push(`${indent}  throw new Error("Effect failed: ${s.description.replace(/"/g, '\\"')}");`);
      lines.push(`${indent}}`);
    }

    // Fallback for effects that couldn't be compiled.
    // Collection-level effects (e.g. list<T>.field = value) are not yet supported
    // by the batch compiler — emit a clear TODO rather than silently dropping them.
    // Effects that reference a completely unknown model are a hard error.
    for (const effect of method.effects) {
      const paramIdx2 = { n: 1 };
      if (!compileEffect(effect, mod, system, paramIdx2, method)) {
        const targetParts = effect.target.split(".");
        const paramName = targetParts[0];
        const param = method.input.find(p => p.name === paramName);
        const isCollectionEffect = param && (param.type.startsWith("list<") || param.type.startsWith("set<"));

        if (isCollectionEffect) {
          // Collection-level effects: apply the field update to all items in the collection
          // using a single batched UPDATE ... WHERE id = ANY($ids::uuid[])
          const innerType = param.type.replace(/^(list|set)<(.+)>$/, "$2");
          // Find the model for the inner element type
          let elemModel: IR.IRModel | undefined;
          for (const m of system.modules) {
            elemModel = m.models.find(mdl => mdl.name === innerType || mdl.name.toLowerCase() === innerType.toLowerCase());
            if (elemModel) break;
          }
          const tableName = elemModel ? (elemModel.name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase() + "s") : (innerType.toLowerCase() + "s");
          const fieldName = targetParts[1];
          const valueTs = targetParts[1] ? effect.value : "null";
          const opSql = effect.op === "add"
            ? `${fieldName} = ${fieldName} + $1`
            : effect.op === "remove"
              ? `${fieldName} = ${fieldName} - $1`
              : `${fieldName} = $1`;
          lines.push(`${indent}// Collection effect: ${effect.target} ${effect.op === "assign" ? "=" : effect.op === "add" ? "+=" : "-="} ${effect.value}`);
          lines.push(`${indent}if (${paramName} && ${paramName}.length > 0) {`);
          lines.push(`${indent}  const __ids_${paramName} = ${paramName}.map((x: any) => x.id ?? x);`);
          lines.push(`${indent}  await query(`);
          lines.push(`${indent}    \`UPDATE ${tableName} SET ${opSql}, updated_at = NOW() WHERE id = ANY($2::uuid[])\`,`);
          lines.push(`${indent}    [${effect.value}, __ids_${paramName}],`);
          lines.push(`${indent}  );`);
          lines.push(`${indent}}`);
        } else {
          throw new Error(
            `Unsupported effect in method '${method.name}': target '${effect.target}' could not be resolved to a known model field. ` +
            `Ensure the effect target matches a declared entity field (e.g. 'entityName.fieldName').`
          );
        }
      }
    }
    lines.push(``);
  }

  // 4. Event emissions
  if (method.emissions.length > 0) {
    lines.push(`${indent}// Emit events`);
    for (const ev of method.emissions) {
      const payload = buildEventPayload(method, fetches);
      if (method.sync === "transactional") {
        lines.push(`${indent}await eventBus.publish("${ev}", ${payload}, "${mod.name}", auth.trace_id, __client);`);
      } else {
        lines.push(`${indent}await eventBus.publish("${ev}", ${payload}, "${mod.name}", auth.trace_id);`);
      }
    }
    lines.push(``);
  }

  // 5. Return result
  const resultEntity = fetches[0];
  if (resultEntity) {
    lines.push(`${indent}res.json({ ok: true, action: "${method.name}", entity: ${resultEntity.paramName} });`);
  } else {
    lines.push(`${indent}res.json({ ok: true, action: "${method.name}" });`);
  }

  return lines.join("\n");
}

function buildEventPayload(method: IR.IRMethod, fetches: EntityFetch[]): string {
  const fields: string[] = fetches.map(f => `${f.paramName}_id: ${f.paramName}?.id`);
  fields.push(`timestamp: new Date().toISOString()`);
  fields.push(`actor_id: auth.actor_id`);
  return `{ ${fields.join(", ")} }`;
}
