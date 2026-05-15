/**
 * bone parser Base â€” Token stream utilities.
 */
import { Token, TokenKind, SourceLocation } from "./lexer";
export declare class ParseError extends Error {
    loc: SourceLocation;
    constructor(message: string, loc: SourceLocation);
}
export declare class TokenStream {
    private tokens;
    private pos;
    constructor(tokens: Token[]);
    peek(offset?: number): Token;
    check(kind: TokenKind): boolean;
    checkAny(...kinds: TokenKind[]): boolean;
    advance(): Token;
    expect(kind: TokenKind, context: string): Token;
    match(kind: TokenKind): boolean;
}
