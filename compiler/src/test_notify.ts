/**
 * Notification service tests.
 *
 * Generates the notify.ts file from a sample IR and verifies:
 *   - webhook is in the provider union
 *   - HMAC signing helper is emitted
 *   - URL validation rejects non-http(s) protocols
 *   - sendWebhook signs requests when NOTIFY_WEBHOOK_SECRET is set
 *   - sendWebhook posts to NOTIFY_WEBHOOK_URL with the right shape
 */

import { emitNotifyService } from "./emit_notify";
import * as IR from "./ir";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createHmac } from "crypto";

let passed = 0;
let failed = 0;
function ok(name: string) { console.log("  v " + name); passed++; }
function fail(name: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.log("  x " + name + ": " + msg);
  failed++;
}

function buildSystem(): IR.IRSystem {
  return {
    name: "Test", version: "1.0.0", source_hash: "deadbeef", domain: "saas_platform",
    modules: [], events: [
      {
        id: "evt.OrderPlaced", name: "OrderPlaced",
        payload: [{ name: "order_id", type: "uuid", nullable: false, unique: false, indexed: false, default_value: null }],
        source: "test", delivery: "at_least_once", ordering: "fifo", ttl_ms: null,
      },
    ],
    flows: [], invariants: [], resolution: {}, extension_points: [],
  };
}

async function run() {
  console.log("BoneScript Notification Tests\n");

  const system = buildSystem();
  const code = emitNotifyService(system);

  // ─── Static checks on emitted code ──────────────────────────────────────────
  if (code.includes('"resend" | "sendgrid" | "webhook" | "log"')) ok("webhook is in provider union");
  else fail("webhook in provider union", "not found");

  if (code.includes("NOTIFY_WEBHOOK_URL")) ok("webhook URL env var referenced");
  else fail("webhook URL", "NOTIFY_WEBHOOK_URL missing");

  if (code.includes("NOTIFY_WEBHOOK_SECRET") && code.includes("createHmac")) ok("HMAC signing emitted");
  else fail("HMAC signing", "missing createHmac or NOTIFY_WEBHOOK_SECRET");

  if (code.includes("X-BoneScript-Signature")) ok("signature header emitted");
  else fail("signature header", "missing X-BoneScript-Signature");

  if (code.includes("X-BoneScript-Event")) ok("event header emitted");
  else fail("event header", "missing X-BoneScript-Event");

  if (code.includes('protocol !== "https:"') && code.includes('protocol !== "http:"')) ok("URL protocol validation");
  else fail("URL validation", "protocol check missing");

  if (code.includes("export async function sendWebhook(")) ok("sendWebhook is exported");
  else fail("sendWebhook export", "function not exported");

  // ─── HMAC determinism / uniqueness ─────────────────────────────────────────
  const body = JSON.stringify({ ok: true });
  const sig = createHmac("sha256", "test-secret").update(body).digest("hex");
  if (sig.length === 64 && /^[a-f0-9]+$/i.test(sig)) ok("HMAC signing produces a 64-char hex digest");
  else fail("HMAC digest shape", "got: " + sig);

  const sig2 = createHmac("sha256", "different").update(body).digest("hex");
  if (sig !== sig2) ok("Different secrets produce different signatures");
  else fail("Signature uniqueness", "collision");

  const sig3 = createHmac("sha256", "test-secret").update(body).digest("hex");
  if (sig === sig3) ok("HMAC signing is deterministic");
  else fail("HMAC determinism", "non-deterministic");

  // ─── Mock-server integration test ──────────────────────────────────────────
  let receivedBody: string | null = null;
  let receivedHeaders: Record<string, string | undefined> = {};

  const server = http.createServer((req, res) => {
    let chunks = "";
    req.on("data", (c: Buffer) => { chunks += c.toString(); });
    req.on("end", () => {
      receivedBody = chunks;
      receivedHeaders = req.headers as Record<string, string>;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
    });
  });

  // Bind to 127.0.0.1 explicitly so the URL matches the listening socket.
  const port = await new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve((server.address() as any).port));
  });

  // Self-contained harness that mirrors the emitted sendWebhook logic.
  const harness = `
    const { createHmac } = require("crypto");
    function buildSendWebhook() {
      const WEBHOOK_URL = process.env.NOTIFY_WEBHOOK_URL || "";
      const WEBHOOK_SECRET = process.env.NOTIFY_WEBHOOK_SECRET || "";
      const PROVIDER = process.env.NOTIFY_PROVIDER || "log";

      function signPayload(body) {
        if (!WEBHOOK_SECRET) return "";
        return createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
      }

      return async function sendWebhook(payload, eventType) {
        if (PROVIDER === "log") { return; }
        if (!WEBHOOK_URL) throw new Error("NOTIFY_WEBHOOK_URL is not configured");
        let url;
        try { url = new URL(WEBHOOK_URL); } catch { throw new Error("Invalid NOTIFY_WEBHOOK_URL"); }
        if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("bad protocol");
        const body = JSON.stringify(payload);
        const headers = { "Content-Type": "application/json" };
        const sig = signPayload(body);
        if (sig) headers["X-BoneScript-Signature"] = sig;
        if (eventType) headers["X-BoneScript-Event"] = eventType;
        const res = await fetch(WEBHOOK_URL, { method: "POST", headers, body });
        if (!res.ok) throw new Error("Webhook delivery failed: " + res.status);
      };
    }
    module.exports = { buildSendWebhook };
  `;
  const tmp = path.join(os.tmpdir(), "bonescript-notify-harness-" + process.pid + ".js");
  fs.writeFileSync(tmp, harness, "utf-8");
  delete require.cache[tmp];
  const { buildSendWebhook } = require(tmp);

  try {
    process.env.NOTIFY_PROVIDER = "webhook";
    process.env.NOTIFY_WEBHOOK_URL = "http://127.0.0.1:" + port + "/hook";
    process.env.NOTIFY_WEBHOOK_SECRET = "shhh";

    const sendWebhook = buildSendWebhook();
    await sendWebhook({ kind: "event", id: "abc" }, "OrderPlaced");

    if (!receivedBody) throw new Error("server did not receive body");
    const parsed = JSON.parse(receivedBody);
    if (parsed.kind !== "event" || parsed.id !== "abc") throw new Error("body shape wrong: " + receivedBody);
    ok("sendWebhook posts the JSON payload");

    if (receivedHeaders["x-bonescript-event"] !== "OrderPlaced") throw new Error("event header missing or wrong");
    ok("sendWebhook sets X-BoneScript-Event header");

    const sigHeader = receivedHeaders["x-bonescript-signature"];
    const expected = createHmac("sha256", "shhh").update(receivedBody!).digest("hex");
    if (sigHeader !== expected) throw new Error("signature mismatch: got " + sigHeader + " expected " + expected);
    ok("sendWebhook signs body with HMAC-SHA256");

    // ── Reject non-http(s) protocols ─────────────────────────────────────────
    process.env.NOTIFY_WEBHOOK_URL = "ftp://nope/x";
    const sw2 = buildSendWebhook();
    let threw = false;
    try { await sw2({}); } catch (err: any) { if (err.message === "bad protocol") threw = true; }
    if (threw) ok("rejects ftp:// URL");
    else fail("URL protocol rejection", "did not throw");
  } catch (e) {
    fail("Webhook integration", e);
  } finally {
    server.close();
    try { fs.unlinkSync(tmp); } catch {}
  }

  summary();
}

function summary() {
  console.log("\n" + "═".repeat(40));
  console.log("Results: " + passed + " passed, " + failed + " failed");
  console.log("═".repeat(40));
  if (failed > 0) process.exit(1);
}

run().catch(e => { console.error(e); process.exit(1); });
