/**
 * BoneScript Module Loader â€” Resolves import declarations across multiple .bone files.
 *
 * Behavior:
 * - Tracks loaded files to avoid cycles
 * - Resolves relative paths from importing file
 * - Merges imported declarations into a single AST
 */
import { ParseError } from "./parser_base";
import * as AST from "./ast";
export interface LoadResult {
    ast: AST.ProgramNode | null;
    errors: {
        file: string;
        error: ParseError;
    }[];
    loadedFiles: string[];
}
export declare class ModuleLoader {
    private loaded;
    private inProgress;
    private errors;
    load(entryFile: string): LoadResult;
    private loadFile;
}
