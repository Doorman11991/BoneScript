"use strict";
/**
 * BoneScript Expression Parser â€” Pratt-style precedence climbing.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseExprList = exports.parseExpr = void 0;
const lexer_1 = require("./lexer");
const parser_base_1 = require("./parser_base");
function parseExpr(s) {
    return parseLogicalOr(s);
}
exports.parseExpr = parseExpr;
function parseExprList(s) {
    const exprs = [];
    if (s.check(lexer_1.TokenKind.RBracket))
        return exprs;
    do {
        exprs.push(parseExpr(s));
    } while (s.match(lexer_1.TokenKind.Comma));
    return exprs;
}
exports.parseExprList = parseExprList;
function parseLogicalOr(s) {
    let left = parseLogicalAnd(s);
    while (s.check(lexer_1.TokenKind.KwOr)) {
        const loc = s.peek().loc;
        s.advance();
        const right = parseLogicalAnd(s);
        left = { kind: "BinaryExpr", loc, op: "or", left, right };
    }
    return left;
}
function parseLogicalAnd(s) {
    let left = parseComparison(s);
    while (s.check(lexer_1.TokenKind.KwAnd)) {
        const loc = s.peek().loc;
        s.advance();
        const right = parseComparison(s);
        left = { kind: "BinaryExpr", loc, op: "and", left, right };
    }
    return left;
}
function parseComparison(s) {
    let left = parseAdditive(s);
    const compOps = [
        lexer_1.TokenKind.EqEq, lexer_1.TokenKind.NotEq, lexer_1.TokenKind.LAngle, lexer_1.TokenKind.RAngle,
        lexer_1.TokenKind.LtEq, lexer_1.TokenKind.GtEq, lexer_1.TokenKind.KwIn, lexer_1.TokenKind.KwContains,
    ];
    if (compOps.includes(s.peek().kind)) {
        const loc = s.peek().loc;
        const op = s.advance().value;
        const right = parseAdditive(s);
        // Check for range: expr in expr..expr
        if (op === "in" && s.check(lexer_1.TokenKind.DotDot)) {
            const dotLoc = s.peek().loc;
            s.advance(); // consume ..
            const upper = parseAdditive(s);
            // Desugar "x in low..high" into BinaryExpr with op "in_range"
            const range = { kind: "BinaryExpr", loc: dotLoc, op: "..", left: right, right: upper };
            left = { kind: "BinaryExpr", loc, op: "in", left, right: range };
        }
        else {
            left = { kind: "BinaryExpr", loc, op, left, right };
        }
    }
    return left;
}
function parseAdditive(s) {
    let left = parseMultiplicative(s);
    while (s.check(lexer_1.TokenKind.Plus) || s.check(lexer_1.TokenKind.Minus)) {
        const loc = s.peek().loc;
        const op = s.advance().value;
        const right = parseMultiplicative(s);
        left = { kind: "BinaryExpr", loc, op, left, right };
    }
    return left;
}
function parseMultiplicative(s) {
    let left = parseUnary(s);
    while (s.check(lexer_1.TokenKind.Star) || s.check(lexer_1.TokenKind.Slash) || s.check(lexer_1.TokenKind.Percent)) {
        const loc = s.peek().loc;
        const op = s.advance().value;
        const right = parseUnary(s);
        left = { kind: "BinaryExpr", loc, op, left, right };
    }
    return left;
}
function parseUnary(s) {
    if (s.check(lexer_1.TokenKind.KwNot)) {
        const loc = s.peek().loc;
        s.advance();
        const operand = parseUnary(s);
        return { kind: "UnaryExpr", loc, op: "not", operand };
    }
    if (s.check(lexer_1.TokenKind.Minus)) {
        const loc = s.peek().loc;
        s.advance();
        const operand = parseUnary(s);
        return { kind: "UnaryExpr", loc, op: "-", operand };
    }
    return parsePrimary(s);
}
function parsePrimary(s) {
    const tok = s.peek();
    const loc = tok.loc;
    // Parenthesized expression
    if (tok.kind === lexer_1.TokenKind.LParen) {
        s.advance();
        const expr = parseExpr(s);
        s.expect(lexer_1.TokenKind.RParen, "parenthesized expression");
        return expr;
    }
    // List literal
    if (tok.kind === lexer_1.TokenKind.LBracket) {
        s.advance();
        const elements = [];
        if (!s.check(lexer_1.TokenKind.RBracket)) {
            do {
                elements.push(parseExpr(s));
            } while (s.match(lexer_1.TokenKind.Comma));
        }
        s.expect(lexer_1.TokenKind.RBracket, "list literal close");
        return { kind: "Literal", loc, type: "list", value: elements };
    }
    // String literal
    if (tok.kind === lexer_1.TokenKind.StringLiteral) {
        s.advance();
        return { kind: "Literal", loc, type: "string", value: tok.value };
    }
    // Int literal
    if (tok.kind === lexer_1.TokenKind.IntLiteral) {
        s.advance();
        return { kind: "Literal", loc, type: "int", value: parseInt(tok.value, 10) };
    }
    // Float literal
    if (tok.kind === lexer_1.TokenKind.FloatLiteral) {
        s.advance();
        return { kind: "Literal", loc, type: "float", value: parseFloat(tok.value) };
    }
    // Boolean
    if (tok.kind === lexer_1.TokenKind.KwTrue) {
        s.advance();
        return { kind: "Literal", loc, type: "bool", value: true };
    }
    if (tok.kind === lexer_1.TokenKind.KwFalse) {
        s.advance();
        return { kind: "Literal", loc, type: "bool", value: false };
    }
    // None
    if (tok.kind === lexer_1.TokenKind.KwNone) {
        s.advance();
        return { kind: "Literal", loc, type: "none", value: null };
    }
    // now()
    if (tok.kind === lexer_1.TokenKind.KwNow) {
        s.advance();
        if (s.match(lexer_1.TokenKind.LParen)) {
            s.expect(lexer_1.TokenKind.RParen, "now()");
        }
        return { kind: "CallExpr", loc, name: "now", args: [] };
    }
    // Identifier â€” field ref or function call
    if (tok.kind === lexer_1.TokenKind.Identifier || isKeywordIdentifier(tok)) {
        const path = [];
        path.push(s.advance().value);
        // Function call
        if (s.check(lexer_1.TokenKind.LParen)) {
            s.advance();
            const args = [];
            if (!s.check(lexer_1.TokenKind.RParen)) {
                do {
                    args.push(parseExpr(s));
                } while (s.match(lexer_1.TokenKind.Comma));
            }
            s.expect(lexer_1.TokenKind.RParen, "function call close");
            return { kind: "CallExpr", loc, name: path[0], args };
        }
        // Dotted field reference
        while (s.match(lexer_1.TokenKind.Dot)) {
            const next = s.peek();
            if (next.kind === lexer_1.TokenKind.Identifier || next.kind === lexer_1.TokenKind.KwUnique || isKeywordIdentifier(next)) {
                path.push(s.advance().value);
            }
            else {
                break;
            }
        }
        return { kind: "FieldRef", loc, path };
    }
    throw new parser_base_1.ParseError(`Expected expression, got ${tok.kind} ('${tok.value}')`, tok.loc);
}
/** Check if a token is a keyword that can also serve as an identifier */
function isKeywordIdentifier(tok) {
    // Keywords that are commonly used as variable/field names
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tok.value) && tok.kind !== lexer_1.TokenKind.EOF;
}
//# sourceMappingURL=parse_expr.js.map