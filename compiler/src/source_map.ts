/**
 * BoneScript Source Map Generator
 *
 * Tracks every IR node and generated code line back to its origin in the .bone source.
 * Output format: a simple JSON map of {generated_file:line â†’ source_file:line}
 */

import * as IR from "./ir";

export interface SourceMapping {
  generated_file: string;
  generated_line: number;
  source_file: string;
  source_line: number;
  source_column: number;
  ir_node_id: string;
  description: string;
}

export interface SourceMap {
  version: number;
  source: string;        // .bone file path
  source_hash: string;
  mappings: SourceMapping[];
}

export class SourceMapBuilder {
  private mappings: SourceMapping[] = [];

  add(mapping: SourceMapping) {
    this.mappings.push(mapping);
  }

  /**
   * Build source map for a generated TypeScript service file.
   * Maps each method to its capability declaration in the source.
   */
  buildForService(
    generatedFile: string,
    sourcePath: string,
    sourceHash: string,
    mod: IR.IRModule
  ): SourceMap {
    const mappings: SourceMapping[] = [];

    // Each method maps to its IR module
    for (const iface of mod.interfaces) {
      for (const method of iface.methods) {
        mappings.push({
          generated_file: generatedFile,
          generated_line: 0, // would be computed during emission
          source_file: sourcePath,
          source_line: 0,    // would come from AST loc tracking
          source_column: 0,
          ir_node_id: mod.id,
          description: `Method '${method.name}' of ${mod.name}`,
        });
      }
    }

    // Each model maps to its entity declaration
    for (const model of mod.models) {
      mappings.push({
        generated_file: generatedFile,
        generated_line: 0,
        source_file: sourcePath,
        source_line: 0,
        source_column: 0,
        ir_node_id: mod.id,
        description: `Model '${model.name}'`,
      });
    }

    return {
      version: 1,
      source: sourcePath,
      source_hash: sourceHash,
      mappings,
    };
  }

  build(sourcePath: string, sourceHash: string): SourceMap {
    return {
      version: 1,
      source: sourcePath,
      source_hash: sourceHash,
      mappings: this.mappings,
    };
  }
}
