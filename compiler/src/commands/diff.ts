/**
 * bonec diff <old.bone> <new.bone>
 * Show SQL schema migration diff between two .bone files.
 */

import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { Lexer } from "../lexer";
import { Parser } from "../parser";
import { Lowering } from "../lowering";
import { toSnakeCase } from "../lowering_helpers";
import type * as IR from "../ir";

const SQL_TYPE_MAP: Record<string, string> = {
  string: "VARCHAR", uint: "BIGINT", int: "BIGINT", float: "DOUBLE PRECISION",
  bool: "BOOLEAN", timestamp: "TIMESTAMPTZ", uuid: "UUID", bytes: "BYTEA", json: "JSONB",
};

async function compileToIR(filePath: string): Promise<IR.IRSystem[]> {
  const resolved = path.resolve(filePath);
  try {
    await fs.promises.access(resolved);
  } catch {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }
  const source = await fs.promises.readFile(resolved, "utf-8");
  const tokens = new Lexer(source).tokenize();
  const ast = new Parser(tokens).parse();
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
  return new Lowering().lower(ast, hash);
}

export async function runDiff(args: string[]): Promise<void> {
  if (args.length < 2) {
    console.error("Usage: bonec diff <old.bone> <new.bone>");
    process.exit(1);
  }

  const [oldFile, newFile] = args;

  // Load both files in parallel
  const [oldIR, newIR] = await Promise.all([
    compileToIR(oldFile),
    compileToIR(newFile),
  ]);

  const collectModels = (systems: IR.IRSystem[]) => {
    const models: IR.IRModel[] = [];
    for (const sys of systems)
      for (const mod of sys.modules)
        for (const m of mod.models) models.push(m);
    return models;
  };

  const oldByName = new Map(collectModels(oldIR).map(m => [m.name, m]));
  const newByName = new Map(collectModels(newIR).map(m => [m.name, m]));
  const statements: string[] = [];

  for (const [name] of newByName) {
    if (!oldByName.has(name)) {
      statements.push(`-- NEW TABLE: ${name}`);
      statements.push(`-- Run: bonec compile ${newFile} (generates full migration)`);
    }
  }

  for (const [name] of oldByName) {
    if (!newByName.has(name)) {
      const table = toSnakeCase(name) + "s";
      statements.push(`-- WARNING: Table '${table}' removed from schema`);
      statements.push(`-- Manual: ALTER TABLE ${table} ... (or DROP TABLE ${table})`);
    }
  }

  for (const [name, newModel] of newByName) {
    const oldModel = oldByName.get(name);
    if (!oldModel) continue;
    const table = toSnakeCase(name) + "s";
    const oldFields = new Map(oldModel.fields.map(f => [f.name, f]));
    const newFields = new Map(newModel.fields.map(f => [f.name, f]));

    for (const [fname, field] of newFields) {
      if (!oldFields.has(fname)) {
        const sqlType = SQL_TYPE_MAP[field.type] || "JSONB";
        statements.push(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${fname} ${sqlType};`);
      }
    }
    for (const [fname] of oldFields) {
      if (!newFields.has(fname)) {
        statements.push(`-- WARNING: Column '${table}.${fname}' removed`);
        statements.push(`-- Manual: ALTER TABLE ${table} DROP COLUMN ${fname};`);
      }
    }
  }

  if (statements.length === 0) {
    console.log("No schema changes detected.");
  } else {
    console.log(`-- BoneScript schema diff: ${path.basename(oldFile)} → ${path.basename(newFile)}`);
    console.log(`-- Generated: ${new Date().toISOString()}`);
    console.log(``);
    console.log(statements.join("\n"));
  }
}
