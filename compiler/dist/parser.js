"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Parser = exports.ParseError = void 0;
const lexer_1 = require("./lexer");
const parser_base_1 = require("./parser_base");
const parse_decls_1 = require("./parse_decls");
const parse_decls2_1 = require("./parse_decls2");
var parser_base_2 = require("./parser_base");
Object.defineProperty(exports, "ParseError", { enumerable: true, get: function () { return parser_base_2.ParseError; } });
class Parser {
    constructor(tokens) {
        this.s = new parser_base_1.TokenStream(tokens);
    }
    parse() {
        const loc = this.s.peek().loc;
        const systems = [];
        while (!this.s.check(lexer_1.TokenKind.EOF)) {
            systems.push(this.parseSystemDecl());
        }
        if (systems.length === 0) {
            throw new parser_base_1.ParseError("Program must contain at least one system declaration", loc);
        }
        return { kind: "Program", loc, systems };
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
            declarations.push(this.parseDeclaration());
        }
        this.s.expect(lexer_1.TokenKind.RBrace, "system body close");
        return { kind: "SystemDecl", loc, name, domain, declarations };
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
                throw new parser_base_1.ParseError("Expected declaration, got " + tok.kind, tok.loc);
        }
    }
}
exports.Parser = Parser;
//# sourceMappingURL=parser.js.map