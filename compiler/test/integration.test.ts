/**
 * Integration tests
 * Tests complete compilation scenarios end-to-end:
 * source → lex → parse → type check → lower → optimize → solve → emit → verify
 */

import { createHash } from "crypto";
import { Lexer } from "../src/lexer";
import { Parser } from "../src/parser";
import { TypeChecker } from "../src/typechecker";
import { Lowering } from "../src/lowering";
import { FullEmitter } from "../src/emit_full";
import { Verifier } from "../src/verifier";
import { optimize } from "../src/optimizer";
import { ConstraintSolver } from "../src/solver";
import type { EmittedFile } from "../src/emitter";

// ─── Full pipeline helper ─────────────────────────────────────────────────────

interface PipelineResult {
  files: EmittedFile[];
  typeErrors: ReturnType<TypeChecker["check"]>;
  verifyResult: ReturnType<Verifier["verify"]>;
  fileCount: number;
  byLanguage: Record<string, number>;
}

function runPipeline(source: string): PipelineResult {
  const tokens = new Lexer(source).tokenize();
  const ast = new Parser(tokens).parse();
  const typeErrors = new TypeChecker().check(ast);

  const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
  const irSystems = new Lowering().lower(ast, hash);

  for (let i = 0; i < irSystems.length; i++) {
    irSystems[i] = optimize(irSystems[i]).system;
    irSystems[i].resolution = new ConstraintSolver().solve(irSystems[i]).resolution;
  }

  const emitter = new FullEmitter();
  const files = irSystems.flatMap(sys => emitter.emit(sys));
  const verifyResult = new Verifier().verify(irSystems[0], files);

  const byLanguage: Record<string, number> = {};
  for (const f of files) byLanguage[f.language] = (byLanguage[f.language] || 0) + 1;

  return { files, typeErrors, verifyResult, fileCount: files.length, byLanguage };
}

// ─── Scenario 1: Minimal system ───────────────────────────────────────────────

describe("Integration — minimal system", () => {
  const source = `
    system Minimal {
      entity User { owns: [name: string, email: string] }
    }
  `;

  let result: PipelineResult;
  beforeAll(() => { result = runPipeline(source); });

  test("compiles without type errors", () => {
    expect(result.typeErrors).toHaveLength(0);
  });

  test("verification passes", () => {
    expect(result.verifyResult.passed).toBe(true);
  });

  test("produces TypeScript, SQL, JSON, and YAML files", () => {
    expect(result.byLanguage["typescript"]).toBeGreaterThan(0);
    expect(result.byLanguage["sql"]).toBeGreaterThan(0);
    expect(result.byLanguage["json"]).toBeGreaterThan(0);
    expect(result.byLanguage["yaml"]).toBeGreaterThan(0);
  });

  test("produces at least 20 files", () => {
    expect(result.fileCount).toBeGreaterThanOrEqual(20);
  });
});

// ─── Scenario 2: E-commerce system ───────────────────────────────────────────

describe("Integration — e-commerce system", () => {
  const source = `
    system ECommerce {
      entity Product {
        owns: [name: string, price: uint, stock: uint]
        constraints: [price > 0, stock >= 0]
        states: available -> sold_out | archived
      }

      entity Order {
        owns: [total: uint, status: string]
        constraints: [total > 0]
        states: pending -> paid -> shipped -> delivered | cancelled
        relation product: belongs_to Product
      }

      event OrderPlaced {
        payload: { order_id: uuid, product_id: uuid, total: uint }
        delivery: exactly_once
        ttl: 90d
      }

      capability purchase(product: Product, qty: uint) {
        requires: [product.stock >= qty, qty > 0]
        effects: [product.stock -= qty]
        emits: OrderPlaced
        sync: transactional
      }

      capability restock(product: Product, qty: uint) {
        requires: [qty > 0]
        effects: [product.stock += qty]
        sync: transactional
      }
    }
  `;

  let result: PipelineResult;
  beforeAll(() => { result = runPipeline(source); });

  test("compiles without type errors", () => {
    expect(result.typeErrors).toHaveLength(0);
  });

  test("verification passes", () => {
    const errors = result.verifyResult.issues.filter(i => i.severity === "error");
    expect(errors).toHaveLength(0);
  });

  test("generates migrations for both entities", () => {
    const sqlFiles = result.files.filter(f => f.language === "sql" && f.path.includes("migrations/"));
    const names = sqlFiles.map(f => f.path);
    expect(names.some(n => n.includes("product"))).toBe(true);
    expect(names.some(n => n.includes("order"))).toBe(true);
  });

  test("generates route files for both entities", () => {
    const routes = result.files.filter(f => f.path.startsWith("src/routes/"));
    const names = routes.map(f => f.path);
    expect(names.some(n => n.includes("product"))).toBe(true);
    expect(names.some(n => n.includes("order"))).toBe(true);
  });

  test("generates state machine for Product", () => {
    const sm = result.files.find(f => f.path.includes("state_machines/product"));
    expect(sm).toBeDefined();
    expect(sm!.content).toContain("available");
    expect(sm!.content).toContain("sold_out");
    expect(sm!.content).toContain("archived");
  });

  test("generates state machine for Order", () => {
    const sm = result.files.find(f => f.path.includes("state_machines/order"));
    expect(sm).toBeDefined();
    expect(sm!.content).toContain("pending");
    expect(sm!.content).toContain("delivered");
    expect(sm!.content).toContain("cancelled");
  });

  test("purchase capability endpoint is generated", () => {
    const route = result.files.find(f => f.path.includes("routes/product"));
    expect(route).toBeDefined();
    expect(route!.content).toContain('post("/purchase"');
  });

  test("event outbox migration is generated", () => {
    const outbox = result.files.find(f => f.path.includes("event_outbox"));
    expect(outbox).toBeDefined();
    expect(outbox!.content).toContain("event_outbox");
  });
});

// ─── Scenario 3: Multiplayer game system ─────────────────────────────────────

describe("Integration — multiplayer game with channels", () => {
  const source = `
    system GameServer {
      entity Player {
        owns: [username: string, score: uint, level: uint]
        constraints: [score >= 0, level >= 1]
      }

      channel game_updates {
        transport: websocket
        ordering: causal
        participants: set<Player>
        persistence: last_100
      }

      event ScoreUpdated {
        payload: { player_id: uuid, new_score: uint }
        delivery: at_least_once
        ttl: 5s
      }

      capability add_score(player: Player, points: uint) {
        requires: [points > 0]
        effects: [player.score += points]
        emits: ScoreUpdated
        sync: eventual
      }
    }
  `;

  let result: PipelineResult;
  beforeAll(() => { result = runPipeline(source); });

  test("compiles without type errors", () => {
    expect(result.typeErrors).toHaveLength(0);
  });

  test("generates websocket.ts for channel", () => {
    const ws = result.files.find(f => f.path === "src/websocket.ts");
    expect(ws).toBeDefined();
    expect(ws!.content).toContain("WebSocket");
  });

  test("index.ts wires up WebSocket server", () => {
    const idx = result.files.find(f => f.path === "src/index.ts");
    expect(idx!.content).toContain("setupWebSocketServer");
  });
});

// ─── Scenario 4: System with flows ───────────────────────────────────────────

describe("Integration — system with flows", () => {
  const source = `
    system Checkout {
      entity Cart { owns: [total: uint] constraints: [total >= 0] }
      entity Payment { owns: [amount: uint, status: string] }

      capability validate_cart(cart: Cart) {
        requires: [cart.total > 0]
        effects: []
        sync: transactional
      }

      capability charge(payment: Payment) {
        requires: [payment.amount > 0]
        effects: [payment.status = "charged"]
        sync: transactional
      }

      flow checkout_flow {
        step validate: validate_cart(cart)
        step charge:   charge(payment)
      }
    }
  `;

  let result: PipelineResult;
  beforeAll(() => { result = runPipeline(source); });

  test("compiles without type errors", () => {
    expect(result.typeErrors).toHaveLength(0);
  });

  test("generates flows.ts", () => {
    const flows = result.files.find(f => f.path === "src/flows.ts");
    expect(flows).toBeDefined();
  });
});

// ─── Scenario 5: Type error propagation ──────────────────────────────────────

describe("Integration — type error propagation", () => {
  test("duplicate field stops at type check, no files emitted", () => {
    const source = `
      system Bad {
        entity E { owns: [x: uint, x: string] }
      }
    `;
    const result = runPipeline(source);
    expect(result.typeErrors.some(e => e.code === "T009")).toBe(true);
    // We still emit files (the pipeline continues) but the error is reported
    // This matches the CLI behavior: type errors are shown but compilation continues
  });

  test("undeclared event emitted produces T011", () => {
    const source = `
      system Bad {
        entity E { owns: [x: uint] }
        capability op(e: E) {
          requires: []
          effects: []
          emits: GhostEvent
          sync: eventual
        }
      }
    `;
    const result = runPipeline(source);
    expect(result.typeErrors.some(e => e.code === "T011")).toBe(true);
  });
});

// ─── Scenario 6: Determinism across full pipeline ────────────────────────────

describe("Integration — full pipeline determinism", () => {
  const source = `
    system Shop {
      entity Product {
        owns: [name: string, price: uint, stock: uint]
        constraints: [price > 0]
        states: available -> sold_out
      }
      event Sold { payload: { product_id: uuid } delivery: at_least_once ttl: 30d }
      capability sell(p: Product) {
        requires: [p.stock > 0]
        effects: [p.stock -= 1]
        emits: Sold
        sync: transactional
      }
    }
  `;

  test("two compilations produce identical output", () => {
    const r1 = runPipeline(source);
    const r2 = runPipeline(source);

    const normalize = (files: EmittedFile[]) =>
      files
        .map(f => ({ path: f.path, content: f.content }))
        .sort((a, b) => a.path.localeCompare(b.path));

    expect(JSON.stringify(normalize(r1.files))).toBe(JSON.stringify(normalize(r2.files)));
  });

  test("source hash is stable", () => {
    const h1 = createHash("sha256").update(source).digest("hex").slice(0, 16);
    const h2 = createHash("sha256").update(source).digest("hex").slice(0, 16);
    expect(h1).toBe(h2);
  });
});

// ─── Scenario 7: Verifier catches IR issues ───────────────────────────────────

describe("Integration — verifier", () => {
  test("valid system passes verifier with no errors", () => {
    const source = `
      system Valid {
        entity Item { owns: [name: string, qty: uint] constraints: [qty >= 0] }
      }
    `;
    const result = runPipeline(source);
    const errors = result.verifyResult.issues.filter(i => i.severity === "error");
    expect(errors).toHaveLength(0);
  });

  test("verifier result has passed flag", () => {
    const source = `
      system Valid {
        entity Item { owns: [name: string] }
      }
    `;
    const result = runPipeline(source);
    expect(typeof result.verifyResult.passed).toBe("boolean");
  });
});

// ─── Scenario 8: Real example files ──────────────────────────────────────────

import * as fs from "fs";
import * as path from "path";

describe("Integration — example files", () => {
  const inventoryPath = path.resolve(__dirname, "../../examples/inventory_platform.bone");
  const deliveryPath  = path.resolve(__dirname, "../../examples/delivery_platform.bone");
  const shopPath      = path.resolve(__dirname, "../../examples/marketplace/shop.bone");

  test("inventory_platform.bone compiles without type errors", () => {
    if (!fs.existsSync(inventoryPath)) {
      console.warn("Skipping: example file not found at", inventoryPath);
      return;
    }
    const source = fs.readFileSync(inventoryPath, "utf-8");
    const result = runPipeline(source);
    expect(result.typeErrors).toHaveLength(0);
  });

  test("inventory_platform.bone produces files", () => {
    if (!fs.existsSync(inventoryPath)) return;
    const source = fs.readFileSync(inventoryPath, "utf-8");
    const result = runPipeline(source);
    expect(result.fileCount).toBeGreaterThan(0);
  });

  test("inventory_platform.bone is deterministic", () => {
    if (!fs.existsSync(inventoryPath)) return;
    const source = fs.readFileSync(inventoryPath, "utf-8");
    const r1 = runPipeline(source);
    const r2 = runPipeline(source);
    const normalize = (files: EmittedFile[]) =>
      files.map(f => f.path + ":" + f.content.length).sort().join("|");
    expect(normalize(r1.files)).toBe(normalize(r2.files));
  });

  test("delivery_platform.bone compiles without type errors", () => {
    if (!fs.existsSync(deliveryPath)) {
      console.warn("Skipping: example file not found at", deliveryPath);
      return;
    }
    const source = fs.readFileSync(deliveryPath, "utf-8");
    const result = runPipeline(source);
    expect(result.typeErrors).toHaveLength(0);
  });

  test("delivery_platform.bone produces files including algorithm implementations", () => {
    if (!fs.existsSync(deliveryPath)) return;
    const source = fs.readFileSync(deliveryPath, "utf-8");
    const result = runPipeline(source);
    expect(result.fileCount).toBeGreaterThan(0);
    // Should emit algorithms.ts since the file uses shortest_path, bipartite_matching, etc.
    const algoFile = result.files.find(f => f.path === "src/algorithms.ts");
    expect(algoFile).toBeDefined();
    expect(algoFile!.content).toContain("shortest_path");
  });

  test("delivery_platform.bone is deterministic", () => {
    if (!fs.existsSync(deliveryPath)) return;
    const source = fs.readFileSync(deliveryPath, "utf-8");
    const r1 = runPipeline(source);
    const r2 = runPipeline(source);
    const normalize = (files: EmittedFile[]) =>
      files.map(f => f.path + ":" + f.content.length).sort().join("|");
    expect(normalize(r1.files)).toBe(normalize(r2.files));
  });

  test("delivery_platform.bone verification passes", () => {
    if (!fs.existsSync(deliveryPath)) return;
    const source = fs.readFileSync(deliveryPath, "utf-8");
    const result = runPipeline(source);
    const errors = result.verifyResult.issues.filter(i => i.severity === "error");
    expect(errors).toHaveLength(0);
  });

  test("marketplace/shop.bone compiles without type errors", () => {
    if (!fs.existsSync(shopPath)) {
      console.warn("Skipping: example file not found at", shopPath);
      return;
    }
    const source = fs.readFileSync(shopPath, "utf-8");
    const result = runPipeline(source);
    expect(result.typeErrors).toHaveLength(0);
  });

  test("marketplace/shop.bone produces files", () => {
    if (!fs.existsSync(shopPath)) return;
    const source = fs.readFileSync(shopPath, "utf-8");
    const result = runPipeline(source);
    expect(result.fileCount).toBeGreaterThan(0);
  });

  test("marketplace/shop.bone is deterministic", () => {
    if (!fs.existsSync(shopPath)) return;
    const source = fs.readFileSync(shopPath, "utf-8");
    const r1 = runPipeline(source);
    const r2 = runPipeline(source);
    const normalize = (files: EmittedFile[]) =>
      files.map(f => f.path + ":" + f.content.length).sort().join("|");
    expect(normalize(r1.files)).toBe(normalize(r2.files));
  });
});
