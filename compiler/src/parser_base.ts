/**
 * bone parser Base â€” Token stream utilities.
 */

import { Token, TokenKind, SourceLocation } from "./lexer";

export class ParseError extends Error {
  constructor(message: string, public loc: SourceLocation) {
    super(`Parse error at ${loc.line}:${loc.column}: ${message}`);
    this.name = "ParseError";
  }
}

export class TokenStream {
  private tokens: Token[];
  private pos: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  peek(offset: number = 0): Token {
    return this.tokens[this.pos + offset] ?? this.tokens[this.tokens.length - 1];
  }

  check(kind: TokenKind): boolean {
    return this.peek().kind === kind;
  }

  checkAny(...kinds: TokenKind[]): boolean {
    return kinds.includes(this.peek().kind);
  }

  advance(): Token {
    const t = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) this.pos++;
    return t;
  }

  expect(kind: TokenKind, context: string): Token {
    if (!this.check(kind)) {
      throw new ParseError(
        `Expected ${kind} in ${context}, got ${this.peek().kind} ('${this.peek().value}')`,
        this.peek().loc
      );
    }
    return this.advance();
  }

  match(kind: TokenKind): boolean {
    if (this.check(kind)) {
      this.advance();
      return true;
    }
    return false;
  }
}
