/**
 * BoneScript compiler CLI
 */

import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { RecoveringParser } from "./parser_recovery";
import { TypeChecker } from "./typechecker";
import { Lowering } from "./lowering";
import { ConstraintSolver } from "./solver";
import { FullEmitter } from "./emit_full";
import { Verifier } from "./verifier";
import { ModuleLoader } from "./module_loader";
import { Formatter } from "./formatter";
import { scaffold, ScaffoldDomain } from "./scaffold";
import { mergeWithExisting } from "./extension_manager";
import { optimize } from "./optimizer";

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    showHelp();
    return;
  }

  const command = args[0];

  switch (command) {
    case "compile":
      requireFile(args[1], runCompile);
      break;
    case "lex":
      requireFile(args[1], runLex);
      break;
    case "parse":
      requireFile(args[1], runParse);
      break;
    case "ir":
      requireFile(args[1], runIR);
      break;
    case "check":
      requireFile(args[1], runCheck);
      break;
    case "fmt":
      requireFile(args[1], runFormat);
      break;
    case "watch":
      requireFile(args[1], runWatch);
      break;
    case "init":
      runInit(args.slice(1));
      break;
    case "diff":
      runDiff(args.slice(1));
      break;
    case "debug":
      requireFile(args[1], runDebug);
      break;
    case "test":
      runTest(args.slice(1));
      break;
    case "verify-determinism":
      requireFile(args[1], runVerifyDeterminism);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

function showHelp() {
  console.log("BoneScript compiler v0.2.0");
  console.log("");
  console.log("Usage:");
  console.log("  bonec compile <file>   Compile to runnable project");
  console.log("  bonec check <file>     Lex + parse + type check (no codegen)");
  console.log("  bonec lex <file>       Show token stream");
  console.log("  bonec parse <file>     Show AST");
  console.log("  bonec ir <file>        Show IR (JSON)");
  console.log("  bonec fmt <file>       Format file in place");
  console.log("  bonec watch <file>     Recompile on change");
  console.log("  bonec diff <old.bone> <new.bone>  Show schema migration diff");
  console.log("");
  console.log("init options:");
  console.log("  bonec init <name> --domain <name>  Scaffold from a domain template");
  console.log("  --domain <name>        Domain template (default: saas_platform)");
  console.log("                         Options: multiplayer_game, saas_platform, iot_system,");
  console.log("                                  social_network, marketplace, realtime_collaboration");
  console.log("  --out <dir>            Output directory (default: current dir)");
}

function requireFile(filePath: string | undefined, action: (source: string, resolved: string) => void) {
  if (!filePath) {
    console.error("Error: No input file specified.");
    process.exit(1);
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`Error: File not found: ${resolved}`);
    process.exit(1);
  }

  const source = fs.readFileSync(resolved, "utf-8");
  action(source, resolved);
}

// â”€â”€â”€ Lex â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function runLex(source: string) {
  try {
    const tokens = new Lexer(source).tokenize();
    console.log(JSON.stringify(tokens, null, 2));
    console.log(`\nv ${tokens.length} tokens produced.`);
  } catch (e: any) {
    console.error(`x ${e.message}`);
    process.exit(1);
  }
}

// â”€â”€â”€ Parse â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function runParse(source: string) {
  try {
    const tokens = new Lexer(source).tokenize();
    const result = new RecoveringParser(tokens).parse();
    if (result.errors.length > 0) {
      console.error(`x ${result.errors.length} parse error(s):`);
      for (const e of result.errors) console.error(`  ${e.message}`);
      if (!result.ast) process.exit(1);
    }
    console.log(JSON.stringify(result.ast, null, 2));
    console.log(`\nv Parsed ${result.ast?.systems.length || 0} system(s).`);
  } catch (e: any) {
    console.error(`x ${e.message}`);
    process.exit(1);
  }
}

// â”€â”€â”€ IR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function runIR(source: string) {
  try {
    const tokens = new Lexer(source).tokenize();
    const ast = new Parser(tokens).parse();
    const sourceHash = createHash("sha256").update(source).digest("hex").slice(0, 16);
    const irSystems = new Lowering().lower(ast, sourceHash);
    console.log(JSON.stringify(irSystems, null, 2));
    console.log(`\nv Lowered to ${irSystems.length} IR system(s).`);
  } catch (e: any) {
    console.error(`x ${e.message}`);
    process.exit(1);
  }
}

// â”€â”€â”€ Check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function runCheck(source: string) {
  const tokens = new Lexer(source).tokenize();
  const result = new RecoveringParser(tokens).parse();

  let totalErrors = 0;

  if (result.errors.length > 0) {
    for (const e of result.errors) {
      console.error(`  parse: ${e.message}`);
      totalErrors++;
    }
  }

  if (result.ast) {
    const typeErrors = new TypeChecker().check(result.ast);
    for (const err of typeErrors) {
      console.error(`  type:  ${err.code} at ${err.loc.line}:${err.loc.column}: ${err.message}`);
      totalErrors++;
    }
  }

  if (totalErrors === 0) {
    console.log("v Check passed (0 errors)");
  } else {
    console.log(`x ${totalErrors} error(s) found.`);
    process.exit(1);
  }
}

// â”€â”€â”€ Format â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function runFormat(source: string, resolved: string) {
  try {
    const tokens = new Lexer(source).tokenize();
    const ast = new Parser(tokens).parse();
    const formatted = new Formatter().format(ast);
    fs.writeFileSync(resolved, formatted, "utf-8");
    console.log(`v Formatted ${resolved}`);
  } catch (e: any) {
    console.error(`x ${e.message}`);
    process.exit(1);
  }
}

// â”€â”€â”€ Watch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function runWatch(_source: string, resolved: string) {
  console.log(`Watching ${resolved}...`);

  const compile = () => {
    try {
      const fresh = fs.readFileSync(resolved, "utf-8");
      console.log(`\n[${new Date().toLocaleTimeString()}] Compiling...`);
      runCompile(fresh, resolved);
    } catch (e: any) {
      console.error(`x ${e.message}`);
    }
  };

  compile();
  fs.watchFile(resolved, { interval: 500 }, (curr, prev) => {
    if (curr.mtimeMs !== prev.mtimeMs) compile();
  });
}

// â”€â”€â”€ Init â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function runInit(args: string[]) {
  if (args.length === 0) {
    console.error("Error: bone init requires a project name.");
    console.error("Example: bone init my-project --domain saas_platform");
    process.exit(1);
  }

  const name = args[0];
  let domain: ScaffoldDomain = "saas_platform";
  let outDir = path.resolve(name);

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--domain" && args[i + 1]) {
      domain = args[i + 1] as ScaffoldDomain;
      i++;
    } else if (args[i] === "--out" && args[i + 1]) {
      outDir = path.resolve(args[i + 1]);
      i++;
    }
  }

  const validDomains: ScaffoldDomain[] = [
    "multiplayer_game", "saas_platform", "iot_system",
    "social_network", "marketplace", "realtime_collaboration",
  ];
  if (!validDomains.includes(domain)) {
    console.error(`Error: Invalid domain '${domain}'. Valid: ${validDomains.join(", ")}`);
    process.exit(1);
  }

  const result = scaffold({ name, domain, outDir });
  console.log(`v Created ${result.created.length} file(s):`);
  for (const f of result.created) console.log(`  ${f}`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${outDir}`);
  console.log(`  bone compile ${name}.bone`);
}

// â”€â”€â”€ Compile (full pipeline) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function runCompile(source: string, resolved: string) {
  try {
    const tokens = new Lexer(source).tokenize();
    console.log(`  [1/7] Lexed: ${tokens.length} tokens`);

    // Use module loader to handle imports
    const loader = new ModuleLoader();
    const loadResult = loader.load(resolved);

    if (loadResult.errors.length > 0) {
      console.log(`  [2/7] Parse: ${loadResult.errors.length} error(s)`);
      for (const e of loadResult.errors.slice(0, 10)) {
        console.log(`         ${path.basename(e.file)}: ${e.error.message}`);
      }
      if (!loadResult.ast) process.exit(1);
    } else {
      const sysCount = loadResult.ast?.systems.length || 0;
      console.log(`  [2/7] Parsed: ${sysCount} system(s) from ${loadResult.loadedFiles.length} file(s)`);
    }

    const ast = loadResult.ast!;

    for (const sys of ast.systems) {
      console.log(`         System '${sys.name}':`);
      const counts: Record<string, number> = {};
      for (const d of sys.declarations) counts[d.kind] = (counts[d.kind] || 0) + 1;
      for (const [kind, count] of Object.entries(counts)) {
        console.log(`           ${kind}: ${count}`);
      }
    }

    // Stage 3: Type Check
    const checker = new TypeChecker();
    const typeErrors = checker.check(ast);
    if (typeErrors.length > 0) {
      console.log(`  [3/7] Type check: ${typeErrors.length} error(s)`);
      for (const err of typeErrors) {
        console.log(`         ${err.code} at ${err.loc.line}:${err.loc.column}: ${err.message}`);
      }
    } else {
      console.log(`  [3/7] Type check: v (0 errors)`);
    }

    // Stage 4: Lower to IR
    const sourceHash = createHash("sha256").update(source).digest("hex").slice(0, 16);
    const lowering = new Lowering();
    const irSystems = lowering.lower(ast, sourceHash);
    const totalModules = irSystems.reduce((sum, s) => sum + s.modules.length, 0);
    const totalEvents = irSystems.reduce((sum, s) => sum + s.events.length, 0);
    const totalFlows = irSystems.reduce((sum, s) => sum + s.flows.length, 0);
    console.log(`  [4/7] Lower to IR: ${totalModules} modules, ${totalEvents} events, ${totalFlows} flows`);
    for (const sys of irSystems) {
      for (const mod of sys.modules) {
        const methodCount = mod.interfaces.reduce((s, i) => s + i.methods.length, 0);
        console.log(`         ${mod.kind.padEnd(16)} ${mod.name.padEnd(24)} (${methodCount} methods, ${mod.models.length} models)`);
      }
    }

    // Stage 4.5: IR Optimization
    for (let i = 0; i < irSystems.length; i++) {
      const result = optimize(irSystems[i]);
      irSystems[i] = result.system;
      if (result.log.length > 0) {
        console.log(`  [4.5] IR optimize: ${result.modulesRemoved} modules removed, ${result.eventsDeduped} events deduped, ${result.depsRemoved} deps minimized`);
      }
    }

    // Stage 5: Constraint Solve
    const solver = new ConstraintSolver();
    let totalResolved = 0;
    for (const sys of irSystems) {
      const result = solver.solve(sys);
      sys.resolution = result.resolution;
      totalResolved += Object.keys(result.resolution).length;
      if (result.errors.length > 0) {
        console.log(`  [5/7] Constraint solve: ${result.errors.length} error(s)`);
        for (const err of result.errors) console.log(`         x ${err}`);
      } else {
        console.log(`  [5/7] Constraint solve: v (${totalResolved} resolved, ${result.assumptions.length} assumptions)`);
        for (const a of result.assumptions.slice(0, 5)) console.log(`         ${a}`);
        if (result.assumptions.length > 5) console.log(`         ... and ${result.assumptions.length - 5} more`);
      }
    }

    // Stage 6: Code Emit
    const emitter = new FullEmitter();
    const allFiles: ReturnType<typeof emitter.emit> = [];
    for (const sys of irSystems) {
      const files = emitter.emit(sys);
      allFiles.push(...files);
    }
    console.log(`  [6/7] Code emit: ${allFiles.length} files generated`);
    const byLang: Record<string, number> = {};
    for (const f of allFiles) byLang[f.language] = (byLang[f.language] || 0) + 1;
    for (const [lang, count] of Object.entries(byLang)) {
      console.log(`         ${lang}: ${count} file(s)`);
    }

    // Stage 7: Verify
    const verifier = new Verifier();
    const verifyResult = verifier.verify(irSystems[0], allFiles);
    const errCount = verifyResult.issues.filter(i => i.severity === "error").length;
    const warnCount = verifyResult.issues.filter(i => i.severity === "warning").length;
    if (verifyResult.passed) {
      console.log(`  [7/7] Verify: v (${allFiles.length} files, ${warnCount} warnings)`);
    } else {
      console.log(`  [7/7] Verify: FAILED (${errCount} errors, ${warnCount} warnings)`);
    }
    for (const issue of verifyResult.issues.slice(0, 10)) {
      const icon = issue.severity === "error" ? "x" : "!";
      console.log(`         ${icon} ${issue.code}: ${issue.message}`);
    }

    // Write output — merge extension point implementations from existing files
    const outputDir = path.resolve(path.dirname(resolved), "output");
    const allExtensions = irSystems.flatMap(s => s.extension_points || []);
    let extensionErrors: string[] = [];

    for (const f of allFiles) {
      const outPath = path.join(outputDir, f.path);
      const dir = path.dirname(outPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      // For extensions.ts: merge preserved implementations
      if (f.path === "src/extensions.ts" && allExtensions.length > 0) {
        const astExtensions = ast.systems.flatMap(s =>
          s.declarations.filter((d): d is any => d.kind === "ExtensionPointDecl")
        );
        const { content, validationErrors } = mergeWithExisting(f.content, outPath, astExtensions);
        for (const e of validationErrors) extensionErrors.push(e.message);
        fs.writeFileSync(outPath, content, "utf-8");
      } else {
        fs.writeFileSync(outPath, f.content, "utf-8");
      }
    }

    if (extensionErrors.length > 0) {
      console.log(`\n  Extension point errors:`);
      for (const e of extensionErrors) console.log(`    x ${e}`);
      process.exit(1);
    }

    console.log(`\nv Compilation complete. ${allFiles.length} files written to output/`);
  } catch (e: any) {
    console.error(`x ${e.message}`);
    process.exit(1);
  }
}

main();

// ─── Diff ─────────────────────────────────────────────────────────────────────

function runDiff(args: string[]) {
  if (args.length < 2) {
    console.error("Usage: bone diff <old.bone> <new.bone>");
    process.exit(1);
  }

  const [oldFile, newFile] = args;

  const compileToIR = (filePath: string) => {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      console.error(`File not found: ${resolved}`);
      process.exit(1);
    }
    const source = fs.readFileSync(resolved, "utf-8");
    const tokens = new Lexer(source).tokenize();
    const ast = new Parser(tokens).parse();
    const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
    return new Lowering().lower(ast, hash);
  };

  const oldIR = compileToIR(oldFile);
  const newIR = compileToIR(newFile);

  const oldModels: any[] = [];
  const newModels: any[] = [];
  for (const sys of oldIR) for (const mod of sys.modules) for (const m of mod.models) oldModels.push(m);
  for (const sys of newIR) for (const mod of sys.modules) for (const m of mod.models) newModels.push(m);

  const oldByName = new Map(oldModels.map(m => [m.name, m]));
  const newByName = new Map(newModels.map(m => [m.name, m]));
  const statements: string[] = [];

  // New tables
  for (const [name, model] of newByName) {
    if (!oldByName.has(name)) {
      statements.push(`-- NEW TABLE: ${name}`);
      statements.push(`-- Run: bone compile ${newFile} (generates full migration)`);
    }
  }

  // Removed tables
  for (const [name] of oldByName) {
    if (!newByName.has(name)) {
      const table = name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase() + "s";
      statements.push(`-- WARNING: Table '${table}' removed from schema`);
      statements.push(`-- Manual: ALTER TABLE ${table} ... (or DROP TABLE ${table})`);
    }
  }

  // Modified tables
  for (const [name, newModel] of newByName) {
    const oldModel = oldByName.get(name);
    if (!oldModel) continue;

    const table = name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase() + "s";
    const oldFields = new Map(oldModel.fields.map((f: any) => [f.name, f]));
    const newFields = new Map(newModel.fields.map((f: any) => [f.name, f]));

    const sqlTypeMap: Record<string, string> = {
      string: "VARCHAR", uint: "BIGINT", int: "BIGINT", float: "DOUBLE PRECISION",
      bool: "BOOLEAN", timestamp: "TIMESTAMPTZ", uuid: "UUID", bytes: "BYTEA", json: "JSONB",
    };

    for (const [fname, field] of newFields) {
      if (!oldFields.has(fname)) {
        const sqlType = sqlTypeMap[(field as any).type] || "JSONB";
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

// ─── Debug ────────────────────────────────────────────────────────────────────

function runDebug(source: string, resolved: string) {
  try {
    const tokens = new Lexer(source).tokenize();
    const ast = new Parser(tokens).parse();
    const sourceHash = createHash("sha256").update(source).digest("hex").slice(0, 16);
    const irSystems = new Lowering().lower(ast, sourceHash);

    const { emitSourceMapFile } = require("./emit_sourcemap");
    for (const sys of irSystems) {
      const mapContent = emitSourceMapFile(sys, path.basename(resolved));
      const mapPath = path.join(path.dirname(resolved), `${sys.name}.bone.map`);
      fs.writeFileSync(mapPath, mapContent, "utf-8");
      console.log(`v Source map written: ${mapPath}`);
      console.log(`  ${sys.modules.length} modules mapped`);
      console.log(`  Use output/src/debug.ts to get annotated runtime errors`);
    }
  } catch (e: any) {
    console.error(`x ${e.message}`);
    process.exit(1);
  }
}

// ─── Test ─────────────────────────────────────────────────────────────────────

function runTest(args: string[]) {
  const outputDir = args[0] ? path.resolve(args[0]) : path.resolve("output");
  const testFile = path.join(outputDir, "src", "tests.ts");

  if (!fs.existsSync(testFile)) {
    console.error(`No test file found at ${testFile}`);
    console.error("Run 'bone compile <file>' first to generate tests.");
    process.exit(1);
  }

  console.log(`Running BoneScript regression tests...`);
  console.log(`Test file: ${testFile}`);
  console.log(`Target: ${process.env.TEST_BASE_URL || "http://localhost:3000"}`);
  console.log(``);

  // Run the generated test file using ts-node
  const { execSync } = require("child_process");
  try {
    execSync(`npx ts-node ${testFile}`, {
      cwd: outputDir,
      stdio: "inherit",
      env: { ...process.env },
    });
  } catch {
    process.exit(1);
  }
}

// ─── Verify Determinism ───────────────────────────────────────────────────────

function runVerifyDeterminism(source: string, resolved: string) {
  console.log("Verifying compilation determinism...");

  const compile = () => {
    const tokens = new Lexer(source).tokenize();
    const ast = new Parser(tokens).parse();
    const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
    const ir = new Lowering().lower(ast, hash);
    const emitter = new FullEmitter();
    const files: { path: string; content: string }[] = [];
    for (const sys of ir) {
      for (const f of emitter.emit(sys)) {
        files.push({ path: f.path, content: f.content });
      }
    }
    // Sort for canonical comparison
    files.sort((a, b) => a.path.localeCompare(b.path));
    return JSON.stringify(files);
  };

  const run1 = compile();
  const run2 = compile();

  if (run1 === run2) {
    const hash = createHash("sha256").update(run1).digest("hex").slice(0, 16);
    console.log(`v Deterministic. Both runs produced identical output.`);
    console.log(`  Output hash: ${hash}`);
  } else {
    // Find first divergence
    const files1: { path: string; content: string }[] = JSON.parse(run1);
    const files2: { path: string; content: string }[] = JSON.parse(run2);

    for (let i = 0; i < Math.max(files1.length, files2.length); i++) {
      const f1 = files1[i];
      const f2 = files2[i];
      if (!f1 || !f2 || f1.path !== f2.path || f1.content !== f2.content) {
        console.error(`x NON-DETERMINISTIC: First divergence at file ${i}`);
        console.error(`  Run 1: ${f1?.path || "(missing)"}`);
        console.error(`  Run 2: ${f2?.path || "(missing)"}`);
        if (f1 && f2 && f1.path === f2.path) {
          // Find first differing line
          const lines1 = f1.content.split("\n");
          const lines2 = f2.content.split("\n");
          for (let j = 0; j < Math.max(lines1.length, lines2.length); j++) {
            if (lines1[j] !== lines2[j]) {
              console.error(`  First differing line ${j + 1}:`);
              console.error(`    Run 1: ${lines1[j]}`);
              console.error(`    Run 2: ${lines2[j]}`);
              break;
            }
          }
        }
        process.exit(1);
      }
    }
  }
}
