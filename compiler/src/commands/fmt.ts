/**
 * bonec fmt <file>
 * Format a .bone file in place.
 */

import * as fs from "fs";
import { Lexer } from "../lexer";
import { Parser } from "../parser";
import { Formatter } from "../formatter";

export async function runFormat(source: string, resolved: string): Promise<void> {
  try {
    const tokens = new Lexer(source).tokenize();
    const ast = new Parser(tokens).parse();
    const formatted = new Formatter().format(ast);
    await fs.promises.writeFile(resolved, formatted, "utf-8");
    console.log(`v Formatted ${resolved}`);
  } catch (e: any) {
    console.error(`x ${e.message}`);
    process.exit(1);
  }
}
