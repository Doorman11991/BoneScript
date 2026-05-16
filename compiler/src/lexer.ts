/**
 * bone lexer
 * Converts source text into a token stream.
 *
 * This is a hand-written lexer (not regex-based) for precise error reporting
 * and deterministic behavior. It implements the lexical rules from spec/02_GRAMMAR.peg.
 */

// â”€â”€â”€ Token Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export enum TokenKind {
  // Structural
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
  At = "At",

  // Operators
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

  // Literals
  StringLiteral = "StringLiteral",
  IntLiteral = "IntLiteral",
  FloatLiteral = "FloatLiteral",

  // Keywords (each keyword is its own token kind for unambiguous parsing)
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

  // Auth methods
  KwJwt = "KwJwt",
  KwOauth2 = "KwOauth2",
  KwApikey = "KwApikey",
  KwSession = "KwSession",

  // Transport types
  KwWebsocket = "KwWebsocket",
  KwSse = "KwSse",
  KwPolling = "KwPolling",
  KwGrpcStream = "KwGrpcStream",

  // Ordering types
  KwCausal = "KwCausal",
  KwFifo = "KwFifo",
  KwTotal = "KwTotal",
  KwUnordered = "KwUnordered",

  // Engine types
  KwPostgresql = "KwPostgresql",
  KwRedis = "KwRedis",
  KwMongodb = "KwMongodb",
  KwSqlite = "KwSqlite",
  KwS3 = "KwS3",
  KwDynamodb = "KwDynamodb",

  // Delivery modes
  KwAtLeastOnce = "KwAtLeastOnce",
  KwAtMostOnce = "KwAtMostOnce",
  KwExactlyOnce = "KwExactlyOnce",

  // Encryption modes
  KwAtRest = "KwAtRest",
  KwInTransit = "KwInTransit",
  KwBoth = "KwBoth",

  // Sync modes
  KwRealtime = "KwRealtime",
  KwEventual = "KwEventual",
  KwBatch = "KwBatch",
  KwTransactional = "KwTransactional",

  // Retry fields
  KwMaxAttempts = "KwMaxAttempts",
  KwBackoff = "KwBackoff",
  KwInterval = "KwInterval",

  // Primitive types
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

  // Generic type constructors
  KwSet = "KwSet",
  KwList = "KwList",
  KwOptional = "KwOptional",
  KwResult = "KwResult",

  // Boolean literals
  KwTrue = "KwTrue",
  KwFalse = "KwFalse",
  KwNone = "KwNone",

  // Logical operators
  KwAnd = "KwAnd",
  KwOr = "KwOr",
  KwNot = "KwNot",
  KwIn = "KwIn",
  KwContains = "KwContains",
  KwUnique = "KwUnique",

  // Persistence modes
  KwFull = "KwFull",

  // Composition (Leap 1)
  KwPipeline = "KwPipeline",
  KwParallel = "KwParallel",
  KwOnError = "KwOnError",
  KwReturns = "KwReturns",

  // Algorithm catalog (Leap 2)
  KwAlgorithm = "KwAlgorithm",
  KwUsing = "KwUsing",

  // Extension points
  KwExtensionPoint = "KwExtensionPoint",
  KwStable = "KwStable",
  KwLanguage = "KwLanguage",

  // Special
  KwNow = "KwNow",

  // Identifier (anything not a keyword)
  Identifier = "Identifier",

  // End of file
  EOF = "EOF",
}

// â”€â”€â”€ Token â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Keyword Table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const KEYWORDS: Record<string, TokenKind> = {
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

export class LexerError extends Error {
  constructor(
    message: string,
    public loc: SourceLocation
  ) {
    super(`Lexer error at ${loc.line}:${loc.column}: ${message}`);
    this.name = "LexerError";
  }
}

// â”€â”€â”€ Lexer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export class Lexer {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];

  constructor(source: string) {
    // Strip BOM if present
    if (source.charCodeAt(0) === 0xFEFF) {
      source = source.slice(1);
    }
    this.source = source;
  }

  tokenize(): Token[] {
    while (this.pos < this.source.length) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.source.length) break;

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

  private currentLoc(): SourceLocation {
    return { line: this.line, column: this.column, offset: this.pos };
  }

  private peek(): string {
    return this.source[this.pos] ?? "";
  }

  private peekAt(offset: number): string {
    return this.source[this.pos + offset] ?? "";
  }

  private advance(): string {
    const ch = this.source[this.pos];
    this.pos++;
    if (ch === "\n") {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  private skipWhitespaceAndComments(): void {
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

  private nextToken(): Token | null {
    const loc = this.currentLoc();
    const ch = this.peek();

    // Multi-character operators (check longest first)
    if (ch === "<" && this.peekAt(1) === "<" && this.peekAt(2) === "=") {
      this.advance(); this.advance(); this.advance();
      return { kind: TokenKind.AppendEq, value: "<<=", loc };
    }
    if (ch === "-" && this.peekAt(1) === ">") {
      this.advance(); this.advance();
      return { kind: TokenKind.Arrow, value: "->", loc };
    }
    if (ch === "=" && this.peekAt(1) === "=") {
      this.advance(); this.advance();
      return { kind: TokenKind.EqEq, value: "==", loc };
    }
    if (ch === "!" && this.peekAt(1) === "=") {
      this.advance(); this.advance();
      return { kind: TokenKind.NotEq, value: "!=", loc };
    }
    if (ch === "<" && this.peekAt(1) === "=") {
      this.advance(); this.advance();
      return { kind: TokenKind.LtEq, value: "<=", loc };
    }
    if (ch === ">" && this.peekAt(1) === "=") {
      this.advance(); this.advance();
      return { kind: TokenKind.GtEq, value: ">=", loc };
    }
    if (ch === "+" && this.peekAt(1) === "=") {
      this.advance(); this.advance();
      return { kind: TokenKind.PlusEq, value: "+=", loc };
    }
    if (ch === "-" && this.peekAt(1) === "=") {
      this.advance(); this.advance();
      return { kind: TokenKind.MinusEq, value: "-=", loc };
    }
    if (ch === "." && this.peekAt(1) === ".") {
      this.advance(); this.advance();
      return { kind: TokenKind.DotDot, value: "..", loc };
    }

    // Single-character operators
    switch (ch) {
      case "{": this.advance(); return { kind: TokenKind.LBrace, value: "{", loc };
      case "}": this.advance(); return { kind: TokenKind.RBrace, value: "}", loc };
      case "[": this.advance(); return { kind: TokenKind.LBracket, value: "[", loc };
      case "]": this.advance(); return { kind: TokenKind.RBracket, value: "]", loc };
      case "(": this.advance(); return { kind: TokenKind.LParen, value: "(", loc };
      case ")": this.advance(); return { kind: TokenKind.RParen, value: ")", loc };
      case "<": this.advance(); return { kind: TokenKind.LAngle, value: "<", loc };
      case ">": this.advance(); return { kind: TokenKind.RAngle, value: ">", loc };
      case ":": this.advance(); return { kind: TokenKind.Colon, value: ":", loc };
      case ",": this.advance(); return { kind: TokenKind.Comma, value: ",", loc };
      case ".": this.advance(); return { kind: TokenKind.Dot, value: ".", loc };
      case "|": this.advance(); return { kind: TokenKind.Pipe, value: "|", loc };
      case "=": this.advance(); return { kind: TokenKind.Equals, value: "=", loc };
      case "+": this.advance(); return { kind: TokenKind.Plus, value: "+", loc };
      case "-": this.advance(); return { kind: TokenKind.Minus, value: "-", loc };
      case "*": this.advance(); return { kind: TokenKind.Star, value: "*", loc };
      case "/": this.advance(); return { kind: TokenKind.Slash, value: "/", loc };
      case "%": this.advance(); return { kind: TokenKind.Percent, value: "%", loc };
      case "?": this.advance(); return { kind: TokenKind.Question, value: "?", loc };
      case "!": this.advance(); return { kind: TokenKind.Bang, value: "!", loc };
      case ";": this.advance(); return { kind: TokenKind.Semicolon, value: ";", loc };
      case "@": this.advance(); return { kind: TokenKind.At, value: "@", loc };
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

  private readString(loc: SourceLocation): Token {
    this.advance(); // opening "
    let value = "";

    while (this.pos < this.source.length && this.peek() !== '"') {
      if (this.peek() === "\\") {
        this.advance(); // backslash
        const escaped = this.advance();
        switch (escaped) {
          case "n": value += "\n"; break;
          case "r": value += "\r"; break;
          case "t": value += "\t"; break;
          case '"': value += '"'; break;
          case "\\": value += "\\"; break;
          default:
            throw new LexerError(`Invalid escape sequence: \\${escaped}`, loc);
        }
      } else {
        value += this.advance();
      }
    }

    if (this.pos >= this.source.length) {
      throw new LexerError("Unterminated string literal", loc);
    }

    this.advance(); // closing "
    return { kind: TokenKind.StringLiteral, value, loc };
  }

  private readNumber(loc: SourceLocation): Token {
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
      value += this.advance(); value += this.advance();
      return { kind: TokenKind.IntLiteral, value, loc };
    }
    if (
      (this.peek() === "s" || this.peek() === "m" || this.peek() === "h" || this.peek() === "d") &&
      !this.isIdentChar(this.peekAt(1))
    ) {
      value += this.advance();
      return { kind: TokenKind.IntLiteral, value, loc };
    }

    return { kind: TokenKind.IntLiteral, value, loc };
  }

  private readIdentifierOrKeyword(loc: SourceLocation): Token {
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

  private isDigit(ch: string): boolean {
    return ch >= "0" && ch <= "9";
  }

  private isIdentStart(ch: string): boolean {
    return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
  }

  private isIdentChar(ch: string): boolean {
    return this.isIdentStart(ch) || this.isDigit(ch);
  }
}
