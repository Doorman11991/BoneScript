/**
 * BoneScript IR Optimizer — Stage 4.5 (between lowering and codegen).
 * Implements spec/07_IR_SPEC.md §6 (IR Optimization).
 *
 * Passes (applied in order, each idempotent):
 * 1. Dead module elimination
 * 2. Store merging (same engine, no conflicting schemas)
 * 3. Event deduplication
 * 4. Dependency minimization (remove transitive deps)
 * 5. Index optimization (remove prefix indexes)
 */

import * as IR from "./ir";

interface OptimizationLog {
  pass: string;
  action: string;
  target: string;
}

export interface OptimizationResult {
  system: IR.IRSystem;
  log: OptimizationLog[];
  modulesRemoved: number;
  eventsDeduped: number;
  depsRemoved: number;
}

export function optimize(system: IR.IRSystem): OptimizationResult {
  const log: OptimizationLog[] = [];
  let s = system;

  s = deadModuleElimination(s, log);
  s = storeMerging(s, log);
  s = eventDeduplication(s, log);
  s = dependencyMinimization(s, log);
  s = indexOptimization(s, log);

  return {
    system: s,
    log,
    modulesRemoved: log.filter(l => l.pass === "deadModuleElimination").length,
    eventsDeduped: log.filter(l => l.pass === "eventDeduplication").length,
    depsRemoved: log.filter(l => l.pass === "dependencyMinimization").length,
  };
}

// ─── Pass 1: Dead Module Elimination ─────────────────────────────────────────

function deadModuleElimination(s: IR.IRSystem, log: OptimizationLog[]): IR.IRSystem {
  const reachable = new Set<string>();

  // Seed: always-reachable kinds
  for (const m of s.modules) {
    if (["gateway", "frontend", "auth_service", "api_service", "realtime_service"].includes(m.kind)) {
      reachable.add(m.id);
    }
  }

  // Propagate reachability
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of s.modules) {
      if (reachable.has(m.id)) {
        for (const dep of m.dependencies) {
          if (!reachable.has(dep)) {
            reachable.add(dep);
            changed = true;
          }
        }
      }
    }
  }

  const removed = s.modules.filter(m => !reachable.has(m.id));
  for (const m of removed) {
    log.push({ pass: "deadModuleElimination", action: "removed", target: m.name });
  }

  return { ...s, modules: s.modules.filter(m => reachable.has(m.id)) };
}

// ─── Pass 2: Store Merging ────────────────────────────────────────────────────

function storeMerging(s: IR.IRSystem, log: OptimizationLog[]): IR.IRSystem {
  const stores = s.modules.filter(m => m.kind === "data_store");
  const toRemove = new Set<string>();
  const idRemap = new Map<string, string>();

  for (let i = 0; i < stores.length; i++) {
    for (let j = i + 1; j < stores.length; j++) {
      const a = stores[i];
      const b = stores[j];
      // Only merge if same engine, both have no models (pure infra stores)
      if (
        a.config["engine"] === b.config["engine"] &&
        a.models.length === 0 &&
        b.models.length === 0 &&
        !toRemove.has(a.id)
      ) {
        toRemove.add(b.id);
        idRemap.set(b.id, a.id);
        log.push({ pass: "storeMerging", action: "merged", target: `${b.name} → ${a.name}` });
      }
    }
  }

  if (toRemove.size === 0) return s;

  const modules = s.modules
    .filter(m => !toRemove.has(m.id))
    .map(m => ({
      ...m,
      dependencies: [...new Set(m.dependencies.map(d => idRemap.get(d) ?? d))],
    }));

  return { ...s, modules };
}

// ─── Pass 3: Event Deduplication ─────────────────────────────────────────────

function eventDeduplication(s: IR.IRSystem, log: OptimizationLog[]): IR.IRSystem {
  const seen = new Set<string>();
  const events: IR.IREvent[] = [];

  for (const ev of s.events) {
    if (seen.has(ev.name)) {
      log.push({ pass: "eventDeduplication", action: "removed duplicate", target: ev.name });
    } else {
      seen.add(ev.name);
      events.push(ev);
    }
  }

  return { ...s, events };
}

// ─── Pass 4: Dependency Minimization ─────────────────────────────────────────

function dependencyMinimization(s: IR.IRSystem, log: OptimizationLog[]): IR.IRSystem {
  const modules = s.modules.map(m => {
    // Remove self-references and duplicates
    const original = m.dependencies.length;
    const deps = [...new Set(m.dependencies.filter(d => d !== m.id))];

    // Remove transitive dependencies: if A→B→C, remove A→C
    const directDeps = new Set(deps);
    const transitive = new Set<string>();

    for (const dep of deps) {
      const depModule = s.modules.find(x => x.id === dep);
      if (depModule) {
        for (const transitiveDep of depModule.dependencies) {
          if (transitiveDep !== m.id) transitive.add(transitiveDep);
        }
      }
    }

    const minimized = deps.filter(d => !transitive.has(d));
    const removed = original - minimized.length;

    if (removed > 0) {
      log.push({ pass: "dependencyMinimization", action: `removed ${removed} transitive deps`, target: m.name });
    }

    return { ...m, dependencies: minimized };
  });

  return { ...s, modules };
}

// ─── Pass 5: Index Optimization ──────────────────────────────────────────────

function indexOptimization(s: IR.IRSystem, log: OptimizationLog[]): IR.IRSystem {
  const modules = s.modules.map(m => {
    const models = m.models.map(model => {
      // Remove indexes that are prefixes of other indexes
      const indexes = model.indexes.filter((idx, i) => {
        const isPrefix = model.indexes.some((other, j) => {
          if (i === j) return false;
          if (other.fields.length <= idx.fields.length) return false;
          return idx.fields.every((f, k) => other.fields[k] === f);
        });
        if (isPrefix) {
          log.push({ pass: "indexOptimization", action: "removed prefix index", target: `${model.name}.${idx.fields.join("_")}` });
        }
        return !isPrefix;
      });
      return { ...model, indexes };
    });
    return { ...m, models };
  });

  return { ...s, modules };
}
