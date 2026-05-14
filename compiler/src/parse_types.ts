/**
 * BoneScript Type Expression Parser
 */

import { TokenKind } from "./lexer";
import { TokenStream, ParseError } from "./parser_base";
import * as AST from "./ast";

export function parseTypeExpr(s: TokenStream): AST.TypeExprNode {
  const loc = s.peek().loc;
  const tok = s.peek();

  // Generic types
  const generics = [TokenKind.KwSet, TokenKind.KwList, TokenKind.KwOptional, TokenKind.KwResult, TokenKind.KwMap];
  if (generics.includes(tok.kind)) {
    const name = s.advance().value;
    s.expect(TokenKind.LAngle, "generic type arg");
    const typeArgs: AST.TypeExprNode[] = [];
    typeArgs.push(parseTypeExpr(s));
    while (s.match(TokenKind.Comma)) {
      typeArgs.push(parseTypeExpr(s));
    }
    s.expect(TokenKind.RAngle, "generic type arg close");
    return { kind: "GenericType", loc, name, typeArgs };
  }

  // Primitive types
  const primitives = [
    TokenKind.KwString, TokenKind.KwUint, TokenKind.KwInt, TokenKind.KwFloat,
    TokenKind.KwBool, TokenKind.KwTimestamp, TokenKind.KwUuid, TokenKind.KwBytes, TokenKind.KwJson,
  ];
  if (primitives.includes(tok.kind)) {
    return { kind: "PrimitiveType", loc, name: s.advance().value };
  }

  // Tuple type
  if (tok.kind === TokenKind.LParen) {
    s.advance();
    const elements: AST.TypeExprNode[] = [];
    elements.push(parseTypeExpr(s));
    while (s.match(TokenKind.Comma)) {
      elements.push(parseTypeExpr(s));
    }
    s.expect(TokenKind.RParen, "tuple type close");
    return { kind: "TupleType", loc, elements };
  }

  // Entity reference
  if (tok.kind === TokenKind.Identifier) {
    return { kind: "EntityRefType", loc, name: s.advance().value };
  }

  throw new ParseError(`Expected type expression, got ${tok.kind}`, tok.loc);
}
