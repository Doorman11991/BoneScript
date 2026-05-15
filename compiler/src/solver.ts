/**
 * BoneScript Constraint Solver â€” Stage 5 of the compilation pipeline.
 * Implements spec/06_CONSTRAINT_SOLVER.md.
 *
 * Resolves all underspecified aspects of the IR into concrete decisions.
 * Uses ONLY: ontology implication rules, domain defaults, structural necessity.
 * NO heuristics. NO probabilistic matching.
 *
 * Phases:
 *   1. Collect â€” gather all constraints
 *   2. Normalize â€” canonical form
 *   3. Propagate â€” unit propagation
 *   4. Check â€” verify consistency
 *   5. Complete â€” fill remaining with defaults
 *   6. Verify â€” final pass
 */

import * as IR from "./ir";

// â”€â”€â”€ Domain Defaults â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface DomainDefaults {
  auth: string;
  engine: string;
  session_engine: string;
  sync: string;
  channel_transport: string;
  channel_ordering: string;
  channel_persistence: string;
  session_ttl_ms: number;
  max_connections: number;
  rate_limit: number;
}

const DOMAIN_DEFAULTS: Record<string, DomainDefaults> = {
  multiplayer_game: {
    auth: "jwt",
    engine: "postgresql",
    session_engine: "redis",
    sync: "realtime",
    channel_transport: "websocket",
    channel_ordering: "causal",
    channel_persistence: "last_100",
    session_ttl_ms: 3_600_000,
    max_connections: 10000,
    rate_limit: 1000,
  },
  saas_platform: {
    auth: "oauth2",
    engine: "postgresql",
    session_engine: "redis",
    sync: "eventual",
    channel_transport: "sse",
    channel_ordering: "fifo",
    channel_persistence: "full",
    session_ttl_ms: 86_400_000,
    max_connections: 5000,
    rate_limit: 500,
  },
  iot_system: {
    auth: "apikey",
    engine: "postgresql", // dynamodb is not yet supported by the emitter (T014); use postgresql
    session_engine: "redis",
    sync: "eventual",
    channel_transport: "grpc_stream",
    channel_ordering: "fifo",
    channel_persistence: "last_1000",
    session_ttl_ms: 7_200_000,
    max_connections: 100000,
    rate_limit: 10000,
  },
  social_network: {
    auth: "oauth2",
    engine: "postgresql",
    session_engine: "redis",
    sync: "eventual",
    channel_transport: "websocket",
    channel_ordering: "causal",
    channel_persistence: "last_100",
    session_ttl_ms: 86_400_000,
    max_connections: 50000,
    rate_limit: 2000,
  },
  marketplace: {
    auth: "oauth2",
    engine: "postgresql",
    session_engine: "redis",
    sync: "transactional",
    channel_transport: "sse",
    channel_ordering: "fifo",
    channel_persistence: "full",
    session_ttl_ms: 3_600_000,
    max_connections: 10000,
    rate_limit: 1000,
  },
  realtime_collaboration: {
    auth: "jwt",
    engine: "postgresql",
    session_engine: "redis",
    sync: "realtime",
    channel_transport: "websocket",
    channel_ordering: "causal",
    channel_persistence: "full",
    session_ttl_ms: 7_200_000,
    max_connections: 10000,
    rate_limit: 5000,
  },
};

const FALLBACK_DEFAULTS: DomainDefaults = {
  auth: "jwt",
  engine: "postgresql",
  session_engine: "redis",
  sync: "eventual",
  channel_transport: "websocket",
  channel_ordering: "fifo",
  channel_persistence: "none",
  session_ttl_ms: 3_600_000,
  max_connections: 10000,
  rate_limit: 1000,
};

// â”€â”€â”€ Solver Output â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface SolverResult {
  resolution: Record<string, string>;
  assumptions: string[];
  warnings: string[];
  errors: string[];
}

// â”€â”€â”€ Solver â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export class ConstraintSolver {
  solve(system: IR.IRSystem): SolverResult {
    const resolution: Record<string, string> = {};
    const assumptions: string[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    const defaults = DOMAIN_DEFAULTS[system.domain || ""] || FALLBACK_DEFAULTS;

    if (!system.domain) {
      assumptions.push("No domain specified. Using fallback defaults.");
    } else {
      assumptions.push(`Domain '${system.domain}' selected. Applying domain defaults.`);
    }

    // â”€â”€â”€ Phase 1: Collect â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // Collect all unresolved variables from modules
    const unresolvedVars: Map<string, string | null> = new Map();

    for (const mod of system.modules) {
      const prefix = `${mod.name}`;

      if (mod.kind === "data_store") {
        const engine = mod.config["engine"] as string | undefined;
        if (!engine) {
          unresolvedVars.set(`${prefix}.engine`, null);
        } else {
          resolution[`${prefix}.engine`] = engine;
        }
        if (mod.config["replicas"] === undefined) {
          unresolvedVars.set(`${prefix}.replicas`, null);
        }
      }

      if (mod.kind === "api_service") {
        const authMethod = mod.config["auth_method"] as string | undefined;
        if (!authMethod || authMethod === "none") {
          unresolvedVars.set(`${prefix}.auth_method`, null);
        } else {
          resolution[`${prefix}.auth_method`] = authMethod;
        }
      }

      if (mod.kind === "realtime_service") {
        const transport = mod.config["transport"] as string | undefined;
        if (!transport) unresolvedVars.set(`${prefix}.transport`, null);
        else resolution[`${prefix}.transport`] = transport;

        const ordering = mod.config["ordering"] as string | undefined;
        if (!ordering) unresolvedVars.set(`${prefix}.ordering`, null);
        else resolution[`${prefix}.ordering`] = ordering;

        const persistence = mod.config["persistence"] as string | undefined;
        if (!persistence || persistence === "none") {
          unresolvedVars.set(`${prefix}.persistence`, null);
        } else {
          resolution[`${prefix}.persistence`] = persistence;
        }
      }

      if (mod.kind === "gateway") {
        if (!mod.config["rate_limit"]) {
          unresolvedVars.set(`${prefix}.rate_limit`, null);
        }
      }
    }

    // â”€â”€â”€ Phase 2: Normalize â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // (constraints are already in canonical form from the IR)

    // â”€â”€â”€ Phase 3: Propagate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // Apply domain defaults to unresolved variables
    for (const [varName] of unresolvedVars) {
      const parts = varName.split(".");
      const prop = parts[parts.length - 1];

      switch (prop) {
        case "engine":
          resolution[varName] = defaults.engine;
          assumptions.push(`${varName} = ${defaults.engine} (domain default)`);
          break;
        case "auth_method":
          resolution[varName] = defaults.auth;
          assumptions.push(`${varName} = ${defaults.auth} (domain default)`);
          break;
        case "transport":
          resolution[varName] = defaults.channel_transport;
          assumptions.push(`${varName} = ${defaults.channel_transport} (domain default)`);
          break;
        case "ordering":
          resolution[varName] = defaults.channel_ordering;
          assumptions.push(`${varName} = ${defaults.channel_ordering} (domain default)`);
          break;
        case "persistence":
          resolution[varName] = defaults.channel_persistence;
          assumptions.push(`${varName} = ${defaults.channel_persistence} (domain default)`);
          break;
        case "rate_limit":
          resolution[varName] = String(defaults.rate_limit);
          assumptions.push(`${varName} = ${defaults.rate_limit} (domain default)`);
          break;
        case "replicas":
          resolution[varName] = "1";
          assumptions.push(`${varName} = 1 (minimum default)`);
          break;
        default:
          warnings.push(`Unresolved variable '${varName}' has no default.`);
      }
    }

    // â”€â”€â”€ Implication Rules â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // Rule: If any module has auth != none, system needs a session store
    const hasAuth = system.modules.some(m =>
      m.config["authenticated"] === true || (m.config["auth_method"] && m.config["auth_method"] !== "none")
    );
    if (hasAuth) {
      const hasSessionStore = system.modules.some(m =>
        m.kind === "data_store" && (m.name.toLowerCase().includes("session") || m.config["engine"] === "redis")
      );
      if (!hasSessionStore) {
        resolution["implied.session_store"] = "required";
        resolution["implied.session_store.engine"] = defaults.session_engine;
        resolution["implied.session_store.ttl_ms"] = String(defaults.session_ttl_ms);
        assumptions.push(`Auth detected â†’ session store required (${defaults.session_engine}, TTL=${defaults.session_ttl_ms}ms)`);
      }
    }

    // Rule: If any realtime_service exists, event_bus is implied
    const hasRealtime = system.modules.some(m => m.kind === "realtime_service");
    if (hasRealtime) {
      resolution["implied.event_bus"] = "required";
      resolution["implied.event_bus.engine"] = "redis_pubsub";
      assumptions.push("Realtime service detected â†’ event bus required (redis_pubsub)");
    }

    // Rule: If events exist with delivery=exactly_once, transactional outbox is implied
    const hasExactlyOnce = system.events.some(e => e.delivery === "exactly_once");
    if (hasExactlyOnce) {
      resolution["implied.outbox"] = "required";
      resolution["implied.outbox.engine"] = defaults.engine;
      assumptions.push("exactly_once delivery detected â†’ transactional outbox required");
    }

    // Rule: If flows exist, saga coordinator is implied
    if (system.flows.length > 0) {
      resolution["implied.saga_coordinator"] = "required";
      assumptions.push("Flow declarations detected â†’ saga coordinator required");
    }

    // â”€â”€â”€ Phase 4: Check Consistency â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // Check: total ordering + polling is invalid
    for (const mod of system.modules) {
      if (mod.kind === "realtime_service") {
        const transport = resolution[`${mod.name}.transport`] || mod.config["transport"];
        const ordering = resolution[`${mod.name}.ordering`] || mod.config["ordering"];
        if (ordering === "total" && transport === "polling") {
          errors.push(`Exclusion rule violated: ${mod.name} has ordering=total with transport=polling (incompatible)`);
        }
      }
    }

    // Check: realtime sync requires at_least_once delivery
    for (const ev of system.events) {
      if (ev.delivery === "at_most_once") {
        const sourceModule = system.modules.find(m => m.id === ev.source);
        if (sourceModule && sourceModule.kind === "realtime_service") {
          warnings.push(`Event '${ev.name}' uses at_most_once delivery on a realtime service. Consider at_least_once.`);
        }
      }
    }

    // â”€â”€â”€ Phase 5: Complete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // Global resolution entries
    resolution["system.name"] = system.name;
    resolution["system.version"] = system.version;
    resolution["system.domain"] = system.domain || "generic";
    resolution["system.default_timeout_ms"] = "30000";
    resolution["system.default_page_size"] = "50";
    resolution["system.max_connections"] = String(defaults.max_connections);

    // â”€â”€â”€ Phase 6: Verify â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // All variables should now be resolved
    for (const [varName] of unresolvedVars) {
      if (!resolution[varName]) {
        errors.push(`C002: Unresolvable variable '${varName}' â€” no default available. Programmer must specify.`);
      }
    }

    return { resolution, assumptions, warnings, errors };
  }
}
