"use strict";
/**
 * BoneScript Type Expression Parser
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTypeExpr = void 0;
const lexer_1 = require("./lexer");
const parser_base_1 = require("./parser_base");
function parseTypeExpr(s) {
    const loc = s.peek().loc;
    const tok = s.peek();
    // Generic types
    const generics = [lexer_1.TokenKind.KwSet, lexer_1.TokenKind.KwList, lexer_1.TokenKind.KwOptional, lexer_1.TokenKind.KwResult, lexer_1.TokenKind.KwMap];
    if (generics.includes(tok.kind)) {
        const name = s.advance().value;
        s.expect(lexer_1.TokenKind.LAngle, "generic type arg");
        const typeArgs = [];
        typeArgs.push(parseTypeExpr(s));
        while (s.match(lexer_1.TokenKind.Comma)) {
            typeArgs.push(parseTypeExpr(s));
        }
        s.expect(lexer_1.TokenKind.RAngle, "generic type arg close");
        return { kind: "GenericType", loc, name, typeArgs };
    }
    // Primitive types
    const primitives = [
        lexer_1.TokenKind.KwString, lexer_1.TokenKind.KwUint, lexer_1.TokenKind.KwInt, lexer_1.TokenKind.KwFloat,
        lexer_1.TokenKind.KwBool, lexer_1.TokenKind.KwTimestamp, lexer_1.TokenKind.KwUuid, lexer_1.TokenKind.KwBytes, lexer_1.TokenKind.KwJson,
    ];
    if (primitives.includes(tok.kind)) {
        return { kind: "PrimitiveType", loc, name: s.advance().value };
    }
    // Tuple type
    if (tok.kind === lexer_1.TokenKind.LParen) {
        s.advance();
        const elements = [];
        elements.push(parseTypeExpr(s));
        while (s.match(lexer_1.TokenKind.Comma)) {
            elements.push(parseTypeExpr(s));
        }
        s.expect(lexer_1.TokenKind.RParen, "tuple type close");
        return { kind: "TupleType", loc, elements };
    }
    // Entity reference
    if (tok.kind === lexer_1.TokenKind.Identifier) {
        return { kind: "EntityRefType", loc, name: s.advance().value };
    }
    throw new parser_base_1.ParseError(`Expected type expression, got ${tok.kind}`, tok.loc);
}
exports.parseTypeExpr = parseTypeExpr;
//# sourceMappingURL=parse_types.js.map