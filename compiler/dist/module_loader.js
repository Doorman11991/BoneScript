"use strict";
/**
 * BoneScript Module Loader â€” Resolves import declarations across multiple .bone files.
 *
 * Behavior:
 * - Tracks loaded files to avoid cycles
 * - Resolves relative paths from importing file
 * - Merges imported declarations into a single AST
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModuleLoader = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const lexer_1 = require("./lexer");
const parser_recovery_1 = require("./parser_recovery");
const parser_base_1 = require("./parser_base");
class ModuleLoader {
    constructor() {
        this.loaded = new Map();
        this.inProgress = new Set();
        this.errors = [];
    }
    load(entryFile) {
        const resolved = path.resolve(entryFile);
        const ast = this.loadFile(resolved);
        return {
            ast,
            errors: this.errors,
            loadedFiles: Array.from(this.loaded.keys()),
        };
    }
    loadFile(filePath) {
        if (this.loaded.has(filePath))
            return this.loaded.get(filePath);
        if (this.inProgress.has(filePath)) {
            this.errors.push({
                file: filePath,
                error: new parser_base_1.ParseError(`Circular import detected: ${filePath}`, { line: 1, column: 1, offset: 0 }),
            });
            return null;
        }
        if (!fs.existsSync(filePath)) {
            this.errors.push({
                file: filePath,
                error: new parser_base_1.ParseError(`File not found: ${filePath}`, { line: 1, column: 1, offset: 0 }),
            });
            return null;
        }
        this.inProgress.add(filePath);
        const source = fs.readFileSync(filePath, "utf-8");
        const tokens = new lexer_1.Lexer(source).tokenize();
        const result = new parser_recovery_1.RecoveringParser(tokens).parse();
        for (const err of result.errors) {
            this.errors.push({ file: filePath, error: err });
        }
        if (!result.ast) {
            this.inProgress.delete(filePath);
            return null;
        }
        // Resolve imports recursively
        const importedSystems = [];
        for (const sys of result.ast.systems) {
            const imports = sys.declarations.filter((d) => d.kind === "ImportDecl");
            for (const imp of imports) {
                const importPath = path.resolve(path.dirname(filePath), imp.from);
                const importedAst = this.loadFile(importPath);
                if (importedAst) {
                    importedSystems.push(...importedAst.systems);
                }
            }
        }
        // Merge imported systems' declarations into current systems
        if (importedSystems.length > 0) {
            const mergedSystems = result.ast.systems.map(sys => {
                const importedDecls = [];
                for (const imported of importedSystems) {
                    // Add imported entities, events, etc. (skip imports themselves)
                    for (const d of imported.declarations) {
                        if (d.kind !== "ImportDecl")
                            importedDecls.push(d);
                    }
                }
                return {
                    ...sys,
                    declarations: [...sys.declarations.filter(d => d.kind !== "ImportDecl"), ...importedDecls],
                };
            });
            result.ast.systems = mergedSystems;
        }
        else {
            // Remove import declarations from final AST
            result.ast.systems = result.ast.systems.map(sys => ({
                ...sys,
                declarations: sys.declarations.filter(d => d.kind !== "ImportDecl"),
            }));
        }
        this.loaded.set(filePath, result.ast);
        this.inProgress.delete(filePath);
        return result.ast;
    }
}
exports.ModuleLoader = ModuleLoader;
//# sourceMappingURL=module_loader.js.map