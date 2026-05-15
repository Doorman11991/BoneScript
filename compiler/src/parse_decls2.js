"use strict";
/**
 * BoneScript Declaration Parsers â€” Channel, Store, Event, Constraint, Policy, Flow, Import
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseExtensionPointDecl = exports.parseImportDecl = exports.parseFlowDecl = exports.parsePolicyDecl = exports.parseConstraintDecl = exports.parseEventDecl = exports.parseStoreDecl = exports.parseChannelDecl = void 0;
const lexer_1 = require("./lexer");
const parser_base_1 = require("./parser_base");
const parse_expr_1 = require("./parse_expr");
const parse_types_1 = require("./parse_types");
const parse_decls_1 = require("./parse_decls");
// â”€â”€â”€ Channel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function parseChannelDecl(s) {
    const loc = s.peek().loc;
    s.expect(lexer_1.TokenKind.KwChannel, "channel");
    const name = s.expect(lexer_1.TokenKind.Identifier, "name").value;
    s.expect(lexer_1.TokenKind.LBrace, "{");
    const node = {
        kind: "ChannelDecl", loc, name,
        transport: null, ordering: null, participants: null,
        persistence: null, filter: null, maxSize: null,
    };
    while (!s.check(lexer_1.TokenKind.RBrace) && !s.check(lexer_1.TokenKind.EOF)) {
        const tok = s.peek();
        switch (tok.kind) {
            case lexer_1.TokenKind.KwTransport:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                node.transport = s.advance().value;
                break;
            case lexer_1.TokenKind.KwOrdering:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                node.ordering = s.advance().value;
                break;
            case lexer_1.TokenKind.KwParticipants:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                node.participants = (0, parse_types_1.parseTypeExpr)(s);
                break;
            case lexer_1.TokenKind.KwPersistence:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                node.persistence = s.advance().value;
                break;
            case lexer_1.TokenKind.KwFilter:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                node.filter = (0, parse_expr_1.parseExpr)(s);
                break;
            case lexer_1.TokenKind.KwMaxSize:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                node.maxSize = parseInt(s.expect(lexer_1.TokenKind.IntLiteral, "n").value, 10);
                break;
            default: throw new parser_base_1.ParseError(`Unexpected in channel: ${tok.kind}`, tok.loc);
        }
    }
    s.expect(lexer_1.TokenKind.RBrace, "}");
    return node;
}
exports.parseChannelDecl = parseChannelDecl;
// â”€â”€â”€ Store â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function parseStoreDecl(s) {
    const loc = s.peek().loc;
    s.expect(lexer_1.TokenKind.KwStore, "store");
    const name = s.expect(lexer_1.TokenKind.Identifier, "name").value;
    s.expect(lexer_1.TokenKind.LBrace, "{");
    const node = {
        kind: "StoreDecl", loc, name,
        engine: null, schema: [], retention: null, partition: null, replicas: null,
    };
    while (!s.check(lexer_1.TokenKind.RBrace) && !s.check(lexer_1.TokenKind.EOF)) {
        const tok = s.peek();
        switch (tok.kind) {
            case lexer_1.TokenKind.KwEngine:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                node.engine = s.advance().value;
                break;
            case lexer_1.TokenKind.KwSchema:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                s.expect(lexer_1.TokenKind.LBrace, "{");
                node.schema = (0, parse_decls_1.parseFieldList)(s);
                s.expect(lexer_1.TokenKind.RBrace, "}");
                break;
            case lexer_1.TokenKind.KwRetention:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                node.retention = (0, parse_decls_1.parseDuration)(s);
                break;
            case lexer_1.TokenKind.KwPartition:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                node.partition = s.expect(lexer_1.TokenKind.Identifier, "field").value;
                break;
            case lexer_1.TokenKind.KwReplicas:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                node.replicas = parseInt(s.expect(lexer_1.TokenKind.IntLiteral, "n").value, 10);
                break;
            default: throw new parser_base_1.ParseError(`Unexpected in store: ${tok.kind}`, tok.loc);
        }
    }
    s.expect(lexer_1.TokenKind.RBrace, "}");
    return node;
}
exports.parseStoreDecl = parseStoreDecl;
// â”€â”€â”€ Event â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function parseEventDecl(s) {
    const loc = s.peek().loc;
    s.expect(lexer_1.TokenKind.KwEvent, "event");
    const name = s.expect(lexer_1.TokenKind.Identifier, "name").value;
    s.expect(lexer_1.TokenKind.LBrace, "{");
    const node = {
        kind: "EventDecl", loc, name, payload: [], delivery: null, ttl: null,
    };
    while (!s.check(lexer_1.TokenKind.RBrace) && !s.check(lexer_1.TokenKind.EOF)) {
        const tok = s.peek();
        switch (tok.kind) {
            case lexer_1.TokenKind.KwPayload:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                s.expect(lexer_1.TokenKind.LBrace, "{");
                node.payload = (0, parse_decls_1.parseFieldList)(s);
                s.expect(lexer_1.TokenKind.RBrace, "}");
                break;
            case lexer_1.TokenKind.KwDelivery:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                node.delivery = s.advance().value;
                break;
            case lexer_1.TokenKind.KwTtl:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                node.ttl = (0, parse_decls_1.parseDuration)(s);
                break;
            default: throw new parser_base_1.ParseError(`Unexpected in event: ${tok.kind}`, tok.loc);
        }
    }
    s.expect(lexer_1.TokenKind.RBrace, "}");
    return node;
}
exports.parseEventDecl = parseEventDecl;
// â”€â”€â”€ Constraint â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function parseConstraintDecl(s) {
    const loc = s.peek().loc;
    s.expect(lexer_1.TokenKind.KwConstraint, "constraint");
    const name = s.expect(lexer_1.TokenKind.Identifier, "name").value;
    s.expect(lexer_1.TokenKind.Colon, ":");
    const expr = (0, parse_expr_1.parseExpr)(s);
    return { kind: "ConstraintDecl", loc, name, expr };
}
exports.parseConstraintDecl = parseConstraintDecl;
// â”€â”€â”€ Policy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function parsePolicyDecl(s) {
    const loc = s.peek().loc;
    s.expect(lexer_1.TokenKind.KwPolicy, "policy");
    const name = s.expect(lexer_1.TokenKind.Identifier, "name").value;
    s.expect(lexer_1.TokenKind.LBrace, "{");
    const node = {
        kind: "PolicyDecl", loc, name, rateLimit: null, access: [], audit: null, encryption: null,
    };
    while (!s.check(lexer_1.TokenKind.RBrace) && !s.check(lexer_1.TokenKind.EOF)) {
        const tok = s.peek();
        switch (tok.kind) {
            case lexer_1.TokenKind.KwRateLimit:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                const count = parseInt(s.expect(lexer_1.TokenKind.IntLiteral, "count").value, 10);
                s.expect(lexer_1.TokenKind.KwPer, "per");
                const per = (0, parse_decls_1.parseDuration)(s);
                node.rateLimit = { count, per };
                break;
            case lexer_1.TokenKind.KwAccess:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                s.expect(lexer_1.TokenKind.LBracket, "[");
                node.access = (0, parse_decls_1.parseIdentList)(s);
                s.expect(lexer_1.TokenKind.RBracket, "]");
                break;
            case lexer_1.TokenKind.KwAudit:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                node.audit = s.advance().kind === lexer_1.TokenKind.KwTrue;
                break;
            case lexer_1.TokenKind.KwEncryption:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                node.encryption = s.advance().value;
                break;
            default: throw new parser_base_1.ParseError(`Unexpected in policy: ${tok.kind}`, tok.loc);
        }
    }
    s.expect(lexer_1.TokenKind.RBrace, "}");
    return node;
}
exports.parsePolicyDecl = parsePolicyDecl;
// â”€â”€â”€ Flow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function parseFlowDecl(s) {
    const loc = s.peek().loc;
    s.expect(lexer_1.TokenKind.KwFlow, "flow");
    const name = s.expect(lexer_1.TokenKind.Identifier, "name").value;
    s.expect(lexer_1.TokenKind.LBrace, "{");
    const steps = [];
    while (!s.check(lexer_1.TokenKind.RBrace) && !s.check(lexer_1.TokenKind.EOF)) {
        const sloc = s.peek().loc;
        s.expect(lexer_1.TokenKind.KwStep, "step");
        const stepName = s.expect(lexer_1.TokenKind.Identifier, "step name").value;
        s.expect(lexer_1.TokenKind.Colon, ":");
        const action = parseCallExpr(s);
        let compensate = null;
        if (s.check(lexer_1.TokenKind.KwCompensate)) {
            s.advance();
            s.expect(lexer_1.TokenKind.Colon, ":");
            compensate = parseCallExpr(s);
        }
        steps.push({ kind: "FlowStep", loc: sloc, name: stepName, action, compensate });
    }
    s.expect(lexer_1.TokenKind.RBrace, "}");
    return { kind: "FlowDecl", loc, name, steps };
}
exports.parseFlowDecl = parseFlowDecl;
function parseCallExpr(s) {
    const loc = s.peek().loc;
    const name = s.expect(lexer_1.TokenKind.Identifier, "call name").value;
    s.expect(lexer_1.TokenKind.LParen, "(");
    const args = [];
    if (!s.check(lexer_1.TokenKind.RParen)) {
        do {
            args.push((0, parse_expr_1.parseExpr)(s));
        } while (s.match(lexer_1.TokenKind.Comma));
    }
    s.expect(lexer_1.TokenKind.RParen, ")");
    return { kind: "CallExpr", loc, name, args };
}
// â”€â”€â”€ Import â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function parseImportDecl(s) {
    const loc = s.peek().loc;
    s.expect(lexer_1.TokenKind.KwImport, "import");
    const name = s.expect(lexer_1.TokenKind.Identifier, "name").value;
    s.expect(lexer_1.TokenKind.KwFrom, "from");
    const from = s.expect(lexer_1.TokenKind.StringLiteral, "path").value;
    return { kind: "ImportDecl", loc, name, from };
}
exports.parseImportDecl = parseImportDecl;
// ─── Extension Point ─────────────────────────────────────────────────────────
function parseExtensionPointDecl(s) {
    const loc = s.peek().loc;
    s.expect(lexer_1.TokenKind.KwExtensionPoint, "extension_point");
    const name = s.expect(lexer_1.TokenKind.Identifier, "extension point name").value;
    s.expect(lexer_1.TokenKind.LParen, "(");
    const params = [];
    if (!s.check(lexer_1.TokenKind.RParen)) {
        do {
            const ploc = s.peek().loc;
            // Allow keywords as param names
            const pname = s.peek().kind === lexer_1.TokenKind.Identifier ? s.advance().value : s.advance().value;
            s.expect(lexer_1.TokenKind.Colon, ":");
            const ptype = (0, parse_types_1.parseTypeExpr)(s);
            params.push({ kind: "Param", loc: ploc, name: pname, type: ptype });
        } while (s.match(lexer_1.TokenKind.Comma));
    }
    s.expect(lexer_1.TokenKind.RParen, ")");
    let returns = null;
    let stable = false;
    s.expect(lexer_1.TokenKind.LBrace, "{");
    while (!s.check(lexer_1.TokenKind.RBrace) && !s.check(lexer_1.TokenKind.EOF)) {
        const tok = s.peek();
        if (tok.kind === lexer_1.TokenKind.KwReturns) {
            s.advance();
            s.expect(lexer_1.TokenKind.Colon, ":");
            returns = (0, parse_types_1.parseTypeExpr)(s);
        }
        else if (tok.kind === lexer_1.TokenKind.KwStable) {
            s.advance();
            s.expect(lexer_1.TokenKind.Colon, ":");
            stable = s.advance().kind === lexer_1.TokenKind.KwTrue;
        }
        else if (tok.kind === lexer_1.TokenKind.KwLanguage) {
            // language: typescript — consume and ignore (only TS supported)
            s.advance();
            s.expect(lexer_1.TokenKind.Colon, ":");
            s.advance();
        }
        else {
            throw new parser_base_1.ParseError(`Unexpected in extension_point: ${tok.kind}`, tok.loc);
        }
    }
    s.expect(lexer_1.TokenKind.RBrace, "}");
    return { kind: "ExtensionPointDecl", loc, name, params, returns, stable };
}
exports.parseExtensionPointDecl = parseExtensionPointDecl;
//# sourceMappingURL=parse_decls2.js.map