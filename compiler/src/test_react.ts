/**
 * React hooks emitter tests.
 *
 * Verifies:
 *   - hooks file is emitted with the right shape
 *   - per-entity hooks are present (useList, use<E>, useCreate, useUpdate, useDelete)
 *   - capability hooks are present (useCapability<Name>)
 *   - emitted code passes tsc type-checking against installed react types
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { emitReactHooks } from "./emit_react";
import * as IR from "./ir";

let passed = 0;
let failed = 0;
function ok(name: string) { console.log("  v " + name); passed++; }
function fail(name: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.log("  x " + name + ": " + msg);
  failed++;
}

function buildSystem(): IR.IRSystem {
  const productModel: IR.IRModel = {
    name: "Product",
    fields: [
      { name: "id", type: "uuid", nullable: false, unique: true, indexed: true, default_value: null },
      { name: "name", type: "string", nullable: false, unique: false, indexed: false, default_value: null },
      { name: "price", type: "uint", nullable: false, unique: false, indexed: false, default_value: null },
      { name: "stock", type: "uint", nullable: false, unique: false, indexed: false, default_value: null },
    ],
    primary_key: "id", indexes: [], constraints: [],
  };

  const purchaseMethod: IR.IRMethod = {
    name: "purchase",
    input: [
      { name: "buyer_id", type: "uuid", nullable: false, unique: false, indexed: false, default_value: null },
      { name: "qty", type: "uint", nullable: false, unique: false, indexed: false, default_value: null },
    ],
    output: "json",
    preconditions: [], effects: [], emissions: [],
    idempotent: false, authenticated: true, timeout_ms: 5000,
    retry: null, pipeline: null, algorithm: null, sync: "transactional",
  };

  return {
    name: "Shop", version: "1.0.0", source_hash: "abc123", domain: "marketplace",
    modules: [
      {
        id: "Shop.api_service.ProductService",
        kind: "api_service",
        name: "ProductService",
        interfaces: [{ name: "ProductService", methods: [purchaseMethod] }],
        models: [productModel],
        events: [], state_machines: [], relations: [], dependencies: [],
        config: {},
      },
    ],
    events: [], flows: [], invariants: [], resolution: {}, extension_points: [],
  };
}

function run() {
  console.log("BoneScript React Hooks Tests\n");

  const system = buildSystem();
  const file = emitReactHooks(system);

  if (file.path === "sdk/react.ts") ok("Emitted at sdk/react.ts");
  else fail("Emit path", "got: " + file.path);

  const code = file.content;

  // ─── Surface checks ─────────────────────────────────────────────────────────
  for (const [feature, marker] of [
    ["ApiProvider", "export function ApiProvider"],
    ["ApiClient interface", "export interface ApiClient"],
    ["useApi hook", "function useApi"],
    ["QueryState", "export interface QueryState<T>"],
    ["MutationState", "export interface MutationState<TInput, TOutput>"],
    ["PaginatedResponse", "export interface PaginatedResponse<T>"],
    ["Product type", "export interface Product {"],
    ["useListProduct", "export function useListProduct()"],
    ["useProduct", "export function useProduct(id: string | null)"],
    ["useCreateProduct", "export function useCreateProduct()"],
    ["useUpdateProduct", "export function useUpdateProduct()"],
    ["useDeleteProduct", "export function useDeleteProduct()"],
    ["useCapabilityPurchase", "export function useCapabilityPurchase()"],
    ["fetch wrapper", "async function apiFetch"],
    ["Bearer token header", '"Bearer " + token'],
  ] as const) {
    if (code.includes(marker)) ok(feature + " is emitted");
    else fail(feature, "marker not found: " + marker);
  }

  // ─── Type-check the emitted code with tsc ──────────────────────────────────
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bonescript-react-test-"));
  try {
    fs.mkdirSync(path.join(tmp, "sdk"));
    fs.writeFileSync(path.join(tmp, "sdk", "react.ts"), code, "utf-8");

    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({
      name: "react-hooks-test",
      version: "1.0.0",
      private: true,
      dependencies: {
        react: "18.3.1",
        typescript: "5.6.3",
        "@types/react": "18.3.12",
      },
    }, null, 2), "utf-8");

    fs.writeFileSync(path.join(tmp, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        target: "ES2020",
        module: "commonjs",
        lib: ["ES2020", "DOM"],
        jsx: "react",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        noEmit: true,
      },
      include: ["sdk/**/*.ts"],
    }, null, 2), "utf-8");

    console.log("\n  (installing react + types — first run only)");
    execSync("npm install --silent --no-audit --no-fund", { cwd: tmp, stdio: "pipe" });
    ok("React + TypeScript installed");

    try {
      execSync("npx tsc --noEmit", { cwd: tmp, stdio: "pipe", encoding: "utf-8" });
      ok("Generated react.ts type-checks cleanly");
    } catch (e: any) {
      const out = (e.stdout || "") + (e.stderr || "");
      throw new Error("tsc errors:\n" + out.split("\n").slice(0, 30).join("\n"));
    }
  } catch (e) {
    fail("Type-check generated react.ts", e);
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }

  summary();
}

function summary() {
  console.log("\n" + "═".repeat(40));
  console.log("Results: " + passed + " passed, " + failed + " failed");
  console.log("═".repeat(40));
  if (failed > 0) process.exit(1);
}

run();
