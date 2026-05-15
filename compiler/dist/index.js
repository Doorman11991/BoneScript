"use strict";
/**
 * BoneScript Compiler — Public API
 * Import this module to use the compiler programmatically.
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
exports.compile = exports.validateExtensions = exports.extractImplementations = exports.mergeWithExisting = exports.listByCategory = exports.listAlgorithms = exports.lookupAlgorithm = exports.IR = exports.AST = exports.scaffold = exports.Formatter = exports.ModuleLoader = exports.optimize = exports.Verifier = exports.NakamaEmitter = exports.FullEmitter = exports.ConstraintSolver = exports.Lowering = exports.TypeChecker = exports.RecoveringParser = exports.ParseError = exports.Parser = exports.TokenKind = exports.LexerError = exports.Lexer = void 0;
// Core pipeline
var lexer_1 = require("./lexer");
Object.defineProperty(exports, "Lexer", { enumerable: true, get: function () { return lexer_1.Lexer; } });
Object.defineProperty(exports, "LexerError", { enumerable: true, get: function () { return lexer_1.LexerError; } });
Object.defineProperty(exports, "TokenKind", { enumerable: true, get: function () { return lexer_1.TokenKind; } });
var parser_1 = require("./parser");
Object.defineProperty(exports, "Parser", { enumerable: true, get: function () { return parser_1.Parser; } });
Object.defineProperty(exports, "ParseError", { enumerable: true, get: function () { return parser_1.ParseError; } });
var parser_recovery_1 = require("./parser_recovery");
Object.defineProperty(exports, "RecoveringParser", { enumerable: true, get: function () { return parser_recovery_1.RecoveringParser; } });
var typechecker_1 = require("./typechecker");
Object.defineProperty(exports, "TypeChecker", { enumerable: true, get: function () { return typechecker_1.TypeChecker; } });
var lowering_1 = require("./lowering");
Object.defineProperty(exports, "Lowering", { enumerable: true, get: function () { return lowering_1.Lowering; } });
var solver_1 = require("./solver");
Object.defineProperty(exports, "ConstraintSolver", { enumerable: true, get: function () { return solver_1.ConstraintSolver; } });
var emit_full_1 = require("./emit_full");
Object.defineProperty(exports, "FullEmitter", { enumerable: true, get: function () { return emit_full_1.FullEmitter; } });
var emit_nakama_1 = require("./emit_nakama");
Object.defineProperty(exports, "NakamaEmitter", { enumerable: true, get: function () { return emit_nakama_1.NakamaEmitter; } });
var verifier_1 = require("./verifier");
Object.defineProperty(exports, "Verifier", { enumerable: true, get: function () { return verifier_1.Verifier; } });
var optimizer_1 = require("./optimizer");
Object.defineProperty(exports, "optimize", { enumerable: true, get: function () { return optimizer_1.optimize; } });
var module_loader_1 = require("./module_loader");
Object.defineProperty(exports, "ModuleLoader", { enumerable: true, get: function () { return module_loader_1.ModuleLoader; } });
var formatter_1 = require("./formatter");
Object.defineProperty(exports, "Formatter", { enumerable: true, get: function () { return formatter_1.Formatter; } });
var scaffold_1 = require("./scaffold");
Object.defineProperty(exports, "scaffold", { enumerable: true, get: function () { return scaffold_1.scaffold; } });
// AST types
exports.AST = __importStar(require("./ast"));
// IR types
exports.IR = __importStar(require("./ir"));
// Algorithm catalog
var algorithm_catalog_1 = require("./algorithm_catalog");
Object.defineProperty(exports, "lookupAlgorithm", { enumerable: true, get: function () { return algorithm_catalog_1.lookupAlgorithm; } });
Object.defineProperty(exports, "listAlgorithms", { enumerable: true, get: function () { return algorithm_catalog_1.listAlgorithms; } });
Object.defineProperty(exports, "listByCategory", { enumerable: true, get: function () { return algorithm_catalog_1.listByCategory; } });
// Extension system
var extension_manager_1 = require("./extension_manager");
Object.defineProperty(exports, "mergeWithExisting", { enumerable: true, get: function () { return extension_manager_1.mergeWithExisting; } });
Object.defineProperty(exports, "extractImplementations", { enumerable: true, get: function () { return extension_manager_1.extractImplementations; } });
Object.defineProperty(exports, "validateExtensions", { enumerable: true, get: function () { return extension_manager_1.validateExtensions; } });
/**
 * Convenience function: compile a .bone source string to files.
 */
async function compile(source, sourceFile = "program.bone") {
    const { createHash } = await Promise.resolve().then(() => __importStar(require("crypto")));
    const { Lexer: L } = await Promise.resolve().then(() => __importStar(require("./lexer")));
    const { Parser: P } = await Promise.resolve().then(() => __importStar(require("./parser")));
    const { TypeChecker: TC } = await Promise.resolve().then(() => __importStar(require("./typechecker")));
    const { Lowering: Lo } = await Promise.resolve().then(() => __importStar(require("./lowering")));
    const { ConstraintSolver: CS } = await Promise.resolve().then(() => __importStar(require("./solver")));
    const { FullEmitter: FE } = await Promise.resolve().then(() => __importStar(require("./emit_full")));
    const { optimize: opt } = await Promise.resolve().then(() => __importStar(require("./optimizer")));
    const errors = [];
    const warnings = [];
    const tokens = new L(source).tokenize();
    const ast = new P(tokens).parse();
    const typeErrors = new TC().check(ast);
    for (const err of typeErrors) {
        errors.push(`${err.code} at ${err.loc.line}:${err.loc.column}: ${err.message}`);
    }
    if (errors.length > 0)
        return { files: [], errors, warnings };
    const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
    const irSystems = new Lo().lower(ast, hash);
    for (let i = 0; i < irSystems.length; i++) {
        const result = opt(irSystems[i]);
        irSystems[i] = result.system;
        const solveResult = new CS().solve(irSystems[i]);
        irSystems[i].resolution = solveResult.resolution;
        for (const w of solveResult.warnings)
            warnings.push(w);
    }
    const files = [];
    const emitter = new FE();
    for (const sys of irSystems) {
        files.push(...emitter.emit(sys));
    }
    return { files, errors, warnings };
}
exports.compile = compile;
//# sourceMappingURL=index.js.map