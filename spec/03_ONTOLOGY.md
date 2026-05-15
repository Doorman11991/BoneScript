# BoneScript Ontology Specification

## 1. Purpose

The ontology defines the **closed set of concepts** that BoneScript programs can express.
Every token in a BoneScript program must resolve to exactly one ontological concept.
There is no "unknown" category. If a concept cannot be mapped, the program is invalid.

This is NOT a keyword list. It is a **formal concept lattice** with:
- Fixed denotation (each concept means exactly one thing)
- Composition rules (how concepts combine)
- Exclusion rules (what combinations are invalid)
- Implication rules (what a concept necessarily entails)

## 2. Concept Categories

### 2.1 Structural Concepts (Nouns)

These define WHAT exists in the system.

| Concept | Denotation | Necessarily Entails |
|---------|-----------|---------------------|
| `System` | A bounded, deployable software system | At least one Entity, at least one Capability |
| `Entity` | A uniquely identifiable, stateful data object | A primary key (uuid), created_at, updated_at |
| `Store` | A persistence mechanism for entities | An engine type, a schema, CRUD operations |
| `Channel` | A communication pathway between participants | A transport, ordering guarantee, at least 2 participants |
| `Event` | An immutable record of something that happened | A payload, a timestamp, a source |
| `Policy` | A set of enforceable rules governing access/behavior | At least one rule |
| `Flow` | A multi-step orchestrated process | At least 2 steps, compensation for each step |

### 2.2 Behavioral Concepts (Verbs)

These define WHAT HAPPENS in the system.

| Concept | Denotation | Necessarily Entails |
|---------|-----------|---------------------|
| `Capability` | A named, atomic operation that changes system state | Preconditions, effects, at least one parameter |
| `Effect` | A state mutation produced by a capability | A target field, a new value |
| `Emission` | The production of an event by a capability | An event type, a payload |
| `Compensation` | The reversal of a step in a flow | Inverse of the step's effects |

### 2.3 Constraint Concepts (Adjectives)

These define WHAT MUST HOLD.

| Concept | Denotation | Applies To |
|---------|-----------|------------|
| `Unique` | No two instances share this value | Fields |
| `NonNull` | This value must always be present | Fields |
| `Range` | Value must fall within bounds | Numeric fields |
| `Membership` | Value must be in a set | Fields |
| `Cardinality` | Relationship count bounds | Relations |
| `Invariant` | A predicate that must hold at all times | Entities, Systems |
| `Precondition` | A predicate that must hold before an operation | Capabilities |
| `Postcondition` | A predicate that must hold after an operation | Capabilities |

### 2.4 Infrastructure Concepts (Adverbs)

These define HOW things are implemented.

| Concept | Denotation | Options (closed set) |
|---------|-----------|---------------------|
| `Transport` | How data moves between nodes | websocket, sse, polling, grpc_stream |
| `Ordering` | Delivery order guarantee | causal, fifo, total, unordered |
| `Delivery` | Delivery count guarantee | at_least_once, at_most_once, exactly_once |
| `Sync` | Consistency model for operations | realtime, eventual, batch, transactional |
| `Engine` | Storage technology | postgresql, redis, mongodb, sqlite, s3, dynamodb |
| `Auth` | Authentication mechanism | jwt, oauth2, apikey, session, none |
| `Encryption` | Data protection model | at_rest, in_transit, both, none |

## 3. Composition Rules

### 3.1 Valid Compositions

```
System CONTAINS {Entity, Capability, Channel, Store, Event, Policy, Flow}
Entity CONTAINS {Field, Constraint, StateMachine, Relation}
Capability CONTAINS {Param, Precondition, Effect, Emission, SyncMode}
Channel CONTAINS {Transport, Ordering, Persistence, Filter}
Store CONTAINS {Engine, Schema, Retention, Partition}
Flow CONTAINS {Step, Compensation}
Policy CONTAINS {RateLimit, Access, Audit, Encryption}
```

### 3.2 Exclusion Rules (Invalid Compositions)

| Rule | Meaning |
|------|---------|
| Entity âˆ‰ Entity | Entities cannot nest (use Relations instead) |
| Capability âˆ‰ Capability | Capabilities cannot nest (use Flows instead) |
| Store âˆ‰ Entity | Stores are system-level, not entity-level |
| Channel.ordering=total âˆ§ Channel.transport=polling | Total ordering incompatible with polling |
| Sync=realtime âˆ§ Delivery=at_most_once | Realtime sync requires at-least-once delivery |
| Auth=none âˆ§ Policy.accessâ‰ [*] | No auth means access must be unrestricted |

### 3.3 Implication Rules (Concept Entailment)

When concept A is present, concept B is NECESSARILY present (compiler inserts B).

| If Present | Then Required |
|-----------|---------------|
| Entity with authâ‰ none | System must have an auth Store |
| Capability with sync=realtime | System must have a Channel |
| Channel with persistenceâ‰ none | System must have a Store for channel history |
| Flow with >1 step | Each step must have a Compensation |
| Entity with states clause | An Event for each state transition |
| Capability with effects on Entity | Entity must be declared in same System |
| Policy with audit=true | System must have a log Store |

## 4. Domain Specialization

The `domain` declaration narrows the ontology to a specific problem space.
This does NOT add new concepts â€” it constrains which combinations are typical
and provides domain-specific defaults.

### 4.1 Defined Domains

| Domain | Default Auth | Default Engine | Default Sync | Typical Entities |
|--------|-------------|---------------|-------------|-----------------|
| `multiplayer_game` | jwt | redis + postgresql | realtime | Player, Item, Session, Match |
| `saas_platform` | oauth2 | postgresql | eventual | User, Tenant, Subscription, Invoice |
| `iot_system` | apikey | dynamodb + s3 | eventual | Device, Reading, Alert, Firmware |
| `social_network` | oauth2 | postgresql + redis | eventual | User, Post, Connection, Feed |
| `marketplace` | oauth2 | postgresql | transactional | User, Listing, Order, Payment, Review |
| `realtime_collaboration` | jwt | postgresql + redis | realtime | User, Document, Cursor, Change |

### 4.2 Domain as Constraint

A domain declaration is syntactic sugar for a set of constraints:
```
domain: multiplayer_game
```
Is equivalent to:
```
constraint default_auth: auth == jwt
constraint default_sync: sync == realtime
constraint session_required: system contains entity with states
```

The programmer can override any domain default explicitly.

## 5. Concept Resolution Algorithm

Given a parsed AST node, resolution proceeds:

1. **Lexical match**: Token matches a keyword â†’ direct concept mapping
2. **Structural match**: Node position in tree â†’ concept from composition rules
3. **Implication check**: Apply implication rules â†’ insert missing required concepts
4. **Exclusion check**: Verify no exclusion rules violated â†’ error if violated
5. **Domain narrowing**: Apply domain constraints â†’ fill defaults

This is a FIXED algorithm. No heuristics. No probabilistic matching.
If resolution fails at any step, the program is REJECTED with a specific error code.

## 6. Concept Identifiers

Every concept instance in a compiled program receives a deterministic identifier:

```
{SystemName}.{ConceptType}.{Name}.{Index}
```

Example:
```
InventoryPlatform.Entity.Player.0
InventoryPlatform.Capability.trade.0
InventoryPlatform.Channel.lobby.0
```

These identifiers are stable across compilations of the same source.
