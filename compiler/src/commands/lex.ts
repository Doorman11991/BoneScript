/**
 * bonec lex <file>
 * Print the token stream as JSON.
 */

import { Lexer } from "../lexer";

export function runLex(source: string): void {
  try {
    const tokens = new Lexer(source).tokenize();
    console.log(JSON.stringify(tokens, null, 2));
    console.log(`\nv ${tokens.length} tokens produced.`);
  } catch (e: any) {
    console.error(`x ${e.message}`);
    process.exit(1);
  }
}
