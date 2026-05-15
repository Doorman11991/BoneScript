# BoneScript Constraint Solver Specification

## 1. Purpose

The constraint solver is the mechanism by which BoneScript eliminates ambiguity.
It is NOT a heuristic system. It is a **deterministic constraint propagation engine**
that resolves all underspecified aspects of a program into concrete decisions.

The key insight: a BoneScript program may leave certain implementation details
unspecified. The constraint solver fills these gaps using ONLY:
- Ontology implication rules (spec 03)
- Domain defaults (spec 03, Â§4)
- Structural necessity (what MUST exist for the program to be valid)

It NEVER guesses. If a decision cannot be made deterministically, the program
is rejected with an error requiring the programmer to be explicit.

## 2. What the Solver Resolves

| Underspecification | Resolution Method |
|-------------------|-------------------|
| Missing store for entity | Implication rule: entity â†’ store required |
| Missing auth store when auth declared | Implication rule: auth â†’ session store |
| Channel without explicit persistence | Domain default or `none` |
| Capability without explicit sync mode | Domain default or `eventual` |
| Entity without explicit primary key | Always `id: uuid` (ontology entailment) |
| Entity without timestamps | Always `created_at`, `updated_at` (ontology entailment) |
| Flow step without compensation | ERROR: programmer must specify |
| Capability without effects | ERROR: capability must change state |
| Event without delivery mode | Domain default or `at_least_once` |

## 3. Constraint Language

Constraints in BoneScript are first-class. They appear in:
- Entity `constraints` clauses
- Capability `requires` clauses
- Top-level `constraint` declarations
- Policy rules
- Ontology implication rules (compiler-internal)

All constraints are predicates over the system state. They are expressed in
a restricted logic:

### 3.1 Constraint Forms

```
Atomic:
  field == value          -- equality
  field != value          -- inequality
  field > value           -- comparison (also <, >=, <=)
  field in set_expr       -- membership
  set_expr contains elem  -- containment
  field.unique            -- uniqueness across all instances
  field.length in a..b    -- range constraint on derived property

Compound:
  c1 and c2              -- conjunction
  c1 or c2               -- disjunction (ONLY in top-level constraints, not in requires)
  not c                  -- negation

Quantified (implicit):
  field.unique           -- âˆ€ instances: no duplicates
  constraints: [...]     -- âˆ€ instances of this entity: all hold
```

### 3.2 Constraint Satisfiability

A set of constraints is **satisfiable** if there exists at least one state
that satisfies all of them simultaneously.

The compiler checks satisfiability at compile time for:
- Entity constraints (must be satisfiable by at least one field assignment)
- Capability preconditions (must be satisfiable by at least one reachable state)
- State machine (must have at least one reachable terminal state OR be cyclic)

If constraints are unsatisfiable, the program is rejected:
```
ERROR C001: Constraints on entity 'Player' are unsatisfiable.
  - username.length >= 1
  - username.length <= 0
  These cannot hold simultaneously.
```

## 4. Solver Algorithm

The solver operates in phases. Each phase is deterministic and total (always terminates).

### Phase 1: Collect

Gather all constraints from:
1. Explicit declarations in source
2. Ontology implication rules
3. Domain defaults
4. Type system requirements (e.g., uuid fields must be unique)

Output: Constraint set C = {câ‚, câ‚‚, ..., câ‚™}

### Phase 2: Normalize

Convert all constraints to a canonical form:
1. Flatten nested `and` (associativity)
2. Distribute `not` inward (De Morgan)
3. Resolve field references to fully qualified paths
4. Replace domain defaults with concrete values

Output: Normalized constraint set C' in conjunctive normal form

### Phase 3: Propagate

Apply unit propagation:
1. If a constraint directly determines a value, assign it
2. Propagate the assignment to all constraints referencing that variable
3. Simplify resulting constraints
4. Repeat until no more propagation possible

Example:
```
auth: jwt                    â†’ auth_method = jwt
(implication) auth â‰  none    â†’ system requires session_store
(implication) session_store  â†’ engine must be specified
domain: multiplayer_game     â†’ engine = redis (domain default for sessions)
```

Output: Partially resolved constraint set with concrete assignments

### Phase 4: Check Consistency

Verify no contradictions:
1. For each variable with an assigned value, check all constraints involving it
2. If any constraint evaluates to `false`, report contradiction
3. If any two assignments conflict, report conflict

Output: Consistent assignment or error

### Phase 5: Complete

For any remaining unresolved variables:
1. Check if domain provides a default â†’ use it
2. Check if ontology provides a default â†’ use it
3. If no default exists â†’ ERROR (programmer must specify)

Output: Complete assignment (all variables resolved) or error

### Phase 6: Verify

Final pass â€” evaluate ALL constraints against the complete assignment:
1. Every constraint must evaluate to `true`
2. Every implication rule must be satisfied
3. Every exclusion rule must not be violated

Output: PASS or list of violations

## 5. Determinism Guarantee

The solver is deterministic because:
1. **Input is fixed**: constraints come from source + ontology + domain (all deterministic)
2. **Normalization is canonical**: same constraints always produce same normal form
3. **Propagation order is fixed**: process constraints in declaration order
4. **Defaults are fixed**: domain/ontology defaults are defined in spec, not computed
5. **No backtracking**: if propagation fails, it's an error, not a branch point

**Theorem**: For any program P, the solver produces the same output on every execution.

**Proof**: By structural induction on the constraint set. Each phase is a pure
function of its input. No randomness, no ordering ambiguity, no external state. âˆŽ

## 6. Solver Errors

| Code | Meaning | Resolution |
|------|---------|-----------|
| `C001` | Unsatisfiable constraints | Programmer must relax or remove conflicting constraints |
| `C002` | Unresolvable variable (no default) | Programmer must specify explicitly |
| `C003` | Circular dependency in constraints | Programmer must break cycle |
| `C004` | Exclusion rule violated | Programmer must change one of the conflicting declarations |
| `C005` | Domain default conflicts with explicit declaration | Explicit wins (warning issued) |
| `C006` | Implication rule produces contradiction | Programmer must restructure |

## 7. Solver Output

The solver produces a **Resolution Map**:

```
ResolutionMap = Map<Variable, ConcreteValue>
```

Where variables include:
- Infrastructure choices (engine types, transport types)
- Default values for unspecified fields
- Implied components (stores, channels added by implication)
- Concrete bounds (buffer sizes, timeouts, retry counts)

This map is passed to the IR lowering phase (spec 07) and determines
exactly what architecture is generated.

## 8. Example: Full Resolution Trace

Input program:
```BoneScript
system Game {
  domain: multiplayer_game
  entity Player { owns: [name: string], auth: jwt }
  capability move(p: Player) { effects: [p.position = new_pos], sync: realtime }
}
```

Solver trace:
```
COLLECT:
  c1: Player.auth = jwt                    (explicit)
  c2: Player has id: uuid                  (ontology)
  c3: Player has created_at: timestamp     (ontology)
  c4: Player has updated_at: timestamp     (ontology)
  c5: system requires session_store        (implication: auth â‰  none)
  c6: session_store.engine = ?             (unresolved)
  c7: sync = realtime                      (explicit)
  c8: system requires channel              (implication: sync = realtime)
  c9: channel.transport = ?                (unresolved)
  c10: channel.ordering = ?                (unresolved)

PROPAGATE:
  c6: domain(multiplayer_game) â†’ session_store.engine = redis
  c9: domain(multiplayer_game) + realtime â†’ channel.transport = websocket
  c10: domain(multiplayer_game) â†’ channel.ordering = causal

CHECK: No contradictions.

COMPLETE:
  channel.persistence = last_100           (domain default)
  channel.max_connections = 10000          (domain default)
  session_store.ttl = 3600                 (domain default)

VERIFY: All constraints satisfied. âœ“

OUTPUT:
  session_store.engine = redis
  session_store.ttl = 3600
  channel.transport = websocket
  channel.ordering = causal
  channel.persistence = last_100
```
