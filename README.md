# BoneScript

[![npm](https://img.shields.io/npm/v/bonescript-compiler)](https://www.npmjs.com/package/bonescript-compiler)
[![license](https://img.shields.io/npm/l/bonescript-compiler)](https://github.com/dantheman181/bonescript/blob/main/compiler/LICENSE)

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

Run `bonec compile shop.bone` and get back a running Express API with PostgreSQL, JWT auth, state machine enforcement, transactional SQL, durable events, health checks, migrations, WebSocket support, a Dockerfile, and a GitHub Actions CI pipeline. No LLMs. Deterministic — same input always produces identical output.

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
# Edit .env — set JWT_SECRET to a random 48-byte hex string:
# node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 4. Run
cd my-app/output
npm install
docker compose up -d   # starts Postgres + Redis
npm run migrate
npm run dev
# → http://localhost:3000
```

## VS Code Extension

```bash
# Build and install in one step
.\install-extension.ps1
```

Open any `.bone` file and get:
- Real-time error highlighting (lex + parse + type check as you type)
- Context-aware completions — different suggestions inside `entity`, `capability`, `channel`, etc.
- Hover docs for every keyword and all your declared entities, capabilities, and events
- Go-to-definition for entity/capability/event references
- Document outline (Ctrl+Shift+O)
- Signature help when typing capability calls
- Quick fixes for common errors

---

## What Gets Generated

From a single `.bone` file, the compiler produces a complete Node.js project:

```
output/
├── src/
│   ├── index.ts          Express server with all routes wired
│   ├── db.ts             Postgres connection pool
│   ├── events.ts         Durable event bus (transactional outbox)
│   ├── auth.ts           JWT middleware
│   ├── health.ts         /health/live, /health/ready, /health/metrics
│   ├── logger.ts         Structured logging (spec/10 schema)
│   ├── metrics.ts        Prometheus-style counters/histograms
│   ├── failure_rules.ts  Rule-based remediation (no ML)
│   ├── flows.ts          Saga runtime with backward compensation
│   ├── websocket.ts      WebSocket server (if channels declared)
│   ├── routes/           One file per entity — CRUD + capabilities
│   └── state_machines/   One file per entity with states
├── migrations/           SQL schemas with indexes, triggers, FK constraints
├── Dockerfile
├── docker-compose.yaml   Postgres + Redis for local dev
├── .github/workflows/    CI/CD pipeline
└── src/tests.ts          Generated regression tests
```

---

## Language Features

**Entities** — stateful data objects with fields, constraints, state machines, and relations

```bone
entity Order {
  owns: [buyer_id: uuid, total: uint, status: string]
  constraints: [total > 0, status in ["pending", "paid", "shipped"]]
  states: pending -> paid -> shipped -> delivered | cancelled
  relation buyer: belongs_to User
}
```

**Capabilities** — named operations with preconditions, effects, and event emissions

```bone
capability ship_order(seller: Seller, order: Order) {
  requires: [order.status == "paid", order.seller_id == seller.id]
  effects: [order.status = "shipped"]
  emits: OrderShipped
  sync: transactional
  timeout: 10s
}
```

**Events** — immutable records with delivery guarantees

```bone
event OrderShipped {
  payload: { order_id: uuid, shipped_at: timestamp }
  delivery: exactly_once   // transactional outbox + deduplication
  ttl: 30d
}
```

**Channels** — real-time WebSocket communication

```bone
channel game_lobby {
  transport: websocket
  ordering: causal
  participants: set<Player>
  persistence: last_100
}
```

**Pipelines** — multi-step operations with automatic rollback

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

**Algorithms** — named implementations from a closed catalog

```bone
capability find_route(start: string, end: string) {
  algorithm: shortest_path using { graph: road_network, source: start, target: end }
  returns: json
}
```

**Extension points** — escape hatches for custom logic that survive recompilation

```bone
extension_point calculate_fee(order: Order) {
  returns: uint
  stable: true   // compilation fails if not implemented
}
```

---

## Commands

| Command | Description |
|---------|-------------|
| `bonec compile <file>` | Full 7-stage compilation → runnable project |
| `bonec check <file>` | Validate without generating code |
| `bonec fmt <file>` | Format in place |
| `bonec watch <file>` | Recompile on save |
| `bonec init <name>` | Scaffold from a domain template |
| `bonec diff <old> <new>` | Show schema migration diff |
| `bonec test [output-dir]` | Run generated regression tests |
| `bonec debug <file>` | Generate source maps |
| `bonec verify-determinism <file>` | Confirm two compilations are identical |

### Domain Templates

`bonec init my-app --domain <name>`

| Domain | Auth | DB | Sync |
|--------|------|----|------|
| `multiplayer_game` | JWT | Postgres + Redis | realtime |
| `saas_platform` | OAuth2 | Postgres | eventual |
| `iot_system` | API key | DynamoDB | eventual |
| `social_network` | OAuth2 | Postgres + Redis | eventual |
| `marketplace` | OAuth2 | Postgres | transactional |
| `realtime_collaboration` | JWT | Postgres + Redis | realtime |

---

## Algorithm Catalog

Built-in algorithms available via `algorithm:` in any capability:

| Name | Category | Complexity |
|------|----------|------------|
| `shortest_path` | graph | O((V+E) log V) |
| `topological_sort` | graph | O(V+E) |
| `binary_search` | search | O(log n) |
| `bipartite_matching` | matching | O(E√V) |
| `round_robin` | scheduling | O(n) |
| `weighted_average` | stats | O(n) |
| `percentile` | stats | O(n log n) |
| `rank_by` | sort | O(n log n) |
| `consistent_hash` | crypto | O(N log N) build |

---

## Event Delivery

Two modes, switchable via environment variable:

```bash
EVENT_MODE=in_process   # default — in-memory, fast, no guarantees
EVENT_MODE=durable      # Postgres-backed transactional outbox
```

In durable mode:
- `at_least_once` — retried with exponential backoff until acknowledged
- `exactly_once` — deduplicated via `event_processed` table

---

## Compilation Pipeline

Every stage is deterministic — same `.bone` file always produces bitwise-identical output.

```
.bone source
    ↓ Lex          tokens
    ↓ Parse        AST (with error recovery)
    ↓ Type Check   validated AST
    ↓ Lower        Architecture IR
    ↓ Optimize     dead module elimination, deduplication
    ↓ Solve        constraint propagation → concrete decisions
    ↓ Emit         TypeScript + SQL + YAML + JSON
    ↓ Verify       IR consistency + generated code checks
```

---

## Tests

```bash
cd compiler
npm test
```

---

## Contributing

Issues and PRs welcome at [github.com/dantheman181/bonescript](https://github.com/dantheman181/bonescript).

---

## Project Structure

```
spec/           Language specification (10 formal documents)
compiler/       Reference compiler (TypeScript) — published as bonescript-compiler on npm
  src/          Source — lexer, parser, type checker, IR, emitters, CLI
  dist/         Compiled output
lsp/            Language Server Protocol server
vscode-ext/     VS Code extension
examples/       Example .bone programs
  inventory_platform.bone   Multiplayer inventory system
  delivery_platform.bone    Delivery routing with algorithms
  marketplace/shop.bone     Full marketplace with flows and relations
```

---

## Status

Published to npm as [`bonescript-compiler`](https://www.npmjs.com/package/bonescript-compiler). The compiler pipeline is complete and deterministic. The generated code compiles and runs. The VS Code extension provides real-time feedback. Tested against a real marketplace application.

Not yet: VS Code marketplace listing for the extension, end-to-end tests with a live database.
