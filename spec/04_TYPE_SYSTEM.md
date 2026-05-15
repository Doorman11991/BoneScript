# BoneScript Type System Specification

## 1. Overview

BoneScript uses a **structural type system** â€” types are defined by their shape,
not by name. Two types are equal if and only if they have the same structure.

The type system serves two purposes:
1. **Validate programs** â€” reject ill-typed programs before compilation
2. **Guide lowering** â€” types determine what IR constructs are generated

## 2. Primitive Types

| Type | Denotation | Size | Default |
|------|-----------|------|---------|
| `string` | UTF-8 text, unbounded | variable | `""` |
| `uint` | Non-negative integer, 64-bit | 8 bytes | `0` |
| `int` | Signed integer, 64-bit | 8 bytes | `0` |
| `float` | IEEE 754 double precision | 8 bytes | `0.0` |
| `bool` | True or false | 1 byte | `false` |
| `timestamp` | UTC nanosecond precision | 8 bytes | epoch |
| `uuid` | RFC 4122 v4 | 16 bytes | generated |
| `bytes` | Raw byte sequence | variable | empty |
| `json` | Arbitrary JSON value | variable | `null` |

## 3. Composite Types

### 3.1 Generic Types

| Constructor | Notation | Semantics |
|------------|----------|-----------|
| `list<T>` | Ordered sequence | Duplicates allowed, indexed by position |
| `set<T>` | Unordered collection | No duplicates, membership test O(1) |
| `map<K, V>` | Key-value mapping | Keys unique, K must be hashable |
| `optional<T>` | Nullable wrapper | Value is T or absent |
| `result<T, E>` | Success or failure | Exactly one of T (ok) or E (err) |

### 3.2 Tuple Types

```
(T1, T2, ..., Tn)
```

Fixed-size, heterogeneous, ordered. Accessed by position.

### 3.3 Union Types

```
T1 | T2 | ... | Tn
```

Value is exactly one of the constituent types. Discriminated by runtime tag.

### 3.4 Entity Types

An entity declaration introduces a **named record type**:

```BoneScript
entity Player {
  owns: [username: string, score: uint]
}
```

This introduces type `Player` with shape:
```
{ id: uuid, created_at: timestamp, updated_at: timestamp, username: string, score: uint }
```

Note: `id`, `created_at`, `updated_at` are ALWAYS present (ontology entailment).

## 4. Type Rules (Judgments)

We use standard notation: `Î“ âŠ¢ e : T` means "in context Î“, expression e has type T."

### 4.1 Literals

```
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Î“ âŠ¢ "..." : string

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Î“ âŠ¢ [0-9]+ : uint        (if non-negative)

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Î“ âŠ¢ [0-9]+.[0-9]+ : float

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Î“ âŠ¢ true : bool
Î“ âŠ¢ false : bool

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Î“ âŠ¢ none : optional<âŠ¥>   (bottom type, unifies with any optional<T>)
```

### 4.2 Field Access

```
Î“ âŠ¢ e : { ..., f: T, ... }
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Î“ âŠ¢ e.f : T
```

### 4.3 Operators

```
Î“ âŠ¢ a : uint    Î“ âŠ¢ b : uint
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Î“ âŠ¢ a + b : uint
Î“ âŠ¢ a - b : int              (subtraction may produce negative)
Î“ âŠ¢ a * b : uint
Î“ âŠ¢ a >= b : bool

Î“ âŠ¢ a : T    Î“ âŠ¢ b : set<T>
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Î“ âŠ¢ a in b : bool

Î“ âŠ¢ a : set<T>    Î“ âŠ¢ b : T
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Î“ âŠ¢ a contains b : bool
```

### 4.4 Capability Parameters

```
capability trade(from: Player, to: Player, item: Item) { ... }
```

Introduces typing context:
```
Î“ = { from: Player, to: Player, item: Item }
```

All expressions in `requires`, `effects`, `emits` are checked under this Î“.

### 4.5 Effect Typing

An effect `target = expr` is valid iff:
```
Î“ âŠ¢ target : T
Î“ âŠ¢ expr : T
```

An effect `target += expr` is valid iff:
```
Î“ âŠ¢ target : set<T>
Î“ âŠ¢ expr : T
```

An effect `target -= expr` is valid iff:
```
Î“ âŠ¢ target : set<T>
Î“ âŠ¢ expr : T
```

### 4.6 Constraint Typing

A constraint expression must always type to `bool`:
```
Î“ âŠ¢ constraint_expr : bool
```

If it doesn't, the program is rejected.

## 5. Subtyping

BoneScript has NO subtyping. Types are equal or they are not.

Exception: `optional<T>` accepts values of type `T` (implicit wrapping).

## 6. Type Inference

BoneScript does NOT perform type inference on declarations. All fields must be
explicitly typed. However, within expressions, intermediate types are inferred:

```BoneScript
constraints: [quantity >= 0]
```

Here, `0` is inferred as `uint` because `quantity` is `uint` and `>=` requires
both operands to have the same numeric type.

Inference rules:
1. Numeric literals default to `uint` unless context requires `int` or `float`
2. String literals are always `string`
3. Boolean literals are always `bool`
4. `none` unifies with any `optional<T>`

## 7. Type Checking Algorithm

```
function typecheck(program: AST): Result<TypedAST, TypeError[]>
  1. Build symbol table from all entity declarations
  2. For each entity:
     a. Check field types are valid (primitives or declared entities)
     b. Check constraints type to bool
     c. Check state machine transitions reference valid states
  3. For each capability:
     a. Build local Î“ from parameters
     b. Check requires clauses type to bool under Î“
     c. Check effects are well-typed under Î“
     d. Check emitted events exist and payload matches
  4. For each channel:
     a. Check participants type is set<Entity>
     b. Check filter expression types to bool
  5. For each flow:
     a. Check each step references a valid capability
     b. Check compensation references a valid capability
     c. Check step ordering is acyclic
  6. For each policy:
     a. Check access roles reference valid identifiers
     b. Check rate_limit is uint
  7. Return all errors collected (fail-fast per declaration, collect across declarations)
```

## 8. Type Errors

| Code | Meaning |
|------|---------|
| `T001` | Undefined type reference |
| `T002` | Field access on non-record type |
| `T003` | Type mismatch in assignment |
| `T004` | Type mismatch in comparison |
| `T005` | Non-boolean constraint expression |
| `T006` | Capability parameter references undeclared entity |
| `T007` | Effect targets field not owned by parameter entity |
| `T008` | Set operation on non-set type |
| `T009` | Duplicate field name in entity |
| `T010` | Undefined state in transition |
| `T011` | Event payload type mismatch |
| `T012` | Flow step references undeclared capability |
| `T013` | Cardinality bounds invalid (min > max) |
| `T014` | Numeric overflow in literal |
| `T015` | Union type with duplicate constituent |

## 9. Type Erasure

Types exist ONLY at compile time. The IR and generated code use concrete
representations. The type system's job is to REJECT invalid programs before
any code is generated.

After type checking passes, the compiler has a guarantee:
> Every field access is valid. Every constraint is boolean. Every effect is
> type-compatible. Every event payload matches its declaration.

This guarantee is what makes deterministic codegen possible.
