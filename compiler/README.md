# bonescript-compiler

[![npm](https://img.shields.io/npm/v/bonescript-compiler)](https://www.npmjs.com/package/bonescript-compiler)
[![license](https://img.shields.io/npm/l/bonescript-compiler)](https://github.com/Doorman11991/BoneScript/blob/main/compiler/LICENSE)
[![node](https://img.shields.io/node/v/bonescript-compiler)](https://www.npmjs.com/package/bonescript-compiler)

A declarative language that compiles system descriptions into complete, runnable Node.js backends. Write the bones, get the whole skeleton.

```bone
system Shop {
  entity Product {
    owns: [name: string, price: uint, stock: uint]
    constraints: [price > 0, stock >= 0]
    states: available -> sold_out | archived
  }

  capability purchase(buyer: User, product: Product, qty: uint) {
    requires: [product.stock >= qty, buyer.balance >= product.price * qty]
    effects: [product.stock -= qty, buyer.balance -= product.price * qty]
    emits: OrderPlaced
    sync: transactional
  }

  event OrderPlaced {
    payload: { order_id: uuid, buyer_id: uuid, total: uint }
    delivery: exactly_once
    ttl: 90d
  }
}
```

Run `bonec compile shop.bone` and get back a complete Express API with PostgreSQL, auth middleware, state machine enforcement, transactional SQL, durable events, health checks, migrations, WebSocket support, a Dockerfile, and a GitHub Actions CI pipeline. No LLMs. Deterministic — same input always produces identical output.

---

## Install

```bash
npm install -g bonescript-compiler
```

Or run without installing:

```bash
npx bonescript-compiler compile shop.bone
```

Requires Node.js 18 or later.

---

## Quick Start

```bash
# 1. Scaffold a new project
bonec init my-app --domain saas_platform

# 2. Compile
bonec compile my-app/my-app.bone

# 3. Configure
cp my-app/output/.env.example my-app/output/.env
# Edit .env — set JWT_SECRET, DATABASE_URL, etc.

# 4. Run
cd my-app/output
npm install
docker compose up -d   # starts Postgres + Redis
npm run migrate
npm run dev
# → http://localhost:3000
```

---

## What Gets Generated

From a single `.bone` file, the compiler produces a complete Node.js project:

```
output/
├── src/
│   ├── index.ts            Express server, all routes wired
│   ├── db.ts               Postgres connection pool
│   ├── auth.ts             JWT / OAuth2 / API key middleware (domain-selected)
│   ├── events.ts           Durable event bus (transactional outbox)
│   ├── publishers.ts       Typed event publisher functions
│   ├── health.ts           /health/live, /health/ready, /health/metrics
│   ├── logger.ts           Structured JSON logging
│   ├── metrics.ts          Prometheus-style counters/histograms
│   ├── failure_rules.ts    Rule-based remediation
│   ├── flows.ts            Saga runtime with backward compensation
│   ├── websocket.ts        WebSocket server (if channels declared)
│   ├── channel_filters.ts  Channel filter predicates (if filters declared)
│   ├── algorithms.ts       Algorithm implementations (only what's used)
│   ├── extensions.ts       Extension point stubs (preserved on recompile)
│   ├── routes/             One file per entity — CRUD + capabilities
│   ├── state_machines/     One file per entity with states
│   ├── models/             TypeScript interfaces + Zod validators
│   └── derived/            Derived field helpers (if derived fields declared)
├── migrations/             SQL schemas, indexes, triggers, FK constraints
│   ├── <entity>.sql
│   ├── event_outbox.sql
│   └── api_keys.sql        (apikey auth domains only)
├── openapi.json            OpenAPI 3.0 schema
├── Dockerfile
├── docker-compose.yaml     Postgres + Redis for local dev
├── k8s/deployment.yaml     Kubernetes deployment manifest
├── .github/workflows/      CI/CD pipeline
└── src/tests.ts            Generated regression tests
```

---

## Language Features

### Entities

Stateful data objects with fields, constraints, state machines, and relations.

```bone
entity Order {
  owns: [buyer_id: uuid, total: uint, status: string]
  constraints: [total > 0, status in ["pending", "paid", "shipped"]]
  states: pending -> paid -> shipped -> delivered | cancelled
  relation buyer: belongs_to User
}
```

Auto-generated fields on every entity: `id: uuid`, `created_at: timestamp`, `updated_at: timestamp`.

### Capabilities

Named operations with preconditions, effects, and event emissions.

```bone
capability ship_order(seller: Seller, order: Order) {
  requires: [order.status == "paid", order.seller_id == seller.id]
  effects: [order.status = "shipped"]
  emits: OrderShipped
  sync: transactional
  timeout: 10s
  retry: { max_attempts: 3, backoff: exponential, interval: 1s }
}
```

`sync` modes: `transactional` (BEGIN/COMMIT), `eventual` (outbox), `realtime` (WebSocket broadcast), `batch` (queued).

### Events

Immutable records with delivery guarantees.

```bone
event OrderShipped {
  payload: { order_id: uuid, shipped_at: timestamp }
  delivery: exactly_once   // transactional outbox + deduplication
  ttl: 30d
}
```

### Channels

Real-time WebSocket communication with optional filter predicates.

```bone
channel game_lobby {
  transport: websocket
  ordering: causal
  participants: set<Player>
  persistence: last_100
  filter: event.room_id == participant.room_id
}
```

### Stores

Explicit persistence declarations that generate SQL migrations.

```bone
store AuditLog {
  engine: postgresql
  schema: {
    actor_id: uuid,
    action: string,
    occurred_at: timestamp
  }
  retention: 90d
}
```

Supported engines: `postgresql`, `redis`.

### Pipelines

Multi-step operations with automatic rollback.

```bone
capability checkout(buyer: Buyer, cart: Cart) {
  pipeline: {
    validate_inventory(cart)
    charge_payment(buyer, cart.total) as payment
    create_order(buyer, cart, payment)
    on_error: rollback
  }
  sync: transactional
}
```

### Flows (Sagas)

Multi-service orchestration with backward compensation.

```bone
flow place_order {
  step reserve: reserve_inventory(order)
    compensate: release_inventory(order)
  step charge: charge_buyer(order)
    compensate: refund_buyer(order)
  step notify: send_confirmation(order)
}
```

### Algorithms

Named implementations from a built-in catalog.

```bone
capability find_route(start: string, end: string) {
  algorithm: shortest_path using { graph: road_network, source: start, target: end }
  returns: json
}
```

Available: `shortest_path`, `topological_sort`, `binary_search`, `bipartite_matching`, `round_robin`, `weighted_average`, `percentile`, `rank_by`, `consistent_hash`.

### Extension Points

Escape hatches for custom logic that survive recompilation.

```bone
extension_point calculate_fee(order: Order) {
  returns: uint
  stable: true   // compilation fails if not implemented
}
```

---

## Auth Strategies

Selected automatically based on domain. Override with `auth:` on any entity.

| Strategy | Trigger | Generated code |
|----------|---------|----------------|
| `jwt` | default / `multiplayer_game` / `realtime_collaboration` | Bearer token middleware, `issueToken()` helper |
| `oauth2` | `saas_platform` / `marketplace` / `social_network` | Full Authorization Code + PKCE flow, `/auth/login`, `/auth/callback`, `/auth/refresh`, `/auth/logout` |
| `apikey` | `iot_system` | `X-API-Key` header, SHA-256 hashed keys, LRU cache, `/auth/keys` CRUD routes, `api_keys.sql` migration |

---

## Commands

| Command | Description |
|---------|-------------|
| `bonec compile <file>` | Full 7-stage compilation → runnable project |
| `bonec check <file>` | Validate without generating code |
| `bonec fmt <file>` | Format in place |
| `bonec watch <file>` | Recompile on save |
| `bonec init <name> --domain <d>` | Scaffold from a domain template |
| `bonec diff <old> <new>` | Show schema migration diff |
| `bonec test [output-dir]` | Run generated regression tests |
| `bonec debug <file>` | Generate source maps |
| `bonec ir <file>` | Print the IR as JSON |
| `bonec lex <file>` | Print the token stream |
| `bonec parse <file>` | Print the AST |
| `bonec verify-determinism <file>` | Confirm two compilations are identical |

### Domain Templates

`bonec init my-app --domain <name>`

| Domain | Auth | Sync |
|--------|------|------|
| `multiplayer_game` | JWT | realtime |
| `saas_platform` | OAuth2 | eventual |
| `iot_system` | API key | eventual |
| `social_network` | OAuth2 | eventual |
| `marketplace` | OAuth2 | transactional |
| `realtime_collaboration` | JWT | realtime |

---

## Type Errors

The compiler reports structured errors with codes:

| Code | Meaning |
|------|---------|
| T001 | Undefined type reference |
| T003 | Type mismatch in assignment |
| T005 | Expression must type to bool |
| T006 | Undeclared parameter type |
| T008 | Invalid set/numeric operator |
| T009 | Duplicate field name |
| T010 | Undefined state in transition |
| T011 | Emitted event not declared |
| T012 | Flow has fewer than 2 steps |
| T013 | Entity name used as capability call |
| T014 | Unsupported store engine |
| T015 | Invalid policy value |

---

## Compilation Pipeline

Every stage is deterministic — same `.bone` file always produces bitwise-identical output.

```
.bone source
    ↓ Lex          tokens
    ↓ Parse        AST (with error recovery)
    ↓ Type Check   validated AST + structured errors
    ↓ Lower        Architecture IR
    ↓ Optimize     dead module elimination, deduplication
    ↓ Solve        constraint propagation → concrete decisions
    ↓ Emit         TypeScript + SQL + YAML + JSON
    ↓ Verify       IR consistency + generated code checks
```

---

## Programmatic API

```typescript
import { compile } from "bonescript-compiler";

const { files, errors, warnings } = await compile(`
  system Shop {
    entity Product { owns: [name: string, price: uint] }
  }
`);

for (const file of files) {
  console.log(file.path, file.language);
}
```

Individual pipeline stages are also exported:

```typescript
import {
  Lexer, Parser, TypeChecker,
  Lowering, optimize, ConstraintSolver,
  FullEmitter, Verifier, Formatter,
  scaffold, ModuleLoader,
} from "bonescript-compiler";
```

---

## VS Code Extension

Install from the repo:

```bash
.\install-extension.ps1
```

Features: real-time diagnostics, context-aware completions, hover docs, go-to-definition, document outline, signature help, quick fixes for all error codes, cross-file rename.

---

## Contributing

Issues and PRs welcome at [github.com/Doorman11991/BoneScript](https://github.com/Doorman11991/BoneScript).

```bash
cd compiler
npm test                  # run all tests
npm run test:jest:unit    # lexer, parser, typechecker
npm run test:jest:integration  # emitter, integration
```
