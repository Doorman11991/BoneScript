/**
 * bonec compile <file>
 * Full 7-stage compilation pipeline → runnable project.
 */

import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { Lexer } from "../lexer";
import { TypeChecker } from "../typechecker";
import { Lowering } from "../lowering";
import { ConstraintSolver } from "../solver";
import { FullEmitter } from "../emit_full";
import { Verifier } from "../verifier";
import { ModuleLoader } from "../module_loader";
import { mergeWithExisting } from "../extension_manager";
import { optimize } from "../optimizer";

export async function runCompile(source: string, resolved: string): Promise<void> {
  try {
    const tokens = new Lexer(source).tokenize();
    console.log(`  [1/7] Lexed: ${tokens.length} tokens`);

    const loader = new ModuleLoader();
    const loadResult = await loader.load(resolved);

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
    const typeErrors = new TypeChecker().check(ast);
    if (typeErrors.length > 0) {
      console.log(`  [3/7] Type check: ${typeErrors.length} error(s)`);
      for (const err of typeErrors) {
        console.log(`         ${err.code} at ${err.loc.line}:${err.loc.column}: ${err.message}`);
      }
      process.exit(1);
    } else {
      console.log(`  [3/7] Type check: v (0 errors)`);
    }

    // Stage 4: Lower to IR
    const sourceHash = createHash("sha256").update(source).digest("hex").slice(0, 16);
    const irSystems = new Lowering().lower(ast, sourceHash);
    const totalModules = irSystems.reduce((sum, s) => sum + s.modules.length, 0);
    const totalEvents  = irSystems.reduce((sum, s) => sum + s.events.length, 0);
    const totalFlows   = irSystems.reduce((sum, s) => sum + s.flows.length, 0);
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
    let solverFailed = false;
    for (const sys of irSystems) {
      const result = solver.solve(sys);
      sys.resolution = result.resolution;
      totalResolved += Object.keys(result.resolution).length;
      if (result.errors.length > 0) {
        solverFailed = true;
        console.log(`  [5/7] Constraint solve: ${result.errors.length} error(s)`);
        for (const err of result.errors) console.log(`         x ${err}`);
      } else {
        console.log(`  [5/7] Constraint solve: v (${totalResolved} resolved, ${result.assumptions.length} assumptions)`);
        for (const a of result.assumptions.slice(0, 5)) console.log(`         ${a}`);
        if (result.assumptions.length > 5) console.log(`         ... and ${result.assumptions.length - 5} more`);
      }

      // Back-propagate resolved values into module configs so emitters pick them up.
      // The solver resolves keys like "APIGateway.rate_limit" → write back to mod.config.
      for (const mod of sys.modules) {
        for (const [key, value] of Object.entries(result.resolution)) {
          const prefix = `${mod.name}.`;
          if (key.startsWith(prefix)) {
            const prop = key.slice(prefix.length);
            // Only overwrite if the module config doesn't already have an explicit value
            if (mod.config[prop] === undefined || mod.config[prop] === null) {
              const numVal = Number(value);
              mod.config[prop] = isNaN(numVal) ? value : numVal;
            }
          }
        }
      }
    }
    if (solverFailed) process.exit(1);

    // Stage 6: Code Emit
    const emitter = new FullEmitter();
    const allFiles: ReturnType<typeof emitter.emit> = [];
    for (const sys of irSystems) allFiles.push(...emitter.emit(sys));
    console.log(`  [6/7] Code emit: ${allFiles.length} files generated`);
    const byLang: Record<string, number> = {};
    for (const f of allFiles) byLang[f.language] = (byLang[f.language] || 0) + 1;
    for (const [lang, count] of Object.entries(byLang)) {
      console.log(`         ${lang}: ${count} file(s)`);
    }

    // Stage 7: Verify — check ALL systems, not just the first
    let verifyFailed = false;
    let totalVerifyErrors = 0;
    let totalVerifyWarnings = 0;
    for (const sys of irSystems) {
      const verifyResult = new Verifier().verify(sys, allFiles);
      const errCount  = verifyResult.issues.filter(i => i.severity === "error").length;
      const warnCount = verifyResult.issues.filter(i => i.severity === "warning").length;
      totalVerifyErrors   += errCount;
      totalVerifyWarnings += warnCount;
      if (!verifyResult.passed) verifyFailed = true;
      for (const issue of verifyResult.issues.slice(0, 10)) {
        console.log(`         ${issue.severity === "error" ? "x" : "!"} ${issue.code}: ${issue.message}`);
      }
    }
    if (verifyFailed) {
      console.log(`  [7/7] Verify: FAILED (${totalVerifyErrors} errors, ${totalVerifyWarnings} warnings)`);
    } else {
      console.log(`  [7/7] Verify: v (${allFiles.length} files, ${totalVerifyWarnings} warnings)`);
    }

    // Abort before writing output if verification failed
    if (verifyFailed) process.exit(1);

    // Write output — all writes in parallel per directory
    const outputDir = path.resolve(path.dirname(resolved), "output");
    const allExtensions = irSystems.flatMap(s => s.extension_points || []);
    const extensionErrors: string[] = [];

    // Collect unique directories and create them all first
    const dirs = new Set(allFiles.map(f => path.dirname(path.join(outputDir, f.path))));
    await Promise.all([...dirs].map(dir => fs.promises.mkdir(dir, { recursive: true })));

    // Write all files (extensions.ts merged, rest written directly)
    await Promise.all(allFiles.map(async f => {
      const outPath = path.join(outputDir, f.path);

      if (f.path === "src/extensions.ts" && allExtensions.length > 0) {
        const astExtensions = ast.systems.flatMap(s =>
          s.declarations.filter((d): d is any => d.kind === "ExtensionPointDecl")
        );
        const { content, validationErrors } = await mergeWithExisting(f.content, outPath, astExtensions);
        for (const e of validationErrors) extensionErrors.push(e.message);
        await fs.promises.writeFile(outPath, content, "utf-8");
      } else {
        await fs.promises.writeFile(outPath, f.content, "utf-8");
      }
    }));

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
