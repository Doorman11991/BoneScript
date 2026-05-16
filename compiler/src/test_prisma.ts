/**
 * Prisma emitter tests.
 *
 * Runs `npx prisma validate` against the generated schema.prisma. Catches
 * type-mapping bugs (e.g. Int @db.BigInt is invalid) that the substring tests
 * in test_react.ts can't see.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { Lowering } from "./lowering";
import { PrismaEmitter } from "./emit_prisma";
import { createHash } from "crypto";

let passed = 0;
let failed = 0;
function ok(name: string) { console.log("  v " + name); passed++; }
function fail(name: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.log("  x " + name + ": " + msg);
  failed++;
}

const SAMPLE = `
system Shop {
  domain: marketplace

  entity Product {
    owns: [
      name: string,
      price: uint,
      stock: uint,
      tags: list<string>,
      meta: json
    ]
    constraints: [price > 0, stock >= 0]
    states: available -> sold_out
    index: [name]
  }

  entity Order {
    owns: [
      product_id: uuid,
      quantity: uint,
      total: float
    ]
    constraints: [quantity > 0, total > 0]
    states: pending -> paid -> shipped
  }
}
`;

function run() {
  console.log("BoneScript Prisma Emitter Tests\n");

  // ─── Compile sample ─────────────────────────────────────────────────────────
  let schemaContent = "";
  try {
    const tokens = new Lexer(SAMPLE).tokenize();
    const ast = new Parser(tokens).parse();
    const hash = createHash("sha256").update(SAMPLE).digest("hex").slice(0, 16);
    const ir = new Lowering().lower(ast, hash);
    const files = new PrismaEmitter().emit(ir[0]);
    if (files.length === 0) throw new Error("no files emitted");
    schemaContent = files[0].content;
    ok("Emitted schema.prisma (" + files[0].content.length + " chars)");
  } catch (e) { fail("Compile to Prisma target", e); summary(); return; }

  // ─── Surface checks for the bugs we just fixed ──────────────────────────────
  if (!schemaContent.includes("@db.BigInt")) ok("uint/int no longer use invalid @db.BigInt");
  else fail("@db.BigInt still present", "found in schema");

  // updated_at must have both @default(now()) and @updatedAt
  const updatedAtLines = schemaContent.split("\n").filter(l => l.includes("updated_at"));
  if (updatedAtLines.length === 0) {
    fail("updated_at line missing", "no updated_at in schema");
  } else {
    const ok1 = updatedAtLines.every(l => l.includes("@default(now())"));
    const ok2 = updatedAtLines.every(l => l.includes("@updatedAt"));
    if (ok1 && ok2) ok("updated_at has @default(now()) @updatedAt");
    else fail("updated_at attributes", `default(now()): ${ok1}, @updatedAt: ${ok2}`);
  }

  if (schemaContent.includes("model Product {")) ok("Product model emitted");
  else fail("Product model", "missing");

  if (schemaContent.includes("model Order {")) ok("Order model emitted");
  else fail("Order model", "missing");

  // Infrastructure models
  if (schemaContent.includes("model AuditLog")) ok("AuditLog model emitted");
  else fail("AuditLog", "missing");

  if (schemaContent.includes("model EventOutbox")) ok("EventOutbox model emitted");
  else fail("EventOutbox", "missing");

  // ─── Run prisma validate against the generated schema ───────────────────────
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bonescript-prisma-test-"));
  try {
    fs.mkdirSync(path.join(tmp, "prisma"));
    fs.writeFileSync(path.join(tmp, "prisma", "schema.prisma"), schemaContent, "utf-8");

    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({
      name: "prisma-validate-test",
      version: "1.0.0",
      private: true,
      dependencies: {
        prisma: "5.22.0",
        "@prisma/client": "5.22.0",
      },
    }, null, 2), "utf-8");

    console.log("\n  (installing prisma — first run only)");
    execSync("npm install --silent --no-audit --no-fund", { cwd: tmp, stdio: "pipe" });
    ok("Prisma installed");

    // Prisma validate reads the datasource URL from env even though it doesn't
    // connect. Provide a syntactically valid placeholder.
    const env = { ...process.env, DATABASE_URL: "postgresql://user:pass@localhost:5432/db" };

    try {
      execSync("npx prisma validate", { cwd: tmp, stdio: "pipe", encoding: "utf-8", env });
      ok("npx prisma validate passes");
    } catch (e: any) {
      const out = (e.stdout || "") + (e.stderr || "");
      throw new Error("prisma validate errors:\n" + out.split("\n").slice(0, 30).join("\n"));
    }

    // Run prisma format to confirm the schema is canonical
    try {
      execSync("npx prisma format", { cwd: tmp, stdio: "pipe", encoding: "utf-8", env });
      ok("npx prisma format succeeds");
    } catch (e: any) {
      const out = (e.stdout || "") + (e.stderr || "");
      throw new Error("prisma format errors:\n" + out.split("\n").slice(0, 30).join("\n"));
    }
  } catch (e) {
    fail("Validate generated schema with Prisma", e);
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }

  summary();
}

function summary() {
  console.log("\n" + "═".repeat(40));
  console.log("Results: " + passed + " passed, " + failed + " failed");
  console.log("═".repeat(40));
  if (failed > 0) process.exit(1);
}

run();
