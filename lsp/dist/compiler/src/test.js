"use strict";
/**
 * BoneScript compiler Test â€” Verifies lexer and parser against example program.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const lexer_1 = require("./lexer");
const parser_1 = require("./parser");
const parser_base_1 = require("./parser_base");
const EXAMPLE = path.resolve(__dirname, "../../examples/inventory_platform.bone");
function test() {
    console.log("BoneScript compiler Test Suite\n");
    // Test 1: Lexer produces tokens
    console.log("Test 1: Lexer tokenizes example program...");
    const source = fs.readFileSync(EXAMPLE, "utf-8");
    const lexer = new lexer_1.Lexer(source);
    let tokens;
    try {
        tokens = lexer.tokenize();
        console.log(`  âœ“ Produced ${tokens.length} tokens`);
    }
    catch (e) {
        if (e instanceof lexer_1.LexerError) {
            console.log(`  âœ— Lexer error: ${e.message}`);
            process.exit(1);
        }
        throw e;
    }
    // Test 2: Lexer is deterministic
    console.log("Test 2: Lexer determinism check...");
    const lexer2 = new lexer_1.Lexer(source);
    const tokens2 = lexer2.tokenize();
    const match = JSON.stringify(tokens) === JSON.stringify(tokens2);
    if (match) {
        console.log("  âœ“ Two lexer runs produce identical output");
    }
    else {
        console.log("  âœ— NON-DETERMINISTIC: Two runs differ");
        process.exit(1);
    }
    // Test 3: Parser produces AST
    console.log("Test 3: Parser produces AST from example...");
    const parser = new parser_1.Parser(tokens);
    let ast;
    try {
        ast = parser.parse();
        console.log(`  âœ“ Parsed ${ast.systems.length} system(s)`);
        for (const sys of ast.systems) {
            console.log(`    System '${sys.name}' (domain: ${sys.domain})`);
            console.log(`      Declarations: ${sys.declarations.length}`);
            const kinds = sys.declarations.map((d) => d.kind);
            const unique = [...new Set(kinds)];
            for (const k of unique) {
                console.log(`        ${k}: ${kinds.filter((x) => x === k).length}`);
            }
        }
    }
    catch (e) {
        if (e instanceof parser_base_1.ParseError) {
            console.log(`  âœ— Parse error: ${e.message}`);
            process.exit(1);
        }
        throw e;
    }
    // Test 4: Parser is deterministic
    console.log("Test 4: Parser determinism check...");
    const parser2 = new parser_1.Parser(new lexer_1.Lexer(source).tokenize());
    const ast2 = parser2.parse();
    const astMatch = JSON.stringify(ast) === JSON.stringify(ast2);
    if (astMatch) {
        console.log("  âœ“ Two parser runs produce identical AST");
    }
    else {
        console.log("  âœ— NON-DETERMINISTIC: Two runs differ");
        process.exit(1);
    }
    // Test 5: Empty input rejected
    console.log("Test 5: Empty input rejected...");
    try {
        const emptyLexer = new lexer_1.Lexer("");
        const emptyTokens = emptyLexer.tokenize();
        const emptyParser = new parser_1.Parser(emptyTokens);
        emptyParser.parse();
        console.log("  âœ— Should have thrown");
        process.exit(1);
    }
    catch (e) {
        if (e instanceof parser_base_1.ParseError) {
            console.log(`  âœ“ Correctly rejected: ${e.message}`);
        }
        else {
            throw e;
        }
    }
    // Test 6: Invalid syntax rejected
    console.log("Test 6: Invalid syntax rejected...");
    try {
        const badSource = "system Foo { entity }";
        const badTokens = new lexer_1.Lexer(badSource).tokenize();
        new parser_1.Parser(badTokens).parse();
        console.log("  âœ— Should have thrown");
        process.exit(1);
    }
    catch (e) {
        if (e instanceof parser_base_1.ParseError) {
            console.log(`  âœ“ Correctly rejected: ${e.message}`);
        }
        else {
            throw e;
        }
    }
    console.log("\nâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
    console.log("All tests passed. âœ“");
    console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
}
test();
//# sourceMappingURL=test.js.map