/**
 * BoneScript Compiler — Public API
 * Import this module to use the compiler programmatically.
 */
export { Lexer, LexerError, TokenKind } from "./lexer";
export type { Token, SourceLocation } from "./lexer";
export { Parser, ParseError } from "./parser";
export { RecoveringParser } from "./parser_recovery";
export type { RecoveredParseResult } from "./parser_recovery";
export { TypeChecker } from "./typechecker";
export type { TypeError } from "./typechecker";
export { Lowering } from "./lowering";
export { ConstraintSolver } from "./solver";
export type { SolverResult } from "./solver";
export { FullEmitter } from "./emit_full";
export { NakamaEmitter } from "./emit_nakama";
export type { NakamaEmittedFile } from "./emit_nakama";
export type { EmittedFile } from "./emitter";
export { Verifier } from "./verifier";
export type { VerifyResult, VerifyIssue } from "./verifier";
export { optimize } from "./optimizer";
export type { OptimizationResult } from "./optimizer";
export { ModuleLoader } from "./module_loader";
export type { LoadResult } from "./module_loader";
export { Formatter } from "./formatter";
export { scaffold } from "./scaffold";
export type { ScaffoldDomain } from "./scaffold";
export * as AST from "./ast";
export * as IR from "./ir";
export { lookupAlgorithm, listAlgorithms, listByCategory } from "./algorithm_catalog";
export { mergeWithExisting, extractImplementations, validateExtensions } from "./extension_manager";
/**
 * Convenience function: compile a .bone source string to files.
 */
export declare function compile(source: string, sourceFile?: string): Promise<{
    files: {
        path: string;
        content: string;
        language: string;
        source_module: string;
    }[];
    errors: string[];
    warnings: string[];
}>;
