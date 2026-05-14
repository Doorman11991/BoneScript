"use strict";
/**
 * bone lexer
 * Converts source text into a token stream.
 *
 * This is a hand-written lexer (not regex-based) for precise error reporting
 * and deterministic behavior. It implements the lexical rules from spec/02_GRAMMAR.peg.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Lexer = exports.LexerError = exports.TokenKind = void 0;
// â”€â”€â”€ Token Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
var TokenKind;
(function (TokenKind) {
    // Structural
    TokenKind["LBrace"] = "LBrace";
    TokenKind["RBrace"] = "RBrace";
    TokenKind["LBracket"] = "LBracket";
    TokenKind["RBracket"] = "RBracket";
    TokenKind["LParen"] = "LParen";
    TokenKind["RParen"] = "RParen";
    TokenKind["LAngle"] = "LAngle";
    TokenKind["RAngle"] = "RAngle";
    TokenKind["Colon"] = "Colon";
    TokenKind["Comma"] = "Comma";
    TokenKind["Dot"] = "Dot";
    TokenKind["DotDot"] = "DotDot";
    TokenKind["Arrow"] = "Arrow";
    TokenKind["Pipe"] = "Pipe";
    TokenKind["Semicolon"] = "Semicolon";
    // Operators
    TokenKind["Equals"] = "Equals";
    TokenKind["EqEq"] = "EqEq";
    TokenKind["NotEq"] = "NotEq";
    TokenKind["LtEq"] = "LtEq";
    TokenKind["GtEq"] = "GtEq";
    TokenKind["Plus"] = "Plus";
    TokenKind["Minus"] = "Minus";
    TokenKind["Star"] = "Star";
    TokenKind["Slash"] = "Slash";
    TokenKind["Percent"] = "Percent";
    TokenKind["PlusEq"] = "PlusEq";
    TokenKind["MinusEq"] = "MinusEq";
    TokenKind["AppendEq"] = "AppendEq";
    TokenKind["Question"] = "Question";
    TokenKind["Bang"] = "Bang";
    // Literals
    TokenKind["StringLiteral"] = "StringLiteral";
    TokenKind["IntLiteral"] = "IntLiteral";
    TokenKind["FloatLiteral"] = "FloatLiteral";
    // Keywords (each keyword is its own token kind for unambiguous parsing)
    TokenKind["KwSystem"] = "KwSystem";
    TokenKind["KwEntity"] = "KwEntity";
    TokenKind["KwCapability"] = "KwCapability";
    TokenKind["KwChannel"] = "KwChannel";
    TokenKind["KwStore"] = "KwStore";
    TokenKind["KwEvent"] = "KwEvent";
    TokenKind["KwConstraint"] = "KwConstraint";
    TokenKind["KwPolicy"] = "KwPolicy";
    TokenKind["KwFlow"] = "KwFlow";
    TokenKind["KwImport"] = "KwImport";
    TokenKind["KwFrom"] = "KwFrom";
    TokenKind["KwDomain"] = "KwDomain";
    TokenKind["KwOwns"] = "KwOwns";
    TokenKind["KwConstraints"] = "KwConstraints";
    TokenKind["KwStates"] = "KwStates";
    TokenKind["KwAuth"] = "KwAuth";
    TokenKind["KwRelation"] = "KwRelation";
    TokenKind["KwIndex"] = "KwIndex";
    TokenKind["KwDerived"] = "KwDerived";
    TokenKind["KwRequires"] = "KwRequires";
    TokenKind["KwEffects"] = "KwEffects";
    TokenKind["KwEmits"] = "KwEmits";
    TokenKind["KwSync"] = "KwSync";
    TokenKind["KwTimeout"] = "KwTimeout";
    TokenKind["KwRetry"] = "KwRetry";
    TokenKind["KwIdempotent"] = "KwIdempotent";
    TokenKind["KwTransport"] = "KwTransport";
    TokenKind["KwOrdering"] = "KwOrdering";
    TokenKind["KwParticipants"] = "KwParticipants";
    TokenKind["KwPersistence"] = "KwPersistence";
    TokenKind["KwFilter"] = "KwFilter";
    TokenKind["KwMaxSize"] = "KwMaxSize";
    TokenKind["KwEngine"] = "KwEngine";
    TokenKind["KwSchema"] = "KwSchema";
    TokenKind["KwRetention"] = "KwRetention";
    TokenKind["KwPartition"] = "KwPartition";
    TokenKind["KwReplicas"] = "KwReplicas";
    TokenKind["KwPayload"] = "KwPayload";
    TokenKind["KwDelivery"] = "KwDelivery";
    TokenKind["KwTtl"] = "KwTtl";
    TokenKind["KwRateLimit"] = "KwRateLimit";
    TokenKind["KwAccess"] = "KwAccess";
    TokenKind["KwAudit"] = "KwAudit";
    TokenKind["KwEncryption"] = "KwEncryption";
    TokenKind["KwStep"] = "KwStep";
    TokenKind["KwCompensate"] = "KwCompensate";
    TokenKind["KwPer"] = "KwPer";
    TokenKind["KwHasOne"] = "KwHasOne";
    TokenKind["KwHasMany"] = "KwHasMany";
    TokenKind["KwBelongsTo"] = "KwBelongsTo";
    TokenKind["KwManyToMany"] = "KwManyToMany";
    // Auth methods
    TokenKind["KwJwt"] = "KwJwt";
    TokenKind["KwOauth2"] = "KwOauth2";
    TokenKind["KwApikey"] = "KwApikey";
    TokenKind["KwSession"] = "KwSession";
    // Transport types
    TokenKind["KwWebsocket"] = "KwWebsocket";
    TokenKind["KwSse"] = "KwSse";
    TokenKind["KwPolling"] = "KwPolling";
    TokenKind["KwGrpcStream"] = "KwGrpcStream";
    // Ordering types
    TokenKind["KwCausal"] = "KwCausal";
    TokenKind["KwFifo"] = "KwFifo";
    TokenKind["KwTotal"] = "KwTotal";
    TokenKind["KwUnordered"] = "KwUnordered";
    // Engine types
    TokenKind["KwPostgresql"] = "KwPostgresql";
    TokenKind["KwRedis"] = "KwRedis";
    TokenKind["KwMongodb"] = "KwMongodb";
    TokenKind["KwSqlite"] = "KwSqlite";
    TokenKind["KwS3"] = "KwS3";
    TokenKind["KwDynamodb"] = "KwDynamodb";
    // Delivery modes
    TokenKind["KwAtLeastOnce"] = "KwAtLeastOnce";
    TokenKind["KwAtMostOnce"] = "KwAtMostOnce";
    TokenKind["KwExactlyOnce"] = "KwExactlyOnce";
    // Encryption modes
    TokenKind["KwAtRest"] = "KwAtRest";
    TokenKind["KwInTransit"] = "KwInTransit";
    TokenKind["KwBoth"] = "KwBoth";
    // Sync modes
    TokenKind["KwRealtime"] = "KwRealtime";
    TokenKind["KwEventual"] = "KwEventual";
    TokenKind["KwBatch"] = "KwBatch";
    TokenKind["KwTransactional"] = "KwTransactional";
    // Retry fields
    TokenKind["KwMaxAttempts"] = "KwMaxAttempts";
    TokenKind["KwBackoff"] = "KwBackoff";
    TokenKind["KwInterval"] = "KwInterval";
    // Primitive types
    TokenKind["KwString"] = "KwString";
    TokenKind["KwUint"] = "KwUint";
    TokenKind["KwInt"] = "KwInt";
    TokenKind["KwFloat"] = "KwFloat";
    TokenKind["KwBool"] = "KwBool";
    TokenKind["KwTimestamp"] = "KwTimestamp";
    TokenKind["KwUuid"] = "KwUuid";
    TokenKind["KwBytes"] = "KwBytes";
    TokenKind["KwMap"] = "KwMap";
    TokenKind["KwJson"] = "KwJson";
    // Generic type constructors
    TokenKind["KwSet"] = "KwSet";
    TokenKind["KwList"] = "KwList";
    TokenKind["KwOptional"] = "KwOptional";
    TokenKind["KwResult"] = "KwResult";
    // Boolean literals
    TokenKind["KwTrue"] = "KwTrue";
    TokenKind["KwFalse"] = "KwFalse";
    TokenKind["KwNone"] = "KwNone";
    // Logical operators
    TokenKind["KwAnd"] = "KwAnd";
    TokenKind["KwOr"] = "KwOr";
    TokenKind["KwNot"] = "KwNot";
    TokenKind["KwIn"] = "KwIn";
    TokenKind["KwContains"] = "KwContains";
    TokenKind["KwUnique"] = "KwUnique";
    // Persistence modes
    TokenKind["KwFull"] = "KwFull";
    // Composition (Leap 1)
    TokenKind["KwPipeline"] = "KwPipeline";
    TokenKind["KwParallel"] = "KwParallel";
    TokenKind["KwOnError"] = "KwOnError";
    TokenKind["KwReturns"] = "KwReturns";
    // Algorithm catalog (Leap 2)
    TokenKind["KwAlgorithm"] = "KwAlgorithm";
    TokenKind["KwUsing"] = "KwUsing";
    // Extension points
    TokenKind["KwExtensionPoint"] = "KwExtensionPoint";
    TokenKind["KwStable"] = "KwStable";
    TokenKind["KwLanguage"] = "KwLanguage";
    // Special
    TokenKind["KwNow"] = "KwNow";
    // Identifier (anything not a keyword)
    TokenKind["Identifier"] = "Identifier";
    // End of file
    TokenKind["EOF"] = "EOF";
})(TokenKind || (exports.TokenKind = TokenKind = {}));
// â”€â”€â”€ Keyword Table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const KEYWORDS = {
    system: TokenKind.KwSystem,
    entity: TokenKind.KwEntity,
    capability: TokenKind.KwCapability,
    channel: TokenKind.KwChannel,
    store: TokenKind.KwStore,
    event: TokenKind.KwEvent,
    constraint: TokenKind.KwConstraint,
    policy: TokenKind.KwPolicy,
    flow: TokenKind.KwFlow,
    import: TokenKind.KwImport,
    from: TokenKind.KwFrom,
    domain: TokenKind.KwDomain,
    owns: TokenKind.KwOwns,
    constraints: TokenKind.KwConstraints,
    states: TokenKind.KwStates,
    auth: TokenKind.KwAuth,
    relation: TokenKind.KwRelation,
    index: TokenKind.KwIndex,
    derived: TokenKind.KwDerived,
    requires: TokenKind.KwRequires,
    effects: TokenKind.KwEffects,
    emits: TokenKind.KwEmits,
    sync: TokenKind.KwSync,
    timeout: TokenKind.KwTimeout,
    retry: TokenKind.KwRetry,
    idempotent: TokenKind.KwIdempotent,
    transport: TokenKind.KwTransport,
    ordering: TokenKind.KwOrdering,
    participants: TokenKind.KwParticipants,
    persistence: TokenKind.KwPersistence,
    filter: TokenKind.KwFilter,
    max_size: TokenKind.KwMaxSize,
    engine: TokenKind.KwEngine,
    schema: TokenKind.KwSchema,
    retention: TokenKind.KwRetention,
    partition: TokenKind.KwPartition,
    replicas: TokenKind.KwReplicas,
    payload: TokenKind.KwPayload,
    delivery: TokenKind.KwDelivery,
    ttl: TokenKind.KwTtl,
    rate_limit: TokenKind.KwRateLimit,
    access: TokenKind.KwAccess,
    audit: TokenKind.KwAudit,
    encryption: TokenKind.KwEncryption,
    step: TokenKind.KwStep,
    compensate: TokenKind.KwCompensate,
    per: TokenKind.KwPer,
    has_one: TokenKind.KwHasOne,
    has_many: TokenKind.KwHasMany,
    belongs_to: TokenKind.KwBelongsTo,
    many_to_many: TokenKind.KwManyToMany,
    jwt: TokenKind.KwJwt,
    oauth2: TokenKind.KwOauth2,
    apikey: TokenKind.KwApikey,
    session: TokenKind.KwSession,
    websocket: TokenKind.KwWebsocket,
    sse: TokenKind.KwSse,
    polling: TokenKind.KwPolling,
    grpc_stream: TokenKind.KwGrpcStream,
    causal: TokenKind.KwCausal,
    fifo: TokenKind.KwFifo,
    total: TokenKind.KwTotal,
    unordered: TokenKind.KwUnordered,
    postgresql: TokenKind.KwPostgresql,
    redis: TokenKind.KwRedis,
    mongodb: TokenKind.KwMongodb,
    sqlite: TokenKind.KwSqlite,
    s3: TokenKind.KwS3,
    dynamodb: TokenKind.KwDynamodb,
    at_least_once: TokenKind.KwAtLeastOnce,
    at_most_once: TokenKind.KwAtMostOnce,
    exactly_once: TokenKind.KwExactlyOnce,
    at_rest: TokenKind.KwAtRest,
    in_transit: TokenKind.KwInTransit,
    both: TokenKind.KwBoth,
    realtime: TokenKind.KwRealtime,
    eventual: TokenKind.KwEventual,
    batch: TokenKind.KwBatch,
    transactional: TokenKind.KwTransactional,
    max_attempts: TokenKind.KwMaxAttempts,
    backoff: TokenKind.KwBackoff,
    interval: TokenKind.KwInterval,
    string: TokenKind.KwString,
    uint: TokenKind.KwUint,
    int: TokenKind.KwInt,
    float: TokenKind.KwFloat,
    bool: TokenKind.KwBool,
    timestamp: TokenKind.KwTimestamp,
    uuid: TokenKind.KwUuid,
    bytes: TokenKind.KwBytes,
    map: TokenKind.KwMap,
    json: TokenKind.KwJson,
    set: TokenKind.KwSet,
    list: TokenKind.KwList,
    optional: TokenKind.KwOptional,
    result: TokenKind.KwResult,
    true: TokenKind.KwTrue,
    false: TokenKind.KwFalse,
    none: TokenKind.KwNone,
    and: TokenKind.KwAnd,
    or: TokenKind.KwOr,
    not: TokenKind.KwNot,
    in: TokenKind.KwIn,
    contains: TokenKind.KwContains,
    unique: TokenKind.KwUnique,
    full: TokenKind.KwFull,
    now: TokenKind.KwNow,
    pipeline: TokenKind.KwPipeline,
    parallel: TokenKind.KwParallel,
    on_error: TokenKind.KwOnError,
    returns: TokenKind.KwReturns,
    algorithm: TokenKind.KwAlgorithm,
    using: TokenKind.KwUsing,
    extension_point: TokenKind.KwExtensionPoint,
    stable: TokenKind.KwStable,
    language: TokenKind.KwLanguage,
};
// â”€â”€â”€ Lexer Error â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
class LexerError extends Error {
    constructor(message, loc) {
        super(`Lexer error at ${loc.line}:${loc.column}: ${message}`);
        this.loc = loc;
        this.name = "LexerError";
    }
}
exports.LexerError = LexerError;
// â”€â”€â”€ Lexer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
class Lexer {
    constructor(source) {
        this.pos = 0;
        this.line = 1;
        this.column = 1;
        this.tokens = [];
        // Strip BOM if present
        if (source.charCodeAt(0) === 0xFEFF) {
            source = source.slice(1);
        }
        this.source = source;
    }
    tokenize() {
        while (this.pos < this.source.length) {
            this.skipWhitespaceAndComments();
            if (this.pos >= this.source.length)
                break;
            const token = this.nextToken();
            if (token) {
                this.tokens.push(token);
            }
        }
        this.tokens.push({
            kind: TokenKind.EOF,
            value: "",
            loc: this.currentLoc(),
        });
        return this.tokens;
    }
    currentLoc() {
        return { line: this.line, column: this.column, offset: this.pos };
    }
    peek() {
        return this.source[this.pos] ?? "";
    }
    peekAt(offset) {
        return this.source[this.pos + offset] ?? "";
    }
    advance() {
        const ch = this.source[this.pos];
        this.pos++;
        if (ch === "\n") {
            this.line++;
            this.column = 1;
        }
        else {
            this.column++;
        }
        return ch;
    }
    skipWhitespaceAndComments() {
        while (this.pos < this.source.length) {
            const ch = this.peek();
            // Whitespace
            if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
                this.advance();
                continue;
            }
            // Line comment
            if (ch === "/" && this.peekAt(1) === "/") {
                this.advance(); // /
                this.advance(); // /
                while (this.pos < this.source.length && this.peek() !== "\n") {
                    this.advance();
                }
                continue;
            }
            // Block comment
            if (ch === "/" && this.peekAt(1) === "*") {
                this.advance(); // /
                this.advance(); // *
                while (this.pos < this.source.length) {
                    if (this.peek() === "*" && this.peekAt(1) === "/") {
                        this.advance(); // *
                        this.advance(); // /
                        break;
                    }
                    this.advance();
                }
                continue;
            }
            break;
        }
    }
    nextToken() {
        const loc = this.currentLoc();
        const ch = this.peek();
        // Multi-character operators (check longest first)
        if (ch === "<" && this.peekAt(1) === "<" && this.peekAt(2) === "=") {
            this.advance();
            this.advance();
            this.advance();
            return { kind: TokenKind.AppendEq, value: "<<=", loc };
        }
        if (ch === "-" && this.peekAt(1) === ">") {
            this.advance();
            this.advance();
            return { kind: TokenKind.Arrow, value: "->", loc };
        }
        if (ch === "=" && this.peekAt(1) === "=") {
            this.advance();
            this.advance();
            return { kind: TokenKind.EqEq, value: "==", loc };
        }
        if (ch === "!" && this.peekAt(1) === "=") {
            this.advance();
            this.advance();
            return { kind: TokenKind.NotEq, value: "!=", loc };
        }
        if (ch === "<" && this.peekAt(1) === "=") {
            this.advance();
            this.advance();
            return { kind: TokenKind.LtEq, value: "<=", loc };
        }
        if (ch === ">" && this.peekAt(1) === "=") {
            this.advance();
            this.advance();
            return { kind: TokenKind.GtEq, value: ">=", loc };
        }
        if (ch === "+" && this.peekAt(1) === "=") {
            this.advance();
            this.advance();
            return { kind: TokenKind.PlusEq, value: "+=", loc };
        }
        if (ch === "-" && this.peekAt(1) === "=") {
            this.advance();
            this.advance();
            return { kind: TokenKind.MinusEq, value: "-=", loc };
        }
        if (ch === "." && this.peekAt(1) === ".") {
            this.advance();
            this.advance();
            return { kind: TokenKind.DotDot, value: "..", loc };
        }
        // Single-character operators
        switch (ch) {
            case "{":
                this.advance();
                return { kind: TokenKind.LBrace, value: "{", loc };
            case "}":
                this.advance();
                return { kind: TokenKind.RBrace, value: "}", loc };
            case "[":
                this.advance();
                return { kind: TokenKind.LBracket, value: "[", loc };
            case "]":
                this.advance();
                return { kind: TokenKind.RBracket, value: "]", loc };
            case "(":
                this.advance();
                return { kind: TokenKind.LParen, value: "(", loc };
            case ")":
                this.advance();
                return { kind: TokenKind.RParen, value: ")", loc };
            case "<":
                this.advance();
                return { kind: TokenKind.LAngle, value: "<", loc };
            case ">":
                this.advance();
                return { kind: TokenKind.RAngle, value: ">", loc };
            case ":":
                this.advance();
                return { kind: TokenKind.Colon, value: ":", loc };
            case ",":
                this.advance();
                return { kind: TokenKind.Comma, value: ",", loc };
            case ".":
                this.advance();
                return { kind: TokenKind.Dot, value: ".", loc };
            case "|":
                this.advance();
                return { kind: TokenKind.Pipe, value: "|", loc };
            case "=":
                this.advance();
                return { kind: TokenKind.Equals, value: "=", loc };
            case "+":
                this.advance();
                return { kind: TokenKind.Plus, value: "+", loc };
            case "-":
                this.advance();
                return { kind: TokenKind.Minus, value: "-", loc };
            case "*":
                this.advance();
                return { kind: TokenKind.Star, value: "*", loc };
            case "/":
                this.advance();
                return { kind: TokenKind.Slash, value: "/", loc };
            case "%":
                this.advance();
                return { kind: TokenKind.Percent, value: "%", loc };
            case "?":
                this.advance();
                return { kind: TokenKind.Question, value: "?", loc };
            case "!":
                this.advance();
                return { kind: TokenKind.Bang, value: "!", loc };
            case ";":
                this.advance();
                return { kind: TokenKind.Semicolon, value: ";", loc };
        }
        // String literal
        if (ch === '"') {
            return this.readString(loc);
        }
        // Number literal
        if (this.isDigit(ch)) {
            return this.readNumber(loc);
        }
        // Identifier or keyword
        if (this.isIdentStart(ch)) {
            return this.readIdentifierOrKeyword(loc);
        }
        throw new LexerError(`Unexpected character: '${ch}'`, loc);
    }
    readString(loc) {
        this.advance(); // opening "
        let value = "";
        while (this.pos < this.source.length && this.peek() !== '"') {
            if (this.peek() === "\\") {
                this.advance(); // backslash
                const escaped = this.advance();
                switch (escaped) {
                    case "n":
                        value += "\n";
                        break;
                    case "r":
                        value += "\r";
                        break;
                    case "t":
                        value += "\t";
                        break;
                    case '"':
                        value += '"';
                        break;
                    case "\\":
                        value += "\\";
                        break;
                    default:
                        throw new LexerError(`Invalid escape sequence: \\${escaped}`, loc);
                }
            }
            else {
                value += this.advance();
            }
        }
        if (this.pos >= this.source.length) {
            throw new LexerError("Unterminated string literal", loc);
        }
        this.advance(); // closing "
        return { kind: TokenKind.StringLiteral, value, loc };
    }
    readNumber(loc) {
        let value = "";
        while (this.pos < this.source.length && this.isDigit(this.peek())) {
            value += this.advance();
        }
        // Check for float
        if (this.peek() === "." && this.isDigit(this.peekAt(1))) {
            value += this.advance(); // .
            while (this.pos < this.source.length && this.isDigit(this.peek())) {
                value += this.advance();
            }
            return { kind: TokenKind.FloatLiteral, value, loc };
        }
        // Check for duration suffix (not a separate token â€” part of the literal)
        // Duration suffixes: ms, s, m, h, d
        if (this.peek() === "m" && this.peekAt(1) === "s") {
            value += this.advance();
            value += this.advance();
            return { kind: TokenKind.IntLiteral, value, loc };
        }
        if ((this.peek() === "s" || this.peek() === "m" || this.peek() === "h" || this.peek() === "d") &&
            !this.isIdentChar(this.peekAt(1))) {
            value += this.advance();
            return { kind: TokenKind.IntLiteral, value, loc };
        }
        return { kind: TokenKind.IntLiteral, value, loc };
    }
    readIdentifierOrKeyword(loc) {
        let value = "";
        while (this.pos < this.source.length && this.isIdentChar(this.peek())) {
            value += this.advance();
        }
        // Check keyword table
        const kwKind = KEYWORDS[value];
        if (kwKind !== undefined) {
            return { kind: kwKind, value, loc };
        }
        return { kind: TokenKind.Identifier, value, loc };
    }
    isDigit(ch) {
        return ch >= "0" && ch <= "9";
    }
    isIdentStart(ch) {
        return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
    }
    isIdentChar(ch) {
        return this.isIdentStart(ch) || this.isDigit(ch);
    }
}
exports.Lexer = Lexer;
//# sourceMappingURL=lexer.js.map