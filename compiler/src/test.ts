/**
 * BoneScript compiler Test â€” Verifies lexer and parser against example program.
 */

import * as fs from "fs";
import * as path from "path";
import { Lexer, LexerError } from "./lexer";
import { Parser } from "./parser";
import { ParseError } from "./parser_base";

const EXAMPLE = path.resolve(__dirname, "../../examples/inventory_platform.bone");

function test() {
  console.log("BoneScript compiler Test Suite\n");

  // Test 1: Lexer produces tokens
  console.log("Test 1: Lexer tokenizes example program...");
  const source = fs.readFileSync(EXAMPLE, "utf-8");
  const lexer = new Lexer(source);
  let tokens;
  try {
    tokens = lexer.tokenize();
    console.log(`  âœ“ Produced ${tokens.length} tokens`);
  } catch (e) {
    if (e instanceof LexerError) {
      console.log(`  âœ— Lexer error: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }

  // Test 2: Lexer is deterministic
  console.log("Test 2: Lexer determinism check...");
  const lexer2 = new Lexer(source);
  const tokens2 = lexer2.tokenize();
  const match = JSON.stringify(tokens) === JSON.stringify(tokens2);
  if (match) {
    console.log("  âœ“ Two lexer runs produce identical output");
  } else {
    console.log("  âœ— NON-DETERMINISTIC: Two runs differ");
    process.exit(1);
  }

  // Test 3: Parser produces AST
  console.log("Test 3: Parser produces AST from example...");
  const parser = new Parser(tokens);
  let ast;
  try {
    ast = parser.parse();
    console.log(`  âœ“ Parsed ${ast.systems.length} system(s)`);
    for (const sys of ast.systems) {
      console.log(`    System '${sys.name}' (domain: ${sys.domain})`);
      console.log(`      Declarations: ${sys.declarations.length}`);
      const kinds = sys.declarations.map((d: any) => d.kind);
      const unique = [...new Set(kinds)];
      for (const k of unique) {
        console.log(`        ${k}: ${kinds.filter((x: any) => x === k).length}`);
      }
    }
  } catch (e) {
    if (e instanceof ParseError) {
      console.log(`  âœ— Parse error: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }

  // Test 4: Parser is deterministic
  console.log("Test 4: Parser determinism check...");
  const parser2 = new Parser(new Lexer(source).tokenize());
  const ast2 = parser2.parse();
  const astMatch = JSON.stringify(ast) === JSON.stringify(ast2);
  if (astMatch) {
    console.log("  âœ“ Two parser runs produce identical AST");
  } else {
    console.log("  âœ— NON-DETERMINISTIC: Two runs differ");
    process.exit(1);
  }

  // Test 5: Empty input rejected
  console.log("Test 5: Empty input rejected...");
  try {
    const emptyLexer = new Lexer("");
    const emptyTokens = emptyLexer.tokenize();
    const emptyParser = new Parser(emptyTokens);
    emptyParser.parse();
    console.log("  âœ— Should have thrown");
    process.exit(1);
  } catch (e) {
    if (e instanceof ParseError) {
      console.log(`  âœ“ Correctly rejected: ${e.message}`);
    } else {
      throw e;
    }
  }

  // Test 6: Invalid syntax rejected
  console.log("Test 6: Invalid syntax rejected...");
  try {
    const badSource = "system Foo { entity }";
    const badTokens = new Lexer(badSource).tokenize();
    new Parser(badTokens).parse();
    console.log("  âœ— Should have thrown");
    process.exit(1);
  } catch (e) {
    if (e instanceof ParseError) {
      console.log(`  âœ“ Correctly rejected: ${e.message}`);
    } else {
      throw e;
    }
  }

  console.log("\nâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
  console.log("All tests passed. âœ“");
  console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
}

test();
