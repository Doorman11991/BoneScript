/**
 * bonec check <file>
 * Lex + parse + type check without code generation.
 */

import { Lexer } from "../lexer";
import { RecoveringParser } from "../parser_recovery";
import { TypeChecker } from "../typechecker";

export function runCheck(source: string): void {
  const tokens = new Lexer(source).tokenize();
  const result = new RecoveringParser(tokens).parse();
  let totalErrors = 0;

  for (const e of result.errors) {
    console.error(`  parse: ${e.message}`);
    totalErrors++;
  }

  if (result.ast) {
    for (const err of new TypeChecker().check(result.ast)) {
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
