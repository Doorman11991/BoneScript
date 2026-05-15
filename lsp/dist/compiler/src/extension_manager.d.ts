/**
 * BoneScript Extension Manager
 *
 * Handles the escape hatch system: extension_point declarations.
 *
 * How it works:
 * 1. Compiler emits a stub with sentinel comments around the implementation region.
 * 2. On recompile, the merger reads the existing output file and extracts any
 *    user code between the sentinels.
 * 3. The user's code is re-injected into the newly generated file.
 * 4. If stable: true and no implementation exists, compilation fails.
 *
 * Sentinel format (must be unique and parseable):
 *   // <bonescript:ext:NAME:begin>
 *   ... user code here ...
 *   // <bonescript:ext:NAME:end>
 */
import * as AST from "./ast";
export declare function beginSentinel(name: string): string;
export declare function endSentinel(name: string): string;
export declare function isStubImplementation(code: string): boolean;
export declare function emitExtensionPointStub(ext: AST.ExtensionPointDeclNode): string;
export interface ExtractedImpl {
    name: string;
    code: string;
    isStub: boolean;
}
export declare function extractImplementations(existingContent: string): Map<string, ExtractedImpl>;
export declare function mergeImplementations(newContent: string, existingImpls: Map<string, ExtractedImpl>): string;
export interface ExtensionValidationError {
    name: string;
    message: string;
}
export declare function validateExtensions(extensions: AST.ExtensionPointDeclNode[], existingImpls: Map<string, ExtractedImpl>): ExtensionValidationError[];
export declare function mergeWithExisting(newContent: string, outputPath: string, extensions: AST.ExtensionPointDeclNode[]): {
    content: string;
    validationErrors: ExtensionValidationError[];
};
