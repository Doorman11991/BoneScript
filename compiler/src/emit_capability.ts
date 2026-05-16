/**
 * BoneScript Capability Body Emitter
 *
 * Translates IR effects and preconditions into real TypeScript + SQL.
 */

import * as IR from "./ir";

// ─── Expression Parser ────────────────────────────────────────────────────────
// Parses the serialized expression strings from the IR back into a structured form.

type ExprKind =
  | { kind: "literal"; value: string; raw: string }
  | { kind: "field"; path: string[] }
  | { kind: "binop"; op: string; left: Expr; right: Expr }
  | { kind: "call"; name: string; args: Expr[] };

type Expr = ExprKind;

function parseExprStr(s: string): Expr {
  s = s.trim();

  // Strip outer parens
  if (s.startsWith("(") && s.endsWith(")")) {
    return parseExprStr(s.slice(1, -1));
  }

  // String literal
  if (s.startsWith('"') && s.endsWith('"')) {
    return { kind: "literal", value: s.slice(1, -1), raw: s };
  }

  // Number literal
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    return { kind: "literal", value: s, raw: s };
  }

  // Boolean
  if (s === "true" || s === "false") {
    return { kind: "literal", value: s, raw: s };
  }

  // Binary operators (check in precedence order, right-to-left to handle left-assoc)
  const binOps = [" or ", " and ", " == ", " != ", " >= ", " <= ", " > ", " < ", " in ", " contains ", " + ", " - ", " * ", " / "];
  for (const op of binOps) {
    const idx = findBinOp(s, op);
    if (idx !== -1) {
      const left = parseExprStr(s.slice(0, idx));
      const right = parseExprStr(s.slice(idx + op.length));
      return { kind: "binop", op: op.trim(), left, right };
    }
  }

  // Function call: name(args)
  const callMatch = s.match(/^(\w+)\((.*)?\)$/);
  if (callMatch) {
    const args = callMatch[2] ? splitArgs(callMatch[2]).map(parseExprStr) : [];
    return { kind: "call", name: callMatch[1], args };
  }

  // Field reference: a.b.c
  if (/^[\w.]+$/.test(s)) {
    return { kind: "field", path: s.split(".") };
  }

  // Fallback: treat as opaque literal
  return { kind: "literal", value: s, raw: s };
}

function findBinOp(s: string, op: string): number {
  let depth = 0;
  for (let i = 0; i <= s.length - op.length; i++) {
    const ch = s[i];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (depth === 0 && s.slice(i, i + op.length) === op) {
      return i;
    }
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
    else if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

// ─── Entity Resolution ────────────────────────────────────────────────────────
// Determines which entities need to be fetched from the DB for a capability.

interface EntityFetch {
  paramName: string;    // capability parameter name (e.g., "item")
  entityType: string;   // entity type name (e.g., "Item")
  tableName: string;    // SQL table name (e.g., "items")
  idField: string;      // request body field for the ID (e.g., "item_id")
}

function toSnakeCase(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

function getEntityFetches(method: IR.IRMethod, mod: IR.IRModule, system: IR.IRSystem): EntityFetch[] {
  const fetches: EntityFetch[] = [];
  const seen = new Set<string>();

  // Build a map of all entity names → table names across the whole system
  const allModels = new Map<string, string>(); // entityName → tableName
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
      fetches.push({
        paramName: param.name,
        entityType: param.type,
        tableName,
        idField: param.name + "_id",
      });
    }
  }

  return fetches;
}

// ─── Precondition Compiler ────────────────────────────────────────────────────

interface CompiledPrecondition {
  code: string;       // TypeScript guard clause
  description: string;
}

function compilePrecondition(expr: Expr, indent: string): string {
  const condition = exprToTs(expr, true);
  const description = exprToDescription(expr).replace(/"/g, '\\"');
  return [
    `${indent}if (${condition}) {`,
    `${indent}  return res.status(422).json({ error: { code: "PRECONDITION_FAILED", message: ${JSON.stringify(description)} } });`,
    `${indent}}`,
  ].join("\n");
}

function exprToTs(expr: Expr, negate: boolean = false): string {
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
      // `caller` is a magic identifier that resolves to the authenticated actor.
      // Used by capabilities for ownership checks, e.g. `caller.id == seller.id`.
      // Maps to `auth.actor_id` (the verified `sub` claim from the JWT).
      if (expr.path[0] === "caller") {
        if (expr.path.length === 1) return "auth?.actor_id";
        const tail = expr.path.slice(1);
        // Only `caller.id` is meaningful at the moment; treat any other suffix
        // as a property access on actor_id for forward compatibility.
        if (tail.length === 1 && (tail[0] === "id" || tail[0] === "actor_id")) {
          return "auth?.actor_id";
        }
        return `auth?.actor_id?.${tail.join("?.")}`;
      }
      // Convert field path to JS property access
      return expr.path.join("?.");

    case "binop": {
      const l = exprToTsInner(expr.left);
      const r = exprToTsInner(expr.right);
      switch (expr.op) {
        case "==": return `${l} === ${r}`;
        case "!=": return `${l} !== ${r}`;
        case "and": return `(${l} && ${r})`;
        case "or": return `(${l} || ${r})`;
        case "in": return `[${r}].flat().includes(${l})`;
        case "contains": return `${l}?.includes(${r})`;
        case ">": case "<": case ">=": case "<=":
        case "+": case "-": case "*": case "/":
          return `${l} ${expr.op} ${r}`;
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
    case "field": return expr.path.join(".");
    case "binop": {
      const l = exprToDescription(expr.left);
      const r = exprToDescription(expr.right);
      return `${l} ${expr.op} ${r}`;
    }
    case "call": return `${expr.name}(${expr.args.map(exprToDescription).join(", ")})`;
  }
}

// ─── Effect Compiler ──────────────────────────────────────────────────────────

interface CompiledEffect {
  sql: string;
  params: string[];
  description: string;
}

function compileEffect(effect: IR.IREffect, mod: IR.IRModule, system: IR.IRSystem, paramIdx: { n: number }): CompiledEffect | null {
  const targetParts = effect.target.split(".");
  if (targetParts.length < 2) return null;

  const entityParam = targetParts[0];   // e.g., "item" or "trade"
  const fieldName = targetParts[1];     // e.g., "quantity" or "offered_items"
  const nestedPath = targetParts.slice(2); // e.g., ["owner_id"] for nested JSONB

  // Find the model for this entity param — search across all modules
  const model = (() => {
    for (const m of system.modules) {
      const found = m.models.find(mdl =>
        toSnakeCase(mdl.name) === entityParam ||
        mdl.name.toLowerCase() === entityParam.toLowerCase()
      );
      if (found) return found;
    }
    return mod.models.find(m =>
      toSnakeCase(m.name) === entityParam ||
      m.name.toLowerCase() === entityParam.toLowerCase()
    );
  })();
  if (!model) return null;

  const tableName = toSnakeCase(model.name) + "s";
  const valueExpr = parseExprStr(effect.value);
  const valueTs = exprToTsInner(valueExpr);
  const idParam = `req.body.${entityParam}_id || req.params.id`;

  // Detect if the param is a list type (bulk operation)
  const isBulk = effect.target.includes("[]") ||
    (entityParam.endsWith("s") && !model.name.toLowerCase().endsWith("s"));
  const bulkIdParam = `req.body.${entityParam}_ids || req.body.${entityParam}?.map((x: any) => x.id)`;
  const whereClause = isBulk
    ? `WHERE id = ANY($2::uuid[])`
    : `WHERE id = ${`$${2}`}`;

  // Handle nested JSONB path: trade.offered_items.owner_id
  if (nestedPath.length > 0) {
    const jsonbField = fieldName;
    const jsonbPath = nestedPath.join(".");
    const p1 = `$${paramIdx.n++}`;
    const p2 = `$${paramIdx.n++}`;
    // Use jsonb_set to update nested path
    const jsonbPathLiteral = `'{${nestedPath.join(",")}}'`;
    return {
      sql: `UPDATE ${tableName} SET ${jsonbField} = jsonb_set(COALESCE(${jsonbField}, '{}'), ${jsonbPathLiteral}, to_jsonb(${p1}::text), true), updated_at = NOW() WHERE id = ${p2} RETURNING *`,
      params: [valueTs, idParam],
      description: `${effect.target} = ${effect.value}`,
    };
  }

  switch (effect.op) {
    case "assign": {
      const p1 = `$${paramIdx.n++}`;
      const p2 = `$${paramIdx.n++}`;
      return {
        sql: `UPDATE ${tableName} SET ${fieldName} = ${p1}, updated_at = NOW() WHERE id = ${p2} RETURNING *`,
        params: [valueTs, idParam],
        description: `${effect.target} = ${effect.value}`,
      };
    }
    case "add": {
      const p1 = `$${paramIdx.n++}`;
      const p2 = `$${paramIdx.n++}`;
      const fieldType = model.fields.find(f => f.name === fieldName)?.type || "";
      const isNumeric = ["uint", "int", "float"].includes(fieldType);
      if (isNumeric) {
        return {
          sql: `UPDATE ${tableName} SET ${fieldName} = ${fieldName} + ${p1}, updated_at = NOW() WHERE id = ${p2} RETURNING *`,
          params: [valueTs, idParam],
          description: `${effect.target} += ${effect.value}`,
        };
      } else {
        return {
          sql: `UPDATE ${tableName} SET ${fieldName} = ${fieldName} || jsonb_build_array(${p1}::jsonb), updated_at = NOW() WHERE id = ${p2} RETURNING *`,
          params: [valueTs, idParam],
          description: `${effect.target} += ${effect.value}`,
        };
      }
    }
    case "remove": {
      const p1 = `$${paramIdx.n++}`;
      const p2 = `$${paramIdx.n++}`;
      const fieldType = model.fields.find(f => f.name === fieldName)?.type || "";
      const isNumeric = ["uint", "int", "float"].includes(fieldType);
      if (isNumeric) {
        return {
          sql: `UPDATE ${tableName} SET ${fieldName} = ${fieldName} - ${p1}, updated_at = NOW() WHERE id = ${p2} RETURNING *`,
          params: [valueTs, idParam],
          description: `${effect.target} -= ${effect.value}`,
        };
      } else {
        return {
          sql: `UPDATE ${tableName} SET ${fieldName} = (SELECT jsonb_agg(elem) FROM jsonb_array_elements(${fieldName}) elem WHERE elem != ${p1}::jsonb), updated_at = NOW() WHERE id = ${p2} RETURNING *`,
          params: [valueTs, idParam],
          description: `${effect.target} -= ${effect.value}`,
        };
      }
    }
  }
}

// ─── Main Capability Body Emitter ─────────────────────────────────────────────

export function emitCapabilityBody(
  method: IR.IRMethod,
  mod: IR.IRModule,
  system: IR.IRSystem,
  indent: string = "    "
): string {
  const lines: string[] = [];
  const fetches = getEntityFetches(method, mod, system);

  // 0. Destructure primitive params from req.body
  const primitiveParams = method.input.filter(p => {
    const isPrimitive = ["string", "uint", "int", "float", "bool", "timestamp", "uuid", "bytes", "json"].includes(p.type);
    const isListOrSet = p.type.startsWith("list<") || p.type.startsWith("set<");
    const isEntityFetch = fetches.some(f => f.paramName === p.name);
    return (isPrimitive || isListOrSet) && !isEntityFetch;
  });

  if (primitiveParams.length > 0) {
    const destructured = primitiveParams.map(p => p.name).join(", ");
    lines.push(`${indent}const { ${destructured} } = req.body;`);
    lines.push(``);
  }

  // 1. Fetch entities referenced in preconditions/effects
  if (fetches.length > 0) {
    lines.push(`${indent}// Fetch entities`);
    for (const fetch of fetches) {
      const idExpr = `req.body.${fetch.idField} || req.params.id`;
      lines.push(`${indent}const ${fetch.paramName} = await queryOne(\`SELECT * FROM ${fetch.tableName} WHERE id = $1\`, [${idExpr}]);`);
      lines.push(`${indent}if (!${fetch.paramName}) {`);
      lines.push(`${indent}  return res.status(404).json({ error: { code: "NOT_FOUND", message: "${fetch.paramName} not found" } });`);
      lines.push(`${indent}}`);
    }
    lines.push(``);
  }

  // 2. Precondition checks
  if (method.preconditions.length > 0) {
    lines.push(`${indent}// Preconditions`);
    for (const pre of method.preconditions) {
      try {
        const expr = parseExprStr(pre.expression);
        lines.push(compilePrecondition(expr, indent));
      } catch {
        // Fallback: emit as comment if parsing fails
        lines.push(`${indent}// CHECK: ${pre.description}`);
      }
    }
    lines.push(``);
  }

  // 3. Effects (applied in declaration order, each in its own query)
  if (method.effects.length > 0) {
    lines.push(`${indent}// Effects (applied in declaration order)`);
    const effectResults: string[] = [];

    for (const effect of method.effects) {
      // Each effect gets its own parameter numbering starting at 1
      const paramIdx = { n: 1 };
      const compiled = compileEffect(effect, mod, system, paramIdx);
      if (compiled) {
        const resultVar = `__effect_${effectResults.length}`;
        effectResults.push(resultVar);
        lines.push(`${indent}const ${resultVar} = await query(\`${compiled.sql}\`, [${compiled.params.join(", ")}]);`);
        lines.push(`${indent}if (!${resultVar} || ${resultVar}.length === 0) {`);
        lines.push(`${indent}  throw new Error("Effect failed: ${compiled.description.replace(/"/g, '\\"')}");`);
        lines.push(`${indent}}`);
      } else {
        // Fallback for complex effects we can't compile
        lines.push(`${indent}// EFFECT: ${effect.target} ${effect.op === "assign" ? "=" : effect.op === "add" ? "+=" : "-="} ${effect.value}`);
        lines.push(`${indent}// TODO: Implement this effect manually`);
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
  const fields: string[] = [];
  for (const fetch of fetches) {
    fields.push(`${fetch.paramName}_id: ${fetch.paramName}?.id`);
  }
  fields.push(`timestamp: new Date().toISOString()`);
  fields.push(`actor_id: auth.actor_id`);
  return `{ ${fields.join(", ")} }`;
}
