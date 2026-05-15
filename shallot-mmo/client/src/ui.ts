/**
 * ShallotMMO UI — HUD, chat, minimap, player list
 * Pure DOM manipulation — no framework needed for this layer.
 */

import { sendChat, attack, type Player } from "./api";
import { socket, type WSMessage } from "./ws";

// ─── Elements ─────────────────────────────────────────────────────────────────

const loginOverlay  = document.getElementById("login-overlay")!;
const hud           = document.getElementById("hud")!;
const zoneLabel     = document.getElementById("zone-label")!;
const playerList    = document.getElementById("player-list")!;
const minimap       = document.getElementById("minimap")!;
const chat          = document.getElementById("chat")!;
const chatMessages  = document.getElementById("chat-messages")!;
const chatInput     = document.getElementById("chat-input") as HTMLInputElement;
const chatSend      = document.getElementById("chat-send")!;
const playerInfo    = document.getElementById("player-info")!;
const hpFill        = document.getElementById("hp-fill")!;
const mpFill        = document.getElementById("mp-fill")!;
const xpFill        = document.getElementById("xp-fill")!;
const playerEntries = document.getElementById("player-entries")!;
const minimapCanvas = document.getElementById("minimap-canvas") as HTMLCanvasElement;

// ─── State ────────────────────────────────────────────────────────────────────

interface NearbyPlayer { id: string; username: string; hp: number; inCombat: boolean; self: boolean }
const nearbyPlayers = new Map<string, NearbyPlayer>();
let currentZoneName = "Unknown Zone";
let myPlayerId = "";

// ─── Show game UI ─────────────────────────────────────────────────────────────

export function showGame(player: Player, zoneName: string) {
  myPlayerId = player.id;
  currentZoneName = zoneName;

  loginOverlay.style.display = "none";
  hud.style.display = "flex";
  zoneLabel.style.display = "block";
  playerList.style.display = "block";
  minimap.style.display = "block";
  chat.style.display = "block";

  updateHUD(player);
  zoneLabel.textContent = zoneName.toUpperCase();

  nearbyPlayers.set(player.id, {
    id: player.id, username: player.username,
    hp: player.hp, inCombat: false, self: true,
  });
  renderPlayerList();
  startMinimapLoop();
  setupChatHandlers();
  setupWSHandlers();
}

// ─── HUD ──────────────────────────────────────────────────────────────────────

export function updateHUD(player: Partial<Player> & { id?: string }) {
  if (player.username && player.level) {
    playerInfo.textContent = `${player.username}  Lv.${player.level}  ${player.gold ?? 0}g`;
  }
  if (player.hp !== undefined && player.max_hp) {
    hpFill.style.width = `${Math.max(0, (player.hp / player.max_hp) * 100)}%`;
  }
  if (player.mp !== undefined && player.max_mp) {
    mpFill.style.width = `${Math.max(0, (player.mp / player.max_mp) * 100)}%`;
  }
  if (player.xp !== undefined) {
    // XP to next level: simple formula — level * 1000
    const level = player.level ?? 1;
    const xpForLevel = level * 1000;
    xpFill.style.width = `${Math.min(100, ((player.xp ?? 0) / xpForLevel) * 100)}%`;
  }
}

// ─── Player list ──────────────────────────────────────────────────────────────

function renderPlayerList() {
  playerEntries.innerHTML = "";
  for (const p of nearbyPlayers.values()) {
    const div = document.createElement("div");
    div.className = "player-entry" + (p.self ? " self" : "") + (p.inCombat ? " in-combat" : "");
    div.textContent = p.self ? `▶ ${p.username}` : p.username;
    if (!p.self) {
      div.style.cursor = "pointer";
      div.title = "Click to attack";
      div.addEventListener("click", () => {
        attack(p.id).catch(e => addChatMessage("system", `Attack failed: ${e.message}`));
      });
    }
    playerEntries.appendChild(div);
  }
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

function setupChatHandlers() {
  const doSend = () => {
    const content = chatInput.value.trim();
    if (!content) return;
    chatInput.value = "";
    sendChat("global", content).catch(e => addChatMessage("system", `Send failed: ${e.message}`));
  };

  chatSend.addEventListener("click", doSend);
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); doSend(); }
  });
}

export function addChatMessage(sender: string, content: string, isSystem = false) {
  const div = document.createElement("div");
  div.className = "chat-msg" + (isSystem ? " system" : "");
  if (isSystem) {
    div.textContent = content;
  } else {
    div.innerHTML = `<span class="sender">${escapeHtml(sender)}</span>: ${escapeHtml(content)}`;
  }
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Keep last 100 messages
  while (chatMessages.children.length > 100) {
    chatMessages.removeChild(chatMessages.firstChild!);
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ─── WebSocket → UI ───────────────────────────────────────────────────────────

// Username cache (populated from WS events)
const usernameCache = new Map<string, string>();

function setupWSHandlers() {
  socket.subscribe((msg: WSMessage) => {
    switch (msg.type) {
      case "PlayerJoinedZone": {
        const { player_id, username, x, y, z } = msg.payload;
        usernameCache.set(player_id, username);
        if (player_id !== myPlayerId) {
          nearbyPlayers.set(player_id, { id: player_id, username, hp: 100, inCombat: false, self: false });
          renderPlayerList();
          addChatMessage("system", `${username} entered the zone.`, true);
        }
        break;
      }
      case "PlayerLeftZone": {
        const { player_id } = msg.payload;
        const p = nearbyPlayers.get(player_id);
        if (p) {
          addChatMessage("system", `${p.username} left the zone.`, true);
          nearbyPlayers.delete(player_id);
          renderPlayerList();
        }
        break;
      }
      case "CombatResult": {
        const { attacker_id, target_id, damage, target_hp } = msg.payload;
        const attacker = usernameCache.get(attacker_id) ?? attacker_id.slice(0, 8);
        const target   = usernameCache.get(target_id)   ?? target_id.slice(0, 8);
        addChatMessage("system", `${attacker} hit ${target} for ${damage} dmg (${target_hp} HP left)`, true);

        const tp = nearbyPlayers.get(target_id);
        if (tp) { tp.hp = target_hp; tp.inCombat = true; renderPlayerList(); }
        const ap = nearbyPlayers.get(attacker_id);
        if (ap) { ap.inCombat = true; renderPlayerList(); }
        break;
      }
      case "PlayerDied": {
        const { player_id, killer_id } = msg.payload;
        const victim = usernameCache.get(player_id) ?? player_id.slice(0, 8);
        const killer = usernameCache.get(killer_id) ?? killer_id.slice(0, 8);
        addChatMessage("system", `☠ ${victim} was slain by ${killer}`, true);
        const p = nearbyPlayers.get(player_id);
        if (p) { p.hp = 0; p.inCombat = false; renderPlayerList(); }
        break;
      }
      case "ChatMessage": {
        const { sender_id, content } = msg.payload;
        const sender = usernameCache.get(sender_id) ?? sender_id.slice(0, 8);
        addChatMessage(sender, content);
        break;
      }
      case "QuestCompleted": {
        const { player_id, xp_gained, gold_gained } = msg.payload;
        if (player_id === myPlayerId) {
          addChatMessage("system", `Quest complete! +${xp_gained} XP, +${gold_gained} gold`, true);
        }
        break;
      }
    }
  });
}

// ─── Minimap ──────────────────────────────────────────────────────────────────

// Stores positions for minimap rendering
const minimapPositions = new Map<string, { x: number; z: number; self: boolean }>();

export function updateMinimapPosition(playerId: string, x: number, z: number, self: boolean) {
  minimapPositions.set(playerId, { x, z, self });
}

export function removeFromMinimap(playerId: string) {
  minimapPositions.delete(playerId);
}

function startMinimapLoop() {
  const ctx = minimapCanvas.getContext("2d")!;
  const W = minimapCanvas.width;
  const H = minimapCanvas.height;
  const RANGE = 100; // world units visible on minimap

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 1;
    for (let i = 0; i <= W; i += W / 5) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke();
    }

    // Players
    for (const [id, pos] of minimapPositions) {
      const px = (pos.x / RANGE + 0.5) * W;
      const py = (pos.z / RANGE + 0.5) * H;
      ctx.beginPath();
      ctx.arc(px, py, pos.self ? 4 : 3, 0, Math.PI * 2);
      ctx.fillStyle = pos.self ? "#7ec8e3" : "#e05555";
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }
  draw();
}
