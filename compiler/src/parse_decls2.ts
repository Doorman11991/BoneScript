/**
 * BoneScript Declaration Parsers â€” Channel, Store, Event, Constraint, Policy, Flow, Import
 */

import { TokenKind } from "./lexer";
import { TokenStream, ParseError } from "./parser_base";
import * as AST from "./ast";
import { parseExpr } from "./parse_expr";
import { parseTypeExpr } from "./parse_types";
import { parseFieldList, parseDuration, parseIdentList } from "./parse_decls";

// â”€â”€â”€ Channel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function parseChannelDecl(s: TokenStream): AST.ChannelDeclNode {
  const loc = s.peek().loc;
  s.expect(TokenKind.KwChannel, "channel");
  const name = s.expect(TokenKind.Identifier, "name").value;
  s.expect(TokenKind.LBrace, "{");

  const node: AST.ChannelDeclNode = {
    kind: "ChannelDecl", loc, name,
    transport: null, ordering: null, participants: null,
    persistence: null, filter: null, maxSize: null,
  };

  while (!s.check(TokenKind.RBrace) && !s.check(TokenKind.EOF)) {
    const tok = s.peek();
    switch (tok.kind) {
      case TokenKind.KwTransport: s.advance(); s.expect(TokenKind.Colon, ":"); node.transport = s.advance().value; break;
      case TokenKind.KwOrdering: s.advance(); s.expect(TokenKind.Colon, ":"); node.ordering = s.advance().value; break;
      case TokenKind.KwParticipants: s.advance(); s.expect(TokenKind.Colon, ":"); node.participants = parseTypeExpr(s); break;
      case TokenKind.KwPersistence: s.advance(); s.expect(TokenKind.Colon, ":"); node.persistence = s.advance().value; break;
      case TokenKind.KwFilter: s.advance(); s.expect(TokenKind.Colon, ":"); node.filter = parseExpr(s); break;
      case TokenKind.KwMaxSize: s.advance(); s.expect(TokenKind.Colon, ":"); node.maxSize = parseInt(s.expect(TokenKind.IntLiteral, "n").value, 10); break;
      default: throw new ParseError(`Unexpected in channel: ${tok.kind}`, tok.loc);
    }
  }
  s.expect(TokenKind.RBrace, "}");
  return node;
}

// â”€â”€â”€ Store â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function parseStoreDecl(s: TokenStream): AST.StoreDeclNode {
  const loc = s.peek().loc;
  s.expect(TokenKind.KwStore, "store");
  const name = s.expect(TokenKind.Identifier, "name").value;
  s.expect(TokenKind.LBrace, "{");

  const node: AST.StoreDeclNode = {
    kind: "StoreDecl", loc, name,
    engine: null, schema: [], retention: null, partition: null, replicas: null,
  };

  while (!s.check(TokenKind.RBrace) && !s.check(TokenKind.EOF)) {
    const tok = s.peek();
    switch (tok.kind) {
      case TokenKind.KwEngine: s.advance(); s.expect(TokenKind.Colon, ":"); node.engine = s.advance().value; break;
      case TokenKind.KwSchema:
        s.advance(); s.expect(TokenKind.Colon, ":");
        s.expect(TokenKind.LBrace, "{");
        node.schema = parseFieldList(s);
        s.expect(TokenKind.RBrace, "}");
        break;
      case TokenKind.KwRetention: s.advance(); s.expect(TokenKind.Colon, ":"); node.retention = parseDuration(s); break;
      case TokenKind.KwPartition: s.advance(); s.expect(TokenKind.Colon, ":"); node.partition = s.expect(TokenKind.Identifier, "field").value; break;
      case TokenKind.KwReplicas: s.advance(); s.expect(TokenKind.Colon, ":"); node.replicas = parseInt(s.expect(TokenKind.IntLiteral, "n").value, 10); break;
      default: throw new ParseError(`Unexpected in store: ${tok.kind}`, tok.loc);
    }
  }
  s.expect(TokenKind.RBrace, "}");
  return node;
}

// â”€â”€â”€ Event â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function parseEventDecl(s: TokenStream): AST.EventDeclNode {
  const loc = s.peek().loc;
  s.expect(TokenKind.KwEvent, "event");
  const name = s.expect(TokenKind.Identifier, "name").value;
  s.expect(TokenKind.LBrace, "{");

  const node: AST.EventDeclNode = {
    kind: "EventDecl", loc, name, payload: [], delivery: null, ttl: null,
  };

  while (!s.check(TokenKind.RBrace) && !s.check(TokenKind.EOF)) {
    const tok = s.peek();
    switch (tok.kind) {
      case TokenKind.KwPayload:
        s.advance(); s.expect(TokenKind.Colon, ":");
        s.expect(TokenKind.LBrace, "{");
        node.payload = parseFieldList(s);
        s.expect(TokenKind.RBrace, "}");
        break;
      case TokenKind.KwDelivery: s.advance(); s.expect(TokenKind.Colon, ":"); node.delivery = s.advance().value; break;
      case TokenKind.KwTtl: s.advance(); s.expect(TokenKind.Colon, ":"); node.ttl = parseDuration(s); break;
      default: throw new ParseError(`Unexpected in event: ${tok.kind}`, tok.loc);
    }
  }
  s.expect(TokenKind.RBrace, "}");
  return node;
}

// â”€â”€â”€ Constraint â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function parseConstraintDecl(s: TokenStream): AST.ConstraintDeclNode {
  const loc = s.peek().loc;
  s.expect(TokenKind.KwConstraint, "constraint");
  const name = s.expect(TokenKind.Identifier, "name").value;
  s.expect(TokenKind.Colon, ":");
  const expr = parseExpr(s);
  return { kind: "ConstraintDecl", loc, name, expr };
}

// â”€â”€â”€ Policy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function parsePolicyDecl(s: TokenStream): AST.PolicyDeclNode {
  const loc = s.peek().loc;
  s.expect(TokenKind.KwPolicy, "policy");
  const name = s.expect(TokenKind.Identifier, "name").value;
  s.expect(TokenKind.LBrace, "{");

  const node: AST.PolicyDeclNode = {
    kind: "PolicyDecl", loc, name, rateLimit: null, access: [], audit: null, encryption: null,
  };

  while (!s.check(TokenKind.RBrace) && !s.check(TokenKind.EOF)) {
    const tok = s.peek();
    switch (tok.kind) {
      case TokenKind.KwRateLimit:
        s.advance(); s.expect(TokenKind.Colon, ":");
        const count = parseInt(s.expect(TokenKind.IntLiteral, "count").value, 10);
        s.expect(TokenKind.KwPer, "per");
        const per = parseDuration(s);
        node.rateLimit = { count, per };
        break;
      case TokenKind.KwAccess:
        s.advance(); s.expect(TokenKind.Colon, ":");
        s.expect(TokenKind.LBracket, "[");
        node.access = parseIdentList(s);
        s.expect(TokenKind.RBracket, "]");
        break;
      case TokenKind.KwAudit: s.advance(); s.expect(TokenKind.Colon, ":"); node.audit = s.advance().kind === TokenKind.KwTrue; break;
      case TokenKind.KwEncryption: s.advance(); s.expect(TokenKind.Colon, ":"); node.encryption = s.advance().value; break;
      default: throw new ParseError(`Unexpected in policy: ${tok.kind}`, tok.loc);
    }
  }
  s.expect(TokenKind.RBrace, "}");
  return node;
}

// â”€â”€â”€ Flow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function parseFlowDecl(s: TokenStream): AST.FlowDeclNode {
  const loc = s.peek().loc;
  s.expect(TokenKind.KwFlow, "flow");
  const name = s.expect(TokenKind.Identifier, "name").value;
  s.expect(TokenKind.LBrace, "{");

  const steps: AST.FlowStepNode[] = [];
  while (!s.check(TokenKind.RBrace) && !s.check(TokenKind.EOF)) {
    const sloc = s.peek().loc;
    s.expect(TokenKind.KwStep, "step");
    const stepName = s.expect(TokenKind.Identifier, "step name").value;
    s.expect(TokenKind.Colon, ":");
    const action = parseCallExpr(s);
    let compensate: AST.CallExprNode | null = null;
    if (s.check(TokenKind.KwCompensate)) {
      s.advance(); s.expect(TokenKind.Colon, ":");
      compensate = parseCallExpr(s);
    }
    steps.push({ kind: "FlowStep", loc: sloc, name: stepName, action, compensate });
  }
  s.expect(TokenKind.RBrace, "}");
  return { kind: "FlowDecl", loc, name, steps };
}

function parseCallExpr(s: TokenStream): AST.CallExprNode {
  const loc = s.peek().loc;
  const name = s.expect(TokenKind.Identifier, "call name").value;
  s.expect(TokenKind.LParen, "(");
  const args: AST.ExprNode[] = [];
  if (!s.check(TokenKind.RParen)) {
    do { args.push(parseExpr(s)); } while (s.match(TokenKind.Comma));
  }
  s.expect(TokenKind.RParen, ")");
  return { kind: "CallExpr", loc, name, args };
}

// â”€â”€â”€ Import â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function parseImportDecl(s: TokenStream): AST.ImportDeclNode {
  const loc = s.peek().loc;
  s.expect(TokenKind.KwImport, "import");
  const name = s.expect(TokenKind.Identifier, "name").value;
  s.expect(TokenKind.KwFrom, "from");
  const from = s.expect(TokenKind.StringLiteral, "path").value;
  return { kind: "ImportDecl", loc, name, from };
}

// ─── Extension Point ─────────────────────────────────────────────────────────

export function parseExtensionPointDecl(s: TokenStream): AST.ExtensionPointDeclNode {
  const loc = s.peek().loc;
  s.expect(TokenKind.KwExtensionPoint, "extension_point");
  const name = s.expect(TokenKind.Identifier, "extension point name").value;
  s.expect(TokenKind.LParen, "(");
  const params: AST.ParamNode[] = [];
  if (!s.check(TokenKind.RParen)) {
    do {
      const ploc = s.peek().loc;
      // Allow keywords as param names
      const pname = s.peek().kind === TokenKind.Identifier ? s.advance().value : s.advance().value;
      s.expect(TokenKind.Colon, ":");
      const ptype = parseTypeExpr(s);
      params.push({ kind: "Param", loc: ploc, name: pname, type: ptype });
    } while (s.match(TokenKind.Comma));
  }
  s.expect(TokenKind.RParen, ")");

  let returns: AST.TypeExprNode | null = null;
  let stable = false;

  s.expect(TokenKind.LBrace, "{");
  while (!s.check(TokenKind.RBrace) && !s.check(TokenKind.EOF)) {
    const tok = s.peek();
    if (tok.kind === TokenKind.KwReturns) {
      s.advance(); s.expect(TokenKind.Colon, ":");
      returns = parseTypeExpr(s);
    } else if (tok.kind === TokenKind.KwStable) {
      s.advance(); s.expect(TokenKind.Colon, ":");
      stable = s.advance().kind === TokenKind.KwTrue;
    } else if (tok.kind === TokenKind.KwLanguage) {
      // language: typescript — consume and ignore (only TS supported)
      s.advance(); s.expect(TokenKind.Colon, ":"); s.advance();
    } else {
      throw new ParseError(`Unexpected in extension_point: ${tok.kind}`, tok.loc);
    }
  }
  s.expect(TokenKind.RBrace, "}");

  return { kind: "ExtensionPointDecl", loc, name, params, returns, stable };
}
