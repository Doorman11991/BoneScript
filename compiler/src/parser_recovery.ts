/**
 * bone parser with Error Recovery
 * Wraps the strict parser to collect multiple errors per file.
 *
 * Strategy:
 * - On error, skip tokens until we hit a synchronization point
 * - Synchronization points: declaration keywords (entity, capability, etc.) and closing braces
 * - Each error is recorded with location, but parsing continues
 */

import { Token, TokenKind } from "./lexer";
import { TokenStream, ParseError } from "./parser_base";
import * as AST from "./ast";
import { parseEntityDecl, parseCapabilityDecl } from "./parse_decls";
import {
  parseChannelDecl, parseStoreDecl, parseEventDecl,
  parseConstraintDecl, parsePolicyDecl, parseFlowDecl, parseImportDecl,
  parseExtensionPointDecl,
} from "./parse_decls2";

export interface RecoveredParseResult {
  ast: AST.ProgramNode | null;
  errors: ParseError[];
}

const SYNC_POINTS = new Set([
  TokenKind.KwSystem,
  TokenKind.KwEntity,
  TokenKind.KwCapability,
  TokenKind.KwChannel,
  TokenKind.KwStore,
  TokenKind.KwEvent,
  TokenKind.KwConstraint,
  TokenKind.KwPolicy,
  TokenKind.KwFlow,
  TokenKind.KwImport,
  TokenKind.KwExtensionPoint,
  TokenKind.RBrace,
]);

export class RecoveringParser {
  private s: TokenStream;
  private errors: ParseError[] = [];

  constructor(tokens: Token[]) {
    this.s = new TokenStream(tokens);
  }

  parse(): RecoveredParseResult {
    const loc = this.s.peek().loc;
    const systems: AST.SystemDeclNode[] = [];

    while (!this.s.check(TokenKind.EOF)) {
      try {
        systems.push(this.parseSystemDecl());
      } catch (e) {
        if (e instanceof ParseError) {
          this.errors.push(e);
          this.synchronize();
        } else {
          throw e;
        }
      }
    }

    if (systems.length === 0 && this.errors.length === 0) {
      this.errors.push(new ParseError("Program must contain at least one system declaration", loc));
    }

    return {
      ast: systems.length > 0 ? { kind: "Program", loc, systems } : null,
      errors: this.errors,
    };
  }

  private synchronize() {
    // Skip tokens until we find a synchronization point
    while (!this.s.check(TokenKind.EOF)) {
      const tok = this.s.peek();
      if (SYNC_POINTS.has(tok.kind)) {
        // Found sync point â€” if it's a closing brace, consume it; otherwise leave it for next parse
        if (tok.kind === TokenKind.RBrace) this.s.advance();
        return;
      }
      this.s.advance();
    }
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
      try {
        declarations.push(this.parseDeclaration());
      } catch (e) {
        if (e instanceof ParseError) {
          this.errors.push(e);
          this.synchronizeInBody();
        } else {
          throw e;
        }
      }
    }

    this.s.expect(TokenKind.RBrace, "system body close");
    return { kind: "SystemDecl", loc, name, domain, declarations };
  }

  private synchronizeInBody() {
    let depth = 0;
    while (!this.s.check(TokenKind.EOF)) {
      const tok = this.s.peek();
      if (tok.kind === TokenKind.LBrace) depth++;
      if (tok.kind === TokenKind.RBrace) {
        if (depth === 0) return; // hit system close
        depth--;
        this.s.advance();
        continue;
      }
      if (depth === 0 && SYNC_POINTS.has(tok.kind)) return;
      this.s.advance();
    }
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
        throw new ParseError(`Expected declaration, got ${tok.kind} ('${tok.value}')`, tok.loc);
    }
  }
}
