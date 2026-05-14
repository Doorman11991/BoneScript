/**
 * BoneScript Expression Parser â€” Pratt-style precedence climbing.
 */

import { TokenKind } from "./lexer";
import { TokenStream, ParseError } from "./parser_base";
import * as AST from "./ast";

export function parseExpr(s: TokenStream): AST.ExprNode {
  return parseLogicalOr(s);
}

export function parseExprList(s: TokenStream): AST.ExprNode[] {
  const exprs: AST.ExprNode[] = [];
  if (s.check(TokenKind.RBracket)) return exprs;
  do {
    exprs.push(parseExpr(s));
  } while (s.match(TokenKind.Comma));
  return exprs;
}

function parseLogicalOr(s: TokenStream): AST.ExprNode {
  let left = parseLogicalAnd(s);
  while (s.check(TokenKind.KwOr)) {
    const loc = s.peek().loc;
    s.advance();
    const right = parseLogicalAnd(s);
    left = { kind: "BinaryExpr", loc, op: "or", left, right };
  }
  return left;
}

function parseLogicalAnd(s: TokenStream): AST.ExprNode {
  let left = parseComparison(s);
  while (s.check(TokenKind.KwAnd)) {
    const loc = s.peek().loc;
    s.advance();
    const right = parseComparison(s);
    left = { kind: "BinaryExpr", loc, op: "and", left, right };
  }
  return left;
}

function parseComparison(s: TokenStream): AST.ExprNode {
  let left = parseAdditive(s);
  const compOps = [
    TokenKind.EqEq, TokenKind.NotEq, TokenKind.LAngle, TokenKind.RAngle,
    TokenKind.LtEq, TokenKind.GtEq, TokenKind.KwIn, TokenKind.KwContains,
  ];
  if (compOps.includes(s.peek().kind)) {
    const loc = s.peek().loc;
    const op = s.advance().value;
    const right = parseAdditive(s);
    // Check for range: expr in expr..expr
    if (op === "in" && s.check(TokenKind.DotDot)) {
      const dotLoc = s.peek().loc;
      s.advance(); // consume ..
      const upper = parseAdditive(s);
      // Desugar "x in low..high" into BinaryExpr with op "in_range"
      const range: AST.BinaryExprNode = { kind: "BinaryExpr", loc: dotLoc, op: "..", left: right, right: upper };
      left = { kind: "BinaryExpr", loc, op: "in", left, right: range };
    } else {
      left = { kind: "BinaryExpr", loc, op, left, right };
    }
  }
  return left;
}

function parseAdditive(s: TokenStream): AST.ExprNode {
  let left = parseMultiplicative(s);
  while (s.check(TokenKind.Plus) || s.check(TokenKind.Minus)) {
    const loc = s.peek().loc;
    const op = s.advance().value;
    const right = parseMultiplicative(s);
    left = { kind: "BinaryExpr", loc, op, left, right };
  }
  return left;
}

function parseMultiplicative(s: TokenStream): AST.ExprNode {
  let left = parseUnary(s);
  while (s.check(TokenKind.Star) || s.check(TokenKind.Slash) || s.check(TokenKind.Percent)) {
    const loc = s.peek().loc;
    const op = s.advance().value;
    const right = parseUnary(s);
    left = { kind: "BinaryExpr", loc, op, left, right };
  }
  return left;
}

function parseUnary(s: TokenStream): AST.ExprNode {
  if (s.check(TokenKind.KwNot)) {
    const loc = s.peek().loc;
    s.advance();
    const operand = parseUnary(s);
    return { kind: "UnaryExpr", loc, op: "not", operand };
  }
  if (s.check(TokenKind.Minus)) {
    const loc = s.peek().loc;
    s.advance();
    const operand = parseUnary(s);
    return { kind: "UnaryExpr", loc, op: "-", operand };
  }
  return parsePrimary(s);
}

function parsePrimary(s: TokenStream): AST.ExprNode {
  const tok = s.peek();
  const loc = tok.loc;

  // Parenthesized expression
  if (tok.kind === TokenKind.LParen) {
    s.advance();
    const expr = parseExpr(s);
    s.expect(TokenKind.RParen, "parenthesized expression");
    return expr;
  }

  // List literal
  if (tok.kind === TokenKind.LBracket) {
    s.advance();
    const elements: AST.ExprNode[] = [];
    if (!s.check(TokenKind.RBracket)) {
      do { elements.push(parseExpr(s)); } while (s.match(TokenKind.Comma));
    }
    s.expect(TokenKind.RBracket, "list literal close");
    return { kind: "Literal", loc, type: "list", value: elements };
  }

  // String literal
  if (tok.kind === TokenKind.StringLiteral) {
    s.advance();
    return { kind: "Literal", loc, type: "string", value: tok.value };
  }

  // Int literal
  if (tok.kind === TokenKind.IntLiteral) {
    s.advance();
    return { kind: "Literal", loc, type: "int", value: parseInt(tok.value, 10) };
  }

  // Float literal
  if (tok.kind === TokenKind.FloatLiteral) {
    s.advance();
    return { kind: "Literal", loc, type: "float", value: parseFloat(tok.value) };
  }

  // Boolean
  if (tok.kind === TokenKind.KwTrue) { s.advance(); return { kind: "Literal", loc, type: "bool", value: true }; }
  if (tok.kind === TokenKind.KwFalse) { s.advance(); return { kind: "Literal", loc, type: "bool", value: false }; }

  // None
  if (tok.kind === TokenKind.KwNone) { s.advance(); return { kind: "Literal", loc, type: "none", value: null }; }

  // now()
  if (tok.kind === TokenKind.KwNow) {
    s.advance();
    if (s.match(TokenKind.LParen)) { s.expect(TokenKind.RParen, "now()"); }
    return { kind: "CallExpr", loc, name: "now", args: [] };
  }

  // Identifier â€” field ref or function call
  if (tok.kind === TokenKind.Identifier || isKeywordIdentifier(tok)) {
    const path: string[] = [];
    path.push(s.advance().value);

    // Function call
    if (s.check(TokenKind.LParen)) {
      s.advance();
      const args: AST.ExprNode[] = [];
      if (!s.check(TokenKind.RParen)) {
        do { args.push(parseExpr(s)); } while (s.match(TokenKind.Comma));
      }
      s.expect(TokenKind.RParen, "function call close");
      return { kind: "CallExpr", loc, name: path[0], args };
    }

    // Dotted field reference
    while (s.match(TokenKind.Dot)) {
      const next = s.peek();
      if (next.kind === TokenKind.Identifier || next.kind === TokenKind.KwUnique || isKeywordIdentifier(next)) {
        path.push(s.advance().value);
      } else {
        break;
      }
    }
    return { kind: "FieldRef", loc, path };
  }

  throw new ParseError(`Expected expression, got ${tok.kind} ('${tok.value}')`, tok.loc);
}

/** Check if a token is a keyword that can also serve as an identifier */
function isKeywordIdentifier(tok: { kind: TokenKind; value: string }): boolean {
  // Keywords that are commonly used as variable/field names
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tok.value) && tok.kind !== TokenKind.EOF;
}
