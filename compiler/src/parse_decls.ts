/**
 * BoneScript Declaration Parsers
 */

import { TokenKind } from "./lexer";
import { TokenStream, ParseError } from "./parser_base";
import * as AST from "./ast";
import { parseExpr, parseExprList } from "./parse_expr";
import { parseTypeExpr } from "./parse_types";

// â”€â”€â”€ Shared Utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Accept an identifier OR a keyword token as a name (for contexts where keywords are valid names) */
function parseIdentOrKeyword(s: TokenStream): string {
  const tok = s.peek();
  if (tok.kind === TokenKind.Identifier) return s.advance().value;
  // Allow any keyword to be used as a name in parameter/field position
  if (tok.value && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tok.value)) return s.advance().value;
  throw new ParseError(`Expected identifier, got ${tok.kind}`, tok.loc);
}

export function parseFieldList(s: TokenStream): AST.FieldNode[] {
  const fields: AST.FieldNode[] = [];
  if (s.check(TokenKind.RBracket) || s.check(TokenKind.RBrace)) return fields;
  do { fields.push(parseField(s)); } while (s.match(TokenKind.Comma));
  return fields;
}

export function parseField(s: TokenStream): AST.FieldNode {
  const loc = s.peek().loc;
  const name = parseIdentOrKeyword(s);
  s.expect(TokenKind.Colon, "field type");
  const type = parseTypeExpr(s);
  let defaultValue: AST.ExprNode | null = null;
  if (s.match(TokenKind.Equals)) { defaultValue = parseExpr(s); }
  return { kind: "Field", loc, name, type, defaultValue };
}

export function parseIdentList(s: TokenStream): string[] {
  const ids: string[] = [];
  ids.push(s.expect(TokenKind.Identifier, "identifier").value);
  while (s.match(TokenKind.Comma)) {
    ids.push(s.expect(TokenKind.Identifier, "identifier").value);
  }
  return ids;
}

export function parseDuration(s: TokenStream): string {
  const tok = s.peek();
  if (tok.kind === TokenKind.IntLiteral || tok.kind === TokenKind.Identifier) {
    return s.advance().value;
  }
  throw new ParseError(`Expected duration, got ${tok.kind}`, tok.loc);
}

function parseFieldRef(s: TokenStream): AST.FieldRefNode {
  const loc = s.peek().loc;
  const path: string[] = [];
  // Accept keywords as field names too
  path.push(parseIdentOrKeyword(s));
  while (s.match(TokenKind.Dot)) {
    const next = s.peek();
    if (next.kind === TokenKind.Identifier || next.kind === TokenKind.KwUnique ||
        (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(next.value) && next.kind !== TokenKind.EOF)) {
      path.push(s.advance().value);
    } else { break; }
  }
  return { kind: "FieldRef", loc, path };
}

// â”€â”€â”€ Entity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function parseEntityDecl(s: TokenStream): AST.EntityDeclNode {
  const loc = s.peek().loc;
  s.expect(TokenKind.KwEntity, "entity");
  const name = s.expect(TokenKind.Identifier, "entity name").value;
  s.expect(TokenKind.LBrace, "entity body");

  const node: AST.EntityDeclNode = {
    kind: "EntityDecl", loc, name,
    owns: [], constraints: [], states: null, auth: null,
    relations: [], indexes: [], derived: [],
  };

  while (!s.check(TokenKind.RBrace) && !s.check(TokenKind.EOF)) {
    const tok = s.peek();
    switch (tok.kind) {
      case TokenKind.KwOwns:
        s.advance(); s.expect(TokenKind.Colon, "owns");
        s.expect(TokenKind.LBracket, "owns fields");
        node.owns = parseFieldList(s);
        s.expect(TokenKind.RBracket, "owns close");
        break;
      case TokenKind.KwConstraints:
        s.advance(); s.expect(TokenKind.Colon, "constraints");
        s.expect(TokenKind.LBracket, "constraints list");
        node.constraints = parseExprList(s);
        s.expect(TokenKind.RBracket, "constraints close");
        break;
      case TokenKind.KwStates:
        s.advance(); s.expect(TokenKind.Colon, "states");
        node.states = parseStateGraph(s);
        break;
      case TokenKind.KwAuth:
        s.advance(); s.expect(TokenKind.Colon, "auth");
        node.auth = parseAuthMethod(s);
        break;
      case TokenKind.KwIndex:
        s.advance(); s.expect(TokenKind.Colon, "index");
        s.expect(TokenKind.LBracket, "index list");
        node.indexes.push(parseIdentList(s));
        s.expect(TokenKind.RBracket, "index close");
        break;
      case TokenKind.KwRelation:
        node.relations.push(parseRelation(s));
        break;
      case TokenKind.KwDerived:
        node.derived.push(parseDerived(s));
        break;
      default:
        throw new ParseError(`Unexpected in entity: ${tok.kind}`, tok.loc);
    }
  }
  s.expect(TokenKind.RBrace, "entity close");
  return node;
}

function parseAuthMethod(s: TokenStream): string {
  const auths = [TokenKind.KwJwt, TokenKind.KwOauth2, TokenKind.KwApikey, TokenKind.KwSession, TokenKind.KwNone];
  if (!auths.includes(s.peek().kind)) {
    throw new ParseError(`Expected auth method, got ${s.peek().kind}`, s.peek().loc);
  }
  return s.advance().value;
}

function parseStateGraph(s: TokenStream): AST.StateGraphNode {
  const loc = s.peek().loc;
  const nodes: AST.StateNodeEntry[] = [];
  let current: AST.StateNodeEntry = { name: s.expect(TokenKind.Identifier, "state").value, guard: null, transitions: [], branches: [] };
  nodes.push(current);

  while (s.check(TokenKind.Arrow) || s.check(TokenKind.Pipe)) {
    const isArrow = s.check(TokenKind.Arrow);
    s.advance();
    const next: AST.StateNodeEntry = { name: s.expect(TokenKind.Identifier, "state").value, guard: null, transitions: [], branches: [] };
    if (isArrow) { current.transitions.push(next.name); } else { current.branches.push(next.name); }
    nodes.push(next);
    if (isArrow) current = next;
  }
  return { kind: "StateGraph", loc, nodes };
}

function parseRelation(s: TokenStream): AST.RelationNode {
  const loc = s.peek().loc;
  s.expect(TokenKind.KwRelation, "relation");
  const name = s.expect(TokenKind.Identifier, "relation name").value;
  s.expect(TokenKind.Colon, "relation type");
  const types = [TokenKind.KwHasOne, TokenKind.KwHasMany, TokenKind.KwBelongsTo, TokenKind.KwManyToMany];
  if (!types.includes(s.peek().kind)) throw new ParseError(`Expected relation type`, s.peek().loc);
  const relationType = s.advance().value as AST.RelationNode["relationType"];
  const target = s.expect(TokenKind.Identifier, "relation target").value;
  let cardinality: AST.RelationNode["cardinality"] = null;
  if (s.match(TokenKind.LBracket)) {
    const min = parseInt(s.expect(TokenKind.IntLiteral, "min").value, 10);
    s.expect(TokenKind.DotDot, "..");
    const max: number | "*" = s.peek().kind === TokenKind.Star ? (s.advance(), "*") : parseInt(s.expect(TokenKind.IntLiteral, "max").value, 10);
    s.expect(TokenKind.RBracket, "]");
    cardinality = { min, max };
  }
  return { kind: "Relation", loc, name, relationType, target, cardinality };
}

function parseDerived(s: TokenStream): AST.DerivedFieldNode {
  const loc = s.peek().loc;
  s.expect(TokenKind.KwDerived, "derived");
  const name = s.expect(TokenKind.Identifier, "name").value;
  s.expect(TokenKind.Colon, ":");
  const expr = parseExpr(s);
  return { kind: "DerivedField", loc, name, expr };
}

// â”€â”€â”€ Capability â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function parseCapabilityDecl(s: TokenStream): AST.CapabilityDeclNode {
  const loc = s.peek().loc;
  s.expect(TokenKind.KwCapability, "capability");
  const name = s.expect(TokenKind.Identifier, "name").value;
  s.expect(TokenKind.LParen, "(");
  const params: AST.ParamNode[] = [];
  if (!s.check(TokenKind.RParen)) {
    do {
      const ploc = s.peek().loc;
      // Allow keywords as param names (e.g., "from", "to")
      const pname = parseIdentOrKeyword(s);
      s.expect(TokenKind.Colon, ":");
      const ptype = parseTypeExpr(s);
      params.push({ kind: "Param", loc: ploc, name: pname, type: ptype });
    } while (s.match(TokenKind.Comma));
  }
  s.expect(TokenKind.RParen, ")");
  s.expect(TokenKind.LBrace, "{");

  const node: AST.CapabilityDeclNode = {
    kind: "CapabilityDecl", loc, name, params,
    requires: [], effects: [], emits: [],
    sync: null, timeout: null, retry: null, idempotent: null,
    pipeline: null, algorithm: null, returns: null,
  };

  while (!s.check(TokenKind.RBrace) && !s.check(TokenKind.EOF)) {
    const tok = s.peek();
    switch (tok.kind) {
      case TokenKind.KwRequires:
        s.advance(); s.expect(TokenKind.Colon, ":");
        s.expect(TokenKind.LBracket, "[");
        node.requires = parseExprList(s);
        s.expect(TokenKind.RBracket, "]");
        break;
      case TokenKind.KwEffects:
        s.advance(); s.expect(TokenKind.Colon, ":");
        s.expect(TokenKind.LBracket, "[");
        node.effects = parseEffectList(s);
        s.expect(TokenKind.RBracket, "]");
        break;
      case TokenKind.KwEmits:
        s.advance(); s.expect(TokenKind.Colon, ":");
        node.emits = parseEmitList(s);
        break;
      case TokenKind.KwSync:
        s.advance(); s.expect(TokenKind.Colon, ":");
        node.sync = s.advance().value;
        break;
      case TokenKind.KwTimeout:
        s.advance(); s.expect(TokenKind.Colon, ":");
        node.timeout = parseDuration(s);
        break;
      case TokenKind.KwIdempotent:
        s.advance(); s.expect(TokenKind.Colon, ":");
        node.idempotent = s.advance().kind === TokenKind.KwTrue;
        break;
      case TokenKind.KwRetry:
        s.advance(); s.expect(TokenKind.Colon, ":");
        node.retry = parseRetryPolicy(s);
        break;
      case TokenKind.KwReturns:
        s.advance(); s.expect(TokenKind.Colon, ":");
        node.returns = parseTypeExpr(s);
        break;
      case TokenKind.KwPipeline:
        node.pipeline = parsePipeline(s);
        break;
      case TokenKind.KwParallel:
        node.pipeline = parsePipeline(s, true);
        break;
      case TokenKind.KwAlgorithm:
        node.algorithm = parseAlgorithm(s);
        break;
      default:
        throw new ParseError(`Unexpected in capability: ${tok.kind}`, tok.loc);
    }
  }
  s.expect(TokenKind.RBrace, "}");
  return node;
}

function parseEffectList(s: TokenStream): AST.EffectNode[] {
  const effects: AST.EffectNode[] = [];
  if (s.check(TokenKind.RBracket)) return effects;
  do {
    const loc = s.peek().loc;
    const target = parseFieldRef(s);
    const opTok = s.peek();
    let op: "=" | "+=" | "-=";
    if (opTok.kind === TokenKind.Equals) { op = "="; s.advance(); }
    else if (opTok.kind === TokenKind.PlusEq) { op = "+="; s.advance(); }
    else if (opTok.kind === TokenKind.MinusEq) { op = "-="; s.advance(); }
    else throw new ParseError(`Expected =, +=, -= in effect`, opTok.loc);
    const value = parseExpr(s);
    effects.push({ kind: "Effect", loc, target, op, value });
  } while (s.match(TokenKind.Comma));
  return effects;
}

function parseEmitList(s: TokenStream): AST.EmitNode[] {
  const emits: AST.EmitNode[] = [];
  do {
    const loc = s.peek().loc;
    const eventName = s.expect(TokenKind.Identifier, "event name").value;
    const args: AST.ExprNode[] = [];
    if (s.match(TokenKind.LParen)) {
      if (!s.check(TokenKind.RParen)) {
        do { args.push(parseExpr(s)); } while (s.match(TokenKind.Comma));
      }
      s.expect(TokenKind.RParen, ")");
    }
    emits.push({ kind: "Emit", loc, eventName, args });
  } while (s.match(TokenKind.Comma));
  return emits;
}

function parseRetryPolicy(s: TokenStream): AST.RetryPolicyNode {
  const loc = s.peek().loc;
  s.expect(TokenKind.LBrace, "{");
  const node: AST.RetryPolicyNode = { kind: "RetryPolicy", loc, maxAttempts: null, backoff: null, interval: null };
  while (!s.check(TokenKind.RBrace)) {
    const tok = s.peek();
    if (tok.kind === TokenKind.KwMaxAttempts) { s.advance(); s.expect(TokenKind.Colon, ":"); node.maxAttempts = parseInt(s.expect(TokenKind.IntLiteral, "n").value, 10); }
    else if (tok.kind === TokenKind.KwBackoff) { s.advance(); s.expect(TokenKind.Colon, ":"); node.backoff = s.advance().value; }
    else if (tok.kind === TokenKind.KwInterval) { s.advance(); s.expect(TokenKind.Colon, ":"); node.interval = parseDuration(s); }
    else throw new ParseError(`Unexpected in retry: ${tok.kind}`, tok.loc);
    if (!s.match(TokenKind.Comma)) break;
  }
  s.expect(TokenKind.RBrace, "}");
  return node;
}


// â”€â”€â”€ Pipeline (Leap 1) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function parsePipeline(s: TokenStream, parallel: boolean = false): AST.PipelineNode {
  const loc = s.peek().loc;
  s.advance(); // consume pipeline or parallel
  s.expect(TokenKind.Colon, ":");
  s.expect(TokenKind.LBrace, "{");

  const steps: AST.PipelineStepNode[] = [];
  let onError: AST.PipelineErrorHandler | null = null;

  while (!s.check(TokenKind.RBrace) && !s.check(TokenKind.EOF)) {
    if (s.check(TokenKind.KwOnError)) {
      onError = parsePipelineErrorHandler(s);
      continue;
    }
    steps.push(parsePipelineStep(s));
  }

  s.expect(TokenKind.RBrace, "}");
  return { kind: "Pipeline", loc, steps, parallel, onError };
}

function parsePipelineStep(s: TokenStream): AST.PipelineStepNode {
  const loc = s.peek().loc;
  const name = s.expect(TokenKind.Identifier, "step name").value;
  s.expect(TokenKind.LParen, "(");
  const args: AST.ExprNode[] = [];
  if (!s.check(TokenKind.RParen)) {
    do { args.push(parseExpr(s)); } while (s.match(TokenKind.Comma));
  }
  s.expect(TokenKind.RParen, ")");

  let bindAs: string | null = null;
  // Optional `as <name>` binding for capturing output
  if (s.peek().kind === TokenKind.Identifier && s.peek().value === "as") {
    s.advance();
    bindAs = s.expect(TokenKind.Identifier, "binding name").value;
  }

  const call: AST.CallExprNode = { kind: "CallExpr", loc, name, args };
  return { kind: "PipelineStep", loc, call, bindAs };
}

function parsePipelineErrorHandler(s: TokenStream): AST.PipelineErrorHandler {
  s.expect(TokenKind.KwOnError, "on_error");
  s.expect(TokenKind.Colon, ":");
  const tok = s.peek();
  const action = s.advance().value as AST.PipelineErrorHandler["action"];

  let call: AST.CallExprNode | null = null;
  // Optional call expression for compensate / retry
  if (s.check(TokenKind.LParen) || (s.peek().kind === TokenKind.Identifier && s.peek(1).kind === TokenKind.LParen)) {
    const callLoc = s.peek().loc;
    if (s.peek().kind === TokenKind.Identifier) {
      const name = s.advance().value;
      s.expect(TokenKind.LParen, "(");
      const args: AST.ExprNode[] = [];
      if (!s.check(TokenKind.RParen)) {
        do { args.push(parseExpr(s)); } while (s.match(TokenKind.Comma));
      }
      s.expect(TokenKind.RParen, ")");
      call = { kind: "CallExpr", loc: callLoc, name, args };
    }
  }

  return { kind: "PipelineErrorHandler", action, call };
}

// â”€â”€â”€ Algorithm (Leap 2) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function parseAlgorithm(s: TokenStream): AST.AlgorithmNode {
  const loc = s.peek().loc;
  s.expect(TokenKind.KwAlgorithm, "algorithm");
  s.expect(TokenKind.Colon, ":");
  const name = s.expect(TokenKind.Identifier, "algorithm name").value;
  const using: AST.AlgorithmBinding[] = [];

  if (s.match(TokenKind.KwUsing)) {
    s.expect(TokenKind.LBrace, "{");
    while (!s.check(TokenKind.RBrace) && !s.check(TokenKind.EOF)) {
      const param = s.expect(TokenKind.Identifier, "param name").value;
      s.expect(TokenKind.Colon, ":");
      const value = parseExpr(s);
      using.push({ param, value });
      if (!s.match(TokenKind.Comma)) break;
    }
    s.expect(TokenKind.RBrace, "}");
  }

  return { kind: "Algorithm", loc, name, using };
}
