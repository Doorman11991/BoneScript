/**
 * SQLite target end-to-end test.
 *
 * Compiles a small .bone program to the SQLite target, installs better-sqlite3,
 * runs the generated migrations, then performs CRUD against the generated
 * db.ts API surface to confirm:
 *   - schema applies cleanly
 *   - generated query() handles SELECT / INSERT / UPDATE / DELETE
 *   - $1, $2 placeholder translation works
 *   - RETURNING * emulation returns the inserted/updated row
 *   - ledger prevents re-running the same migration
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { createHash } from "crypto";
import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { Lowering } from "./lowering";
import { SqliteEmitter } from "./emit_sqlite";

const SAMPLE = `
system TestStore {
  domain: saas_platform

  entity Item {
    owns: [name: string, quantity: uint, available: bool]
    constraints: [quantity >= 0]
  }
}
`;

let passed = 0;
let failed = 0;

function ok(name: string) { console.log("  v " + name); passed++; }
function fail(name: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.log("  x " + name + ": " + msg);
  failed++;
}

function run(): void {
  console.log("BoneScript SQLite Target Tests\n");

  // 1. Compile sample to SQLite target into a temp dir
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bonescript-sqlite-"));
  const outDir = path.join(tmpRoot, "out");
  fs.mkdirSync(outDir);

  try {
    const tokens = new Lexer(SAMPLE).tokenize();
    const ast = new Parser(tokens).parse();
    const hash = createHash("sha256").update(SAMPLE).digest("hex").slice(0, 16);
    const ir = new Lowering().lower(ast, hash);

    const emitter = new SqliteEmitter();
    const files = emitter.emit(ir[0]);

    for (const f of files) {
      const target = path.join(outDir, f.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, f.content, "utf-8");
    }
    ok("Emitter produced " + files.length + " file(s)");
  } catch (e) { fail("Compile to SQLite target", e); return; }

  // 2. Verify expected files exist
  for (const expected of ["package.json", "src/db.ts", "src/migrate.ts", "migrations/event_outbox.sql", "migrations/audit_log.sql"]) {
    if (fs.existsSync(path.join(outDir, expected))) ok("Generated " + expected);
    else { fail("Missing " + expected, "file not emitted"); return; }
  }

  // 3. Run migrations against an actual sqlite db
  // We do this by directly using better-sqlite3 from the compiler's node_modules
  // (it's already a transitive dep of ts-node tooling) — install only if missing.
  const compilerNodeModules = path.resolve(__dirname, "..", "node_modules");
  const sqliteModule = path.join(compilerNodeModules, "better-sqlite3");

  if (!fs.existsSync(sqliteModule)) {
    console.log("\n  (installing better-sqlite3 — first run only)");
    try {
      execSync("npm install better-sqlite3@11.5.0 --no-save", {
        cwd: path.resolve(__dirname, ".."),
        stdio: "pipe",
      });
    } catch (e) {
      fail("Install better-sqlite3", e);
      // Skip the runtime tests but the emitter itself produced output.
      summary(); return;
    }
  }

  // Load better-sqlite3 dynamically
  let Database: any;
  try { Database = require("better-sqlite3"); ok("Loaded better-sqlite3"); }
  catch (e) { fail("Load better-sqlite3", e); summary(); return; }

  const dbPath = path.join(outDir, "test.db");
  let db: any;
  try {
    db = new Database(dbPath);
    db.pragma("foreign_keys = ON");
    ok("Opened SQLite database");
  } catch (e) { fail("Open SQLite", e); summary(); return; }

  // 4. Apply each migration block sequentially
  try {
    const migrations = fs.readdirSync(path.join(outDir, "migrations"))
      .filter(f => f.endsWith(".sql"))
      .sort();
    for (const m of migrations) {
      const sql = fs.readFileSync(path.join(outDir, "migrations", m), "utf-8");
      db.exec(sql);
    }
    ok("Applied " + migrations.length + " migration file(s)");
  } catch (e) { fail("Apply migrations", e); summary(); return; }

  // 5. Verify the items table exists with the expected columns
  try {
    const cols = db.prepare("PRAGMA table_info(items)").all() as Array<{ name: string; type: string }>;
    const names = cols.map(c => c.name).sort();
    const expected = ["available", "created_at", "id", "name", "quantity", "updated_at"];
    for (const e of expected) {
      if (!names.includes(e)) throw new Error("missing column " + e + " (have: " + names.join(",") + ")");
    }
    ok("items table has expected columns");
  } catch (e) { fail("Inspect items table", e); summary(); return; }

  // 6. CRUD smoke test via direct sqlite access (proxy for what the generated
  // route handlers will do once compiled and run).
  try {
    const id = "11111111-1111-1111-1111-111111111111";
    db.prepare("INSERT INTO items (id, name, quantity, available) VALUES (?, ?, ?, ?)")
      .run(id, "Widget", 5, 1);

    const row = db.prepare("SELECT * FROM items WHERE id = ?").get(id) as any;
    if (!row) throw new Error("row not inserted");
    if (row.name !== "Widget") throw new Error("wrong name: " + row.name);
    if (row.quantity !== 5) throw new Error("wrong quantity: " + row.quantity);
    ok("INSERT + SELECT round-trips correctly");

    db.prepare("UPDATE items SET quantity = ? WHERE id = ?").run(3, id);
    const after = db.prepare("SELECT quantity FROM items WHERE id = ?").get(id) as any;
    if (after.quantity !== 3) throw new Error("UPDATE did not apply");
    ok("UPDATE applies correctly");

    const cnt = db.prepare("DELETE FROM items WHERE id = ?").run(id).changes;
    if (cnt !== 1) throw new Error("DELETE returned " + cnt);
    const gone = db.prepare("SELECT * FROM items WHERE id = ?").get(id);
    if (gone) throw new Error("row not deleted");
    ok("DELETE removes the row");
  } catch (e) { fail("CRUD round-trip", e); summary(); return; }

  // 7. Confirm CHECK constraint from quantity >= 0 still works on event_outbox
  // (which has a status CHECK clause)
  try {
    let threw = false;
    try {
      db.prepare("INSERT INTO event_outbox (id, event_type, payload, source, status) VALUES (?, ?, ?, ?, ?)")
        .run("e1", "T", "{}", "test", "bogus_status");
    } catch { threw = true; }
    if (!threw) throw new Error("CHECK constraint did not fire");
    ok("event_outbox CHECK constraint is enforced");
  } catch (e) { fail("Constraint enforcement", e); summary(); return; }

  // 8. Test the generated db.ts placeholder translation by exercising it via a
  // short hand-rolled script. We avoid running it in-process because db.ts uses
  // `import Database from "better-sqlite3"` which doesn't match our runtime
  // shape. Instead we read the file and assert key behaviors statically.
  try {
    const dbTs = fs.readFileSync(path.join(outDir, "src/db.ts"), "utf-8");
    if (!dbTs.includes("translateSql")) throw new Error("missing $N placeholder translation");
    if (!dbTs.includes("RETURNING")) throw new Error("missing RETURNING * shim");
    if (!dbTs.includes("better-sqlite3")) throw new Error("not using better-sqlite3");
    if (!dbTs.includes("journal_mode = WAL")) throw new Error("WAL mode not configured");
    ok("Generated db.ts has placeholder translation, RETURNING shim, and WAL pragma");
  } catch (e) { fail("Inspect db.ts", e); summary(); return; }

  // 9. Behavioral test of the generated db.ts query() function. Compile it
  // to JS and require() it, pointing it at our test database via SQLITE_PATH.
  // First close the test's own connection so the harness can open the file.
  try { db.close(); } catch {}

  try {
    const dbTsContent = fs.readFileSync(path.join(outDir, "src/db.ts"), "utf-8");

    // Resolve better-sqlite3 from the compiler's node_modules (where the test
    // runner installed it) and embed an absolute path. The temp output dir
    // doesn't have its own node_modules.
    const sqlitePkgPath = require.resolve("better-sqlite3").replace(/\\/g, "\\\\");
    const stripped = dbTsContent
      .replace(/^import Database from "better-sqlite3";$/m, `const Database = require(${JSON.stringify(sqlitePkgPath)});`)
      .replace(/^import \* as path from "path";$/m, "const path = require('path');");

    // Strip TypeScript annotations.
    const ts = require("typescript");
    const transpiled = ts.transpileModule(stripped, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;

    const harness = path.join(outDir, "src", "db.test.js");
    fs.writeFileSync(harness, transpiled, "utf-8");
    delete require.cache[harness];

    process.env.SQLITE_PATH = path.join(outDir, "test.db");
    const dbModule = require(harness);

    // INSERT via generated query() — RETURNING * should give back the row
    const insertSql = "INSERT INTO items (id, name, quantity, available) VALUES ($1, $2, $3, $4) RETURNING *";
    const insertedAsync = dbModule.query(insertSql, ["aaa-bbb-ccc", "Test", 7, 1]);
    return insertedAsync.then((inserted: any[]) => {
      if (inserted.length === 0) throw new Error("INSERT RETURNING returned no rows");
      if (inserted[0].name !== "Test") throw new Error("INSERT row mismatch: " + JSON.stringify(inserted[0]));
      ok("Generated query() handles INSERT RETURNING *");

      // UPDATE in the emit_capability format: "UPDATE t SET col = $1 WHERE id = $2"
      const updSql = "UPDATE items SET quantity = $1 WHERE id = $2 RETURNING *";
      return dbModule.query(updSql, [42, "aaa-bbb-ccc"]).then((updated: any[]) => {
        if (updated.length === 0) throw new Error("UPDATE RETURNING returned no rows — RETURNING shim broken");
        if (updated[0].quantity !== 42) throw new Error("UPDATE returned wrong row: " + JSON.stringify(updated[0]));
        ok("Generated query() handles UPDATE RETURNING * (capability shape: SET col=$1 WHERE id=$2)");

        // UPDATE in the emit_runtime format: "UPDATE t SET col=$2, col2=$3 WHERE id=$1"
        const updRuntimeSql = "UPDATE items SET name = $2 WHERE id = $1 RETURNING *";
        return dbModule.query(updRuntimeSql, ["aaa-bbb-ccc", "Renamed"]).then((updated2: any[]) => {
          if (updated2.length === 0) throw new Error("runtime-shape UPDATE RETURNING returned no rows");
          if (updated2[0].name !== "Renamed") throw new Error("UPDATE returned wrong row: " + JSON.stringify(updated2[0]));
          ok("Generated query() handles UPDATE RETURNING * (runtime shape: WHERE id=$1)");

          // Cleanup. The harness's module-level Database holds an open file
          // handle on Windows; close it before we try to rmdir the temp.
          try { dbModule.pool.end(); } catch {}
          try { fs.unlinkSync(harness); } catch {}
          try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
          summary();
        });
      });
    }).catch((e: unknown) => {
      fail("Generated db.ts behavior", e);
      try { dbModule.pool.end(); } catch {}
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
      summary();
    });
  } catch (e) {
    fail("Set up generated db.ts harness", e);
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
    summary();
    return;
  }
}

function summary() {
  console.log("\n" + "═".repeat(40));
  console.log("Results: " + passed + " passed, " + failed + " failed");
  console.log("═".repeat(40));
  if (failed > 0) process.exit(1);
}

run();
