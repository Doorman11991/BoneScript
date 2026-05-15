/**
 * bonec fmt <file>
 * Format a .bone file in place.
 */

import * as fs from "fs";
import { Lexer } from "../lexer";
import { Parser } from "../parser";
import { Formatter } from "../formatter";

export function runFormat(source: string, resolved: string): void {
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
