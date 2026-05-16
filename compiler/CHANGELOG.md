# Changelog

All notable changes to `bonescript-compiler` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/).

## [0.6.1] - 2026-05-16

### Security
- **V-9** Hardened the generated notification service (`emit_notify.ts`).
  Event payloads are now HTML-escaped before being interpolated into email
  bodies so a payload value like `<script>...` cannot break out of the
  `<pre>` block. Recipient addresses are validated against a conservative
  regex that also rejects `\r` / `\n`, preventing header injection into the
  Resend / SendGrid request bodies.

### Repo hygiene
- Untracked `examples/*/output/node_modules/` from git. The vendor tree was
  historically committed; `.gitignore` already excluded it but the existing
  files remained in git history. The fresh `npm install` in the example now
  reports zero advisories, and Dependabot alerts against stale vendored
  versions clear up.
- Added this `CHANGELOG.md`.

## [0.6.0] - 2026-05-16

Twelve security fixes scored by priority and effort, plus DSL additions for
ownership predicates and field-level data classification. All 56 + 7 compiler
tests pass, deterministic compilation holds, the regenerated marketplace
example type-checks cleanly, and `npm audit` reports zero vulnerabilities.

### Added
- **`caller` built-in** for capability preconditions. Resolves to the
  authenticated actor's id (`auth.actor_id`) so the DSL can express ownership
  checks directly:
  ```bone
  capability publish_listing(seller: Seller, listing: Listing) {
    requires: [
      caller.id == seller.id,
      ...
    ]
  }
  ```
- **`@sensitive` field annotation.** Marks PII / secret fields so the audit
  middleware redacts them before persisting request bodies to
  `audit_log.payload`.
  ```bone
  entity Buyer {
    owns: [
      email: string @sensitive,
      payment_token: string @sensitive,
      ...
    ]
  }
  ```
- Generated `<Entity>CreateSchema` and `<Entity>UpdateSchema` Zod derivatives,
  wired into POST and PUT route handlers.
- `app.set('trust proxy', ...)` in the generated index, with a `TRUST_PROXY`
  environment override.

### Changed
- **JWT verification is now algorithm-pinned.** `jwt.verify(token, secret, {
  algorithms: ['HS256'], maxAge: '1h' })` plus a strict check that `decoded.sub`
  is a non-empty string. Closes the algorithm-confusion class of attacks.
- **WebSocket auth uses the same secret-loading rules as HTTP**: refuse-to-start
  in production if `JWT_SECRET` is unset, warn in dev, pin algorithms.
- **PUT routes derive an updatable-column allow-list** from the IR model and
  reject unknown keys with HTTP 400 `UNKNOWN_FIELDS`. Closes the
  SQL-identifier-injection path where `Object.keys(req.body)` was previously
  interpolated as identifiers into `UPDATE SET`.
- **Admin panel (`emit_admin.ts`) was rewritten** to use `createElement` and
  `textContent` for every API-derived value. All `innerHTML` and inline
  `onclick=` handlers removed. Closes the stored-XSS path that would have
  leaked the admin bearer token from `localStorage`.
- **Audit middleware now redacts** `@sensitive` fields plus an always-redact
  list of common credential names (`password`, `token`, `api_key`, `ssn`,
  `card_number`, etc.).
- **`/health/metrics` is now restricted** to a `METRICS_TOKEN` bearer or
  RFC1918 / loopback source IPs. Returns 403 otherwise.
- **`trace_id` is server-generated.** A client-supplied `X-Trace-Id` header is
  only honored if it parses as a UUID, preventing forged correlation IDs in
  audit and event records.
- **Dependency versions bumped** in `emitPackageJson`:
  - `express` 4.18.2 → 4.22.2 (CVE-2024-29041, qs / path-to-regexp DoS)
  - `ws` 8.16.0 → 8.18.0 (CVE-2024-37890)
  - `helmet` 7.1.0 → 8.0.0
  - `pg` 8.11.3 → 8.13.1
  - `ioredis` 5.3.2 → 5.4.1
  - `uuid` 9.0.0 → 10.0.0
  - `zod` (new) 3.23.8
  - Type packages bumped to match.

### Fixed
- Duplicate-emission of model schemas in `emit_zod.ts` — the same model
  appearing in both an `api_service` and its backing `data_store` module was
  being emitted twice, causing `Cannot redeclare block-scoped variable` errors.
  Same dedupe pattern as the previous fix in `emit_full.ts`.
- `getAuditLog()` was treating `query()`'s return value as `{ rows }` instead
  of the array it actually returns.
- `examples/marketplace/output/.env` was tracked in git despite being listed
  in `.gitignore`. Removed via `git rm --cached`.

### Notes for downstream consumers
- This release is the first to depend on `zod` in generated projects. Consumers
  who run `bonec compile` will see `zod` show up in their generated
  `package.json`.
- The `@renamed_from` and `@sensitive` annotations require parser support
  introduced in this release. `.bone` files using them will fail to parse on
  v0.5.x.
- The `caller` identifier in capability `requires:` clauses is a new built-in.
  If a `.bone` file already declared a parameter named `caller`, recompile
  carefully — the built-in shadows the parameter.

## [0.5.8] and earlier

See git history. Versions 0.5.4 → 0.5.8 were published in the v0.5 line and
are superseded by 0.6.0.

[0.6.1]: https://www.npmjs.com/package/bonescript-compiler/v/0.6.1
[0.6.0]: https://www.npmjs.com/package/bonescript-compiler/v/0.6.0
