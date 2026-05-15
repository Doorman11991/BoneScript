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

  policy api_security {
    rate_limit: 100 per 1m
    audit: true
  }
}
```

Run `bonec compile shop.bone` and get back a complete project: Express API, PostgreSQL migrations, JWT auth, state machine enforcement, transactional SQL, durable events, health checks, WebSocket support, OpenAPI spec, TypeScript SDK, Zod schemas, Postman collection, GraphQL schema, seed file, audit log, cron stubs, notification service, admin panel, Dockerfile, and GitHub Actions CI. No LLMs. Deterministic — same input always produces identical output.

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
# Edit .env — set JWT_SECRET:
# node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 4. Run
cd my-app/output
npm install
docker compose up -d   # starts Postgres + Redis
npm run migrate
npm run dev
# → http://localhost:3000
# → http://localhost:3000/admin  (admin panel)
```

### Nakama target (game backends)

```bash
bonec compile game.bone --target nakama
cd output-nakama && npm install && npm run build
# Copy build/ to your Nakama runtime path
```

---

## What Gets Generated

From a single `.bone` file, `bonec compile` produces a complete project:

```
output/
├── src/
│   ├── index.ts            Express server, all routes wired
│   ├── db.ts               Postgres connection pool
│   ├── events.ts           Durable event bus (transactional outbox)
│   ├── auth.ts             JWT middleware
│   ├── audit.ts            Audit log middleware + query helper
│   ├── notify.ts           Email notification service (Resend/SendGrid/log)
│   ├── cron.ts             Scheduled job stubs (node-cron)
│   ├── schemas.ts          Zod v3 validation schemas
│   ├── health.ts           /health/live, /health/ready, /health/metrics
│   ├── logger.ts           Structured logging
│   ├── metrics.ts          Prometheus-style counters/histograms
│   ├── failure_rules.ts    Rule-based remediation
│   ├── flows.ts            Saga runtime with compensation
│   ├── websocket.ts        WebSocket server (if channels declared)
│   ├── seed.ts             Database seed script
│   ├── routes/             One file per entity — CRUD + capabilities
│   └── state_machines/     One file per entity with states
├── sdk/
│   └── client.ts           Typed TypeScript fetch client
├── admin/
│   └── index.html          Self-contained admin panel (no build step)
├── migrations/             SQL schemas, indexes, triggers, FK constraints
│   ├── audit_log.sql       Audit log table
│   └── event_outbox.sql    Durable event outbox
├── openapi.yaml            OpenAPI 3.0.3 spec
├── schema.graphql          GraphQL schema
├── {Name}.postman_collection.json
├── Dockerfile
├── docker-compose.yaml     Postgres + Redis for local dev
├── .github/workflows/      CI/CD pipeline
└── src/tests.ts            Generated regression tests
```

### Compile flags

```bash
bonec compile <file> [options]

--target express     Express/PostgreSQL output (default)
--target nakama      Nakama TypeScript runtime output

--no-sdk             Skip sdk/client.ts generation
--no-openapi         Skip openapi.yaml, schema.graphql, Postman collection
--no-seed            Skip src/seed.ts generation
```

---

## Language Features

**Entities** — stateful data objects with fields, constraints, state machines, and relations

```bone
entity Order {
  owns: [buyer_id: uuid, total: uint, status: string]
  constraints: [total > 0, status in ["pending", "paid", "shipped"]]
  states: pending -> paid -> shipped -> delivered | cancelled
  auth: jwt
  relation buyer: belongs_to User
  index: [buyer_id, status]
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
  retry: { max_attempts: 3, backoff: exponential, interval: 1s }
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

**Policies** — rate limiting and audit logging, wired automatically into routes

```bone
policy api_security {
  rate_limit: 100 per 1m
  access: [user, admin]
  audit: true
  encryption: both
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
| `bonec compile <file> --target nakama` | Compile to Nakama TypeScript runtime |
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
| `multiplayer_game` | JWT | Postgres + Redis | realtime / nakama |
| `saas_platform` | OAuth2 | Postgres | eventual |
| `iot_system` | API key | DynamoDB | eventual |
| `social_network` | OAuth2 | Postgres + Redis | eventual |
| `marketplace` | OAuth2 | Postgres | transactional |
| `realtime_collaboration` | JWT | Postgres + Redis | realtime |

---

## Generated Output Details

### Admin Panel (`admin/index.html`)

A self-contained admin UI — no build step, no dependencies beyond a Tailwind CDN link. Open it directly in a browser pointed at your running API. Features:

- Sidebar navigation per entity
- Paginated data table with type-aware column rendering
- Create/Edit modal with auto-generated form fields
- Delete with confirmation
- Capability buttons that POST to capability endpoints
- Bearer token auth stored in localStorage
- API URL configurable via `<meta name="bonescript-api-url">` tag

### TypeScript SDK (`sdk/client.ts`)

A typed fetch client for your frontend. Zero dependencies.

```typescript
import { ShopClient } from "./sdk/client";

const client = new ShopClient("http://localhost:3000", () => localStorage.getItem("token"));

const products = await client.listProduct();
const product = await client.createProduct({ name: "Widget", price: 999, stock: 100 });
await client.purchase({ product_id: product.id, qty: 1 });
```

### Zod Schemas (`src/schemas.ts`)

Runtime validation schemas for all models and capability inputs, with constraint mapping.

```typescript
import { ProductSchema, ShopServicePurchaseInputSchema } from "./schemas";

const validated = ProductSchema.parse(req.body);
const input = ShopServicePurchaseInputSchema.parse(req.body);
```

### Notification Service (`src/notify.ts`)

Pluggable email notifications on event emissions. Set `NOTIFY_PROVIDER=resend` or `sendgrid` in `.env` and implement recipient lookup.

### Cron Jobs (`src/cron.ts`)

Commented-out `node-cron` stubs for each `sync: batch` capability. Uncomment and configure schedules as needed.

### Audit Log (`migrations/audit_log.sql` + `src/audit.ts`)

Automatically applied to routes on modules with `audit: true` in their policy. Records actor, action, entity type/id, payload, IP, and user agent.

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

## Algorithm Catalog

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
    ↓ Emit         TypeScript + SQL + YAML + JSON + HTML
    ↓ Verify       IR consistency + generated code checks
```

---

## VS Code Extension

```bash
.\install-extension.ps1
```

Open any `.bone` file and get real-time error highlighting, context-aware completions, hover docs, go-to-definition, document outline, signature help, and quick fixes.

---

## Tests

```bash
cd compiler
npm test
```

---

## Project Structure

```
spec/           Language specification (10 formal documents)
compiler/       Reference compiler (TypeScript) — bonescript-compiler on npm
  src/          Lexer, parser, type checker, IR, 15+ emitters, CLI
  dist/         Compiled output
lsp/            Language Server Protocol server
vscode-ext/     VS Code extension
examples/       Example .bone programs
```

---

## Status

Published to npm as [`bonescript-compiler`](https://www.npmjs.com/package/bonescript-compiler) v0.5.8.

The compiler pipeline is complete and deterministic. All generated code compiles and runs. The VS Code extension provides real-time feedback.

Not yet: VS Code marketplace listing, end-to-end tests with a live database.
