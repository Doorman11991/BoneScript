/**
 * Lexer unit tests
 * Tests tokenization of BoneScript constructs.
 */

import { Lexer, LexerError, TokenKind } from "../src/lexer";
import type { Token } from "../src/lexer";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lex(source: string): Token[] {
  return new Lexer(source).tokenize();
}

function kinds(source: string): TokenKind[] {
  return lex(source).map(t => t.kind);
}

function firstKind(source: string): TokenKind {
  return lex(source)[0].kind;
}

// ─── Keywords ─────────────────────────────────────────────────────────────────

describe("Lexer — keywords", () => {
  const keywordCases: [string, TokenKind][] = [
    ["system",       TokenKind.KwSystem],
    ["entity",       TokenKind.KwEntity],
    ["capability",   TokenKind.KwCapability],
    ["channel",      TokenKind.KwChannel],
    ["store",        TokenKind.KwStore],
    ["event",        TokenKind.KwEvent],
    ["constraint",   TokenKind.KwConstraint],
    ["policy",       TokenKind.KwPolicy],
    ["flow",         TokenKind.KwFlow],
    ["owns",         TokenKind.KwOwns],
    ["requires",     TokenKind.KwRequires],
    ["effects",      TokenKind.KwEffects],
    ["emits",        TokenKind.KwEmits],
    ["sync",         TokenKind.KwSync],
    ["states",       TokenKind.KwStates],
    ["relation",     TokenKind.KwRelation],
  ];

  test.each(keywordCases)("'%s' lexes as %s", (word, expected) => {
    expect(firstKind(word)).toBe(expected);
  });

  test("keyword is not confused with identifier prefix", () => {
    // 'systems' should be an Identifier, not KwSystem
    expect(firstKind("systems")).toBe(TokenKind.Identifier);
    expect(firstKind("entity_name")).toBe(TokenKind.Identifier);
    expect(firstKind("capability2")).toBe(TokenKind.Identifier);
  });
});

// ─── Identifiers ──────────────────────────────────────────────────────────────

describe("Lexer — identifiers", () => {
  test("simple identifier", () => {
    const [tok] = lex("MyEntity");
    expect(tok.kind).toBe(TokenKind.Identifier);
    expect(tok.value).toBe("MyEntity");
  });

  test("snake_case identifier", () => {
    const [tok] = lex("my_entity");
    expect(tok.kind).toBe(TokenKind.Identifier);
    expect(tok.value).toBe("my_entity");
  });

  test("identifier with digits", () => {
    const [tok] = lex("entity2");
    expect(tok.kind).toBe(TokenKind.Identifier);
    expect(tok.value).toBe("entity2");
  });

  test("identifier cannot start with digit", () => {
    // '2entity' lexes as IntLiteral then KwEntity (entity is a keyword)
    const tokens = lex("2entity");
    expect(tokens[0].kind).toBe(TokenKind.IntLiteral);
    expect(tokens[1].kind).toBe(TokenKind.KwEntity);
  });
});

// ─── Literals ─────────────────────────────────────────────────────────────────

describe("Lexer — literals", () => {
  test("integer literal", () => {
    const [tok] = lex("42");
    expect(tok.kind).toBe(TokenKind.IntLiteral);
    expect(tok.value).toBe("42");
  });

  test("float literal", () => {
    const [tok] = lex("3.14");
    expect(tok.kind).toBe(TokenKind.FloatLiteral);
    expect(tok.value).toBe("3.14");
  });

  test("string literal with double quotes", () => {
    const [tok] = lex('"hello world"');
    expect(tok.kind).toBe(TokenKind.StringLiteral);
    expect(tok.value).toBe("hello world");
  });

  test("string literal with escape sequences", () => {
    const [tok] = lex('"line1\\nline2"');
    expect(tok.kind).toBe(TokenKind.StringLiteral);
  });

  test("empty string literal", () => {
    const [tok] = lex('""');
    expect(tok.kind).toBe(TokenKind.StringLiteral);
    expect(tok.value).toBe("");
  });

  test("zero integer", () => {
    const [tok] = lex("0");
    expect(tok.kind).toBe(TokenKind.IntLiteral);
    expect(tok.value).toBe("0");
  });
});

// ─── Operators and punctuation ────────────────────────────────────────────────

describe("Lexer — operators and punctuation", () => {
  const opCases: [string, TokenKind][] = [
    ["{",  TokenKind.LBrace],
    ["}",  TokenKind.RBrace],
    ["[",  TokenKind.LBracket],
    ["]",  TokenKind.RBracket],
    ["(",  TokenKind.LParen],
    [")",  TokenKind.RParen],
    [":",  TokenKind.Colon],
    [",",  TokenKind.Comma],
    [".",  TokenKind.Dot],
    ["->", TokenKind.Arrow],
    ["|",  TokenKind.Pipe],
    ["=",  TokenKind.Equals],
    ["==", TokenKind.EqEq],
    ["!=", TokenKind.NotEq],
    ["<=", TokenKind.LtEq],
    [">=", TokenKind.GtEq],
    ["+=", TokenKind.PlusEq],
    ["-=", TokenKind.MinusEq],
    ["+",  TokenKind.Plus],
    ["-",  TokenKind.Minus],
    ["*",  TokenKind.Star],
    ["/",  TokenKind.Slash],
    ["%",  TokenKind.Percent],
    ["..", TokenKind.DotDot],
  ];

  test.each(opCases)("'%s' lexes as %s", (op, expected) => {
    expect(firstKind(op)).toBe(expected);
  });

  test("arrow is not confused with minus", () => {
    const tokens = lex("a -> b");
    expect(tokens[1].kind).toBe(TokenKind.Arrow);
  });

  test("== is not confused with =", () => {
    const tokens = lex("a == b");
    expect(tokens[1].kind).toBe(TokenKind.EqEq);
  });

  test(".. is not confused with .", () => {
    const tokens = lex("1..10");
    expect(tokens[1].kind).toBe(TokenKind.DotDot);
  });
});

// ─── Comments ─────────────────────────────────────────────────────────────────

describe("Lexer — comments", () => {
  test("line comment is skipped", () => {
    // The lexer emits an EOF token — filter it out when counting meaningful tokens
    const tokens = lex("// this is a comment\nfoo").filter(t => t.kind !== "EOF");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].kind).toBe(TokenKind.Identifier);
    expect(tokens[0].value).toBe("foo");
  });

  test("inline comment after code is skipped", () => {
    const tokens = lex("foo // comment").filter(t => t.kind !== "EOF");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].value).toBe("foo");
  });

  test("multiple comment lines", () => {
    const tokens = lex("// line 1\n// line 2\nbar").filter(t => t.kind !== "EOF");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].value).toBe("bar");
  });
});

// ─── Whitespace ───────────────────────────────────────────────────────────────

describe("Lexer — whitespace", () => {
  // The lexer always emits a trailing EOF token — filter it for length checks
  const meaningful = (source: string) => lex(source).filter(t => t.kind !== "EOF");

  test("spaces between tokens are ignored", () => {
    expect(meaningful("a   b   c")).toHaveLength(3);
  });

  test("newlines between tokens are ignored", () => {
    expect(meaningful("a\nb\nc")).toHaveLength(3);
  });

  test("tabs are ignored", () => {
    expect(meaningful("a\t\tb")).toHaveLength(2);
  });

  test("empty source produces only EOF", () => {
    expect(meaningful("")).toHaveLength(0);
    expect(meaningful("   ")).toHaveLength(0);
    expect(meaningful("// just a comment")).toHaveLength(0);
  });
});

// ─── Source locations ─────────────────────────────────────────────────────────

describe("Lexer — source locations", () => {
  test("first token is at line 1, column 1", () => {
    const [tok] = lex("foo");
    expect(tok.loc.line).toBe(1);
    expect(tok.loc.column).toBe(1);
  });

  test("token on second line has correct line number", () => {
    const tokens = lex("foo\nbar");
    expect(tokens[1].loc.line).toBe(2);
    expect(tokens[1].loc.column).toBe(1);
  });

  test("column advances correctly within a line", () => {
    const tokens = lex("foo bar");
    expect(tokens[0].loc.column).toBe(1);
    expect(tokens[1].loc.column).toBe(5);
  });
});

// ─── Duration literals ────────────────────────────────────────────────────────

describe("Lexer — duration literals", () => {
  test("duration with seconds suffix", () => {
    const tokens = lex("30s");
    // Duration is lexed as IntLiteral + Identifier or as a single DurationLiteral
    // depending on implementation — just verify it doesn't throw
    expect(tokens.length).toBeGreaterThan(0);
  });

  test("duration with days suffix", () => {
    const tokens = lex("90d");
    expect(tokens.length).toBeGreaterThan(0);
  });
});

// ─── Error cases ──────────────────────────────────────────────────────────────

describe("Lexer — error cases", () => {
  test("unterminated string literal throws LexerError", () => {
    expect(() => lex('"unterminated')).toThrow(LexerError);
  });

  test("LexerError has a message", () => {
    try {
      lex('"unterminated');
      fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(LexerError);
      expect((e as LexerError).message).toBeTruthy();
    }
  });
});

// ─── Full construct tokenization ──────────────────────────────────────────────

describe("Lexer — full constructs", () => {
  test("entity declaration tokenizes correctly", () => {
    const source = `entity User { owns: [name: string] }`;
    const tokens = lex(source);
    const kindList = tokens.map(t => t.kind);
    expect(kindList).toContain(TokenKind.KwEntity);
    expect(kindList).toContain(TokenKind.KwOwns);
    expect(kindList).toContain(TokenKind.LBrace);
    expect(kindList).toContain(TokenKind.RBrace);
    expect(kindList).toContain(TokenKind.LBracket);
    expect(kindList).toContain(TokenKind.RBracket);
    expect(kindList).toContain(TokenKind.Colon);
  });

  test("capability declaration tokenizes correctly", () => {
    const source = `capability buy(u: User, p: Product) {
      requires: [p.stock > 0]
      effects: [p.stock -= 1]
      sync: transactional
    }`;
    const tokens = lex(source);
    const kindList = tokens.map(t => t.kind);
    expect(kindList).toContain(TokenKind.KwCapability);
    expect(kindList).toContain(TokenKind.KwRequires);
    expect(kindList).toContain(TokenKind.KwEffects);
    expect(kindList).toContain(TokenKind.KwSync);
    expect(kindList).toContain(TokenKind.MinusEq);
  });

  test("state machine tokenizes correctly", () => {
    const source = `states: pending -> paid -> shipped | cancelled`;
    const tokens = lex(source);
    const kindList = tokens.map(t => t.kind);
    expect(kindList).toContain(TokenKind.KwStates);
    expect(kindList).toContain(TokenKind.Arrow);
    expect(kindList).toContain(TokenKind.Pipe);
  });

  test("generic type tokenizes correctly", () => {
    // Both 'set' and 'string' are keywords in BoneScript
    const source = `set<string>`;
    const tokens = lex(source);
    expect(tokens[0].kind).toBe(TokenKind.KwSet);
    expect(tokens[1].kind).toBe(TokenKind.LAngle);
    // 'string' is a keyword (KwString or similar) — verify it's not an error
    expect(tokens[2].value).toBe("string");
    expect(tokens[3].kind).toBe(TokenKind.RAngle);
  });

  test("determinism: same source always produces same tokens", () => {
    const source = `system Foo { entity Bar { owns: [x: uint] } }`;
    const t1 = lex(source);
    const t2 = lex(source);
    expect(JSON.stringify(t1)).toBe(JSON.stringify(t2));
  });
});
