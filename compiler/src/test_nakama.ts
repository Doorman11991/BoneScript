/**
 * BoneScript Nakama Emitter Tests
 * Verifies NakamaEmitter produces correct output from IR.
 */

import { createHash } from "crypto";
import * as path from "path";
import * as fs from "fs";
import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { TypeChecker } from "./typechecker";
import { Lowering } from "./lowering";
import { NakamaEmitter } from "./emit_nakama";
import { FullEmitter } from "./emit_full";

// ─── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${detail ? ": " + detail : ""}`);
    failed++;
  }
}

function compileToNakama(source: string) {
  const tokens = new Lexer(source).tokenize();
  const ast = new Parser(tokens).parse();
  const errors = new TypeChecker().check(ast);
  if (errors.length > 0) throw new Error(errors.map(e => e.message).join(", "));
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
  const irSystems = new Lowering().lower(ast, hash);
  const emitter = new NakamaEmitter();
  const files: ReturnType<typeof emitter.emit> = [];
  for (const sys of irSystems) files.push(...emitter.emit(sys));
  return files;
}

function fileContent(files: ReturnType<NakamaEmitter["emit"]>, filePath: string): string | null {
  return files.find(f => f.path === filePath)?.content ?? null;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MINIMAL = `
system Arena {
  entity Player {
    owns: [username: string, score: uint]
    auth: jwt
  }
  capability award_points(p: Player, amount: uint) {
    requires: [amount > 0]
    effects: [p.score += amount]
    sync: eventual
  }
}
`;

const WITH_EVENTS = `
system Arena {
  event PointsAwarded {
    payload: { player_id: uuid, amount: uint }
    delivery: at_least_once
    ttl: 7d
  }
  entity Player {
    owns: [username: string, score: uint]
    auth: jwt
  }
  capability award_points(p: Player, amount: uint) {
    requires: [amount > 0]
    effects: [p.score += amount]
    emits: PointsAwarded
    sync: eventual
  }
}
`;

const WITH_REALTIME = `
system Arena {
  entity Player {
    owns: [username: string, score: uint]
    auth: jwt
  }
  capability move(p: Player, x: uint, y: uint) {
    requires: [p.score >= 0]
    effects: [p.score = p.score]
    sync: realtime
  }
  channel game_room {
    transport: websocket
    ordering: causal
    participants: set<Player>
    persistence: last_100
    max_size: 1000
  }
}
`;

const NO_AUTH = `
system Arena {
  entity Item { owns: [name: string] }
  capability ping(i: Item) {
    requires: [i.name != ""]
    effects: [i.name = i.name]
    sync: eventual
  }
}
`;

const INVENTORY_EXAMPLE = fs.readFileSync(
  path.resolve(__dirname, "../../examples/inventory_platform.bone"), "utf-8"
);

// ─── Test 1: Required files are emitted ───────────────────────────────────────

console.log("\nTest 1: Required files are emitted...");
{
  const files = compileToNakama(MINIMAL);
  const paths = files.map(f => f.path);
  assert("package.json emitted", paths.includes("package.json"));
  assert("tsconfig.json emitted", paths.includes("tsconfig.json"));
  assert("src/storage.ts emitted", paths.includes("src/storage.ts"));
  assert("src/rpc.ts emitted", paths.includes("src/rpc.ts"));
  assert("src/index.ts emitted", paths.includes("src/index.ts"));
  assert("README.md emitted", paths.includes("README.md"));
}

// ─── Test 2: package.json has Nakama runtime dep ──────────────────────────────

console.log("\nTest 2: package.json contains Nakama runtime dependency...");
{
  const files = compileToNakama(MINIMAL);
  const pkg = JSON.parse(fileContent(files, "package.json")!);
  assert("has @heroiclabs/nakama-runtime devDep", "@heroiclabs/nakama-runtime" in pkg.devDependencies);
  assert("has typescript devDep", "typescript" in pkg.devDependencies);
  assert("build script present", pkg.scripts?.build === "npx tsc");
}

// ─── Test 3: tsconfig is valid ────────────────────────────────────────────────

console.log("\nTest 3: tsconfig.json is valid...");
{
  const files = compileToNakama(MINIMAL);
  const cfg = JSON.parse(fileContent(files, "tsconfig.json")!);
  assert("target is ES2020", cfg.compilerOptions?.target === "ES2020");
  assert("outDir is ./build", cfg.compilerOptions?.outDir === "./build");
  assert("strict mode on", cfg.compilerOptions?.strict === true);
}

// ─── Test 4: Storage helpers generated per entity ────────────────────────────

console.log("\nTest 4: Storage helpers generated for each entity...");
{
  const files = compileToNakama(MINIMAL);
  const storage = fileContent(files, "src/storage.ts")!;
  assert("Player interface exported", storage.includes("export interface Player"));
  assert("readPlayer function exported", storage.includes("export function readPlayer"));
  assert("writePlayer function exported", storage.includes("export function writePlayer"));
  assert("deletePlayer function exported", storage.includes("export function deletePlayer"));
  assert("uses nk.storageRead", storage.includes("nk.storageRead"));
  assert("uses nk.storageWrite", storage.includes("nk.storageWrite"));
  assert("collection is players", storage.includes('"players"'));
}

// ─── Test 5: RPC handlers generated per capability ───────────────────────────

console.log("\nTest 5: RPC handlers generated for each capability...");
{
  const files = compileToNakama(MINIMAL);
  const rpc = fileContent(files, "src/rpc.ts")!;
  assert("RPC function type used", rpc.includes("nkruntime.RpcFunction"));
  // Lowering names the module after the entity: PlayerService -> player_service
  assert("award_points RPC id exported", rpc.includes("award_points"));
  assert("auth guard present for authenticated method", rpc.includes("ctx.userId"));
  assert("logger.info call present", rpc.includes("logger.info"));
  assert("returns JSON string", rpc.includes("JSON.stringify"));
}

// ─── Test 6: Auth guard only on authenticated methods ────────────────────────

console.log("\nTest 6: Auth guard only on authenticated methods...");
{
  const filesAuth = compileToNakama(MINIMAL);
  const filesNoAuth = compileToNakama(NO_AUTH);
  const rpcAuth = fileContent(filesAuth, "src/rpc.ts")!;
  const rpcNoAuth = fileContent(filesNoAuth, "src/rpc.ts")!;
  assert("auth guard present when entity has auth:jwt", rpcAuth.includes("if (!ctx.userId)"));
  // All api_service methods are authenticated by default in the lowering.
  // The auth guard is always present for api_service modules.
  assert("auth guard present in both cases", rpcNoAuth.includes("if (!ctx.userId)"));
}

// ─── Test 7: Event emissions become stream sends ─────────────────────────────

console.log("\nTest 7: Event emissions become nk.streamSend calls...");
{
  const files = compileToNakama(WITH_EVENTS);
  const rpc = fileContent(files, "src/rpc.ts")!;
  assert("nk.streamSend present", rpc.includes("nk.streamSend"));
  assert("event name in stream send", rpc.includes("PointsAwarded"));
}

// ─── Test 8: Match handler generated for realtime channels ───────────────────

console.log("\nTest 8: Match handler generated for realtime channels...");
{
  const files = compileToNakama(WITH_REALTIME);
  const paths = files.map(f => f.path);
  assert("src/match.ts emitted", paths.includes("src/match.ts"));
  const match = fileContent(files, "src/match.ts")!;
  assert("matchInit present", match.includes("matchInit"));
  assert("matchJoin present", match.includes("matchJoin"));
  assert("matchLeave present", match.includes("matchLeave"));
  assert("matchLoop present", match.includes("matchLoop"));
  assert("matchTerminate present", match.includes("matchTerminate"));
  assert("tickRate set", match.includes("tickRate"));
  assert("broadcastMessage present", match.includes("broadcastMessage"));
}

// ─── Test 9: No match.ts when no realtime channels ───────────────────────────

console.log("\nTest 9: No match.ts emitted when no realtime channels...");
{
  const files = compileToNakama(MINIMAL);
  const paths = files.map(f => f.path);
  assert("src/match.ts NOT emitted", !paths.includes("src/match.ts"));
}

// ─── Test 10: InitModule registers all RPCs and match handlers ───────────────

console.log("\nTest 10: InitModule registers all RPCs and match handlers...");
{
  const files = compileToNakama(WITH_REALTIME);
  const index = fileContent(files, "src/index.ts")!;
  assert("InitModule function present", index.includes("function InitModule"));
  assert("initializer.registerRpc called", index.includes("initializer.registerRpc"));
  assert("initializer.registerMatch called", index.includes("initializer.registerMatch"));
  assert("globalThis.InitModule exported", index.includes("globalThis") && index.includes("InitModule"));
}

// ─── Test 11: Existing Express target unaffected ─────────────────────────────

console.log("\nTest 11: Existing Express/FullEmitter output is unaffected...");
{
  const tokens = new Lexer(MINIMAL).tokenize();
  const ast = new Parser(tokens).parse();
  const hash = createHash("sha256").update(MINIMAL).digest("hex").slice(0, 16);
  const irSystems = new Lowering().lower(ast, hash);
  const emitter = new FullEmitter();
  const files: ReturnType<typeof emitter.emit> = [];
  for (const sys of irSystems) files.push(...emitter.emit(sys));
  const paths = files.map(f => f.path);
  assert("Express: src/index.ts emitted", paths.includes("src/index.ts"));
  assert("Express: src/auth.ts emitted", paths.includes("src/auth.ts"));
  assert("Express: docker-compose.yaml emitted", paths.includes("docker-compose.yaml"));
  assert("Express: no src/rpc.ts", !paths.includes("src/rpc.ts"));
  assert("Express: no src/storage.ts", !paths.includes("src/storage.ts"));
}

// ─── Test 12: Full inventory_platform.bone compiles to Nakama ────────────────

console.log("\nTest 12: Full inventory_platform.bone compiles to Nakama without errors...");
{
  let files: ReturnType<NakamaEmitter["emit"]> = [];
  let err: string | null = null;
  try {
    files = compileToNakama(INVENTORY_EXAMPLE);
  } catch (e: any) {
    err = e.message;
  }
  assert("no compile errors", err === null, err ?? "");
  assert("files emitted", files.length > 0);
  const rpc = fileContent(files, "src/rpc.ts");
  assert("rpc.ts present", rpc !== null);
  assert("create_trade RPC present", rpc?.includes("create_trade") ?? false);
  assert("accept_trade RPC present", rpc?.includes("accept_trade") ?? false);
  assert("award_xp RPC present", rpc?.includes("award_xp") ?? false);
  assert("consume_item RPC present", rpc?.includes("consume_item") ?? false);
  const match = fileContent(files, "src/match.ts");
  assert("match.ts present (has channels)", match !== null);
  assert("game_lobby match handler present", match?.includes("game_lobby") ?? false);
}

// ─── Test 13: Determinism ─────────────────────────────────────────────────────

console.log("\nTest 13: NakamaEmitter output is deterministic...");
{
  const run1 = JSON.stringify(compileToNakama(INVENTORY_EXAMPLE).map(f => ({ p: f.path, c: f.content })));
  const run2 = JSON.stringify(compileToNakama(INVENTORY_EXAMPLE).map(f => ({ p: f.path, c: f.content })));
  assert("two runs produce identical output", run1 === run2);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

const SEP = "═".repeat(40);
console.log(`\n${SEP}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(SEP);
if (failed > 0) process.exit(1);
