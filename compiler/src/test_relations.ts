/**
 * Relation lowering tests.
 *
 * Verifies that a `.bone` source using `relation X: belongs_to Y` without
 * manually declaring the FK column in `owns:` produces a working schema
 * across emitters: Postgres SQL, SQLite SQL, and Prisma.
 *
 * Pre-fix the marketplace example only worked because the user had to
 * duplicate `seller_id: uuid` in `owns:`. Now the lowering synthesizes the
 * FK column from the relation declaration.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { Lowering } from "./lowering";
import { Emitter } from "./emitter";
import { SqliteEmitter } from "./emit_sqlite";
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
system Bookstore {
  domain: marketplace

  entity Author {
    owns: [name: string, bio: string]
  }

  entity Book {
    owns: [title: string, isbn: string, price: uint]
    relation author: belongs_to Author
  }

  entity Review {
    owns: [rating: uint, comment: string]
    constraints: [rating in 1..5]
    relation book: belongs_to Book
    relation reviewer: belongs_to Author
  }
}
`;

function run() {
  console.log("BoneScript Relation Lowering Tests\n");

  const tokens = new Lexer(SAMPLE).tokenize();
  const ast = new Parser(tokens).parse();
  const hash = createHash("sha256").update(SAMPLE).digest("hex").slice(0, 16);
  const ir = new Lowering().lower(ast, hash);
  const system = ir[0];

  // ─── Verify the IR has the synthesized FK columns ───────────────────────────
  function findModel(name: string) {
    for (const mod of system.modules) {
      const m = mod.models.find(m => m.name === name);
      if (m) return m;
    }
    return null;
  }

  const book = findModel("Book");
  if (!book) { fail("Book model present", "missing"); summary(); return; }
  if (book.fields.find(f => f.name === "author_id")) ok("Book has synthesized author_id field");
  else fail("author_id missing", "Book.fields = " + book.fields.map(f => f.name).join(","));

  const review = findModel("Review");
  if (!review) { fail("Review model present", "missing"); summary(); return; }
  if (review.fields.find(f => f.name === "book_id")) ok("Review has synthesized book_id field");
  else fail("book_id missing", "Review.fields = " + review.fields.map(f => f.name).join(","));
  if (review.fields.find(f => f.name === "author_id")) ok("Review has synthesized author_id field (reviewer relation targets Author)");
  else fail("Review.author_id missing", "Review.fields = " + review.fields.map(f => f.name).join(","));

  // The synthesized columns should be uuid NOT NULL and indexed
  const authorIdField = book.fields.find(f => f.name === "author_id")!;
  if (authorIdField.type === "uuid" && !authorIdField.nullable && authorIdField.indexed) {
    ok("Synthesized FK column is uuid, NOT NULL, indexed");
  } else {
    fail("FK column shape", JSON.stringify(authorIdField));
  }

  // ─── Postgres schema ────────────────────────────────────────────────────────
  const pgFiles = new Emitter().emit(system);
  const bookSchema = pgFiles.find(f => f.path === "schema/book.sql");
  if (!bookSchema) { fail("Postgres book schema emitted", "missing"); summary(); return; }
  if (bookSchema.content.includes("author_id UUID NOT NULL")) ok("Postgres CREATE TABLE has author_id column");
  else fail("Postgres author_id column", "missing in schema");
  if (bookSchema.content.includes("FOREIGN KEY (author_id) REFERENCES authors(id)")) ok("Postgres FK constraint references author_id");
  else fail("Postgres FK constraint", "missing");

  // ─── SQLite schema ──────────────────────────────────────────────────────────
  const sqliteFiles = new SqliteEmitter().emit(system);
  const sqliteBookSchema = sqliteFiles.find(f => f.path === "migrations/book.sql");
  if (!sqliteBookSchema) { fail("SQLite book schema emitted", "missing"); summary(); return; }
  if (sqliteBookSchema.content.includes("author_id TEXT NOT NULL")) ok("SQLite CREATE TABLE has author_id column");
  else fail("SQLite author_id column", "content:\n" + sqliteBookSchema.content);
  if (sqliteBookSchema.content.includes("FOREIGN KEY (author_id) REFERENCES authors(id)")) ok("SQLite FK constraint references author_id");
  else fail("SQLite FK constraint", "missing");

  // ─── Prisma schema ──────────────────────────────────────────────────────────
  const prismaFiles = new PrismaEmitter().emit(system);
  const prismaSchema = prismaFiles[0];
  if (prismaSchema.content.includes("author_id")) ok("Prisma schema has author_id field");
  else fail("Prisma author_id", "missing");

  // ─── End-to-end SQLite test: actually create the table ──────────────────────
  let Database: any;
  try { Database = require("better-sqlite3"); }
  catch {
    console.log("\n  (skipping live SQLite test — better-sqlite3 not installed)");
    summary(); return;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bonescript-relations-"));
  try {
    const dbPath = path.join(tmp, "test.db");
    const db = new Database(dbPath);
    db.pragma("foreign_keys = ON");

    // Apply schemas in dependency order: authors, books, reviews
    const schemas = ["author", "book", "review"];
    for (const name of schemas) {
      const f = sqliteFiles.find(f => f.path === `migrations/${name}.sql`);
      if (!f) throw new Error(`schema for ${name} missing`);
      db.exec(f.content);
    }
    ok("All SQLite schemas applied without error");

    // Insert an author and a book referencing it
    db.prepare("INSERT INTO authors (id, name, bio) VALUES (?, ?, ?)").run("a1", "Asimov", "scifi");
    db.prepare("INSERT INTO books (id, title, isbn, price, author_id) VALUES (?, ?, ?, ?, ?)")
      .run("b1", "Foundation", "9780553293357", 1499, "a1");
    ok("INSERT into books with author_id FK succeeds");

    // Verify the FK is enforced
    let rejected = false;
    try {
      db.prepare("INSERT INTO books (id, title, isbn, price, author_id) VALUES (?, ?, ?, ?, ?)")
        .run("b2", "Bad", "0", 100, "no-such-author");
    } catch { rejected = true; }
    if (rejected) ok("FK constraint rejects orphan author_id");
    else fail("FK enforcement", "orphan insert was allowed");

    db.close();
  } catch (e) {
    fail("Live SQLite end-to-end", e);
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
