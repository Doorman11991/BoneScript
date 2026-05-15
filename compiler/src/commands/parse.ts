/**
 * bonec parse <file>
 * Print the AST as JSON.
 */

import { Lexer } from "../lexer";
import { RecoveringParser } from "../parser_recovery";

export function runParse(source: string): void {
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
