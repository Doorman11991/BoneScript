/**
 * ShallotMMO — entry point
 */

import { login, register, getZones } from "./api";
import { socket } from "./ws";
import { world, setupNetworkBridge, startPositionSync } from "./game";
import { showGame, addChatMessage } from "./ui";

// ─── Login form ───────────────────────────────────────────────────────────────

const usernameInput = document.getElementById("username") as HTMLInputElement;
const passwordInput = document.getElementById("password") as HTMLInputElement;
const loginBtn      = document.getElementById("login-btn") as HTMLButtonElement;
const registerBtn   = document.getElementById("register-btn") as HTMLButtonElement;
const loginError    = document.getElementById("login-error")!;

function setError(msg: string) { loginError.textContent = msg; }
function setLoading(on: boolean) {
  loginBtn.disabled    = on;
  registerBtn.disabled = on;
  loginBtn.textContent    = on ? "CONNECTING..." : "ENTER WORLD";
  registerBtn.textContent = on ? "..." : "CREATE ACCOUNT";
}

loginBtn.addEventListener("click", async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) { setError("Username and password required."); return; }
  setLoading(true); setError("");
  try {
    const { player } = await login(username, password);
    await enterWorld(player);
  } catch (e: any) {
    setError(e.message ?? "Login failed.");
  } finally { setLoading(false); }
});

registerBtn.addEventListener("click", async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) { setError("Username and password required."); return; }
  if (username.length < 3) { setError("Username must be at least 3 characters."); return; }
  if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
  setLoading(true); setError("");
  try {
    const email = `${username.toLowerCase()}@shallotmmo.local`;
    await register(username, email, password);
    const { player } = await login(username, password);
    await enterWorld(player);
  } catch (e: any) {
    setError(e.message ?? "Registration failed.");
  } finally { setLoading(false); }
});

// ─── Enter world ──────────────────────────────────────────────────────────────

async function enterWorld(player: any) {
  world.localPlayer = player;

  let zoneName = "Starter Plains";
  try {
    const { items: zones } = await getZones();
    const zone = zones.find((z: any) => z.id === player.zone_id) ?? zones[0];
    if (zone) zoneName = zone.name;
  } catch { /* non-fatal */ }

  // Connect WebSocket channels
  socket.connect(["zone_updates", "combat_feed", "global_chat"]);

  // Wire WS → world state
  setupNetworkBridge();

  // Start position heartbeat
  startPositionSync();

  // Show game UI
  showGame(player, zoneName);
  addChatMessage("system", `Welcome, ${player.username}! You are in ${zoneName}.`, true);
  addChatMessage("system", "Click a player name to attack. Press Enter to chat.", true);
  addChatMessage("system", "3D renderer (Shallot/WebGPU) will connect here once the package stabilises.", true);
}
