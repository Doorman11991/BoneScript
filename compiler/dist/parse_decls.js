"use strict";
/**
 * BoneScript Declaration Parsers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAlgorithm = exports.parsePipeline = exports.parseCapabilityDecl = exports.parseEntityDecl = exports.parseDuration = exports.parseIdentList = exports.parseField = exports.parseFieldList = void 0;
const lexer_1 = require("./lexer");
const parser_base_1 = require("./parser_base");
const parse_expr_1 = require("./parse_expr");
const parse_types_1 = require("./parse_types");
// â”€â”€â”€ Shared Utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/** Accept an identifier OR a keyword token as a name (for contexts where keywords are valid names) */
function parseIdentOrKeyword(s) {
    const tok = s.peek();
    if (tok.kind === lexer_1.TokenKind.Identifier)
        return s.advance().value;
    // Allow any keyword to be used as a name in parameter/field position
    if (tok.value && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tok.value))
        return s.advance().value;
    throw new parser_base_1.ParseError(`Expected identifier, got ${tok.kind}`, tok.loc);
}
function parseFieldList(s) {
    const fields = [];
    if (s.check(lexer_1.TokenKind.RBracket) || s.check(lexer_1.TokenKind.RBrace))
        return fields;
    do {
        fields.push(parseField(s));
    } while (s.match(lexer_1.TokenKind.Comma));
    return fields;
}
exports.parseFieldList = parseFieldList;
function parseField(s) {
    const loc = s.peek().loc;
    const name = parseIdentOrKeyword(s);
    s.expect(lexer_1.TokenKind.Colon, "field type");
    const type = (0, parse_types_1.parseTypeExpr)(s);
    let defaultValue = null;
    if (s.match(lexer_1.TokenKind.Equals)) {
        defaultValue = (0, parse_expr_1.parseExpr)(s);
    }
    // Optional annotations: @renamed_from(old_name), @sensitive
    let renamedFrom = null;
    let sensitive = false;
    while (s.check(lexer_1.TokenKind.At)) {
        s.advance();
        const annoName = parseIdentOrKeyword(s);
        if (annoName === "renamed_from") {
            s.expect(lexer_1.TokenKind.LParen, "renamed_from(old_name)");
            renamedFrom = parseIdentOrKeyword(s);
            s.expect(lexer_1.TokenKind.RParen, "renamed_from close");
        }
        else if (annoName === "sensitive") {
            // Bare flag annotation. Optional empty parens for forward compat.
            sensitive = true;
            if (s.match(lexer_1.TokenKind.LParen)) {
                s.expect(lexer_1.TokenKind.RParen, "sensitive close");
            }
        }
        else {
            // Unknown annotation — accept and ignore for forward compat; consume
            // an optional (...) payload so it parses cleanly.
            if (s.match(lexer_1.TokenKind.LParen)) {
                let depth = 1;
                while (depth > 0 && !s.check(lexer_1.TokenKind.EOF)) {
                    if (s.check(lexer_1.TokenKind.LParen))
                        depth++;
                    else if (s.check(lexer_1.TokenKind.RParen))
                        depth--;
                    if (depth > 0)
                        s.advance();
                }
                s.expect(lexer_1.TokenKind.RParen, "annotation close");
            }
        }
    }
    return { kind: "Field", loc, name, type, defaultValue, renamedFrom, sensitive };
}
exports.parseField = parseField;
function parseIdentList(s) {
    const ids = [];
    ids.push(s.expect(lexer_1.TokenKind.Identifier, "identifier").value);
    while (s.match(lexer_1.TokenKind.Comma)) {
        ids.push(s.expect(lexer_1.TokenKind.Identifier, "identifier").value);
    }
    return ids;
}
exports.parseIdentList = parseIdentList;
function parseDuration(s) {
    const tok = s.peek();
    if (tok.kind === lexer_1.TokenKind.IntLiteral || tok.kind === lexer_1.TokenKind.Identifier) {
        return s.advance().value;
    }
    throw new parser_base_1.ParseError(`Expected duration, got ${tok.kind}`, tok.loc);
}
exports.parseDuration = parseDuration;
function parseFieldRef(s) {
    const loc = s.peek().loc;
    const path = [];
    // Accept keywords as field names too
    path.push(parseIdentOrKeyword(s));
    while (s.match(lexer_1.TokenKind.Dot)) {
        const next = s.peek();
        if (next.kind === lexer_1.TokenKind.Identifier || next.kind === lexer_1.TokenKind.KwUnique ||
            (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(next.value) && next.kind !== lexer_1.TokenKind.EOF)) {
            path.push(s.advance().value);
        }
        else {
            break;
        }
    }
    return { kind: "FieldRef", loc, path };
}
// â”€â”€â”€ Entity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function parseEntityDecl(s) {
    const loc = s.peek().loc;
    s.expect(lexer_1.TokenKind.KwEntity, "entity");
    const name = s.expect(lexer_1.TokenKind.Identifier, "entity name").value;
    s.expect(lexer_1.TokenKind.LBrace, "entity body");
    const node = {
        kind: "EntityDecl", loc, name,
        owns: [], constraints: [], states: null, auth: null,
        relations: [], indexes: [], derived: [],
    };
    while (!s.check(lexer_1.TokenKind.RBrace) && !s.check(lexer_1.TokenKind.EOF)) {
        const tok = s.peek();
        switch (tok.kind) {
            case lexer_1.TokenKind.KwOwns:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, "owns");
                s.expect(lexer_1.TokenKind.LBracket, "owns fields");
                node.owns = parseFieldList(s);
                s.expect(lexer_1.TokenKind.RBracket, "owns close");
                break;
            case lexer_1.TokenKind.KwConstraints:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, "constraints");
                s.expect(lexer_1.TokenKind.LBracket, "constraints list");
                node.constraints = (0, parse_expr_1.parseExprList)(s);
                s.expect(lexer_1.TokenKind.RBracket, "constraints close");
                break;
            case lexer_1.TokenKind.KwStates:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, "states");
                node.states = parseStateGraph(s);
                break;
            case lexer_1.TokenKind.KwAuth:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, "auth");
                node.auth = parseAuthMethod(s);
                break;
            case lexer_1.TokenKind.KwIndex:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, "index");
                s.expect(lexer_1.TokenKind.LBracket, "index list");
                node.indexes.push(parseIdentList(s));
                s.expect(lexer_1.TokenKind.RBracket, "index close");
                break;
            case lexer_1.TokenKind.KwRelation:
                node.relations.push(parseRelation(s));
                break;
            case lexer_1.TokenKind.KwDerived:
                node.derived.push(parseDerived(s));
                break;
            default:
                throw new parser_base_1.ParseError(`Unexpected in entity: ${tok.kind}`, tok.loc);
        }
    }
    s.expect(lexer_1.TokenKind.RBrace, "entity close");
    return node;
}
exports.parseEntityDecl = parseEntityDecl;
function parseAuthMethod(s) {
    const auths = [lexer_1.TokenKind.KwJwt, lexer_1.TokenKind.KwOauth2, lexer_1.TokenKind.KwApikey, lexer_1.TokenKind.KwSession, lexer_1.TokenKind.KwNone];
    if (!auths.includes(s.peek().kind)) {
        throw new parser_base_1.ParseError(`Expected auth method, got ${s.peek().kind}`, s.peek().loc);
    }
    return s.advance().value;
}
function parseStateGraph(s) {
    const loc = s.peek().loc;
    const nodes = [];
    let current = { name: s.expect(lexer_1.TokenKind.Identifier, "state").value, guard: null, transitions: [], branches: [] };
    nodes.push(current);
    while (s.check(lexer_1.TokenKind.Arrow) || s.check(lexer_1.TokenKind.Pipe)) {
        const isArrow = s.check(lexer_1.TokenKind.Arrow);
        s.advance();
        const next = { name: s.expect(lexer_1.TokenKind.Identifier, "state").value, guard: null, transitions: [], branches: [] };
        if (isArrow) {
            current.transitions.push(next.name);
        }
        else {
            current.branches.push(next.name);
        }
        nodes.push(next);
        if (isArrow)
            current = next;
    }
    return { kind: "StateGraph", loc, nodes };
}
function parseRelation(s) {
    const loc = s.peek().loc;
    s.expect(lexer_1.TokenKind.KwRelation, "relation");
    const name = s.expect(lexer_1.TokenKind.Identifier, "relation name").value;
    s.expect(lexer_1.TokenKind.Colon, "relation type");
    const types = [lexer_1.TokenKind.KwHasOne, lexer_1.TokenKind.KwHasMany, lexer_1.TokenKind.KwBelongsTo, lexer_1.TokenKind.KwManyToMany];
    if (!types.includes(s.peek().kind))
        throw new parser_base_1.ParseError(`Expected relation type`, s.peek().loc);
    const relationType = s.advance().value;
    const target = s.expect(lexer_1.TokenKind.Identifier, "relation target").value;
    let cardinality = null;
    if (s.match(lexer_1.TokenKind.LBracket)) {
        const min = parseInt(s.expect(lexer_1.TokenKind.IntLiteral, "min").value, 10);
        s.expect(lexer_1.TokenKind.DotDot, "..");
        const max = s.peek().kind === lexer_1.TokenKind.Star ? (s.advance(), "*") : parseInt(s.expect(lexer_1.TokenKind.IntLiteral, "max").value, 10);
        s.expect(lexer_1.TokenKind.RBracket, "]");
        cardinality = { min, max };
    }
    return { kind: "Relation", loc, name, relationType, target, cardinality };
}
function parseDerived(s) {
    const loc = s.peek().loc;
    s.expect(lexer_1.TokenKind.KwDerived, "derived");
    const name = s.expect(lexer_1.TokenKind.Identifier, "name").value;
    s.expect(lexer_1.TokenKind.Colon, ":");
    const expr = (0, parse_expr_1.parseExpr)(s);
    return { kind: "DerivedField", loc, name, expr };
}
// â”€â”€â”€ Capability â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function parseCapabilityDecl(s) {
    const loc = s.peek().loc;
    s.expect(lexer_1.TokenKind.KwCapability, "capability");
    const name = s.expect(lexer_1.TokenKind.Identifier, "name").value;
    s.expect(lexer_1.TokenKind.LParen, "(");
    const params = [];
    if (!s.check(lexer_1.TokenKind.RParen)) {
        do {
            const ploc = s.peek().loc;
            // Allow keywords as param names (e.g., "from", "to")
            const pname = parseIdentOrKeyword(s);
            s.expect(lexer_1.TokenKind.Colon, ":");
            const ptype = (0, parse_types_1.parseTypeExpr)(s);
            params.push({ kind: "Param", loc: ploc, name: pname, type: ptype });
        } while (s.match(lexer_1.TokenKind.Comma));
    }
    s.expect(lexer_1.TokenKind.RParen, ")");
    s.expect(lexer_1.TokenKind.LBrace, "{");
    const node = {
        kind: "CapabilityDecl", loc, name, params,
        requires: [], effects: [], emits: [],
        sync: null, timeout: null, retry: null, idempotent: null,
        pipeline: null, algorithm: null, returns: null,
    };
    while (!s.check(lexer_1.TokenKind.RBrace) && !s.check(lexer_1.TokenKind.EOF)) {
        const tok = s.peek();
        switch (tok.kind) {
            case lexer_1.TokenKind.KwRequires:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                s.expect(lexer_1.TokenKind.LBracket, "[");
                node.requires = (0, parse_expr_1.parseExprList)(s);
                s.expect(lexer_1.TokenKind.RBracket, "]");
                break;
            case lexer_1.TokenKind.KwEffects:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                s.expect(lexer_1.TokenKind.LBracket, "[");
                node.effects = parseEffectList(s);
                s.expect(lexer_1.TokenKind.RBracket, "]");
                break;
            case lexer_1.TokenKind.KwEmits:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                node.emits = parseEmitList(s);
                break;
            case lexer_1.TokenKind.KwSync:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                node.sync = s.advance().value;
                break;
            case lexer_1.TokenKind.KwTimeout:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                node.timeout = parseDuration(s);
                break;
            case lexer_1.TokenKind.KwIdempotent:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                node.idempotent = s.advance().kind === lexer_1.TokenKind.KwTrue;
                break;
            case lexer_1.TokenKind.KwRetry:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                node.retry = parseRetryPolicy(s);
                break;
            case lexer_1.TokenKind.KwReturns:
                s.advance();
                s.expect(lexer_1.TokenKind.Colon, ":");
                node.returns = (0, parse_types_1.parseTypeExpr)(s);
                break;
            case lexer_1.TokenKind.KwPipeline:
                node.pipeline = parsePipeline(s);
                break;
            case lexer_1.TokenKind.KwParallel:
                node.pipeline = parsePipeline(s, true);
                break;
            case lexer_1.TokenKind.KwAlgorithm:
                node.algorithm = parseAlgorithm(s);
                break;
            default:
                throw new parser_base_1.ParseError(`Unexpected in capability: ${tok.kind}`, tok.loc);
        }
    }
    s.expect(lexer_1.TokenKind.RBrace, "}");
    return node;
}
exports.parseCapabilityDecl = parseCapabilityDecl;
function parseEffectList(s) {
    const effects = [];
    if (s.check(lexer_1.TokenKind.RBracket))
        return effects;
    do {
        const loc = s.peek().loc;
        const target = parseFieldRef(s);
        const opTok = s.peek();
        let op;
        if (opTok.kind === lexer_1.TokenKind.Equals) {
            op = "=";
            s.advance();
        }
        else if (opTok.kind === lexer_1.TokenKind.PlusEq) {
            op = "+=";
            s.advance();
        }
        else if (opTok.kind === lexer_1.TokenKind.MinusEq) {
            op = "-=";
            s.advance();
        }
        else
            throw new parser_base_1.ParseError(`Expected =, +=, -= in effect`, opTok.loc);
        const value = (0, parse_expr_1.parseExpr)(s);
        effects.push({ kind: "Effect", loc, target, op, value });
    } while (s.match(lexer_1.TokenKind.Comma));
    return effects;
}
function parseEmitList(s) {
    const emits = [];
    do {
        const loc = s.peek().loc;
        const eventName = s.expect(lexer_1.TokenKind.Identifier, "event name").value;
        const args = [];
        if (s.match(lexer_1.TokenKind.LParen)) {
            if (!s.check(lexer_1.TokenKind.RParen)) {
                do {
                    args.push((0, parse_expr_1.parseExpr)(s));
                } while (s.match(lexer_1.TokenKind.Comma));
            }
            s.expect(lexer_1.TokenKind.RParen, ")");
        }
        emits.push({ kind: "Emit", loc, eventName, args });
    } while (s.match(lexer_1.TokenKind.Comma));
    return emits;
}
function parseRetryPolicy(s) {
    const loc = s.peek().loc;
    s.expect(lexer_1.TokenKind.LBrace, "{");
    const node = { kind: "RetryPolicy", loc, maxAttempts: null, backoff: null, interval: null };
    while (!s.check(lexer_1.TokenKind.RBrace)) {
        const tok = s.peek();
        if (tok.kind === lexer_1.TokenKind.KwMaxAttempts) {
            s.advance();
            s.expect(lexer_1.TokenKind.Colon, ":");
            node.maxAttempts = parseInt(s.expect(lexer_1.TokenKind.IntLiteral, "n").value, 10);
        }
        else if (tok.kind === lexer_1.TokenKind.KwBackoff) {
            s.advance();
            s.expect(lexer_1.TokenKind.Colon, ":");
            node.backoff = s.advance().value;
        }
        else if (tok.kind === lexer_1.TokenKind.KwInterval) {
            s.advance();
            s.expect(lexer_1.TokenKind.Colon, ":");
            node.interval = parseDuration(s);
        }
        else
            throw new parser_base_1.ParseError(`Unexpected in retry: ${tok.kind}`, tok.loc);
        if (!s.match(lexer_1.TokenKind.Comma))
            break;
    }
    s.expect(lexer_1.TokenKind.RBrace, "}");
    return node;
}
// â”€â”€â”€ Pipeline (Leap 1) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function parsePipeline(s, parallel = false) {
    const loc = s.peek().loc;
    s.advance(); // consume pipeline or parallel
    s.expect(lexer_1.TokenKind.Colon, ":");
    s.expect(lexer_1.TokenKind.LBrace, "{");
    const steps = [];
    let onError = null;
    while (!s.check(lexer_1.TokenKind.RBrace) && !s.check(lexer_1.TokenKind.EOF)) {
        if (s.check(lexer_1.TokenKind.KwOnError)) {
            onError = parsePipelineErrorHandler(s);
            continue;
        }
        steps.push(parsePipelineStep(s));
    }
    s.expect(lexer_1.TokenKind.RBrace, "}");
    return { kind: "Pipeline", loc, steps, parallel, onError };
}
exports.parsePipeline = parsePipeline;
function parsePipelineStep(s) {
    const loc = s.peek().loc;
    const name = s.expect(lexer_1.TokenKind.Identifier, "step name").value;
    s.expect(lexer_1.TokenKind.LParen, "(");
    const args = [];
    if (!s.check(lexer_1.TokenKind.RParen)) {
        do {
            args.push((0, parse_expr_1.parseExpr)(s));
        } while (s.match(lexer_1.TokenKind.Comma));
    }
    s.expect(lexer_1.TokenKind.RParen, ")");
    let bindAs = null;
    // Optional `as <name>` binding for capturing output
    if (s.peek().kind === lexer_1.TokenKind.Identifier && s.peek().value === "as") {
        s.advance();
        bindAs = s.expect(lexer_1.TokenKind.Identifier, "binding name").value;
    }
    const call = { kind: "CallExpr", loc, name, args };
    return { kind: "PipelineStep", loc, call, bindAs };
}
function parsePipelineErrorHandler(s) {
    s.expect(lexer_1.TokenKind.KwOnError, "on_error");
    s.expect(lexer_1.TokenKind.Colon, ":");
    const tok = s.peek();
    const action = s.advance().value;
    let call = null;
    // Optional call expression for compensate / retry
    if (s.check(lexer_1.TokenKind.LParen) || (s.peek().kind === lexer_1.TokenKind.Identifier && s.peek(1).kind === lexer_1.TokenKind.LParen)) {
        const callLoc = s.peek().loc;
        if (s.peek().kind === lexer_1.TokenKind.Identifier) {
            const name = s.advance().value;
            s.expect(lexer_1.TokenKind.LParen, "(");
            const args = [];
            if (!s.check(lexer_1.TokenKind.RParen)) {
                do {
                    args.push((0, parse_expr_1.parseExpr)(s));
                } while (s.match(lexer_1.TokenKind.Comma));
            }
            s.expect(lexer_1.TokenKind.RParen, ")");
            call = { kind: "CallExpr", loc: callLoc, name, args };
        }
    }
    return { kind: "PipelineErrorHandler", action, call };
}
// â”€â”€â”€ Algorithm (Leap 2) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function parseAlgorithm(s) {
    const loc = s.peek().loc;
    s.expect(lexer_1.TokenKind.KwAlgorithm, "algorithm");
    s.expect(lexer_1.TokenKind.Colon, ":");
    const name = s.expect(lexer_1.TokenKind.Identifier, "algorithm name").value;
    const using = [];
    if (s.match(lexer_1.TokenKind.KwUsing)) {
        s.expect(lexer_1.TokenKind.LBrace, "{");
        while (!s.check(lexer_1.TokenKind.RBrace) && !s.check(lexer_1.TokenKind.EOF)) {
            const param = s.expect(lexer_1.TokenKind.Identifier, "param name").value;
            s.expect(lexer_1.TokenKind.Colon, ":");
            const value = (0, parse_expr_1.parseExpr)(s);
            using.push({ param, value });
            if (!s.match(lexer_1.TokenKind.Comma))
                break;
        }
        s.expect(lexer_1.TokenKind.RBrace, "}");
    }
    return { kind: "Algorithm", loc, name, using };
}
exports.parseAlgorithm = parseAlgorithm;
//# sourceMappingURL=parse_decls.js.map