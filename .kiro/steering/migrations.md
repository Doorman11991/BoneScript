---
inclusion: fileMatch
fileMatchPattern: 'migrate*'
---

# Schema migration policy

BoneScript is the source of truth for schema. The compiler emits SQL DDL for
each model and a small migration runner that applies them.

## How the runner works

`src/migrate.ts` (generated) tracks applied migrations in a `schema_migrations`
table:

| column       | purpose                                                  |
| ------------ | -------------------------------------------------------- |
| id           | stable identifier (e.g. `0000_sellers`, `manual_0007_*`) |
| checksum     | sha256 of the SQL block as compiled                      |
| applied_at   | timestamp of first successful apply                      |
| applied_by   | DB user that applied it                                  |
| duration_ms  | how long the apply took                                  |

Each block runs in its own transaction. If a block has already been recorded
with the same checksum it is skipped. If the checksum has drifted (someone
edited an already-applied schema) the runner refuses to proceed and asks for
an explicit migration instead.

## Adding new fields

1. Edit the `.bone` source.
2. Run `bonec compile <file>`. The compiler emits a fresh `migrate.ts` with the
   new schema as a new (or modified-checksum) block.
3. If the block is genuinely new (a brand new model), running `npm run migrate`
   will pick it up automatically.
4. If the block modifies an existing already-applied table, the runner will
   refuse to re-apply. Generate an explicit migration:

   ```
   bonec diff old_version.bone new_version.bone --write ./output
   ```

   This writes a numbered file to `output/migrations/_manual/` which the runner
   picks up on the next `npm run migrate`.

## Renaming columns

Use the `@renamed_from(old_name)` annotation in the field declaration:

```bone
entity Seller {
  owns: [
    full_name: string @renamed_from(name),
    ...
  ]
}
```

`bonec diff` translates this into `ALTER TABLE ... RENAME COLUMN`, preserving
data instead of dropping and re-adding the column.

## Removing columns and tables

The diff tool emits warnings, not destructive DDL. Drop columns or tables by
hand-editing the generated migration file (or writing your own under
`migrations/_manual/`). This is intentional so a typo in `.bone` source does
not silently delete production data.

## When to outgrow the built-in runner

The built-in runner is intentionally small. Move to a battle-tested tool when:

- You need to roll back specific migrations (the built-in runner is forward-only)
- Multiple developers need concurrent migration authoring with merge conflict
  resolution
- You want migration squashing or replay against fresh databases for tests

Suggested replacements that work well alongside BoneScript-generated SQL:

- [`node-pg-migrate`](https://www.npmjs.com/package/node-pg-migrate) — JS-native,
  reads files from `migrations/`, supports up/down. Drop the BoneScript
  migrations into its directory layout and let it manage the ledger.
- [`dbmate`](https://github.com/amacneil/dbmate) — language-agnostic Go binary,
  works well in CI.
- [Prisma Migrate](https://www.prisma.io/migrate) or
  [Atlas](https://atlasgo.io/) — heavier, but handle declarative-to-imperative
  conversion close to what BoneScript does.

When migrating to one of these, treat BoneScript as the schema generator and
the external tool as the apply/rollback engine. Stop generating `migrate.ts`
by removing the relevant entry from `emit_full.ts`, or leave it disabled.


## Field annotations

Two annotations are recognized after a field declaration:

- `@renamed_from(old_name)` — tells `bonec diff` to emit `ALTER TABLE ... RENAME
  COLUMN` instead of drop + add. Preserves data across renames.
- `@sensitive` — marks a field as PII or secret. The generated audit middleware
  redacts these fields before persisting the request body to `audit_log.payload`.
  A built-in always-redact list also covers `password`, `token`, `secret`,
  `api_key`, `ssn`, `card_number`, etc.

Example:

```bone
entity Buyer {
  owns: [
    name: string,
    email: string @sensitive,
    payment_token: string @sensitive,
    balance: uint
  ]
}
```
