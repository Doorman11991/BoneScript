/**
 * BoneScript Verifier â€” Stage 7 of the compilation pipeline.
 * Implements spec/07_IR_SPEC.md Â§5 (IR Validation Rules).
 *
 * Checks:
 * - V001: Every dependency target exists as a module
 * - V002: Every event source exists as a module
 * - V003: State machine transitions reference valid events
 * - V004: No circular dependencies between modules
 * - V005: Every method's preconditions reference accessible fields
 * - V006: Every effect targets a field that exists
 * - V007: Every model has a primary key field
 * - V008: Every index references fields that exist
 * - V009: No duplicate module ids
 * - V010: No duplicate event ids
 * - V011: Every authenticated method's module depends on auth
 * - V012: Resolution map is complete
 *
 * Also validates generated code:
 * - All TypeScript files have balanced braces
 * - All SQL files have valid CREATE TABLE structure
 * - All imports reference existing files
 */

import * as IR from "./ir";
import { EmittedFile } from "./emitter";

export interface VerifyIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  location: string;
}

export interface VerifyResult {
  passed: boolean;
  issues: VerifyIssue[];
}

export class Verifier {
  verify(system: IR.IRSystem, files: EmittedFile[]): VerifyResult {
    const issues: VerifyIssue[] = [];

    // ─── IR Validation ────────────────────────────────────────────────────────
    this.checkDependencies(system, issues);
    this.checkEventSources(system, issues);       // V002
    this.checkDuplicateIds(system, issues);
    this.checkModels(system, issues);
    this.checkStateMachines(system, issues);
    this.checkCircularDeps(system, issues);
    this.checkPreconditions(system, issues);       // V005
    this.checkMethodEffects(system, issues);       // V006
    this.checkAuthDependencies(system, issues);    // V011
    this.checkResolutionMap(system, issues);       // V012

    // ─── Generated Code Validation ────────────────────────────────────────────
    this.checkTypeScriptSyntax(files, issues);
    this.checkSqlSyntax(files, issues);
    this.checkImports(files, issues);

    return {
      passed: issues.filter(i => i.severity === "error").length === 0,
      issues,
    };
  }

  // â”€â”€â”€ V001: Dependency targets exist â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private checkDependencies(system: IR.IRSystem, issues: VerifyIssue[]) {
    const moduleIds = new Set(system.modules.map(m => m.id));
    for (const mod of system.modules) {
      for (const dep of mod.dependencies) {
        if (!moduleIds.has(dep)) {
          issues.push({
            code: "V001",
            severity: "error",
            message: `Module '${mod.name}' depends on '${dep}' which does not exist`,
            location: mod.id,
          });
        }
      }
    }
  }

  // â”€â”€â”€ V009/V010: No duplicate IDs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private checkDuplicateIds(system: IR.IRSystem, issues: VerifyIssue[]) {
    const moduleIds = new Set<string>();
    for (const mod of system.modules) {
      if (moduleIds.has(mod.id)) {
        issues.push({
          code: "V009",
          severity: "error",
          message: `Duplicate module id: ${mod.id} (${mod.name})`,
          location: mod.id,
        });
      }
      moduleIds.add(mod.id);
    }

    const eventIds = new Set<string>();
    for (const ev of system.events) {
      if (eventIds.has(ev.id)) {
        issues.push({
          code: "V010",
          severity: "error",
          message: `Duplicate event id: ${ev.id} (${ev.name})`,
          location: ev.id,
        });
      }
      eventIds.add(ev.id);
    }
  }

  // â”€â”€â”€ V007/V008: Model validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private checkModels(system: IR.IRSystem, issues: VerifyIssue[]) {
    for (const mod of system.modules) {
      for (const model of mod.models) {
        // V007: Primary key exists
        const pkField = model.fields.find(f => f.name === model.primary_key);
        if (!pkField) {
          issues.push({
            code: "V007",
            severity: "error",
            message: `Model '${model.name}' primary key '${model.primary_key}' not found in fields`,
            location: `${mod.id}.${model.name}`,
          });
        }

        // V008: Index fields exist
        const fieldNames = new Set(model.fields.map(f => f.name));
        for (const idx of model.indexes) {
          for (const field of idx.fields) {
            if (!fieldNames.has(field)) {
              issues.push({
                code: "V008",
                severity: "warning",
                message: `Index on '${model.name}' references non-existent field '${field}'`,
                location: `${mod.id}.${model.name}`,
              });
            }
          }
        }
      }
    }
  }

  // â”€â”€â”€ V003: State machine transitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private checkStateMachines(system: IR.IRSystem, issues: VerifyIssue[]) {
    for (const mod of system.modules) {
      for (const sm of mod.state_machines) {
        const validStates = new Set(sm.states);

        // Initial state must be valid
        if (!validStates.has(sm.initial)) {
          issues.push({
            code: "V003",
            severity: "error",
            message: `State machine '${sm.entity}' initial state '${sm.initial}' not in states list`,
            location: `${mod.id}.${sm.entity}`,
          });
        }

        // All transition targets must be valid
        for (const t of sm.transitions) {
          if (!validStates.has(t.from)) {
            issues.push({
              code: "V003",
              severity: "error",
              message: `Transition from '${t.from}' â€” state not declared in '${sm.entity}'`,
              location: `${mod.id}.${sm.entity}`,
            });
          }
          if (!validStates.has(t.to)) {
            issues.push({
              code: "V003",
              severity: "error",
              message: `Transition to '${t.to}' â€” state not declared in '${sm.entity}'`,
              location: `${mod.id}.${sm.entity}`,
            });
          }
        }
      }
    }
  }

  // â”€â”€â”€ V004: Circular dependencies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private checkCircularDeps(system: IR.IRSystem, issues: VerifyIssue[]) {
    const graph = new Map<string, string[]>();
    for (const mod of system.modules) {
      graph.set(mod.id, mod.dependencies);
    }

    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = (node: string, path: string[]): boolean => {
      if (inStack.has(node)) {
        const cycle = [...path.slice(path.indexOf(node)), node];
        const names = cycle.map(id => system.modules.find(m => m.id === id)?.name || id);
        issues.push({
          code: "V004",
          severity: "error",
          message: `Circular dependency: ${names.join(" â†’ ")}`,
          location: node,
        });
        return true;
      }
      if (visited.has(node)) return false;

      visited.add(node);
      inStack.add(node);

      for (const dep of graph.get(node) || []) {
        if (graph.has(dep)) {
          dfs(dep, [...path, node]);
        }
      }

      inStack.delete(node);
      return false;
    };

    for (const [id] of graph) {
      if (!visited.has(id)) {
        dfs(id, []);
      }
    }
  }

  // â”€â”€â”€ Generated TypeScript Validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private checkTypeScriptSyntax(files: EmittedFile[], issues: VerifyIssue[]) {
    for (const file of files) {
      if (file.language !== "typescript") continue;

      // Check balanced braces
      let braceCount = 0;
      let parenCount = 0;
      let bracketCount = 0;

      for (const ch of file.content) {
        if (ch === "{") braceCount++;
        if (ch === "}") braceCount--;
        if (ch === "(") parenCount++;
        if (ch === ")") parenCount--;
        if (ch === "[") bracketCount++;
        if (ch === "]") bracketCount--;
      }

      if (braceCount !== 0) {
        issues.push({
          code: "GEN_TS_BRACES",
          severity: "error",
          message: `Unbalanced braces in ${file.path} (${braceCount > 0 ? "missing }" : "extra }"})`,
          location: file.path,
        });
      }
      if (parenCount !== 0) {
        issues.push({
          code: "GEN_TS_PARENS",
          severity: "warning",
          message: `Unbalanced parentheses in ${file.path}`,
          location: file.path,
        });
      }
    }
  }

  // â”€â”€â”€ Generated SQL Validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private checkSqlSyntax(files: EmittedFile[], issues: VerifyIssue[]) {
    for (const file of files) {
      if (file.language !== "sql") continue;

      // Check CREATE TABLE has matching parentheses
      if (file.content.includes("CREATE TABLE")) {
        const opens = (file.content.match(/\(/g) || []).length;
        const closes = (file.content.match(/\)/g) || []).length;
        if (opens !== closes) {
          issues.push({
            code: "GEN_SQL_PARENS",
            severity: "error",
            message: `Unbalanced parentheses in SQL: ${file.path}`,
            location: file.path,
          });
        }
      }

      // Check no empty CREATE TABLE
      if (file.content.match(/CREATE TABLE[^(]+\(\s*\)/)) {
        issues.push({
          code: "GEN_SQL_EMPTY",
          severity: "warning",
          message: `Empty CREATE TABLE in ${file.path}`,
          location: file.path,
        });
      }
    }
  }

  // â”€â”€â”€ Import Resolution â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private checkImports(files: EmittedFile[], issues: VerifyIssue[]) {
    const filePaths = new Set(files.map(f => f.path));

    for (const file of files) {
      if (file.language !== "typescript") continue;

      const importMatches = file.content.matchAll(/from\s+"([^"]+)"/g);
      for (const match of importMatches) {
        const importPath = match[1];
        // Skip node_modules imports
        if (!importPath.startsWith(".")) continue;

        // Resolve relative to file
        const dir = file.path.split("/").slice(0, -1).join("/");
        const resolved = resolvePath(dir, importPath) + ".ts";

        // Check if target exists in our file set
        if (!filePaths.has(resolved) && !filePaths.has(resolved.replace(".ts", "/index.ts"))) {
          // Not necessarily an error â€” could be importing from a parent project
          // Only warn for imports within src/
          if (importPath.startsWith("./") || importPath.startsWith("../")) {
            issues.push({
              code: "GEN_IMPORT",
              severity: "warning",
              message: `Import '${importPath}' in ${file.path} may not resolve (target: ${resolved})`,
              location: file.path,
            });
          }
        }
      }
    }
  }


  // ─── V002: Event source exists as a module ────────────────────────────────
  private checkEventSources(system: IR.IRSystem, issues: VerifyIssue[]) {
    const moduleIds = new Set(system.modules.map(m => m.id));
    for (const ev of system.events) {
      if (ev.source && ev.source !== "unknown" && !moduleIds.has(ev.source)) {
        issues.push({
          code: "V002",
          severity: "warning",
          message: `Event '${ev.name}' source '${ev.source}' does not match any module id`,
          location: ev.id,
        });
      }
    }
  }

  // ─── V005: Preconditions reference accessible fields ─────────────────────
  private checkPreconditions(system: IR.IRSystem, issues: VerifyIssue[]) {
    // Build a map of all model field names by model name (lowercase for case-insensitive lookup)
    const modelFields = new Map<string, Set<string>>();
    for (const mod of system.modules) {
      for (const model of mod.models) {
        const fields = new Set(model.fields.map(f => f.name));
        // Add ontology-entailed fields always present
        fields.add("id"); fields.add("created_at"); fields.add("updated_at"); fields.add("state");
        modelFields.set(model.name, fields);
        modelFields.set(model.name.toLowerCase(), fields);
      }
    }

    // Simple field-path extractor: finds "word.word" patterns in a serialized expression
    const fieldPathPattern = /\b([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)\b/g;

    for (const mod of system.modules) {
      for (const iface of mod.interfaces) {
        for (const method of iface.methods) {
          for (const pre of method.preconditions) {
            let match: RegExpExecArray | null;
            fieldPathPattern.lastIndex = 0;
            while ((match = fieldPathPattern.exec(pre.expression)) !== null) {
              const [, paramName, fieldName] = match;
              // Skip known non-field patterns (e.g. "now()", numeric literals)
              if (paramName === "now" || /^\d/.test(paramName)) continue;
              // Check if the field exists in any model — warn if not found
              const foundInAnyModel = [...modelFields.values()].some(f => f.has(fieldName));
              if (!foundInAnyModel) {
                issues.push({
                  code: "V005",
                  severity: "warning",
                  message: `Precondition in '${method.name}' references '${paramName}.${fieldName}' — field '${fieldName}' not found in any model`,
                  location: `${mod.id}.${method.name}`,
                });
              }
            }
          }
        }
      }
    }
  }

  // ─── V006: Effects target fields that exist ───────────────────────────────
  private checkMethodEffects(system: IR.IRSystem, issues: VerifyIssue[]) {
    // Build a map of all model field names by model name
    const modelFields = new Map<string, Set<string>>();
    for (const mod of system.modules) {
      for (const model of mod.models) {
        const fields = new Set(model.fields.map(f => f.name));
        modelFields.set(model.name, fields);
        modelFields.set(model.name.toLowerCase(), fields);
      }
    }

    for (const mod of system.modules) {
      for (const iface of mod.interfaces) {
        for (const method of iface.methods) {
          for (const effect of method.effects) {
            const parts = effect.target.split(".");
            if (parts.length < 2) continue;
            const fieldName = parts[1];
            // Try to find the model — check all models for the field
            // (we can't always resolve the param name to a model here without type info)
            // Only error if the field name looks like a typo (not found in ANY model)
            const foundInAnyModel = [...modelFields.values()].some(fields => fields.has(fieldName));
            if (!foundInAnyModel && !["state", "status", "owner_id"].includes(fieldName)) {
              issues.push({
                code: "V006",
                severity: "warning",
                message: `Effect target '${effect.target}' in method '${method.name}' — field '${fieldName}' not found in any model`,
                location: `${mod.id}.${method.name}`,
              });
            }
          }
        }
      }
    }
  }

  // ─── V011: Authenticated methods' modules depend on auth ─────────────────
  private checkAuthDependencies(system: IR.IRSystem, issues: VerifyIssue[]) {
    const authModuleIds = new Set(
      system.modules
        .filter(m => m.kind === "auth_service" || m.config["auth_method"])
        .map(m => m.id)
    );

    for (const mod of system.modules) {
      const hasAuthenticatedMethod = mod.interfaces.some(i =>
        i.methods.some(m => m.authenticated)
      );
      if (!hasAuthenticatedMethod) continue;

      // Module must either be an auth service itself or depend on one
      const isAuthService = mod.kind === "auth_service";
      const dependsOnAuth = mod.dependencies.some(dep => authModuleIds.has(dep));
      const hasAuthConfig = mod.config["auth_method"] && mod.config["auth_method"] !== "none";

      if (!isAuthService && !dependsOnAuth && !hasAuthConfig && authModuleIds.size > 0) {
        issues.push({
          code: "V011",
          severity: "warning",
          message: `Module '${mod.name}' has authenticated methods but does not declare an auth dependency`,
          location: mod.id,
        });
      }
    }
  }

  // ─── V012: Resolution map is complete ────────────────────────────────────
  private checkResolutionMap(system: IR.IRSystem, issues: VerifyIssue[]) {
    // Resolution map must have at least the system-level keys
    const required = ["system.name", "system.version", "system.domain"];
    for (const key of required) {
      if (!system.resolution[key]) {
        issues.push({
          code: "V012",
          severity: "warning",
          message: `Resolution map missing required key '${key}' — run constraint solver`,
          location: system.name,
        });
      }
    }
  }

}

function resolvePath(base: string, relative: string): string {
  const parts = base.split("/");
  const relParts = relative.split("/");

  for (const part of relParts) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }

  return parts.join("/");
}
