/**
 * bone lexer
 * Converts source text into a token stream.
 *
 * This is a hand-written lexer (not regex-based) for precise error reporting
 * and deterministic behavior. It implements the lexical rules from spec/02_GRAMMAR.peg.
 */
export declare enum TokenKind {
    LBrace = "LBrace",
    RBrace = "RBrace",
    LBracket = "LBracket",
    RBracket = "RBracket",
    LParen = "LParen",
    RParen = "RParen",
    LAngle = "LAngle",
    RAngle = "RAngle",
    Colon = "Colon",
    Comma = "Comma",
    Dot = "Dot",
    DotDot = "DotDot",
    Arrow = "Arrow",
    Pipe = "Pipe",
    Semicolon = "Semicolon",
    Equals = "Equals",
    EqEq = "EqEq",
    NotEq = "NotEq",
    LtEq = "LtEq",
    GtEq = "GtEq",
    Plus = "Plus",
    Minus = "Minus",
    Star = "Star",
    Slash = "Slash",
    Percent = "Percent",
    PlusEq = "PlusEq",
    MinusEq = "MinusEq",
    AppendEq = "AppendEq",
    Question = "Question",
    Bang = "Bang",
    StringLiteral = "StringLiteral",
    IntLiteral = "IntLiteral",
    FloatLiteral = "FloatLiteral",
    KwSystem = "KwSystem",
    KwEntity = "KwEntity",
    KwCapability = "KwCapability",
    KwChannel = "KwChannel",
    KwStore = "KwStore",
    KwEvent = "KwEvent",
    KwConstraint = "KwConstraint",
    KwPolicy = "KwPolicy",
    KwFlow = "KwFlow",
    KwImport = "KwImport",
    KwFrom = "KwFrom",
    KwDomain = "KwDomain",
    KwOwns = "KwOwns",
    KwConstraints = "KwConstraints",
    KwStates = "KwStates",
    KwAuth = "KwAuth",
    KwRelation = "KwRelation",
    KwIndex = "KwIndex",
    KwDerived = "KwDerived",
    KwRequires = "KwRequires",
    KwEffects = "KwEffects",
    KwEmits = "KwEmits",
    KwSync = "KwSync",
    KwTimeout = "KwTimeout",
    KwRetry = "KwRetry",
    KwIdempotent = "KwIdempotent",
    KwTransport = "KwTransport",
    KwOrdering = "KwOrdering",
    KwParticipants = "KwParticipants",
    KwPersistence = "KwPersistence",
    KwFilter = "KwFilter",
    KwMaxSize = "KwMaxSize",
    KwEngine = "KwEngine",
    KwSchema = "KwSchema",
    KwRetention = "KwRetention",
    KwPartition = "KwPartition",
    KwReplicas = "KwReplicas",
    KwPayload = "KwPayload",
    KwDelivery = "KwDelivery",
    KwTtl = "KwTtl",
    KwRateLimit = "KwRateLimit",
    KwAccess = "KwAccess",
    KwAudit = "KwAudit",
    KwEncryption = "KwEncryption",
    KwStep = "KwStep",
    KwCompensate = "KwCompensate",
    KwPer = "KwPer",
    KwHasOne = "KwHasOne",
    KwHasMany = "KwHasMany",
    KwBelongsTo = "KwBelongsTo",
    KwManyToMany = "KwManyToMany",
    KwJwt = "KwJwt",
    KwOauth2 = "KwOauth2",
    KwApikey = "KwApikey",
    KwSession = "KwSession",
    KwWebsocket = "KwWebsocket",
    KwSse = "KwSse",
    KwPolling = "KwPolling",
    KwGrpcStream = "KwGrpcStream",
    KwCausal = "KwCausal",
    KwFifo = "KwFifo",
    KwTotal = "KwTotal",
    KwUnordered = "KwUnordered",
    KwPostgresql = "KwPostgresql",
    KwRedis = "KwRedis",
    KwMongodb = "KwMongodb",
    KwSqlite = "KwSqlite",
    KwS3 = "KwS3",
    KwDynamodb = "KwDynamodb",
    KwAtLeastOnce = "KwAtLeastOnce",
    KwAtMostOnce = "KwAtMostOnce",
    KwExactlyOnce = "KwExactlyOnce",
    KwAtRest = "KwAtRest",
    KwInTransit = "KwInTransit",
    KwBoth = "KwBoth",
    KwRealtime = "KwRealtime",
    KwEventual = "KwEventual",
    KwBatch = "KwBatch",
    KwTransactional = "KwTransactional",
    KwMaxAttempts = "KwMaxAttempts",
    KwBackoff = "KwBackoff",
    KwInterval = "KwInterval",
    KwString = "KwString",
    KwUint = "KwUint",
    KwInt = "KwInt",
    KwFloat = "KwFloat",
    KwBool = "KwBool",
    KwTimestamp = "KwTimestamp",
    KwUuid = "KwUuid",
    KwBytes = "KwBytes",
    KwMap = "KwMap",
    KwJson = "KwJson",
    KwSet = "KwSet",
    KwList = "KwList",
    KwOptional = "KwOptional",
    KwResult = "KwResult",
    KwTrue = "KwTrue",
    KwFalse = "KwFalse",
    KwNone = "KwNone",
    KwAnd = "KwAnd",
    KwOr = "KwOr",
    KwNot = "KwNot",
    KwIn = "KwIn",
    KwContains = "KwContains",
    KwUnique = "KwUnique",
    KwFull = "KwFull",
    KwPipeline = "KwPipeline",
    KwParallel = "KwParallel",
    KwOnError = "KwOnError",
    KwReturns = "KwReturns",
    KwAlgorithm = "KwAlgorithm",
    KwUsing = "KwUsing",
    KwExtensionPoint = "KwExtensionPoint",
    KwStable = "KwStable",
    KwLanguage = "KwLanguage",
    KwNow = "KwNow",
    Identifier = "Identifier",
    EOF = "EOF"
}
export interface SourceLocation {
    line: number;
    column: number;
    offset: number;
}
export interface Token {
    kind: TokenKind;
    value: string;
    loc: SourceLocation;
}
export declare class LexerError extends Error {
    loc: SourceLocation;
    constructor(message: string, loc: SourceLocation);
}
export declare class Lexer {
    private source;
    private pos;
    private line;
    private column;
    private tokens;
    constructor(source: string);
    tokenize(): Token[];
    private currentLoc;
    private peek;
    private peekAt;
    private advance;
    private skipWhitespaceAndComments;
    private nextToken;
    private readString;
    private readNumber;
    private readIdentifierOrKeyword;
    private isDigit;
    private isIdentStart;
    private isIdentChar;
}
