/**
 * BoneScript Entity Lowering
 * Converts EntityDecl + CapabilityDecl AST nodes into IR api_service modules.
 * Also handles field lowering and CRUD method generation.
 */

import * as AST from "./ast";
import * as IR from "./ir";
import { makeId, parseDurationMs, serializeType, serializeExpr, toSnakeCase } from "./lowering_helpers";

// ─── Field Lowering ───────────────────────────────────────────────────────────

export function lowerField(f: AST.FieldNode): IR.IRField {
  const type = serializeType(f.type);
  // defaultValue is an ExprNode | null — serialize it to a string if present
  const defaultValue = f.defaultValue ? serializeExpr(f.defaultValue) : null;
  return {
    name: f.name,
    type,
    nullable: false,
    unique: false,
    indexed: false,
    default_value: defaultValue,
  };
}

// ─── CRUD Method Generation ───────────────────────────────────────────────────

export function makeCrudMethod(op: string, entityName: string, fields: IR.IRField[]): IR.IRMethod {
  const input: IR.IRField[] =
    op === "create" || op === "update"
      ? fields.filter(f => f.name !== "id" && f.name !== "created_at" && f.name !== "updated_at")
      : op === "list"
        ? [
            { name: "page",      type: "uint", nullable: true, unique: false, indexed: false, default_value: "1" },
            { name: "page_size", type: "uint", nullable: true, unique: false, indexed: false, default_value: "50" },
          ]
        : [{ name: "id", type: "uuid", nullable: false, unique: true, indexed: true, default_value: null }];

  return {
    name: op,
    input,
    output: op === "list" ? `list<${entityName}>` : op === "delete" ? "bool" : entityName,
    preconditions: [],
    effects: [],
    emissions: [],
    idempotent: op === "read" || op === "list",
    authenticated: true,
    timeout_ms: 30000,
    retry: null,
    pipeline: null,
    algorithm: null,
    sync: null,
  };
}

// ─── Capability Lowering ──────────────────────────────────────────────────────

export function lowerCapability(cap: AST.CapabilityDeclNode): IR.IRMethod {
  const input: IR.IRField[] = cap.params.map(p => ({
    name: p.name,
    type: serializeType(p.type),
    nullable: false,
    unique: false,
    indexed: false,
    default_value: null,
  }));

  const preconditions: IR.IRPrecondition[] = cap.requires.map(r => ({
    expression: serializeExpr(r),
    description: serializeExpr(r),
  }));

  const effects: IR.IREffect[] = cap.effects.map(e => ({
    target: e.target.path.join("."),
    op: e.op === "=" ? "assign" as const : e.op === "+=" ? "add" as const : "remove" as const,
    value: serializeExpr(e.value),
  }));

  let pipeline: IR.IRPipeline | null = null;
  if (cap.pipeline) {
    pipeline = {
      parallel: cap.pipeline.parallel,
      steps: cap.pipeline.steps.map(step => ({
        call_name: step.call.name,
        call_args: step.call.args.map(a => serializeExpr(a)),
        bind_as: step.bindAs,
      })),
      on_error: cap.pipeline.onError ? {
        action: cap.pipeline.onError.action,
        call_name: cap.pipeline.onError.call?.name || null,
        call_args: cap.pipeline.onError.call?.args.map(a => serializeExpr(a)) || [],
      } : null,
    };
  }

  let algorithm: IR.IRAlgorithm | null = null;
  if (cap.algorithm) {
    algorithm = {
      catalog_name: cap.algorithm.name,
      bindings: cap.algorithm.using.map(b => ({
        param: b.param,
        value: serializeExpr(b.value),
      })),
    };
  }

  return {
    name: cap.name,
    input,
    output: cap.returns ? serializeType(cap.returns) : "result<void, error>",
    preconditions,
    effects,
    emissions: cap.emits.map(e => e.eventName),
    idempotent: cap.idempotent || false,
    authenticated: true,
    timeout_ms: parseDurationMs(cap.timeout) || 30000,
    retry: cap.retry ? {
      max_attempts: cap.retry.maxAttempts || 3,
      backoff: (cap.retry.backoff as IR.IRRetryPolicy["backoff"]) || "exponential",
      interval_ms: parseDurationMs(cap.retry.interval) || 1000,
    } : null,
    pipeline,
    algorithm,
    sync: cap.sync,
  };
}

// ─── Entity Lowering ──────────────────────────────────────────────────────────

export function lowerEntity(
  systemName: string,
  entity: AST.EntityDeclNode,
  capabilities: AST.CapabilityDeclNode[],
  stores: AST.StoreDeclNode[],
): IR.IRModule {
  const moduleId = makeId(systemName, "api_service", `${entity.name}Service`);

  // Ontology-entailed fields + declared fields
  const fields: IR.IRField[] = [
    { name: "id",         type: "uuid",      nullable: false, unique: true,  indexed: true,  default_value: "gen_random_uuid()" },
    { name: "created_at", type: "timestamp", nullable: false, unique: false, indexed: true,  default_value: "now()" },
    { name: "updated_at", type: "timestamp", nullable: false, unique: false, indexed: false, default_value: "now()" },
    ...entity.owns.map(lowerField),
  ];

  const derivedFields: IR.IRField[] = entity.derived.map(d => ({
    name: d.name,
    type: "json",
    nullable: true,
    unique: false,
    indexed: false,
    default_value: `GENERATED ALWAYS AS (${serializeExpr(d.expr)}) STORED`,
  }));

  const indexes: IR.IRIndex[] = entity.indexes.map(idx => ({ fields: idx, unique: false }));

  const modelConstraints: IR.IRModelConstraint[] = [];
  for (const c of entity.constraints) {
    const serialized = serializeExpr(c);
    if (c.kind === "FieldRef" && c.path[c.path.length - 1] === "unique") {
      const field = c.path.slice(0, -1).join(".");
      modelConstraints.push({ kind: "unique", target: field, params: {} });
      indexes.push({ fields: [field], unique: true });
    } else {
      modelConstraints.push({ kind: "check", target: entity.name, params: { expression: serialized } });
    }
  }

  const model: IR.IRModel = {
    name: entity.name,
    fields: [...fields, ...derivedFields],
    primary_key: "id",
    indexes,
    constraints: modelConstraints,
  };

  // State machine
  const stateMachines: IR.IRStateMachine[] = [];
  if (entity.states) {
    const states = entity.states.nodes.map(n => n.name);
    const transitions: IR.IRTransition[] = [];
    for (const node of entity.states.nodes) {
      for (const target of node.transitions) {
        transitions.push({ from: node.name, to: target, trigger: `${node.name}_to_${target}`, guard: null });
      }
      for (const target of node.branches) {
        transitions.push({ from: node.name, to: target, trigger: `${node.name}_to_${target}`, guard: null });
      }
    }
    stateMachines.push({ entity: entity.name, states, initial: states[0], transitions });
  }

  // Methods: CRUD + capabilities
  const methods: IR.IRMethod[] = [
    makeCrudMethod("create", entity.name, fields),
    makeCrudMethod("read",   entity.name, fields),
    makeCrudMethod("update", entity.name, fields),
    makeCrudMethod("delete", entity.name, fields),
    makeCrudMethod("list",   entity.name, fields),
    ...capabilities.map(lowerCapability),
  ];

  // Relations
  const relations: IR.IRRelation[] = entity.relations.map(rel => {
    const fromTable = toSnakeCase(entity.name) + "s";
    const toTable   = toSnakeCase(rel.target) + "s";
    let foreignKey: string;
    let junctionTable: string | undefined;

    switch (rel.relationType) {
      case "belongs_to":
        foreignKey = toSnakeCase(rel.target) + "_id";
        break;
      case "has_one":
      case "has_many":
        foreignKey = toSnakeCase(entity.name) + "_id";
        break;
      case "many_to_many":
        foreignKey = toSnakeCase(entity.name) + "_id";
        junctionTable = [fromTable, toTable].sort().join("_");
        break;
      default:
        foreignKey = toSnakeCase(rel.target) + "_id";
    }

    return {
      name: rel.name,
      kind: rel.relationType,
      from_entity: entity.name,
      to_entity: rel.target,
      from_table: fromTable,
      to_table: toTable,
      foreign_key: foreignKey,
      junction_table: junctionTable,
      cardinality: rel.cardinality ?? undefined,
    };
  });

  const relatedStore = stores.find(s => s.name.toLowerCase().includes(entity.name.toLowerCase()));
  const deps = relatedStore ? [makeId(systemName, "data_store", relatedStore.name)] : [];

  return {
    id: moduleId,
    kind: "api_service",
    name: `${entity.name}Service`,
    interfaces: [{ name: `I${entity.name}Service`, methods }],
    models: [model],
    events: [],
    state_machines: stateMachines,
    relations,
    dependencies: deps,
    config: {
      authenticated: entity.auth !== null && entity.auth !== "none",
      auth_method: entity.auth || "none",
    },
  };
}
