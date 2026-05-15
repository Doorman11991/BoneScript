"use strict";
/**
 * bone parser Base â€” Token stream utilities.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenStream = exports.ParseError = void 0;
class ParseError extends Error {
    constructor(message, loc) {
        super(`Parse error at ${loc.line}:${loc.column}: ${message}`);
        this.loc = loc;
        this.name = "ParseError";
    }
}
exports.ParseError = ParseError;
class TokenStream {
    constructor(tokens) {
        this.pos = 0;
        this.tokens = tokens;
    }
    peek(offset = 0) {
        return this.tokens[this.pos + offset] ?? this.tokens[this.tokens.length - 1];
    }
    check(kind) {
        return this.peek().kind === kind;
    }
    checkAny(...kinds) {
        return kinds.includes(this.peek().kind);
    }
    advance() {
        const t = this.tokens[this.pos];
        if (this.pos < this.tokens.length - 1)
            this.pos++;
        return t;
    }
    expect(kind, context) {
        if (!this.check(kind)) {
            throw new ParseError(`Expected ${kind} in ${context}, got ${this.peek().kind} ('${this.peek().value}')`, this.peek().loc);
        }
        return this.advance();
    }
    match(kind) {
        if (this.check(kind)) {
            this.advance();
            return true;
        }
        return false;
    }
}
exports.TokenStream = TokenStream;
//# sourceMappingURL=parser_base.js.map