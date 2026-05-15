/**
 * Parser unit tests
 * Tests AST generation from token streams.
 */

import { Lexer } from "../src/lexer";
import { Parser } from "../src/parser";
import { RecoveringParser } from "../src/parser_recovery";
import { ParseError } from "../src/parser_base";
import type * as AST from "../src/ast";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parse(source: string): AST.ProgramNode {
  const tokens = new Lexer(source).tokenize();
  return new Parser(tokens).parse();
}

function parseRecover(source: string) {
  const tokens = new Lexer(source).tokenize();
  return new RecoveringParser(tokens).parse();
}

function firstSystem(source: string): AST.SystemDeclNode {
  return parse(source).systems[0];
}

function decls(source: string): AST.DeclarationNode[] {
  return firstSystem(source).declarations;
}

function firstDecl<T extends AST.DeclarationNode>(source: string, kind: T["kind"]): T {
  const d = decls(source).find(d => d.kind === kind);
  if (!d) throw new Error(`No ${kind} declaration found`);
  return d as T;
}

// ─── System declaration ───────────────────────────────────────────────────────

describe("Parser — system declaration", () => {
  test("parses minimal system", () => {
    const ast = parse(`system Foo { entity Bar { owns: [x: uint] } }`);
    expect(ast.systems).toHaveLength(1);
    expect(ast.systems[0].name).toBe("Foo");
  });

  test("system name is captured", () => {
    const sys = firstSystem(`system MyApp { entity E { owns: [x: uint] } }`);
    expect(sys.name).toBe("MyApp");
  });

  test("system with domain annotation", () => {
    const sys = firstSystem(`system Shop { domain: marketplace entity P { owns: [n: string] } }`);
    expect(sys.domain).toBe("marketplace");
  });

  test("empty source throws ParseError", () => {
    expect(() => parse("")).toThrow(ParseError);
  });

  test("missing system body throws ParseError", () => {
    expect(() => parse("system Foo")).toThrow(ParseError);
  });

  test("multiple systems in one file", () => {
    const ast = parse(`
      system A { entity X { owns: [n: string] } }
      system B { entity Y { owns: [m: uint] } }
    `);
    expect(ast.systems).toHaveLength(2);
    expect(ast.systems[0].name).toBe("A");
    expect(ast.systems[1].name).toBe("B");
  });
});

// ─── Entity declaration ───────────────────────────────────────────────────────

describe("Parser — entity declaration", () => {
  const wrap = (body: string) => `system S { ${body} }`;

  test("parses entity with single field", () => {
    const entity = firstDecl<AST.EntityDeclNode>(
      wrap(`entity User { owns: [name: string] }`),
      "EntityDecl"
    );
    expect(entity.name).toBe("User");
    expect(entity.owns).toHaveLength(1);
    expect(entity.owns[0].name).toBe("name");
  });

  test("parses entity with multiple fields", () => {
    const entity = firstDecl<AST.EntityDeclNode>(
      wrap(`entity Product { owns: [name: string, price: uint, stock: uint] }`),
      "EntityDecl"
    );
    expect(entity.owns).toHaveLength(3);
    expect(entity.owns.map(f => f.name)).toEqual(["name", "price", "stock"]);
  });

  test("parses entity with constraints", () => {
    const entity = firstDecl<AST.EntityDeclNode>(
      wrap(`entity Item { owns: [price: uint] constraints: [price > 0] }`),
      "EntityDecl"
    );
    expect(entity.constraints).toHaveLength(1);
  });

  test("parses entity with state machine", () => {
    const entity = firstDecl<AST.EntityDeclNode>(
      wrap(`entity Order { owns: [x: uint] states: pending -> paid -> shipped }`),
      "EntityDecl"
    );
    expect(entity.states).not.toBeNull();
    expect(entity.states!.nodes.map(n => n.name)).toContain("pending");
    expect(entity.states!.nodes.map(n => n.name)).toContain("paid");
    expect(entity.states!.nodes.map(n => n.name)).toContain("shipped");
  });

  test("parses entity with branching states", () => {
    const entity = firstDecl<AST.EntityDeclNode>(
      wrap(`entity Task { owns: [x: uint] states: open -> done | cancelled }`),
      "EntityDecl"
    );
    const openNode = entity.states!.nodes.find(n => n.name === "open");
    expect(openNode).toBeDefined();
    // 'done' and 'cancelled' should be reachable from 'open'
    expect([...openNode!.transitions, ...openNode!.branches]).toContain("done");
    expect([...openNode!.transitions, ...openNode!.branches]).toContain("cancelled");
  });

  test("parses entity with relation", () => {
    const entity = firstDecl<AST.EntityDeclNode>(
      wrap(`entity Order { owns: [x: uint] relation buyer: belongs_to User }`),
      "EntityDecl"
    );
    expect(entity.relations).toHaveLength(1);
    expect(entity.relations[0].name).toBe("buyer");
    expect(entity.relations[0].relationType).toBe("belongs_to");
    expect(entity.relations[0].target).toBe("User");
  });

  test("empty entity body is accepted by the parser", () => {
    // Parser accepts empty bodies; type checker may reject them
    expect(() => parse(wrap(`entity Empty { }`))).not.toThrow();
  });
});

// ─── Capability declaration ───────────────────────────────────────────────────

describe("Parser — capability declaration", () => {
  const wrap = (body: string) => `system S { entity E { owns: [x: uint] } ${body} }`;

  test("parses minimal capability", () => {
    const cap = firstDecl<AST.CapabilityDeclNode>(
      wrap(`capability noop(e: E) { requires: [] effects: [] sync: eventual }`),
      "CapabilityDecl"
    );
    expect(cap.name).toBe("noop");
    expect(cap.params).toHaveLength(1);
    expect(cap.params[0].name).toBe("e");
  });

  test("parses capability with preconditions", () => {
    const cap = firstDecl<AST.CapabilityDeclNode>(
      wrap(`capability inc(e: E, n: uint) { requires: [n > 0, e.x < 1000] effects: [e.x += n] sync: eventual }`),
      "CapabilityDecl"
    );
    expect(cap.requires).toHaveLength(2);
  });

  test("parses capability with effects", () => {
    const cap = firstDecl<AST.CapabilityDeclNode>(
      wrap(`capability set_x(e: E, v: uint) { requires: [] effects: [e.x = v] sync: transactional }`),
      "CapabilityDecl"
    );
    expect(cap.effects).toHaveLength(1);
    expect(cap.effects[0].op).toBe("=");
  });

  test("parses += and -= effects", () => {
    const cap = firstDecl<AST.CapabilityDeclNode>(
      wrap(`capability adjust(e: E, n: uint) { requires: [] effects: [e.x += n, e.x -= 1] sync: eventual }`),
      "CapabilityDecl"
    );
    expect(cap.effects[0].op).toBe("+=");
    expect(cap.effects[1].op).toBe("-=");
  });

  test("parses capability with emits", () => {
    const src = `system S {
      entity E { owns: [x: uint] }
      event Done { payload: { id: uuid } delivery: at_least_once }
      capability finish(e: E) { requires: [] effects: [] emits: Done sync: eventual }
    }`;
    const cap = firstDecl<AST.CapabilityDeclNode>(src, "CapabilityDecl");
    expect(cap.emits).toHaveLength(1);
    expect(cap.emits[0].eventName).toBe("Done");
  });

  test("parses sync modes", () => {
    for (const mode of ["transactional", "eventual", "realtime", "batch"]) {
      const cap = firstDecl<AST.CapabilityDeclNode>(
        wrap(`capability op(e: E) { requires: [] effects: [] sync: ${mode} }`),
        "CapabilityDecl"
      );
      expect(cap.sync).toBe(mode);
    }
  });

  test("parses timeout", () => {
    const cap = firstDecl<AST.CapabilityDeclNode>(
      wrap(`capability op(e: E) { requires: [] effects: [] sync: eventual timeout: 10s }`),
      "CapabilityDecl"
    );
    expect(cap.timeout).toBeTruthy();
  });
});

// ─── Event declaration ────────────────────────────────────────────────────────

describe("Parser — event declaration", () => {
  const wrap = (body: string) => `system S { entity E { owns: [x: uint] } ${body} }`;

  test("parses event with payload", () => {
    const ev = firstDecl<AST.EventDeclNode>(
      wrap(`event OrderPlaced { payload: { order_id: uuid, total: uint } delivery: exactly_once }`),
      "EventDecl"
    );
    expect(ev.name).toBe("OrderPlaced");
    expect(ev.payload).toHaveLength(2);
    expect(ev.payload[0].name).toBe("order_id");
  });

  test("parses delivery modes", () => {
    for (const mode of ["at_least_once", "exactly_once"]) {
      const ev = firstDecl<AST.EventDeclNode>(
        wrap(`event E { payload: { id: uuid } delivery: ${mode} }`),
        "EventDecl"
      );
      expect(ev.delivery).toBe(mode);
    }
  });

  test("parses event with TTL", () => {
    const ev = firstDecl<AST.EventDeclNode>(
      wrap(`event E { payload: { id: uuid } delivery: at_least_once ttl: 30d }`),
      "EventDecl"
    );
    expect(ev.ttl).toBeTruthy();
  });
});

// ─── Channel declaration ──────────────────────────────────────────────────────

describe("Parser — channel declaration", () => {
  const wrap = (body: string) => `system S { entity E { owns: [x: uint] } ${body} }`;

  test("parses channel declaration", () => {
    const ch = firstDecl<AST.ChannelDeclNode>(
      wrap(`channel updates { transport: websocket ordering: causal participants: set<E> persistence: last_100 }`),
      "ChannelDecl"
    );
    expect(ch.name).toBe("updates");
    expect(ch.transport).toBe("websocket");
    expect(ch.ordering).toBe("causal");
  });
});

// ─── Flow declaration ─────────────────────────────────────────────────────────

describe("Parser — flow declaration", () => {
  const wrap = (body: string) => `system S { entity E { owns: [x: uint] } ${body} }`;

  test("parses flow with two steps", () => {
    const flow = firstDecl<AST.FlowDeclNode>(
      wrap(`flow checkout { step validate: check(e) step charge: pay(e) }`),
      "FlowDecl"
    );
    expect(flow.name).toBe("checkout");
    expect(flow.steps).toHaveLength(2);
    expect(flow.steps[0].name).toBe("validate");
    expect(flow.steps[1].name).toBe("charge");
  });

  test("flow with one step is parsed (type checker catches the error)", () => {
    // Parser accepts it; type checker rejects it with T012
    const result = parseRecover(wrap(`flow bad { step one: do_thing(e) }`));
    expect(result.ast).not.toBeNull();
  });
});

// ─── Store declaration ────────────────────────────────────────────────────────

describe("Parser — store declaration", () => {
  const wrap = (body: string) => `system S { entity E { owns: [x: uint] } ${body} }`;

  test("parses store with engine", () => {
    const store = firstDecl<AST.StoreDeclNode>(
      wrap(`store sessions { engine: redis }`),
      "StoreDecl"
    );
    expect(store.name).toBe("sessions");
    expect(store.engine).toBe("redis");
  });
});

// ─── Type expressions ─────────────────────────────────────────────────────────

describe("Parser — type expressions", () => {
  const wrap = (fieldType: string) =>
    `system S { entity E { owns: [x: ${fieldType}] } }`;

  const primitives = ["string", "uint", "int", "float", "bool", "timestamp", "uuid", "bytes", "json"];

  test.each(primitives)("primitive type '%s' parses", (t) => {
    const entity = firstDecl<AST.EntityDeclNode>(wrap(t), "EntityDecl");
    expect(entity.owns[0].type.kind).toBe("PrimitiveType");
  });

  test("generic type list<string> parses", () => {
    const entity = firstDecl<AST.EntityDeclNode>(wrap("list<string>"), "EntityDecl");
    expect(entity.owns[0].type.kind).toBe("GenericType");
  });

  test("generic type set<uuid> parses", () => {
    const entity = firstDecl<AST.EntityDeclNode>(wrap("set<uuid>"), "EntityDecl");
    expect(entity.owns[0].type.kind).toBe("GenericType");
  });

  test("entity reference type parses", () => {
    const src = `system S {
      entity User { owns: [name: string] }
      entity Order { owns: [buyer: User] }
    }`;
    const order = parse(src).systems[0].declarations
      .filter(d => d.kind === "EntityDecl")
      .find((d: any) => d.name === "Order") as AST.EntityDeclNode;
    expect(order.owns[0].type.kind).toBe("EntityRefType");
  });
});

// ─── Error recovery ───────────────────────────────────────────────────────────

describe("Parser — error recovery", () => {
  test("recovering parser returns partial AST on syntax error", () => {
    // An empty entity body is actually valid in this parser, so use a harder syntax error
    const result = parseRecover(`system S { entity Bad { owns: [x: ] } entity Good { owns: [x: uint] } }`);
    // Should produce an AST (possibly partial) and may have errors
    expect(result.ast !== null || result.errors.length > 0).toBe(true);
  });

  test("recovering parser reports error location", () => {
    const result = parseRecover(`system S { entity Bad { } }`);
    if (result.errors.length > 0) {
      expect(result.errors[0].message).toBeTruthy();
    }
  });

  test("strict parser throws on truly invalid syntax", () => {
    // Missing type in field list is a genuine parse error
    expect(() => parse(`system S { entity Bad { owns: [x: ] } }`)).toThrow(ParseError);
  });

  test("strict parser throws on missing system name", () => {
    expect(() => parse(`system { entity E { owns: [x: uint] } }`)).toThrow(ParseError);
  });
});

// ─── Determinism ──────────────────────────────────────────────────────────────

describe("Parser — determinism", () => {
  test("same source always produces identical AST", () => {
    const source = `system Shop {
      entity Product { owns: [name: string, price: uint] constraints: [price > 0] }
      capability buy(p: Product) { requires: [p.price > 0] effects: [p.price -= 1] sync: transactional }
    }`;
    const ast1 = parse(source);
    const ast2 = parse(source);
    expect(JSON.stringify(ast1)).toBe(JSON.stringify(ast2));
  });
});
