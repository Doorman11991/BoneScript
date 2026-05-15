/**
 * ShallotMMO Load Test — 1000 simulated players
 *
 * Each virtual player:
 *   1. Registers (or reuses existing account)
 *   2. Logs in → gets JWT
 *   3. Connects to zone_updates + global_chat WebSocket channels
 *   4. Runs a random action loop for DURATION_MS:
 *        - move         (60% weight) — sends position update
 *        - send_chat    (20% weight) — sends a chat message
 *        - attack       (10% weight) — attacks a random online player
 *        - get_profile  (10% weight) — GET /players/:id
 *   5. Logs out and disconnects
 *
 * Metrics collected per action:
 *   - latency (p50, p95, p99, max)
 *   - throughput (req/s)
 *   - error rate
 *   - WebSocket message rate
 *
 * Usage:
 *   node loadtest.mjs [--players 1000] [--ramp 10] [--duration 30] [--base http://localhost:3000]
 *
 * --players   total virtual players          (default: 1000)
 * --ramp      players spawned per second     (default: 10)
 * --duration  seconds each player is active  (default: 30)
 * --base      backend base URL               (default: http://localhost:3000)
 */

import { createHash } from "crypto";
import { WebSocket } from "ws";
import { performance } from "perf_hooks";

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith("--"))
    .map(a => a.slice(2).split("="))
    .map(([k, v]) => [k, v])
);

const TOTAL_PLAYERS = parseInt(args.players  ?? "1000");
const RAMP_PER_SEC  = parseInt(args.ramp     ?? "10");
const DURATION_MS   = parseInt(args.duration ?? "30") * 1000;
const BASE_URL      = args.base ?? "http://localhost:3000";
const WS_URL        = BASE_URL.replace(/^http/, "ws");

// ─── Shared state ─────────────────────────────────────────────────────────────

// All currently online player IDs (for attack targeting)
const onlinePlayers = new Set();

// Metrics buckets per action type
const metrics = {};
function recordMetric(action, latencyMs, ok) {
  if (!metrics[action]) metrics[action] = { latencies: [], errors: 0, total: 0 };
  metrics[action].total++;
  metrics[action].latencies.push(latencyMs);
  if (!ok) metrics[action].errors++;
}

let wsMessagesReceived = 0;
let activeConnections  = 0;
let peakConnections    = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sha256hex(s) {
  return createHash("sha256").update(s).digest("hex");
}

function randomFloat(min, max) {
  return min + Math.random() * (max - min);
}

function pickRandom(set) {
  const arr = [...set];
  return arr[Math.floor(Math.random() * arr.length)];
}

async function apiCall(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const start = performance.now();
  let ok = false;
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    ok = res.ok;
    const latency = performance.now() - start;
    recordMetric(`${method} ${path.replace(/\/[0-9a-f-]{36}/g, "/:id")}`, latency, ok);
    if (!ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, body: text };
    }
    return { ok: true, data: await res.json() };
  } catch (e) {
    const latency = performance.now() - start;
    recordMetric(`${method} ${path.replace(/\/[0-9a-f-]{36}/g, "/:id")}`, latency, false);
    return { ok: false, error: e.message };
  }
}

// ─── WebSocket connection ─────────────────────────────────────────────────────

function connectWS(channel, token) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${WS_URL}/ws?channel=${channel}&token=${encodeURIComponent(token)}`);
    ws.on("open",    () => { activeConnections++; peakConnections = Math.max(peakConnections, activeConnections); resolve(ws); });
    ws.on("message", () => { wsMessagesReceived++; });
    ws.on("error",   () => { resolve(null); }); // non-fatal
    ws.on("close",   () => { activeConnections = Math.max(0, activeConnections - 1); });
    setTimeout(() => resolve(null), 5000); // 5s connect timeout
  });
}

// ─── Virtual player ───────────────────────────────────────────────────────────

async function runPlayer(index) {
  const username      = `loadbot_${index}_${Date.now()}`;
  const passwordHash  = sha256hex(`pass_${index}`);
  const email         = `${username}@loadtest.local`;

  // 1. Register
  const regResult = await apiCall("POST", "/players", { username, email, password_hash: passwordHash });
  if (!regResult.ok) return; // skip if registration failed

  // 2. Login
  const loginResult = await apiCall("POST", "/players/login", { username, password_hash: passwordHash });
  if (!loginResult.ok) return;
  const { token, player } = loginResult.data;
  const playerId = player.id;

  onlinePlayers.add(playerId);

  // 3. Connect WebSocket channels (non-blocking — failures are tolerated)
  const [wsZone, wsChat] = await Promise.all([
    connectWS("zone_updates", token),
    connectWS("global_chat",  token),
  ]);

  // 4. Action loop
  const deadline = Date.now() + DURATION_MS;
  while (Date.now() < deadline) {
    const roll = Math.random();
    const delay = 200 + Math.random() * 800; // 200–1000ms between actions

    if (roll < 0.60) {
      // Move
      await apiCall("POST", "/players/move", {
        x:     randomFloat(-500, 500),
        y:     0,
        z:     randomFloat(-500, 500),
        rot_y: randomFloat(0, 360),
      }, token);

    } else if (roll < 0.80) {
      // Chat
      await apiCall("POST", "/players/send-chat", {
        channel: "global",
        content: `Hello from bot ${index}!`,
      }, token);

    } else if (roll < 0.90) {
      // Attack a random online player (skip if none available)
      const targets = [...onlinePlayers].filter(id => id !== playerId);
      if (targets.length > 0) {
        const targetId = targets[Math.floor(Math.random() * targets.length)];
        await apiCall("POST", "/players/attack", {
          attacker_id: playerId,
          target_id:   targetId,
        }, token);
      }

    } else {
      // Get own profile
      await apiCall("GET", `/players/${playerId}`, null, token);
    }

    await sleep(delay);
  }

  // 5. Logout
  await apiCall("POST", "/players/logout", {}, token);
  onlinePlayers.delete(playerId);

  // Close WebSocket connections
  if (wsZone)  wsZone.close();
  if (wsChat)  wsChat.close();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Ramp up ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nShallotMMO Load Test`);
  console.log(`${"─".repeat(50)}`);
  console.log(`  Target:   ${BASE_URL}`);
  console.log(`  Players:  ${TOTAL_PLAYERS}`);
  console.log(`  Ramp:     ${RAMP_PER_SEC}/s`);
  console.log(`  Duration: ${DURATION_MS / 1000}s per player`);
  console.log(`${"─".repeat(50)}\n`);

  // Verify server is up before starting
  try {
    const health = await fetch(`${BASE_URL}/health/live`);
    if (!health.ok) throw new Error(`Health check failed: ${health.status}`);
    console.log(`  ✓ Server healthy\n`);
  } catch (e) {
    console.error(`  ✗ Server not reachable: ${e.message}`);
    process.exit(1);
  }

  const startTime = performance.now();
  const playerPromises = [];
  const intervalMs = 1000 / RAMP_PER_SEC;

  // Progress ticker
  let spawned = 0;
  const ticker = setInterval(() => {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    const done    = playerPromises.filter(p => p._done).length;
    process.stdout.write(`\r  [${elapsed}s] spawned=${spawned}  active=${spawned - done}  ws_msgs=${wsMessagesReceived}  peak_ws=${peakConnections}   `);
  }, 500);

  // Spawn players at the ramp rate
  for (let i = 0; i < TOTAL_PLAYERS; i++) {
    const p = runPlayer(i);
    p.then(() => { p._done = true; }).catch(() => { p._done = true; });
    playerPromises.push(p);
    spawned++;
    if (i < TOTAL_PLAYERS - 1) await sleep(intervalMs);
  }

  // Wait for all players to finish
  await Promise.allSettled(playerPromises);
  clearInterval(ticker);

  const totalMs = performance.now() - startTime;
  process.stdout.write("\n");

  // ─── Report ────────────────────────────────────────────────────────────────

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  RESULTS  (total time: ${(totalMs / 1000).toFixed(1)}s)`);
  console.log(`${"═".repeat(60)}\n`);

  // Per-action stats
  const allActions = Object.entries(metrics).sort(([a], [b]) => a.localeCompare(b));
  let totalRequests = 0;
  let totalErrors   = 0;

  const colW = [32, 7, 7, 7, 7, 7, 7, 7];
  const header = ["Action", "Count", "Err%", "p50ms", "p95ms", "p99ms", "maxms", "req/s"];
  console.log(header.map((h, i) => h.padEnd(colW[i])).join(""));
  console.log("─".repeat(colW.reduce((a, b) => a + b, 0)));

  for (const [action, m] of allActions) {
    const sorted = m.latencies.slice().sort((a, b) => a - b);
    const p50  = percentile(sorted, 50);
    const p95  = percentile(sorted, 95);
    const p99  = percentile(sorted, 99);
    const max  = sorted[sorted.length - 1] ?? 0;
    const errPct = ((m.errors / m.total) * 100).toFixed(1);
    const rps  = (m.total / (totalMs / 1000)).toFixed(1);

    totalRequests += m.total;
    totalErrors   += m.errors;

    const row = [
      action.slice(0, 31),
      m.total.toString(),
      `${errPct}%`,
      `${p50.toFixed(0)}`,
      `${p95.toFixed(0)}`,
      `${p99.toFixed(0)}`,
      `${max.toFixed(0)}`,
      rps,
    ];
    console.log(row.map((v, i) => v.padEnd(colW[i])).join(""));
  }

  console.log("─".repeat(colW.reduce((a, b) => a + b, 0)));

  const overallRps    = (totalRequests / (totalMs / 1000)).toFixed(1);
  const overallErrPct = ((totalErrors / totalRequests) * 100).toFixed(2);
  const allLatencies  = allActions.flatMap(([, m]) => m.latencies).sort((a, b) => a - b);

  console.log(`\n  Total requests : ${totalRequests}`);
  console.log(`  Total errors   : ${totalErrors} (${overallErrPct}%)`);
  console.log(`  Overall req/s  : ${overallRps}`);
  console.log(`  p50 latency    : ${percentile(allLatencies, 50).toFixed(0)}ms`);
  console.log(`  p95 latency    : ${percentile(allLatencies, 95).toFixed(0)}ms`);
  console.log(`  p99 latency    : ${percentile(allLatencies, 99).toFixed(0)}ms`);
  console.log(`  Max latency    : ${(allLatencies[allLatencies.length - 1] ?? 0).toFixed(0)}ms`);
  console.log(`  WS messages rx : ${wsMessagesReceived}`);
  console.log(`  Peak WS conns  : ${peakConnections}`);
  console.log(`  Players:        ${TOTAL_PLAYERS} spawned, ${TOTAL_PLAYERS - onlinePlayers.size} finished`);
  console.log(`\n${"═".repeat(60)}\n`);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

main().catch(e => { console.error(e); process.exit(1); });
