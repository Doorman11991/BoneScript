/**
 * Emitter unit tests
 * Verifies that generated code contains the expected constructs.
 * Tests the FullEmitter (complete project output) and targeted emitters.
 */

import { createHash } from "crypto";
import { Lexer } from "../src/lexer";
import { Parser } from "../src/parser";
import { TypeChecker } from "../src/typechecker";
import { Lowering } from "../src/lowering";
import { FullEmitter } from "../src/emit_full";
import { optimize } from "../src/optimizer";
import { ConstraintSolver } from "../src/solver";
import type { EmittedFile } from "../src/emitter";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function compile(source: string): EmittedFile[] {
  const tokens = new Lexer(source).tokenize();
  const ast = new Parser(tokens).parse();
  const typeErrors = new TypeChecker().check(ast);
  if (typeErrors.length > 0) {
    throw new Error(`Type errors: ${typeErrors.map(e => `${e.code}: ${e.message}`).join(", ")}`);
  }
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
  const irSystems = new Lowering().lower(ast, hash);
  for (let i = 0; i < irSystems.length; i++) {
    irSystems[i] = optimize(irSystems[i]).system;
    irSystems[i].resolution = new ConstraintSolver().solve(irSystems[i]).resolution;
  }
  const emitter = new FullEmitter();
  return irSystems.flatMap(sys => emitter.emit(sys));
}

function file(files: EmittedFile[], pathSuffix: string): EmittedFile {
  const f = files.find(f => f.path.endsWith(pathSuffix));
  if (!f) {
    const paths = files.map(f => f.path).join(", ");
    throw new Error(`File ending in '${pathSuffix}' not found. Available: ${paths}`);
  }
  return f;
}

function content(files: EmittedFile[], pathSuffix: string): string {
  return file(files, pathSuffix).content;
}

// ─── Minimal system ───────────────────────────────────────────────────────────

const MINIMAL = `
system Shop {
  entity Product {
    owns: [name: string, price: uint, stock: uint]
    constraints: [price > 0, stock >= 0]
  }
}
`;

describe("Emitter — file set", () => {
  let files: EmittedFile[];
  beforeAll(() => { files = compile(MINIMAL); });

  test("emits package.json", () => {
    const f = file(files, "package.json");
    expect(f.language).toBe("json");
    const pkg = JSON.parse(f.content);
    expect(pkg.name).toBe("shop");
    expect(pkg.dependencies).toHaveProperty("express");
    expect(pkg.dependencies).toHaveProperty("pg");
    expect(pkg.dependencies).toHaveProperty("jsonwebtoken");
  });

  test("emits tsconfig.json", () => {
    const f = file(files, "tsconfig.json");
    const cfg = JSON.parse(f.content);
    expect(cfg.compilerOptions.strict).toBe(true);
    expect(cfg.compilerOptions.target).toBe("ES2020");
  });

  test("emits src/db.ts", () => {
    const c = content(files, "src/db.ts");
    expect(c).toContain("Pool");
    expect(c).toContain("export async function query");
    expect(c).toContain("export async function queryOne");
    expect(c).toContain("export async function transaction");
  });

  test("emits src/auth.ts", () => {
    const c = content(files, "src/auth.ts");
    expect(c).toContain("JWT_SECRET");
    expect(c).toContain("authMiddleware");
    expect(c).toContain("requireAuth");
    expect(c).toContain("process.exit(1)"); // production safety check
  });

  test("emits src/index.ts", () => {
    const c = content(files, "src/index.ts");
    expect(c).toContain("express()");
    expect(c).toContain("helmet()");
    expect(c).toContain("rateLimit");
    expect(c).toContain("SIGTERM");
    expect(c).toContain("SIGINT");
  });

  test("emits src/events.ts", () => {
    const c = content(files, "src/events.ts");
    expect(c).toContain("eventBus");
    expect(c).toContain("publish");
    expect(c).toContain("subscribe");
  });

  test("emits src/health.ts", () => {
    const c = content(files, "src/health.ts");
    expect(c).toContain("/live");
    expect(c).toContain("/ready");
  });

  test("emits src/logger.ts", () => {
    const c = content(files, "src/logger.ts");
    expect(c).toContain("logger");
    expect(c).toContain("info");
    expect(c).toContain("error");
  });

  test("emits src/metrics.ts", () => {
    const c = content(files, "src/metrics.ts");
    expect(c).toContain("counter");
  });

  test("emits Dockerfile", () => {
    const c = content(files, "Dockerfile");
    expect(c).toContain("FROM node");
    expect(c).toContain("EXPOSE");
  });

  test("emits docker-compose.yaml", () => {
    const c = content(files, "docker-compose.yaml");
    expect(c).toContain("postgres");
    expect(c).toContain("redis");
  });

  test("emits .github/workflows/ci.yaml", () => {
    const c = content(files, "ci.yaml");
    expect(c).toContain("npm");
    expect(c).toContain("postgres");
  });

  test("emits .env.example", () => {
    const c = content(files, ".env.example");
    expect(c).toContain("JWT_SECRET");
    expect(c).toContain("DATABASE_URL");
    expect(c).toContain("RATE_LIMIT_MAX");
  });
});

// ─── SQL migration output ─────────────────────────────────────────────────────

describe("Emitter — SQL migrations", () => {
  let files: EmittedFile[];
  beforeAll(() => { files = compile(MINIMAL); });

  test("emits migration for Product entity", () => {
    const c = content(files, "migrations/product.sql");
    expect(c).toContain("CREATE TABLE IF NOT EXISTS products");
    expect(c).toContain("id UUID");
    expect(c).toContain("name VARCHAR");
    expect(c).toContain("price BIGINT");
    expect(c).toContain("stock BIGINT");
    expect(c).toContain("created_at TIMESTAMPTZ");
    expect(c).toContain("updated_at TIMESTAMPTZ");
  });

  test("migration includes primary key", () => {
    const c = content(files, "migrations/product.sql");
    expect(c).toContain("PRIMARY KEY");
  });

  test("migration includes updated_at trigger", () => {
    const c = content(files, "migrations/product.sql");
    expect(c).toContain("TRIGGER");
    expect(c).toContain("updated_at");
  });

  test("migration uses parameterized defaults", () => {
    const c = content(files, "migrations/product.sql");
    expect(c).toContain("gen_random_uuid()");
    expect(c).toContain("DEFAULT NOW()");
  });
});

// ─── Route file output ────────────────────────────────────────────────────────

describe("Emitter — route files", () => {
  let files: EmittedFile[];
  beforeAll(() => { files = compile(MINIMAL); });

  test("emits route file for Product", () => {
    const c = content(files, "src/routes/product.ts");
    expect(c).toContain("productsRouter");
    expect(c).toContain("Router()");
  });

  test("route file has CRUD endpoints", () => {
    const c = content(files, "src/routes/product.ts");
    expect(c).toContain('post("/",');       // CREATE
    expect(c).toContain('get("/:id",');     // READ
    expect(c).toContain('get("/",');        // LIST
    expect(c).toContain('put("/:id",');     // UPDATE
    expect(c).toContain('delete("/:id",'); // DELETE
  });

  test("route file uses requireAuth on all endpoints", () => {
    const c = content(files, "src/routes/product.ts");
    const requireAuthCount = (c.match(/requireAuth/g) || []).length;
    expect(requireAuthCount).toBeGreaterThanOrEqual(5); // at least one per CRUD op
  });

  test("UPDATE route has column allowlist (SQL injection prevention)", () => {
    const c = content(files, "src/routes/product.ts");
    expect(c).toContain("ALLOWED_COLUMNS");
    expect(c).toContain("new Set([");
  });

  test("LIST route uses COUNT(*) OVER() window function", () => {
    const c = content(files, "src/routes/product.ts");
    expect(c).toContain("COUNT(*) OVER()");
    expect(c).not.toContain("SELECT COUNT(*) as count"); // old two-query pattern gone
  });
});

// ─── Capability endpoint generation ──────────────────────────────────────────

const WITH_CAPABILITY = `
system Shop {
  entity Product {
    owns: [name: string, price: uint, stock: uint]
    constraints: [price > 0, stock >= 0]
  }
  capability restock(p: Product, qty: uint) {
    requires: [qty > 0]
    effects: [p.stock += qty]
    sync: transactional
  }
}
`;

describe("Emitter — capability endpoints", () => {
  let files: EmittedFile[];
  beforeAll(() => { files = compile(WITH_CAPABILITY); });

  test("capability endpoint is emitted", () => {
    const c = content(files, "src/routes/product.ts");
    expect(c).toContain('post("/restock"');
  });

  test("transactional capability uses BEGIN/COMMIT", () => {
    const c = content(files, "src/routes/product.ts");
    expect(c).toContain('"BEGIN"');
    expect(c).toContain('"COMMIT"');
    expect(c).toContain('"ROLLBACK"');
  });

  test("capability fetches entity before checking preconditions", () => {
    const c = content(files, "src/routes/product.ts");
    // Entity fetch should appear before precondition check
    const fetchIdx = c.indexOf("SELECT * FROM products");
    const preIdx   = c.indexOf("PRECONDITION_FAILED");
    expect(fetchIdx).toBeLessThan(preIdx);
  });

  test("capability effect is emitted in the route", () => {
    const c = content(files, "src/routes/product.ts");
    // The restock capability should have an effects section
    expect(c).toContain("// Effects (batched by entity to minimise round-trips)");
    // The capability endpoint exists
    expect(c).toContain('post("/restock"');
  });
});

// ─── State machine output ─────────────────────────────────────────────────────

const WITH_STATES = `
system Shop {
  entity Order {
    owns: [total: uint]
    states: pending -> paid -> shipped
  }
}
`;

describe("Emitter — state machine", () => {
  let files: EmittedFile[];
  beforeAll(() => { files = compile(WITH_STATES); });

  test("emits state machine file", () => {
    const c = content(files, "src/state_machines/order.ts");
    expect(c).toContain("OrderState");
    expect(c).toContain("transitionOrder");
    expect(c).toContain("ORDER_INITIAL");
  });

  test("state machine includes all states", () => {
    const c = content(files, "src/state_machines/order.ts");
    expect(c).toContain('"pending"');
    expect(c).toContain('"paid"');
    expect(c).toContain('"shipped"');
  });

  test("state machine transition function returns ok/error", () => {
    const c = content(files, "src/state_machines/order.ts");
    expect(c).toContain("ok: true");
    expect(c).toContain("ok: false");
  });

  test("UPDATE route enforces state machine", () => {
    const c = content(files, "src/routes/order.ts");
    expect(c).toContain("transitionOrder");
    expect(c).toContain("INVALID_TRANSITION");
  });
});

// ─── WebSocket channel output ─────────────────────────────────────────────────

const WITH_CHANNEL = `
system Game {
  entity Player { owns: [name: string] }
  channel updates {
    transport: websocket
    ordering: causal
    participants: set<Player>
    persistence: last_50
  }
}
`;

describe("Emitter — WebSocket channels", () => {
  let files: EmittedFile[];
  beforeAll(() => { files = compile(WITH_CHANNEL); });

  test("emits websocket.ts when channels are declared", () => {
    const c = content(files, "src/websocket.ts");
    expect(c).toContain("WebSocket");
  });

  test("index.ts sets up WebSocket server", () => {
    const c = content(files, "src/index.ts");
    expect(c).toContain("setupWebSocketServer");
  });
});

// ─── Event outbox output ──────────────────────────────────────────────────────

const WITH_EVENT = `
system Shop {
  entity Product { owns: [name: string, price: uint] }
  event PriceChanged {
    payload: { product_id: uuid, new_price: uint }
    delivery: exactly_once
    ttl: 30d
  }
  capability update_price(p: Product, new_price: uint) {
    requires: [new_price > 0]
    effects: [p.price = new_price]
    emits: PriceChanged
    sync: transactional
  }
}
`;

describe("Emitter — events", () => {
  let files: EmittedFile[];
  beforeAll(() => { files = compile(WITH_EVENT); });

  test("emits event outbox migration", () => {
    const c = content(files, "migrations/event_outbox.sql");
    expect(c).toContain("event_outbox");
    expect(c).toContain("event_type");
    expect(c).toContain("status");
  });

  test("capability endpoint publishes event", () => {
    const c = content(files, "src/routes/product.ts");
    expect(c).toContain('eventBus.publish("PriceChanged"');
  });
});

// ─── Security properties ──────────────────────────────────────────────────────

describe("Emitter — security properties", () => {
  let files: EmittedFile[];
  beforeAll(() => { files = compile(MINIMAL); });

  test("auth.ts refuses to start in production without JWT_SECRET", () => {
    const c = content(files, "src/auth.ts");
    expect(c).toContain("process.exit(1)");
    expect(c).toContain("production");
    expect(c).toContain("JWT_SECRET");
  });

  test("index.ts uses helmet", () => {
    const c = content(files, "src/index.ts");
    expect(c).toContain("helmet()");
  });

  test("index.ts restricts CORS to ALLOWED_ORIGINS", () => {
    const c = content(files, "src/index.ts");
    expect(c).toContain("ALLOWED_ORIGINS");
    expect(c).not.toContain("cors()"); // bare cors() with no config is gone
  });

  test("index.ts applies rate limiting", () => {
    const c = content(files, "src/index.ts");
    expect(c).toContain("rateLimit");
    expect(c).toContain("RATE_LIMIT_MAX");
    expect(c).toContain("AUTH_RATE_LIMIT_MAX");
  });

  test("index.ts limits request body size", () => {
    const c = content(files, "src/index.ts");
    expect(c).toContain('limit: "1mb"');
  });
});

// ─── Determinism ──────────────────────────────────────────────────────────────

describe("Emitter — determinism", () => {
  test("same source always produces identical output", () => {
    const files1 = compile(MINIMAL);
    const files2 = compile(MINIMAL);
    const sorted = (f: EmittedFile[]) =>
      f.map(x => ({ path: x.path, content: x.content }))
       .sort((a, b) => a.path.localeCompare(b.path));
    expect(JSON.stringify(sorted(files1))).toBe(JSON.stringify(sorted(files2)));
  });
});
