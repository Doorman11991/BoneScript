"use strict";
/**
 * bone parser with Error Recovery
 * Wraps the strict parser to collect multiple errors per file.
 *
 * Strategy:
 * - On error, skip tokens until we hit a synchronization point
 * - Synchronization points: declaration keywords (entity, capability, etc.) and closing braces
 * - Each error is recorded with location, but parsing continues
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecoveringParser = void 0;
const lexer_1 = require("./lexer");
const parser_base_1 = require("./parser_base");
const parse_decls_1 = require("./parse_decls");
const parse_decls2_1 = require("./parse_decls2");
const SYNC_POINTS = new Set([
    lexer_1.TokenKind.KwSystem,
    lexer_1.TokenKind.KwEntity,
    lexer_1.TokenKind.KwCapability,
    lexer_1.TokenKind.KwChannel,
    lexer_1.TokenKind.KwStore,
    lexer_1.TokenKind.KwEvent,
    lexer_1.TokenKind.KwConstraint,
    lexer_1.TokenKind.KwPolicy,
    lexer_1.TokenKind.KwFlow,
    lexer_1.TokenKind.KwImport,
    lexer_1.TokenKind.KwExtensionPoint,
    lexer_1.TokenKind.RBrace,
]);
class RecoveringParser {
    constructor(tokens) {
        this.errors = [];
        this.s = new parser_base_1.TokenStream(tokens);
    }
    parse() {
        const loc = this.s.peek().loc;
        const systems = [];
        while (!this.s.check(lexer_1.TokenKind.EOF)) {
            try {
                systems.push(this.parseSystemDecl());
            }
            catch (e) {
                if (e instanceof parser_base_1.ParseError) {
                    this.errors.push(e);
                    this.synchronize();
                }
                else {
                    throw e;
                }
            }
        }
        if (systems.length === 0 && this.errors.length === 0) {
            this.errors.push(new parser_base_1.ParseError("Program must contain at least one system declaration", loc));
        }
        return {
            ast: systems.length > 0 ? { kind: "Program", loc, systems } : null,
            errors: this.errors,
        };
    }
    synchronize() {
        // Skip tokens until we find a synchronization point
        while (!this.s.check(lexer_1.TokenKind.EOF)) {
            const tok = this.s.peek();
            if (SYNC_POINTS.has(tok.kind)) {
                // Found sync point â€” if it's a closing brace, consume it; otherwise leave it for next parse
                if (tok.kind === lexer_1.TokenKind.RBrace)
                    this.s.advance();
                return;
            }
            this.s.advance();
        }
    }
    parseSystemDecl() {
        const loc = this.s.peek().loc;
        this.s.expect(lexer_1.TokenKind.KwSystem, "system declaration");
        const name = this.s.expect(lexer_1.TokenKind.Identifier, "system name").value;
        this.s.expect(lexer_1.TokenKind.LBrace, "system body");
        let domain = null;
        if (this.s.check(lexer_1.TokenKind.KwDomain)) {
            this.s.advance();
            this.s.expect(lexer_1.TokenKind.Colon, "domain");
            domain = this.s.expect(lexer_1.TokenKind.Identifier, "domain name").value;
        }
        const declarations = [];
        while (!this.s.check(lexer_1.TokenKind.RBrace) && !this.s.check(lexer_1.TokenKind.EOF)) {
            try {
                declarations.push(this.parseDeclaration());
            }
            catch (e) {
                if (e instanceof parser_base_1.ParseError) {
                    this.errors.push(e);
                    this.synchronizeInBody();
                }
                else {
                    throw e;
                }
            }
        }
        this.s.expect(lexer_1.TokenKind.RBrace, "system body close");
        return { kind: "SystemDecl", loc, name, domain, declarations };
    }
    synchronizeInBody() {
        let depth = 0;
        while (!this.s.check(lexer_1.TokenKind.EOF)) {
            const tok = this.s.peek();
            if (tok.kind === lexer_1.TokenKind.LBrace)
                depth++;
            if (tok.kind === lexer_1.TokenKind.RBrace) {
                if (depth === 0)
                    return; // hit system close
                depth--;
                this.s.advance();
                continue;
            }
            if (depth === 0 && SYNC_POINTS.has(tok.kind))
                return;
            this.s.advance();
        }
    }
    parseDeclaration() {
        const tok = this.s.peek();
        switch (tok.kind) {
            case lexer_1.TokenKind.KwEntity: return (0, parse_decls_1.parseEntityDecl)(this.s);
            case lexer_1.TokenKind.KwCapability: return (0, parse_decls_1.parseCapabilityDecl)(this.s);
            case lexer_1.TokenKind.KwChannel: return (0, parse_decls2_1.parseChannelDecl)(this.s);
            case lexer_1.TokenKind.KwStore: return (0, parse_decls2_1.parseStoreDecl)(this.s);
            case lexer_1.TokenKind.KwEvent: return (0, parse_decls2_1.parseEventDecl)(this.s);
            case lexer_1.TokenKind.KwConstraint: return (0, parse_decls2_1.parseConstraintDecl)(this.s);
            case lexer_1.TokenKind.KwPolicy: return (0, parse_decls2_1.parsePolicyDecl)(this.s);
            case lexer_1.TokenKind.KwFlow: return (0, parse_decls2_1.parseFlowDecl)(this.s);
            case lexer_1.TokenKind.KwImport: return (0, parse_decls2_1.parseImportDecl)(this.s);
            case lexer_1.TokenKind.KwExtensionPoint: return (0, parse_decls2_1.parseExtensionPointDecl)(this.s);
            default:
                throw new parser_base_1.ParseError(`Expected declaration, got ${tok.kind} ('${tok.value}')`, tok.loc);
        }
    }
}
exports.RecoveringParser = RecoveringParser;
//# sourceMappingURL=parser_recovery.js.map