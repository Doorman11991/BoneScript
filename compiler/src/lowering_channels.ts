/**
 * BoneScript Channel / Event / Flow / Store Lowering
 * Converts ChannelDecl, EventDecl, FlowDecl, and StoreDecl AST nodes into IR.
 */

import * as AST from "./ast";
import * as IR from "./ir";
import { makeId, parseDurationMs, serializeExpr } from "./lowering_helpers";
import { lowerField as lowerFieldHelper } from "./lowering_entities";

// Re-export lowerField so lowering.ts can use a single import
export { lowerField } from "./lowering_entities";

// ─── Store Lowering ───────────────────────────────────────────────────────────

export function lowerStore(systemName: string, store: AST.StoreDeclNode): IR.IRModule {
  const entityName = store.name.replace(/Store$/, "") || store.name;
  const model: IR.IRModel = {
    name: entityName,
    fields: store.schema.map(lowerFieldHelper),
    primary_key: "id",
    indexes: [],
    constraints: [],
  };

  if (!model.fields.find(f => f.name === "id")) {
    model.fields.unshift({
      name: "id", type: "uuid", nullable: false, unique: true, indexed: true, default_value: "gen_random_uuid()",
    });
  }

  return {
    id: makeId(systemName, "data_store", store.name),
    kind: "data_store",
    name: store.name,
    interfaces: [],
    models: [model],
    events: [],
    state_machines: [],
    relations: [],
    dependencies: [],
    config: {
      engine: store.engine || "postgresql",
      replicas: store.replicas || 1,
      ...(store.retention ? { retention_ms: parseDurationMs(store.retention) || 0 } : {}),
      ...(store.partition ? { partition_key: store.partition } : {}),
    },
  };
}

// ─── Channel Lowering ─────────────────────────────────────────────────────────

export function lowerChannel(systemName: string, channel: AST.ChannelDeclNode): IR.IRModule {
  return {
    id: makeId(systemName, "realtime_service", channel.name),
    kind: "realtime_service",
    name: channel.name,
    interfaces: [{
      name: `I${channel.name}Channel`,
      methods: [
        { name: "connect",   input: [], output: "connection",   preconditions: [], effects: [], emissions: [], idempotent: false, authenticated: true, timeout_ms: 5000, retry: null, pipeline: null, algorithm: null, sync: null },
        { name: "subscribe", input: [{ name: "topic", type: "string", nullable: false, unique: false, indexed: false, default_value: null }], output: "subscription", preconditions: [], effects: [], emissions: [], idempotent: true, authenticated: true, timeout_ms: 5000, retry: null, pipeline: null, algorithm: null, sync: null },
        { name: "publish",   input: [{ name: "message", type: "json", nullable: false, unique: false, indexed: false, default_value: null }], output: "void", preconditions: [], effects: [], emissions: [], idempotent: false, authenticated: true, timeout_ms: 5000, retry: null, pipeline: null, algorithm: null, sync: null },
      ],
    }],
    models: [],
    events: [],
    state_machines: [],
    relations: [],
    dependencies: [],
    config: {
      transport:   channel.transport   || "websocket",
      ordering:    channel.ordering    || "fifo",
      persistence: channel.persistence || "none",
      max_size:    channel.maxSize     || 10000,
      ...(channel.filter ? { filter: serializeExpr(channel.filter) } : {}),
    },
  };
}

// ─── Event Lowering ───────────────────────────────────────────────────────────

export function lowerEvent(systemName: string, ev: AST.EventDeclNode, source: string): IR.IREvent {
  return {
    id: makeId(systemName, "event", ev.name),
    name: ev.name,
    payload: ev.payload.map(lowerFieldHelper),
    source,
    delivery: (ev.delivery as IR.IRDeliveryMode) || "at_least_once",
    ordering: "fifo",
    ttl_ms: parseDurationMs(ev.ttl),
  };
}

// ─── Flow Lowering ────────────────────────────────────────────────────────────

export function lowerFlow(_systemName: string, flow: AST.FlowDeclNode): IR.IRFlow {
  return {
    name: flow.name,
    steps: flow.steps.map(s => ({
      name: s.name,
      action: `${s.action.name}(${s.action.args.map(serializeExpr).join(", ")})`,
      compensation: s.compensate
        ? `${s.compensate.name}(${s.compensate.args.map(serializeExpr).join(", ")})`
        : null,
    })),
  };
}
