/**
 * BoneScript Module Loader — Resolves import declarations across multiple .bone files.
 *
 * Behavior:
 * - Tracks loaded files to avoid cycles
 * - Resolves relative paths from importing file
 * - Merges imported declarations into a single AST
 */

import * as fs from "fs";
import * as path from "path";
import { Lexer } from "./lexer";
import { RecoveringParser } from "./parser_recovery";
import { ParseError } from "./parser_base";
import * as AST from "./ast";

export interface LoadResult {
  ast: AST.ProgramNode | null;
  errors: { file: string; error: ParseError }[];
  loadedFiles: string[];
}

export class ModuleLoader {
  private loaded = new Map<string, AST.ProgramNode>();
  private inProgress = new Set<string>();
  private errors: { file: string; error: ParseError }[] = [];

  async load(entryFile: string): Promise<LoadResult> {
    const resolved = path.resolve(entryFile);
    const ast = await this.loadFile(resolved);
    return {
      ast,
      errors: this.errors,
      loadedFiles: Array.from(this.loaded.keys()),
    };
  }

  private async loadFile(filePath: string): Promise<AST.ProgramNode | null> {
    if (this.loaded.has(filePath)) return this.loaded.get(filePath)!;
    if (this.inProgress.has(filePath)) {
      this.errors.push({
        file: filePath,
        error: new ParseError(`Circular import detected: ${filePath}`, { line: 1, column: 1, offset: 0 }),
      });
      return null;
    }

    // Check existence without blocking the event loop
    try {
      await fs.promises.access(filePath);
    } catch {
      this.errors.push({
        file: filePath,
        error: new ParseError(`File not found: ${filePath}`, { line: 1, column: 1, offset: 0 }),
      });
      return null;
    }

    this.inProgress.add(filePath);

    const source = await fs.promises.readFile(filePath, "utf-8");
    const tokens = new Lexer(source).tokenize();
    const result = new RecoveringParser(tokens).parse();

    for (const err of result.errors) {
      this.errors.push({ file: filePath, error: err });
    }

    if (!result.ast) {
      this.inProgress.delete(filePath);
      return null;
    }

    // Resolve imports recursively (in parallel where possible)
    const importedSystems: AST.SystemDeclNode[] = [];
    for (const sys of result.ast.systems) {
      const imports = sys.declarations.filter((d): d is AST.ImportDeclNode => d.kind === "ImportDecl");
      // Load all imports for this system in parallel
      const importedAsts = await Promise.all(
        imports.map(imp => {
          const importPath = path.resolve(path.dirname(filePath), imp.from);
          return this.loadFile(importPath);
        })
      );
      for (const importedAst of importedAsts) {
        if (importedAst) importedSystems.push(...importedAst.systems);
      }
    }

    // Merge imported declarations into current systems
    if (importedSystems.length > 0) {
      result.ast.systems = result.ast.systems.map(sys => {
        const importedDecls: AST.DeclarationNode[] = importedSystems.flatMap(imported =>
          imported.declarations.filter(d => d.kind !== "ImportDecl")
        );
        return {
          ...sys,
          declarations: [...sys.declarations.filter(d => d.kind !== "ImportDecl"), ...importedDecls],
        };
      });
    } else {
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
