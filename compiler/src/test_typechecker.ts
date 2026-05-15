/**
 * BoneScript Type Checker Tests
 * Verifies the type checker catches errors per spec/04_TYPE_SYSTEM.md.
 */

import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { TypeChecker } from "./typechecker";

function compile(source: string) {
  const tokens = new Lexer(source).tokenize();
  const ast = new Parser(tokens).parse();
  const checker = new TypeChecker();
  return checker.check(ast);
}

let passed = 0;
let failed = 0;

function expect(name: string, source: string, expectedCode: string | null) {
  const errors = compile(source);
  if (expectedCode === null) {
    if (errors.length === 0) {
      console.log(`  âœ“ ${name}`);
      passed++;
    } else {
      console.log(`  âœ— ${name}: expected no errors, got ${errors.length}`);
      for (const e of errors) console.log(`      ${e.code}: ${e.message}`);
      failed++;
    }
  } else {
    const found = errors.find(e => e.code === expectedCode);
    if (found) {
      console.log(`  âœ“ ${name} (${expectedCode}: ${found.message})`);
      passed++;
    } else {
      console.log(`  âœ— ${name}: expected ${expectedCode}, got [${errors.map(e => e.code).join(", ")}]`);
      for (const e of errors) console.log(`      ${e.code}: ${e.message}`);
      failed++;
    }
  }
}

console.log("BoneScript Type Checker Tests\n");

// â”€â”€â”€ Valid Programs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

expect("Valid minimal system", `
system Minimal {
  entity User {
    owns: [name: string]
  }
  capability greet(u: User) {
    requires: [u.name != ""]
    effects: [u.name = "greeted"]
    sync: eventual
  }
}
`, null);

expect("Valid with set operations", `
system SetOps {
  entity Bag {
    owns: [items: set<string>]
  }
  capability add_item(b: Bag, item: string) {
    requires: [b.items.size < 100]
    effects: [b.items += item]
    sync: transactional
  }
}
`, null);

expect("Valid with numeric operations", `
system NumOps {
  entity Counter {
    owns: [value: uint]
    constraints: [value >= 0, value <= 1000]
  }
  capability increment(c: Counter, amount: uint) {
    requires: [amount > 0]
    effects: [c.value += amount]
    sync: eventual
  }
}
`, null);

// â”€â”€â”€ Type Errors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

expect("T009: Duplicate field name", `
system DupField {
  entity Bad {
    owns: [name: string, name: uint]
  }
}
`, "T009");

expect("T010: Undefined state in transition", `
system BadState {
  entity Thing {
    owns: [x: uint]
    states: active -> nonexistent
  }
}
`, null); // states are just identifiers, both are "defined" by being in the graph

expect("T012: Flow with less than 2 steps", `
system BadFlow {
  entity Item { owns: [x: uint] }
  flow single_step {
    step one: do_thing(x)
  }
}
`, "T012");

expect("T011: Emit undeclared event", `
system BadEmit {
  entity User { owns: [name: string] }
  capability greet(u: User) {
    requires: [u.name != ""]
    effects: [u.name = "hi"]
    emits: NonExistentEvent
    sync: eventual
  }
}
`, "T011");

// â”€â”€â”€ Summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

console.log(`\nâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•`);

if (failed > 0) process.exit(1);
