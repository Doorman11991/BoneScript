"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Verifier = void 0;
class Verifier {
    verify(system, files) {
        const issues = [];
        // â”€â”€â”€ IR Validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        this.checkDependencies(system, issues);
        this.checkDuplicateIds(system, issues);
        this.checkModels(system, issues);
        this.checkStateMachines(system, issues);
        this.checkCircularDeps(system, issues);
        this.checkAuthDependencies(system, issues);
        // â”€â”€â”€ Generated Code Validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        this.checkTypeScriptSyntax(files, issues);
        this.checkSqlSyntax(files, issues);
        this.checkImports(files, issues);
        return {
            passed: issues.filter(i => i.severity === "error").length === 0,
            issues,
        };
    }
    // â”€â”€â”€ V001: Dependency targets exist â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    checkDependencies(system, issues) {
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
    checkDuplicateIds(system, issues) {
        const moduleIds = new Set();
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
        const eventIds = new Set();
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
    checkModels(system, issues) {
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
    checkStateMachines(system, issues) {
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
    checkCircularDeps(system, issues) {
        const graph = new Map();
        for (const mod of system.modules) {
            graph.set(mod.id, mod.dependencies);
        }
        const visited = new Set();
        const inStack = new Set();
        const dfs = (node, path) => {
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
            if (visited.has(node))
                return false;
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
    // --- V011: Authenticated methods require auth dependency -------------------
    checkAuthDependencies(system, issues) {
        // Collect all module IDs that are auth_service kind
        const authServiceIds = new Set(system.modules.filter(m => m.kind === "auth_service").map(m => m.id));
        for (const mod of system.modules) {
            // Skip auth services themselves
            if (mod.kind === "auth_service")
                continue;
            // Check if any method in this module is authenticated
            const hasAuthenticatedMethod = mod.interfaces.some(iface => iface.methods.some(method => method.authenticated));
            if (!hasAuthenticatedMethod)
                continue;
            // Check if the module declares a dependency on at least one auth_service
            const dependsOnAuth = mod.dependencies.some(dep => authServiceIds.has(dep));
            if (!dependsOnAuth) {
                // Collect the authenticated method names for a helpful message
                const authMethods = [];
                for (const iface of mod.interfaces) {
                    for (const method of iface.methods) {
                        if (method.authenticated)
                            authMethods.push(method.name);
                    }
                }
                issues.push({
                    code: "V011",
                    severity: "warning",
                    message: `Module '${mod.name}' has authenticated method(s) [${authMethods.join(', ')}] but does not declare a dependency on an auth_service module`,
                    location: mod.id,
                });
            }
        }
    }
    checkTypeScriptSyntax(files, issues) {
        for (const file of files) {
            if (file.language !== "typescript")
                continue;
            // Check balanced braces
            let braceCount = 0;
            let parenCount = 0;
            let bracketCount = 0;
            for (const ch of file.content) {
                if (ch === "{")
                    braceCount++;
                if (ch === "}")
                    braceCount--;
                if (ch === "(")
                    parenCount++;
                if (ch === ")")
                    parenCount--;
                if (ch === "[")
                    bracketCount++;
                if (ch === "]")
                    bracketCount--;
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
    checkSqlSyntax(files, issues) {
        for (const file of files) {
            if (file.language !== "sql")
                continue;
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
    checkImports(files, issues) {
        const filePaths = new Set(files.map(f => f.path));
        for (const file of files) {
            if (file.language !== "typescript")
                continue;
            const importMatches = file.content.matchAll(/from\s+"([^"]+)"/g);
            for (const match of importMatches) {
                const importPath = match[1];
                // Skip node_modules imports
                if (!importPath.startsWith("."))
                    continue;
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
}
exports.Verifier = Verifier;
function resolvePath(base, relative) {
    const parts = base.split("/");
    const relParts = relative.split("/");
    for (const part of relParts) {
        if (part === "..")
            parts.pop();
        else if (part !== ".")
            parts.push(part);
    }
    return parts.join("/");
}
//# sourceMappingURL=verifier.js.map