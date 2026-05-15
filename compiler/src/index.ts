/**
 * BoneScript Compiler — Public API
 * Import this module to use the compiler programmatically.
 */

// Core pipeline
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

// AST types
export * as AST from "./ast";

// IR types
export * as IR from "./ir";

// Algorithm catalog
export { lookupAlgorithm, listAlgorithms, listByCategory } from "./algorithm_catalog";

// Extension system
export { mergeWithExisting, extractImplementations, validateExtensions } from "./extension_manager";

/**
 * Convenience function: compile a .bone source string to files.
 */
export async function compile(source: string, sourceFile: string = "program.bone"): Promise<{
  files: { path: string; content: string; language: string; source_module: string }[];
  errors: string[];
  warnings: string[];
}> {
  const { createHash } = await import("crypto");
  const { Lexer: L } = await import("./lexer");
  const { Parser: P } = await import("./parser");
  const { TypeChecker: TC } = await import("./typechecker");
  const { Lowering: Lo } = await import("./lowering");
  const { ConstraintSolver: CS } = await import("./solver");
  const { FullEmitter: FE } = await import("./emit_full");
  const { optimize: opt } = await import("./optimizer");

  const errors: string[] = [];
  const warnings: string[] = [];

  const tokens = new L(source).tokenize();
  const ast = new P(tokens).parse();

  const typeErrors = new TC().check(ast);
  for (const err of typeErrors) {
    errors.push(`${err.code} at ${err.loc.line}:${err.loc.column}: ${err.message}`);
  }
  if (errors.length > 0) return { files: [], errors, warnings };

  const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
  const irSystems = new Lo().lower(ast, hash);

  for (let i = 0; i < irSystems.length; i++) {
    const result = opt(irSystems[i]);
    irSystems[i] = result.system;
    const solveResult = new CS().solve(irSystems[i]);
    irSystems[i].resolution = solveResult.resolution;
    for (const w of solveResult.warnings) warnings.push(w);
  }

  const files: { path: string; content: string; language: string; source_module: string }[] = [];
  const emitter = new FE();
  for (const sys of irSystems) {
    files.push(...emitter.emit(sys));
  }

  return { files, errors, warnings };
}
