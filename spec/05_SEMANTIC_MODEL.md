# BoneScript Semantic Model

## 1. Purpose

This document defines what BoneScript programs MEAN â€” not what they look like
(grammar) or what types they have (type system), but what they DENOTE.

We use **denotational semantics**: each syntactic construct maps to a
mathematical object. This gives us:
- Precise meaning independent of implementation
- A basis for proving compiler correctness
- A reference for resolving edge cases

## 2. Semantic Domains

A BoneScript program denotes a **System Configuration** â€” a mathematical object
that fully specifies a software system's behavior.

### 2.1 Domain Definitions

```
State       = EntityId â†’ FieldMap
FieldMap    = FieldName â†’ Value
Value       = String | Uint | Int | Float | Bool | Timestamp | UUID | Bytes | JSON
            | List<Value> | Set<Value> | Map<Value, Value> | None

Event       = (EventName, Payload, Timestamp, SourceId)
Payload     = FieldMap

Trace       = List<Event>

Predicate   = State â†’ Bool
Effect      = State â†’ State
Capability  = (Predicate, Effect, Set<Event>)   -- (precondition, transformation, emissions)

Channel     = (Transport, Ordering, Buffer)
Buffer      = List<Event>  -- bounded by persistence config

StateMachine = (Set<State>, State, Set<Transition>)
Transition   = (State, Event, Guard, State)     -- (from, trigger, condition, to)
Guard        = State â†’ Bool

System      = {
  entities:     Set<EntitySchema>,
  state:        State,
  capabilities: Map<Name, Capability>,
  channels:     Map<Name, Channel>,
  machines:     Map<EntityId, StateMachine>,
  policies:     Set<Policy>,
  invariants:   Set<Predicate>
}
```

## 3. Denotation Functions

We write `âŸ¦ x âŸ§` for "the denotation of syntactic construct x."

### 3.1 System

```
âŸ¦ system Name { domain: D, decls... } âŸ§ = System {
  entities   = â‹ƒ { âŸ¦dâŸ§ | d âˆˆ decls, d is EntityDecl },
  state      = initial_state(entities),
  capabilities = { name â†’ âŸ¦dâŸ§ | d âˆˆ decls, d is CapabilityDecl },
  channels   = { name â†’ âŸ¦dâŸ§ | d âˆˆ decls, d is ChannelDecl },
  machines   = { eid â†’ âŸ¦d.statesâŸ§ | d âˆˆ decls, d is EntityDecl with states },
  policies   = { âŸ¦dâŸ§ | d âˆˆ decls, d is PolicyDecl },
  invariants = { âŸ¦dâŸ§ | d âˆˆ decls, d is ConstraintDecl } âˆª domain_invariants(D)
}
```

### 3.2 Entity

```
âŸ¦ entity Name { owns: [fields], constraints: [cs], states: sg } âŸ§ = EntitySchema {
  name    = Name,
  fields  = { id: uuid, created_at: timestamp, updated_at: timestamp } âˆª âŸ¦fieldsâŸ§,
  invariants = { âŸ¦câŸ§ | c âˆˆ cs },
  machine = âŸ¦sgâŸ§ if sg exists, else trivial_machine
}
```

### 3.3 Capability

```
âŸ¦ capability Name(params) { requires: [rs], effects: [es], emits: [evs] } âŸ§ =
  let pre   = Î»state. âˆ€r âˆˆ rs: âŸ¦râŸ§(state) = true
  let eff   = Î»state. fold(âŸ¦eâŸ§, state) for e âˆˆ es  -- sequential application
  let emit  = { âŸ¦evâŸ§ | ev âˆˆ evs }
  in (pre, eff, emit)
```

**Critical property**: Effects are applied SEQUENTIALLY in declaration order.
This makes the semantics deterministic â€” reordering effects may change meaning.

### 3.4 Effect

```
âŸ¦ target = expr âŸ§ = Î»state. state[target â†¦ âŸ¦exprâŸ§(state)]
âŸ¦ target += expr âŸ§ = Î»state. state[target â†¦ state(target) âˆª {âŸ¦exprâŸ§(state)}]
âŸ¦ target -= expr âŸ§ = Î»state. state[target â†¦ state(target) \ {âŸ¦exprâŸ§(state)}]
```

### 3.5 Constraint / Predicate

```
âŸ¦ a == b âŸ§ = Î»state. âŸ¦aâŸ§(state) = âŸ¦bâŸ§(state)
âŸ¦ a >= b âŸ§ = Î»state. âŸ¦aâŸ§(state) â‰¥ âŸ¦bâŸ§(state)
âŸ¦ a in b âŸ§ = Î»state. âŸ¦aâŸ§(state) âˆˆ âŸ¦bâŸ§(state)
âŸ¦ a contains b âŸ§ = Î»state. âŸ¦bâŸ§(state) âˆˆ âŸ¦aâŸ§(state)
âŸ¦ a and b âŸ§ = Î»state. âŸ¦aâŸ§(state) âˆ§ âŸ¦bâŸ§(state)
âŸ¦ a or b âŸ§ = Î»state. âŸ¦aâŸ§(state) âˆ¨ âŸ¦bâŸ§(state)
âŸ¦ not a âŸ§ = Î»state. Â¬âŸ¦aâŸ§(state)
âŸ¦ field.unique âŸ§ = Î»state. âˆ€e1, e2 âˆˆ instances: e1.field â‰  e2.field (where e1 â‰  e2)
```

### 3.6 State Machine

```
âŸ¦ s1 -> s2 -> s3 | s4 âŸ§ = StateMachine {
  states = {s1, s2, s3, s4},
  initial = s1,
  transitions = {
    (s1, auto, true, s2),
    (s2, auto, true, s3),
    (s2, auto, true, s4)    -- branch
  }
}
```

When a state machine has guards:
```
âŸ¦ s1 -> s2(guard_expr) âŸ§ = transition (s1, trigger, âŸ¦guard_exprâŸ§, s2)
```

### 3.7 Channel

```
âŸ¦ channel Name { transport: T, ordering: O, persistence: P } âŸ§ = Channel {
  transport = T,
  ordering  = ordering_semantics(O),
  buffer    = persistence_buffer(P)
}
```

Where ordering semantics are:
```
ordering_semantics(fifo)      = âˆ€m1, m2: send(m1) < send(m2) â†’ deliver(m1) < deliver(m2)
ordering_semantics(causal)    = âˆ€m1, m2: causes(m1, m2) â†’ deliver(m1) < deliver(m2)
ordering_semantics(total)     = âˆƒ total order on all messages agreed by all participants
ordering_semantics(unordered) = no delivery order guarantee
```

### 3.8 Flow (Saga)

```
âŸ¦ flow Name { step s1: cap1, step s2: cap2, ... } âŸ§ = Saga {
  steps = [(s1, âŸ¦cap1âŸ§, âŸ¦comp1âŸ§), (s2, âŸ¦cap2âŸ§, âŸ¦comp2âŸ§), ...],
  execution = sequential,
  failure_semantics = backward_compensation
}
```

Failure semantics: if step N fails, compensate steps N-1, N-2, ..., 1 in reverse order.

## 4. System Invariants (Always True)

A valid BoneScript system satisfies these meta-invariants at ALL times:

1. **State Consistency**: After any capability execution, all entity constraints hold.
   ```
   âˆ€cap âˆˆ capabilities, âˆ€state: pre(cap)(state) â†’ invariants(eff(cap)(state))
   ```

2. **State Machine Validity**: Entities are always in a valid state.
   ```
   âˆ€entity: entity.current_state âˆˆ entity.machine.states
   ```

3. **Event Causality**: Events reference only entities that exist.
   ```
   âˆ€event: event.source âˆˆ dom(state)
   ```

4. **Channel Ordering**: Delivery respects declared ordering.
   ```
   âˆ€channel: ordering_semantics(channel.ordering) holds for all deliveries
   ```

5. **Flow Atomicity**: A flow either completes all steps or compensates all completed steps.
   ```
   âˆ€flow execution: (all steps succeed) âˆ¨ (all completed steps are compensated)
   ```

## 5. Determinism Theorem

**Theorem**: For any BoneScript program P and initial state Sâ‚€, the compiled system's
behavior is fully determined by the sequence of external inputs.

**Proof sketch**:
1. The initial state is determined by entity declarations (fixed).
2. Each capability is a pure function State â†’ State (effects are sequential, deterministic).
3. Event emissions are determined by capability execution (fixed set per capability).
4. Channel delivery order is determined by ordering semantics (causal/fifo/total are deterministic given input order).
5. Flow execution is sequential with deterministic compensation.
6. No construct in the language introduces non-determinism.

Therefore: same program + same input sequence â†’ same state trajectory. âˆŽ

## 6. Compilation Correctness Criterion

The compiler is correct if and only if:

> For all programs P, the generated system G(P) is a faithful implementation
> of âŸ¦PâŸ§ â€” meaning G(P) produces the same state transitions, event emissions,
> and observable outputs as the mathematical model âŸ¦PâŸ§ for all valid input sequences.

This is the standard against which the reference implementation is verified.
