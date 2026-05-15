/**
 * bonec verify-determinism <file>
 * Compile twice and assert bitwise-identical output.
 */

import { createHash } from "crypto";
import { Lexer } from "../lexer";
import { Parser } from "../parser";
import { Lowering } from "../lowering";
import { FullEmitter } from "../emit_full";

export function runVerifyDeterminism(source: string): void {
  console.log("Verifying compilation determinism...");

  const compile = (): string => {
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
    files.sort((a, b) => a.path.localeCompare(b.path));
    return JSON.stringify(files);
  };

  const run1 = compile();
  const run2 = compile();

  if (run1 === run2) {
    const hash = createHash("sha256").update(run1).digest("hex").slice(0, 16);
    console.log(`v Deterministic. Both runs produced identical output.`);
    console.log(`  Output hash: ${hash}`);
    return;
  }

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
