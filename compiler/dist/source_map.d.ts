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
    source: string;
    source_hash: string;
    mappings: SourceMapping[];
}
export declare class SourceMapBuilder {
    private mappings;
    add(mapping: SourceMapping): void;
    /**
     * Build source map for a generated TypeScript service file.
     * Maps each method to its capability declaration in the source.
     */
    buildForService(generatedFile: string, sourcePath: string, sourceHash: string, mod: IR.IRModule): SourceMap;
    build(sourcePath: string, sourceHash: string): SourceMap;
}
