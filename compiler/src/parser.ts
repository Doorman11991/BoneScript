import { Token, TokenKind } from "./lexer";
import { TokenStream, ParseError } from "./parser_base";
import * as AST from "./ast";
import { parseEntityDecl, parseCapabilityDecl } from "./parse_decls";
import { parseChannelDecl, parseStoreDecl, parseEventDecl, parseConstraintDecl, parsePolicyDecl, parseFlowDecl, parseImportDecl, parseExtensionPointDecl } from "./parse_decls2";

export { ParseError } from "./parser_base";

export class Parser {
  private s: TokenStream;

  constructor(tokens: Token[]) {
    this.s = new TokenStream(tokens);
  }

  parse(): AST.ProgramNode {
    const loc = this.s.peek().loc;
    const systems: AST.SystemDeclNode[] = [];
    while (!this.s.check(TokenKind.EOF)) {
      systems.push(this.parseSystemDecl());
    }
    if (systems.length === 0) {
      throw new ParseError("Program must contain at least one system declaration", loc);
    }
    return { kind: "Program", loc, systems };
  }

  private parseSystemDecl(): AST.SystemDeclNode {
    const loc = this.s.peek().loc;
    this.s.expect(TokenKind.KwSystem, "system declaration");
    const name = this.s.expect(TokenKind.Identifier, "system name").value;
    this.s.expect(TokenKind.LBrace, "system body");
    let domain: string | null = null;
    if (this.s.check(TokenKind.KwDomain)) {
      this.s.advance();
      this.s.expect(TokenKind.Colon, "domain");
      domain = this.s.expect(TokenKind.Identifier, "domain name").value;
    }
    const declarations: AST.DeclarationNode[] = [];
    while (!this.s.check(TokenKind.RBrace) && !this.s.check(TokenKind.EOF)) {
      declarations.push(this.parseDeclaration());
    }
    this.s.expect(TokenKind.RBrace, "system body close");
    return { kind: "SystemDecl", loc, name, domain, declarations };
  }

  private parseDeclaration(): AST.DeclarationNode {
    const tok = this.s.peek();
    switch (tok.kind) {
      case TokenKind.KwEntity: return parseEntityDecl(this.s);
      case TokenKind.KwCapability: return parseCapabilityDecl(this.s);
      case TokenKind.KwChannel: return parseChannelDecl(this.s);
      case TokenKind.KwStore: return parseStoreDecl(this.s);
      case TokenKind.KwEvent: return parseEventDecl(this.s);
      case TokenKind.KwConstraint: return parseConstraintDecl(this.s);
      case TokenKind.KwPolicy: return parsePolicyDecl(this.s);
      case TokenKind.KwFlow: return parseFlowDecl(this.s);
      case TokenKind.KwImport: return parseImportDecl(this.s);
      case TokenKind.KwExtensionPoint: return parseExtensionPointDecl(this.s);
      default:
        throw new ParseError("Expected declaration, got " + tok.kind, tok.loc);
    }
  }
}
