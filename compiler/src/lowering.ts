/**
 * BoneScript Lowering — Stage 4 of the compilation pipeline.
 * Converts typed AST into the Architecture IR (spec/07_IR_SPEC.md).
 *
 * This file is the orchestrator. The actual lowering logic lives in:
 *   lowering_helpers.ts   — makeId, parseDurationMs, serializeExpr/Type
 *   lowering_entities.ts  — lowerEntity, lowerCapability, lowerField, makeCrudMethod
 *   lowering_channels.ts  — lowerStore, lowerChannel, lowerEvent, lowerFlow
 */

import * as AST from "./ast";
import * as IR from "./ir";
import { makeId, serializeExpr, serializeType } from "./lowering_helpers";
import { lowerEntity, lowerCapability } from "./lowering_entities";
import { lowerStore, lowerChannel, lowerEvent, lowerFlow } from "./lowering_channels";

export class Lowering {
  private systemName: string = "";

  lower(program: AST.ProgramNode, sourceHash: string): IR.IRSystem[] {
    return program.systems.map(sys => this.lowerSystem(sys, sourceHash));
  }

  private lowerSystem(sys: AST.SystemDeclNode, sourceHash: string): IR.IRSystem {
    this.systemName = sys.name;

    const modules:    IR.IRModule[]    = [];
    const events:     IR.IREvent[]     = [];
    const flows:      IR.IRFlow[]      = [];
    const invariants: IR.IRInvariant[] = [];

    // Partition declarations by kind
    const entities     = sys.declarations.filter((d): d is AST.EntityDeclNode     => d.kind === "EntityDecl");
    const capabilities = sys.declarations.filter((d): d is AST.CapabilityDeclNode => d.kind === "CapabilityDecl");
    const channels     = sys.declarations.filter((d): d is AST.ChannelDeclNode    => d.kind === "ChannelDecl");
    const stores       = sys.declarations.filter((d): d is AST.StoreDeclNode      => d.kind === "StoreDecl");
    const eventDecls   = sys.declarations.filter((d): d is AST.EventDeclNode      => d.kind === "EventDecl");
    const constraints  = sys.declarations.filter((d): d is AST.ConstraintDeclNode => d.kind === "ConstraintDecl");
    const policies     = sys.declarations.filter((d): d is AST.PolicyDeclNode     => d.kind === "PolicyDecl");
    const flowDecls    = sys.declarations.filter((d): d is AST.FlowDeclNode       => d.kind === "FlowDecl");
    const extensionPoints = sys.declarations.filter((d): d is AST.ExtensionPointDeclNode => d.kind === "ExtensionPointDecl");

    // Stores → data_store modules
    for (const store of stores) {
      modules.push(lowerStore(this.systemName, store));
    }

    // Entities → api_service modules (with CRUD + related capabilities)
    for (const entity of entities) {
      const relatedCaps = capabilities.filter(c =>
        c.params.some(p => p.type.kind === "EntityRefType" && p.type.name === entity.name)
      );
      modules.push(lowerEntity(this.systemName, entity, relatedCaps, stores));
    }

    // Standalone capabilities (no entity params) → utility api_service module
    // These include algorithm capabilities, pure-function capabilities, etc.
    const attachedCaps = new Set(
      entities.flatMap(entity =>
        capabilities.filter(c =>
          c.params.some(p => p.type.kind === "EntityRefType" && p.type.name === entity.name)
        )
      )
    );
    const standaloneCaps = capabilities.filter(c => !attachedCaps.has(c));
    if (standaloneCaps.length > 0) {
      const utilMethods = standaloneCaps.map(cap => lowerCapability(cap));
      modules.push({
        id: makeId(this.systemName, "api_service", "UtilityService"),
        kind: "api_service",
        name: "UtilityService",
        interfaces: [{ name: "IUtilityService", methods: utilMethods }],
        models: [],
        events: [],
        state_machines: [],
        relations: [],
        dependencies: [],
        config: { authenticated: false, auth_method: "none" },
      });
    }

    // Channels → realtime_service modules
    for (const channel of channels) {
      modules.push(lowerChannel(this.systemName, channel));
    }

    // Build a map from event name → emitting module id by scanning all capabilities
    // across all entities. This resolves the event source before lowering events.
    const eventSourceMap = new Map<string, string>();
    for (const entity of entities) {
      const moduleId = makeId(this.systemName, "api_service", `${entity.name}Service`);
      const relatedCaps = capabilities.filter(c =>
        c.params.some(p => p.type.kind === "EntityRefType" && p.type.name === entity.name)
      );
      for (const cap of relatedCaps) {
        for (const emit of cap.emits) {
          if (!eventSourceMap.has(emit.eventName)) {
            eventSourceMap.set(emit.eventName, moduleId);
          }
        }
      }
    }

    // Events
    for (const ev of eventDecls) {
      const source = eventSourceMap.get(ev.name) || "unknown";
      events.push(lowerEvent(this.systemName, ev, source));
    }

    // Flows
    for (const flow of flowDecls) {
      flows.push(lowerFlow(this.systemName, flow));
    }

    // Constraints → invariants
    for (const c of constraints) {
      invariants.push({
        id: makeId(this.systemName, "invariant", c.name),
        expression: serializeExpr(c.expr),
        scope: "global",
      });
    }

    // Gateway module (always present per ontology)
    const gatewayConfig: Record<string, string | number | boolean> = {
      rate_limit: 1000,
      cors: true,
      tls: true,
    };
    if (policies.length > 0) {
      const mainPolicy = policies[0];
      if (mainPolicy.rateLimit) gatewayConfig["rate_limit"] = mainPolicy.rateLimit.count;
      if (mainPolicy.encryption) gatewayConfig["encryption"] = mainPolicy.encryption;
    }
    modules.push({
      id: makeId(this.systemName, "gateway", "APIGateway"),
      kind: "gateway",
      name: "APIGateway",
      interfaces: [],
      models: [],
      events: [],
      state_machines: [],
      relations: [],
      dependencies: modules
        .filter(m => m.kind === "api_service" || m.kind === "realtime_service")
        .map(m => m.id),
      config: gatewayConfig,
    });

    return {
      name: sys.name,
      version: "1.0.0",
      source_hash: sourceHash,
      domain: sys.domain,
      modules,
      events,
      flows,
      invariants,
      resolution: {},
      extension_points: extensionPoints.map(ep => ({
        name: ep.name,
        params: ep.params.map(p => ({ name: p.name, type: serializeType(p.type) })),
        returns: ep.returns ? serializeType(ep.returns) : null,
        stable: ep.stable,
      })),
    };
  }
}
