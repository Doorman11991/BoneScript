# BoneScript

A formal declarative language that compiles structured system declarations into
deterministic, runnable backend code (TypeScript services, SQL schemas, infrastructure configs).

You write the bones of your system. BoneScript compiles them to a working backend.

## Status: v0.2.0

Working pipeline: Lex → Parse → Type Check → Lower IR → Solve → Emit → Verify.
Output is a complete Node.js project that compiles and runs.

## Quick Start

```bash
# Install
cd compiler
npm install

# Scaffold a new project
npx ts-node src/cli.ts init my-project --domain saas_platform --out ../my-project

# Compile to runnable code
npx ts-node src/cli.ts compile ../my-project/my-project.bone

# The output is a real Node.js project — start it
cd ../my-project/output
npm install
docker compose up -d  # start postgres + redis
npm run migrate
npm run dev
```

## Commands

| Command | Description |
|---------|-------------|
| `bone compile <file>` | Full 7-stage compilation → runnable project |
| `bone check <file>` | Lex + parse + type check (no codegen) |
| `bone lex <file>` | Show token stream |
| `bone parse <file>` | Show AST as JSON |
| `bone ir <file>` | Show IR as JSON |
| `bone fmt <file>` | Format file in place |
| `bone watch <file>` | Recompile on change |
| `bone init <name>` | Scaffold new project |

### `init` Domains

Choose from:
- `multiplayer_game` — JWT auth, WebSocket, Redis sessions
- `saas_platform` — OAuth2, Postgres, eventual consistency
- `iot_system` — API keys, DynamoDB, gRPC streams
- `social_network` — OAuth2, Postgres + Redis, causal ordering
- `marketplace` — OAuth2, Postgres, transactional ACID
- `realtime_collaboration` — JWT, WebSocket, full persistence

## Editor Support

A VS Code extension is in `vscode-ext/` providing:
- Syntax highlighting (TextMate grammar)
- Real-time diagnostics (lex + parse + type errors as you type)
- Autocomplete with snippets for declarations, keywords, types
- Hover documentation for keywords
- Bracket matching and auto-closing

Backed by the LSP server in `lsp/`.

## Project Structure

```
spec/                       Language specification (10 documents)
compiler/                   Reference compiler
  src/
    lexer.ts                Tokenizer
    parser.ts               Strict parser
    parser_recovery.ts      Parser with error recovery
    parse_decls*.ts         Declaration parsers
    parse_expr.ts           Expression parser
    parse_types.ts          Type expression parser
    ast.ts                  AST definitions
    typechecker.ts          Type checker (Stage 3)
    types.ts                Internal type system
    ir.ts                   IR data structures
    lowering.ts             AST → IR (Stage 4)
    solver.ts               Constraint solver (Stage 5)
    emitter.ts              Schema/types emitter
    emit_runtime.ts         Runtime code emitter
    emit_full.ts            Full project emitter (Stage 6)
    emit_websocket.ts       WebSocket server emitter
    emit_maintenance.ts     Logger, metrics, health, failure rules
    emit_extras.ts          Saga runtime, derived fields, channel filters
    emit_composition.ts     Pipeline + algorithm emitters
    algorithm_catalog.ts    Closed catalog of named algorithms
    verifier.ts             Output verifier (Stage 7)
    module_loader.ts        Cross-file imports
    formatter.ts            Source formatter
    scaffold.ts             Project scaffolder
    cli.ts                  CLI entry point
lsp/                        Language Server Protocol server
vscode-ext/                 VS Code extension
examples/                   Example .bone programs
```

## Compilation Pipeline

| Stage | Name | Function |
|-------|------|----------|
| 1 | Lex | Source → tokens |
| 2 | Parse | Tokens → AST (with error recovery) |
| 3 | Type Check | Validate types, constraints, effects |
| 4 | Lower | AST → IR with deterministic IDs |
| 5 | Solve | Resolve underspecified variables via domain defaults |
| 6 | Emit | IR → TypeScript + SQL + YAML + JSON |
| 7 | Verify | Validate IR consistency and generated code |

Every stage is **deterministic**: same input always produces bitwise-identical output.

## Sample Program

```bone
system InventoryPlatform {
  domain: multiplayer_game

  entity Player {
    owns: [username: string, score: uint]
    constraints: [username.unique, score >= 0]
    states: active -> suspended | deleted
    auth: jwt
  }

  capability award_xp(player: Player, amount: uint) {
    requires: [amount > 0, player.state == "active"]
    effects: [player.score += amount]
    emits: PlayerLeveledUp
    sync: eventual
  }

  event PlayerLeveledUp {
    payload: { player_id: uuid, new_score: uint }
    delivery: at_least_once
    ttl: 30d
  }
}
```

## Tests

```bash
cd compiler
npx ts-node src/test.ts              # 6 tests (lexer + parser + determinism)
npx ts-node src/test_typechecker.ts  # 7 tests (type errors)
```
