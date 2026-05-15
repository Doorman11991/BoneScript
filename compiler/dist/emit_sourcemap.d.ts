/**
 * BoneScript Source Map Emitter
 * Generates a .bone.map file that maps generated TS line numbers back to .bone source.
 * Also generates a debug wrapper that intercepts runtime errors and annotates them.
 */
import * as IR from "./ir";
export interface BoneSourceMap {
    version: 1;
    source_hash: string;
    source_file: string;
    mappings: BoneMapping[];
}
export interface BoneMapping {
    generated_file: string;
    generated_line: number;
    bone_line: number;
    bone_column: number;
    description: string;
}
/**
 * Emit a source map JSON file for the compiled system.
 * Maps IR nodes to their approximate .bone source locations.
 */
export declare function emitSourceMapFile(system: IR.IRSystem, sourceFile: string): string;
/**
 * Emit a debug error handler that annotates runtime errors with .bone context.
 * Reads the source map at runtime to provide dual-stack traces.
 */
export declare function emitDebugHandler(system: IR.IRSystem): string;
