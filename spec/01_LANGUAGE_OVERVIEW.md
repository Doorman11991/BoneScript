# BoneScript Language Specification v0.1

## 1. What BoneScript Is

BoneScript (Conceptual-Virtual Intent-Based Execution) is a **formal declarative language** 
whose source programs describe software systems as **constrained intent graphs**.

A BoneScript program is NOT natural language. It is a structured declaration that:
- Has a defined grammar (PEG)
- Operates over a closed ontology of software concepts
- Is compiled through constraint solving (not template matching)
- Produces deterministic, reproducible output for any given input

## 2. Core Insight

The fundamental problem BoneScript solves:

> Human intent is ambiguous. Software must not be.

BoneScript bridges this gap NOT by guessing (heuristics) but by:
1. Restricting the input space to a formal grammar
2. Defining a closed ontology of concepts with fixed semantics
3. Using constraint propagation to resolve all ambiguity at compile time
4. Requiring the programmer to resolve any remaining ambiguity explicitly

## 3. Language Properties

| Property | Guarantee |
|----------|-----------|
| Determinism | Same source â†’ identical output (bitwise) |
| Totality | Every valid program compiles to a complete system |
| Soundness | If it compiles, the output satisfies all declared constraints |
| Decidability | Compilation always terminates |
| Minimality | Output contains no components not required by the intent graph |

## 4. What a BoneScript Program Looks Like

```BoneScript
system InventoryPlatform {
  domain: multiplayer_game

  entity Item {
    owns: [name: string, quantity: uint, metadata: map]
    constraints: [quantity >= 0, name.length in 1..128]
    states: available -> reserved -> consumed | deleted
  }

  entity Player {
    owns: [username: string, inventory: set<Item>]
    constraints: [username.unique, inventory.size <= 1000]
    auth: jwt
  }

  capability trade(from: Player, to: Player, item: Item) {
    requires: [from.inventory contains item, item.state == available]
    effects: [
      item.owner = to,
      from.inventory -= item,
      to.inventory += item
    ]
    emits: TradeCompleted
    sync: realtime
  }

  channel lobby {
    transport: websocket
    ordering: causal
    participants: set<Player>
    persistence: last_100
  }
}
```

This is NOT pseudocode. Every token has formal semantics defined in this spec.

## 5. Compilation Model

```
Source (.bone)
    â”‚
    â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  PARSE          â”‚  PEG grammar â†’ Concrete Syntax Tree
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚
         â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  RESOLVE        â”‚  Ontology lookup + constraint propagation
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚
         â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  TYPE CHECK     â”‚  Structural type system verification
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚
         â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  LOWER          â”‚  Intent graph â†’ Architecture IR
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚
         â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  SOLVE          â”‚  Constraint satisfaction â†’ concrete decisions
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚
         â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  EMIT           â”‚  IR â†’ target code (deterministic templates)
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚
         â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  VERIFY         â”‚  Post-condition checking on output
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

## 6. Document Map

- `02_GRAMMAR.peg` â€” Formal PEG grammar
- `03_ONTOLOGY.md` â€” Closed concept ontology with fixed semantics
- `04_TYPE_SYSTEM.md` â€” Structural type system
- `05_SEMANTIC_MODEL.md` â€” Denotational semantics
- `06_CONSTRAINT_SOLVER.md` â€” Ambiguity resolution via constraint propagation
- `07_IR_SPEC.md` â€” Intermediate representation (formal)
- `08_DETERMINISM.md` â€” Proof of deterministic compilation
- `09_CODEGEN.md` â€” Target emission rules
- `10_MAINTENANCE_MODEL.md` â€” Self-monitoring specification
