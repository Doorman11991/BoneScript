/**
 * bone parser with Error Recovery
 * Wraps the strict parser to collect multiple errors per file.
 *
 * Strategy:
 * - On error, skip tokens until we hit a synchronization point
 * - Synchronization points: declaration keywords (entity, capability, etc.) and closing braces
 * - Each error is recorded with location, but parsing continues
 */
import { Token } from "./lexer";
import { ParseError } from "./parser_base";
import * as AST from "./ast";
export interface RecoveredParseResult {
    ast: AST.ProgramNode | null;
    errors: ParseError[];
}
export declare class RecoveringParser {
    private s;
    private errors;
    constructor(tokens: Token[]);
    parse(): RecoveredParseResult;
    private synchronize;
    private parseSystemDecl;
    private synchronizeInBody;
    private parseDeclaration;
}
