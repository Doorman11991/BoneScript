# BoneScript Determinism Specification

## 1. The Determinism Guarantee

**Axiom**: Given source program P, the BoneScript compiler produces output O such that:
```
âˆ€ executions e1, e2 of compile(P):
  output(e1) = output(e2)    (bitwise equality)
```

This is not aspirational. It is a hard requirement. Any compiler implementation
that violates this property is INCORRECT.

## 2. Sources of Non-Determinism (and how BoneScript eliminates each)

### 2.1 Hash Map Iteration Order

**Problem**: Most languages iterate hash maps in insertion order or random order.
**Solution**: All maps in the IR are serialized with keys sorted lexicographically.
All internal processing uses sorted iteration.

### 2.2 Timestamp Generation

**Problem**: Timestamps in generated code would differ between compilations.
**Solution**: No timestamps appear in generated code. The `created_at` and
`updated_at` fields are populated at RUNTIME, not compile time.
The only compile-time identifier is the source hash (deterministic).

### 2.3 UUID/ID Generation

**Problem**: Random IDs would differ between compilations.
**Solution**: All compile-time identifiers are derived deterministically:
```
module_id = sha256(system_name + "." + module_kind + "." + module_name)[0:16]
event_id  = sha256(system_name + "." + source_module + "." + event_name)[0:16]
```

### 2.4 Constraint Solver Ordering

**Problem**: If constraints are processed in different orders, different
defaults might be chosen.
**Solution**: Constraints are processed in DECLARATION ORDER (source position).
Ties broken by lexicographic ordering of constraint identifiers.

### 2.5 Optimization Pass Ordering

**Problem**: Different optimization orders can produce different (but equivalent) IRs.
**Solution**: Optimizations are applied in a FIXED order (spec 07, Â§6).
Each optimization is idempotent. The sequence is:
1. Dead module elimination
2. Store merging
3. Event deduplication
4. Dependency minimization
5. Index optimization

### 2.6 Code Generation Ordering

**Problem**: Files could be generated in different orders.
**Solution**: Files are generated in a fixed order:
1. Schema files (sorted by model name)
2. Interface files (sorted by module name)
3. Implementation files (sorted by module name)
4. Configuration files (sorted by filename)
5. Infrastructure files (sorted by filename)

### 2.7 Import Statement Ordering

**Problem**: Import statements in generated code could vary.
**Solution**: Imports are sorted lexicographically by module path.

### 2.8 Floating Point

**Problem**: Floating point operations can produce different results on different platforms.
**Solution**: BoneScript does not use floating point in compilation. Float literals
in source are preserved as strings until codegen, where they are emitted verbatim.

## 3. Determinism Verification

The compiler includes a self-check mode:
```
bone compile --verify-determinism program.bone
```

This compiles the program TWICE and asserts bitwise equality of output.
If they differ, it reports the first divergence point.

## 4. Canonical Forms

Every intermediate representation has a canonical form â€” a unique representation
for each semantic equivalence class.

### 4.1 AST Canonical Form
- Whitespace normalized
- Comments stripped
- Identifiers preserved exactly
- Node children in declaration order

### 4.2 Constraint Set Canonical Form
- Conjunctive normal form
- Clauses sorted by: (1) number of literals, (2) lexicographic on literal identifiers
- Duplicate clauses removed

### 4.3 IR Canonical Form
- Modules sorted by qualified id
- Fields sorted by declaration order (preserved from source)
- Dependencies sorted lexicographically
- Events sorted by qualified id

### 4.4 Output Canonical Form
- Files sorted by path
- Within files: deterministic formatting (no prettifier randomness)
- Line endings: LF (Unix)
- Encoding: UTF-8, no BOM
- Trailing newline: yes

## 5. Formal Proof of Determinism

**Theorem**: The BoneScript compilation function `compile: Source â†’ Output` is a pure function.

**Proof by structural induction on the pipeline**:

**Base case (Parse)**:
- PEG parsing is deterministic by definition (ordered choice eliminates ambiguity)
- Same input â†’ same parse tree (or same error)

**Inductive step (each subsequent stage)**:

For stage S with input I (output of previous stage):
- S reads only I and fixed tables (ontology, domain defaults)
- S uses no randomness, no system clock, no external I/O
- S processes elements in a fixed order (declaration order or sorted)
- S produces output in canonical form

Therefore: same I â†’ same output of S.

By induction: same Source â†’ same Output through all stages. âˆŽ

## 6. What This Means in Practice

1. **Reproducible builds**: Compile on any machine, get identical output
2. **Diffable output**: Changes in source produce minimal, predictable diffs in output
3. **Cacheable**: Output can be cached by source hash
4. **Verifiable**: Third party can verify compilation by re-running
5. **No "works on my machine"**: Compilation is environment-independent

## 7. Exceptions (Controlled Non-Determinism)

The ONLY place non-determinism is permitted is in the **runtime** of generated systems:
- UUIDs generated at runtime (for entity instances)
- Timestamps at runtime
- Network ordering (within declared ordering constraints)
- External system responses

These are NOT compiler non-determinism. They are runtime behavior that the
generated system handles according to its declared constraints.
