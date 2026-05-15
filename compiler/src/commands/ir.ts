/**
 * bonec ir <file>
 * Print the IR as JSON.
 */

import { createHash } from "crypto";
import { Lexer } from "../lexer";
import { Parser } from "../parser";
import { Lowering } from "../lowering";

export function runIR(source: string): void {
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
