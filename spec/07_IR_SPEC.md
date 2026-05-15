# BoneScript Intermediate Representation Specification

## 1. Purpose

The IR is the **canonical internal form** of a compiled BoneScript program.
It sits between the high-level semantic model and target code generation.

Properties:
- **Language-agnostic**: No target language constructs
- **Fully resolved**: All constraints solved, all defaults filled
- **Strongly typed**: Every node carries its type
- **Verifiable**: Can be checked for internal consistency without source
- **Deterministic**: Same source always produces bitwise-identical IR

## 2. IR Structure (Formal Definition)

The IR is a directed acyclic graph (DAG) with the following node types:

```
IR ::= SystemIR

SystemIR ::= {
  name:        String,
  version:     SemVer,
  hash:        SHA256,          -- of source program
  modules:     List<ModuleIR>,
  events:      List<EventIR>,
  invariants:  List<InvariantIR>,
  resolution:  ResolutionMap    -- from constraint solver
}

ModuleIR ::= {
  id:          QualifiedId,
  kind:        ModuleKind,
  interfaces:  List<InterfaceIR>,
  models:      List<ModelIR>,
  state_machines: List<StateMachineIR>,
  dependencies: List<QualifiedId>,
  config:      ConfigMap
}

ModuleKind ::= ApiService | WorkerService | RealtimeService | AuthService
             | DataStore | EventBus | Cache | Gateway | Frontend

InterfaceIR ::= {
  name:    String,
  methods: List<MethodIR>
}

MethodIR ::= {
  name:          String,
  input:         List<FieldIR>,
  output:        TypeIR,
  preconditions: List<PredicateIR>,
  effects:       List<EffectIR>,
  emissions:     List<QualifiedId>,   -- event ids
  idempotent:    Bool,
  authenticated: Bool,
  timeout:       Duration,
  retry:         RetryPolicy | None
}

FieldIR ::= {
  name:     String,
  type:     TypeIR,
  nullable: Bool,
  default:  Value | None,
  constraints: List<FieldConstraintIR>
}

TypeIR ::= Primitive PrimitiveKind
         | Generic GenericKind List<TypeIR>
         | Record List<FieldIR>
         | Union List<TypeIR>
         | Ref QualifiedId            -- reference to a ModelIR

PrimitiveKind ::= String | Uint | Int | Float | Bool | Timestamp | UUID | Bytes | JSON
GenericKind   ::= List | Set | Map | Optional | Result

ModelIR ::= {
  name:        String,
  fields:      List<FieldIR>,
  primary_key: String,
  indexes:     List<IndexIR>,
  constraints: List<ModelConstraintIR>
}

IndexIR ::= {
  fields: List<String>,
  unique: Bool
}

ModelConstraintIR ::= {
  kind:   ConstraintKind,
  target: String,
  params: Map<String, Value>
}

ConstraintKind ::= Unique | NonNull | Range | Enum | Custom

StateMachineIR ::= {
  entity:      QualifiedId,
  states:      List<String>,
  initial:     String,
  transitions: List<TransitionIR>
}

TransitionIR ::= {
  from:    String,
  to:      String,
  trigger: QualifiedId,    -- event or method id
  guard:   PredicateIR | None
}

EventIR ::= {
  id:       QualifiedId,
  name:     String,
  payload:  List<FieldIR>,
  source:   QualifiedId,
  delivery: DeliveryMode,
  ordering: OrderingMode,
  ttl:      Duration | None
}

DeliveryMode ::= AtLeastOnce | AtMostOnce | ExactlyOnce
OrderingMode ::= FIFO | Causal | Total | Unordered

InvariantIR ::= {
  id:        String,
  predicate: PredicateIR,
  scope:     QualifiedId | Global
}

PredicateIR ::= {
  op:       PredicateOp,
  operands: List<ExprIR>
}

PredicateOp ::= Eq | Neq | Lt | Gt | Lte | Gte | In | Contains
              | And | Or | Not | ForAll | Exists

EffectIR ::= {
  target:   FieldPath,
  op:       EffectOp,
  value:    ExprIR
}

EffectOp ::= Assign | Add | Remove

ExprIR ::= Literal Value
          | FieldAccess FieldPath
          | BinOp Op ExprIR ExprIR
          | UnaryOp Op ExprIR
          | FuncCall String List<ExprIR>

FieldPath ::= List<String>   -- e.g., ["player", "inventory", "size"]

QualifiedId ::= String       -- e.g., "Game.Entity.Player"

ConfigMap ::= Map<String, Value>
ResolutionMap ::= Map<String, Value>

RetryPolicy ::= {
  max_attempts: Uint,
  backoff:      BackoffKind,
  interval:     Duration
}

BackoffKind ::= Fixed | Linear | Exponential
```

## 3. IR Construction Rules

The IR is constructed from the typed AST + resolution map. Rules:

### 3.1 One Module Per Semantic Component

Each SEG-level component becomes exactly one IR module:
- Each entity with a store â†’ one DataStore module + one ApiService module
- Each channel â†’ one RealtimeService module
- Auth â†’ one AuthService module
- Each flow â†’ methods on existing ApiService modules

### 3.2 Interface Derivation

For an entity `E` with capabilities `c1, c2, ...`:
```
InterfaceIR {
  name: "I{E}Service",
  methods: [derive_method(c) for c in capabilities referencing E]
}
```

If no explicit capabilities exist for an entity, generate CRUD:
```
methods: [create, read, update, delete, list]
```

### 3.3 Model Derivation

For an entity `E`:
```
ModelIR {
  name: E.name,
  fields: E.owns âˆª {id, created_at, updated_at},
  primary_key: "id",
  indexes: derived from constraints (unique fields, foreign keys),
  constraints: derived from E.constraints
}
```

### 3.4 Event Derivation

For each capability that `emits`:
```
EventIR {
  name: "{Capability}.{action}",
  payload: capability parameters + timestamp + actor_id,
  source: module containing the capability,
  delivery: from resolution map,
  ordering: from resolution map
}
```

### 3.5 Dependency Derivation

Module A depends on Module B if:
- A's methods reference B's models (data access)
- A emits events consumed by B
- A's preconditions reference B's state
- Resolution map indicates A requires B's capability

## 4. IR Serialization

The IR is serialized as a deterministic JSON document:
- Keys sorted alphabetically at every level
- No whitespace variation
- Numbers in canonical form (no leading zeros, no trailing zeros after decimal)
- Strings in UTF-8 with minimal escaping
- SHA-256 hash of serialized IR included in header

This ensures: `hash(serialize(IR)) == hash(serialize(IR))` always.

## 5. IR Validation Rules

Before codegen, the IR must pass these checks:

| Rule | Check |
|------|-------|
| V001 | Every dependency target exists as a module |
| V002 | Every event source exists as a module |
| V003 | Every state machine transition trigger references a valid event |
| V004 | No circular dependencies between modules |
| V005 | Every method's preconditions reference accessible fields |
| V006 | Every effect targets a field that exists in the target model |
| V007 | Every model has a primary key field |
| V008 | Every index references fields that exist |
| V009 | No duplicate module ids |
| V010 | No duplicate event ids |
| V011 | Every authenticated method's module depends on auth module |
| V012 | Resolution map is complete (no unresolved variables) |

## 6. IR Optimization (Stage D in Pipeline)

Optimizations are transformations `IR â†’ IR` that preserve semantics:

### 6.1 Dead Module Elimination
Remove modules with no dependents and no external interface.

### 6.2 Store Merging
If two DataStore modules use the same engine and have no conflicting schemas,
merge into one module with combined schema.

### 6.3 Event Deduplication
If two events have identical payload structure and same source, merge.

### 6.4 Dependency Minimization
Remove transitive dependencies (if Aâ†’Bâ†’C, remove Aâ†’C).

### 6.5 Index Optimization
If an index is a prefix of another index on the same model, remove the shorter one.

Each optimization must:
1. Be provably semantics-preserving
2. Be deterministic (same IR in â†’ same IR out)
3. Be idempotent (applying twice = applying once)
