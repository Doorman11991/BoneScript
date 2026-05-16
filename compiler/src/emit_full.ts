/**
 * BoneScript Full Emitter Ã¢â‚¬â€ Produces a complete, runnable project.
 * Combines schema generation with runtime service code.
 */

import * as IR from "./ir";
import { Emitter, EmittedFile } from "./emitter";
import {
  emitPackageJson,
  emitTsConfig,
  emitDbClient,
  emitAuthMiddleware,
  emitEntityRouter,
  emitStateMachineRuntime,
  emitIndex,
  emitMigration,
} from "./emit_runtime";
import { emitWebSocketServer } from "./emit_websocket";
import {
  emitLogger,
  emitMetrics,
  emitHealthChecks,
  emitFailureRules,
  emitMigrationDiff,
} from "./emit_maintenance";
import { emitFlowRuntime } from "./emit_extras";
import { emitAlgorithmsFile, collectUsedAlgorithms } from "./emit_composition";
import { emitExtensionPointStub } from "./extension_manager";
import * as AST from "./ast";
import { emitDurableEventBus, emitOutboxSchema } from "./emit_events";
import { emitBatchExecutor } from "./emit_batch";
import { emitSourceMapFile, emitDebugHandler } from "./emit_sourcemap";
import { emitTestSuite } from "./emit_tests";
import { emitDockerfile, emitDockerignore, emitK8sDeployment, emitGithubActions } from "./emit_deploy";
import { emitOpenApiSpec } from "./emit_openapi";
import { emitTypescriptSdk } from "./emit_sdk";
import { emitReactHooks } from "./emit_react";
import { emitZodSchemas } from "./emit_zod";
import { emitPostmanCollection } from "./emit_postman";
import { emitSeedFile } from "./emit_seed";
import { emitAuditSchema, emitAuditMiddleware } from "./emit_audit";
import { emitAdminPanel } from "./emit_admin";
import { emitNotifyService } from "./emit_notify";
import { emitCronJobs } from "./emit_cron";
import { emitGraphQLSchema } from "./emit_graphql";

function toSnakeCase(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

export interface FullEmitterOptions {
  noSdk?: boolean;
  noOpenApi?: boolean;
  noSeed?: boolean;
}

export class FullEmitter {
  private schemaEmitter = new Emitter();

  emit(system: IR.IRSystem, options: FullEmitterOptions = {}): EmittedFile[] {
    const files: EmittedFile[] = [];

    // 1. Package files
    files.push({ path: "package.json", content: emitPackageJson(system), language: "json", source_module: "root" });
    files.push({ path: "tsconfig.json", content: emitTsConfig(), language: "json", source_module: "root" });
    files.push({ path: ".env.example", content: this.emitEnvExample(system), language: "yaml", source_module: "root" });

    // 2. Source: infrastructure
    files.push({ path: "src/db.ts", content: emitDbClient(system), language: "typescript", source_module: "infra" });
    // Durable event bus replaces the old in-process stub
    files.push({ path: "src/events.ts", content: emitDurableEventBus(system), language: "typescript", source_module: "infra" });
    // Outbox SQL schema
    files.push({ path: "migrations/event_outbox.sql", content: emitOutboxSchema(), language: "sql", source_module: "infra" });
    files.push({ path: "src/auth.ts", content: emitAuthMiddleware(system), language: "typescript", source_module: "infra" });
    files.push({ path: "src/logger.ts", content: emitLogger(system), language: "typescript", source_module: "infra" });
    files.push({ path: "src/metrics.ts", content: emitMetrics(), language: "typescript", source_module: "infra" });
    files.push({ path: "src/health.ts", content: emitHealthChecks(system), language: "typescript", source_module: "infra" });
    files.push({ path: "src/failure_rules.ts", content: emitFailureRules(system), language: "typescript", source_module: "infra" });

    // 2a. WebSocket server (only if there are realtime channels)
    const wsContent = emitWebSocketServer(system);
    if (wsContent) {
      files.push({ path: "src/websocket.ts", content: wsContent, language: "typescript", source_module: "infra" });
    }

    // 2b. Flow saga runtime (only if there are flows)
    const flowContent = emitFlowRuntime(system);
    if (flowContent) {
      files.push({ path: "src/flows.ts", content: flowContent, language: "typescript", source_module: "infra" });
    }

    // 2b2. Batch executor (only if there are batch capabilities)
    const batchContent = emitBatchExecutor(system);
    if (batchContent) {
      files.push({ path: "src/batch.ts", content: batchContent, language: "typescript", source_module: "infra" });
    }

    // 2c. Migration diff utility (always emitted)
    files.push({ path: "src/migration_diff.ts", content: emitMigrationDiff(), language: "typescript", source_module: "infra" });

    // 2d. Algorithm implementations (only what's used)
    const usedAlgorithms = collectUsedAlgorithms(system);
    if (usedAlgorithms.size > 0) {
      const algoContent = emitAlgorithmsFile(usedAlgorithms);
      files.push({ path: "src/algorithms.ts", content: algoContent, language: "typescript", source_module: "algorithms" });
    } else {
      files.push({
        path: "src/algorithms.ts",
        content: "// No algorithms used in this system.\nexport {};\n",
        language: "typescript",
        source_module: "algorithms",
      });
    }

    // 2e. Extension points (escape hatches — preserved across recompilation)
    if (system.extension_points && system.extension_points.length > 0) {
      const extLines: string[] = [
        "// Generated by BoneScript compiler.",
        "// Extension points: implement the functions below.",
        "// Code between sentinel comments is preserved on recompile.",
        "// DO NOT remove the sentinel comments.",
        "",
      ];
      for (const ep of system.extension_points) {
        const params = ep.params.map((p: { name: string; type: string }) => `${p.name}: ${p.type}`).join(", ");
        const returnType = ep.returns || "void";
        extLines.push(`/**`);
        extLines.push(` * Extension point: ${ep.name}`);
        extLines.push(` * ${ep.stable ? "STABLE: implementation required." : "Optional."}`);
        extLines.push(` */`);
        extLines.push(`export function ${ep.name}(${params}): ${returnType} {`);
        extLines.push(`  // <bonescript:ext:${ep.name}:begin>`);
        extLines.push(`  throw new Error("Not implemented: ${ep.name}");`);
        extLines.push(`  // <bonescript:ext:${ep.name}:end>`);
        extLines.push(`}`);
        extLines.push("");
      }
      files.push({
        path: "src/extensions.ts",
        content: extLines.join("\n"),
        language: "typescript",
        source_module: "extensions",
      });
    }

    // 3. Source: state machines
    for (const mod of system.modules) {
      for (const sm of mod.state_machines) {
        files.push({
          path: `src/state_machines/${toSnakeCase(sm.entity)}.ts`,
          content: emitStateMachineRuntime(sm),
          language: "typescript",
          source_module: mod.id,
        });
      }
    }

    // 4. Source: route files (CRUD + capabilities)
    for (const mod of system.modules) {
      if (mod.kind === "api_service" && mod.models.length > 0) {
        const content = emitEntityRouter(mod, system);
        if (content) {
          files.push({
            path: `src/routes/${toSnakeCase(mod.models[0].name)}.ts`,
            content,
            language: "typescript",
            source_module: mod.id,
          });
        }
      }
    }

    // 5. Source: main entry point
    files.push({ path: "src/index.ts", content: emitIndex(system), language: "typescript", source_module: "root" });

    // 6. SQL migrations — run schema emitter ONCE, then match by model name.
    // Multiple modules (e.g. an api_service AND its backing data_store) can
    // reference the same model. We dedupe by output path so each table only
    // appears once in migrations/ and once in the migrate.ts blocks list.
    const schemas: string[] = [];
    const seenPaths = new Set<string>();
    const allSchemaFiles = this.schemaEmitter.emit(system);
    for (const mod of system.modules) {
      if (mod.kind === "data_store" || mod.kind === "api_service") {
        for (const model of mod.models) {
          const schemaFile = allSchemaFiles.find(f => f.path.includes(toSnakeCase(model.name)) && f.language === "sql");
          if (schemaFile) {
            const targetPath = `migrations/${schemaFile.path.replace("schema/", "")}`;
            if (seenPaths.has(targetPath)) continue;
            seenPaths.add(targetPath);
            files.push({ ...schemaFile, path: targetPath });
            schemas.push(schemaFile.content);
          }
        }
      }
    }

    // 7. Migration runner
    files.push({ path: "src/migrate.ts", content: emitMigration(system, schemas), language: "typescript", source_module: "infra" });

    // 8. Docker compose for local dev
    files.push({ path: "docker-compose.yaml", content: this.emitDockerCompose(system), language: "yaml", source_module: "infra" });

    // 9. README
    files.push({ path: "README.md", content: this.emitReadme(system), language: "yaml", source_module: "root" });

    // 12. OpenAPI spec
    if (!options.noOpenApi) {
      files.push({ path: "openapi.yaml", content: emitOpenApiSpec(system), language: "yaml", source_module: "docs" });
      // GraphQL schema (alongside openapi)
      files.push({ path: "schema.graphql", content: emitGraphQLSchema(system), language: "yaml", source_module: "docs" });
    }

    // 13. TypeScript SDK
    if (!options.noSdk) {
      files.push({ path: "sdk/client.ts", content: emitTypescriptSdk(system), language: "typescript", source_module: "sdk" });
      // React hooks layered on top of the SDK
      files.push(emitReactHooks(system));
    }

    // 14. Zod schemas
    files.push({ path: "src/schemas.ts", content: emitZodSchemas(system), language: "typescript", source_module: "validation" });

    // 15. Postman collection
    if (!options.noOpenApi) {
      files.push({ path: `${system.name}.postman_collection.json`, content: emitPostmanCollection(system), language: "json", source_module: "docs" });
    }

    // 16. Seed file
    if (!options.noSeed) {
      files.push({ path: "src/seed.ts", content: emitSeedFile(system), language: "typescript", source_module: "dev" });
    }

    // 17. Audit log
    files.push({ path: "migrations/audit_log.sql", content: emitAuditSchema(), language: "sql", source_module: "infra" });
    files.push({ path: "src/audit.ts", content: emitAuditMiddleware(system), language: "typescript", source_module: "infra" });

    // 18. Notification service
    files.push({ path: "src/notify.ts", content: emitNotifyService(system), language: "typescript", source_module: "infra" });

    // 19. Cron jobs
    files.push({ path: "src/cron.ts", content: emitCronJobs(system), language: "typescript", source_module: "infra" });

    // 18. Admin panel
    files.push({ path: "admin/index.html", content: emitAdminPanel(system), language: "yaml", source_module: "admin" });

    // 10. Source map + debug handler
    files.push({ path: `${system.name}.bone.map`, content: emitSourceMapFile(system, `${system.name}.bone`), language: "json", source_module: "root" });
    files.push({ path: "src/debug.ts", content: emitDebugHandler(system), language: "typescript", source_module: "infra" });
    files.push({ path: "src/tests.ts", content: emitTestSuite(system), language: "typescript", source_module: "tests" });

    // 11. Deploy targets
    files.push({ path: "Dockerfile", content: emitDockerfile(system), language: "yaml", source_module: "deploy" });
    files.push({ path: ".dockerignore", content: emitDockerignore(), language: "yaml", source_module: "deploy" });
    files.push({ path: "k8s/deployment.yaml", content: emitK8sDeployment(system), language: "yaml", source_module: "deploy" });
    files.push({ path: ".github/workflows/ci.yaml", content: emitGithubActions(system), language: "yaml", source_module: "deploy" });

    return files;
  }

  private emitEnvExample(system: IR.IRSystem): string {
    return `# ${system.name} Environment Variables
# Copy this file to .env and fill in real values. Never commit .env to source control.

# --- Required in production ---
# Generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=

# --- Database ---
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/${toSnakeCase(system.name)}

# --- Redis (optional, used by some domain templates) ---
REDIS_URL=redis://localhost:6379

# --- Server ---
PORT=3000
NODE_ENV=development

# --- CORS ---
# Comma-separated list of allowed origins. Leave empty to disallow all cross-origin requests.
# Example: ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
ALLOWED_ORIGINS=

# --- Event delivery mode ---
# in_process: in-memory, fast, no durability guarantees (default for development)
# durable: Postgres-backed transactional outbox (recommended for production)
EVENT_MODE=in_process
EVENT_WORKER_INTERVAL_MS=1000

# --- Request timeout ---
REQUEST_TIMEOUT_MS=30000

# --- Notifications ---
# NOTIFY_PROVIDER=log|resend|sendgrid|webhook (default: log)
NOTIFY_PROVIDER=log
NOTIFY_API_KEY=
NOTIFY_FROM_EMAIL=noreply@example.com

# --- Webhook delivery (only when NOTIFY_PROVIDER=webhook) ---
# Endpoint that receives event payloads as application/json POST.
NOTIFY_WEBHOOK_URL=
# Optional HMAC-SHA256 secret. When set, requests include
# 'X-BoneScript-Signature: <hex digest>' so receivers can verify integrity.
NOTIFY_WEBHOOK_SECRET=
`;
  }

  private emitDockerCompose(system: IR.IRSystem): string {
    return `# Generated by BoneScript compiler.
version: "3.8"

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${toSnakeCase(system.name)}
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pgdata:
`;
  }

  private emitReadme(system: IR.IRSystem): string {
    const apiModules = system.modules.filter(m => m.kind === "api_service");
    const routes = apiModules
      .filter(m => m.models.length > 0)
      .map(m => `- \`/${toSnakeCase(m.models[0].name)}s\` Ã¢â‚¬â€ ${m.name}`)
      .join("\n");

    return `# ${system.name}

Generated by BoneScript compiler. Source hash: ${system.source_hash}

## Quick Start

\`\`\`bash
# Start dependencies
docker compose up -d

# Install
npm install

# Run migrations
npm run migrate

# Start server
npm run dev
\`\`\`

## API Routes

${routes}

Each route supports:
- \`GET /\` Ã¢â‚¬â€ List (paginated)
- \`GET /:id\` Ã¢â‚¬â€ Read
- \`POST /\` Ã¢â‚¬â€ Create
- \`PUT /:id\` Ã¢â‚¬â€ Update
- \`DELETE /:id\` Ã¢â‚¬â€ Delete

Plus capability-specific endpoints.

## Auth

Send a Bearer token in the Authorization header:
\`\`\`
Authorization: Bearer <jwt-token>
\`\`\`

## Environment

Copy \`.env.example\` to \`.env\` and configure.
`;
  }
}
