/**
 * ShallotMMO — game state and network bridge
 *
 * Shallot (@dylanebert/shallot) ships raw TypeScript source and requires
 * its own monorepo build pipeline (Rust/WASM + vite 8). Until it stabilises
 * as a standalone package we run without the 3D engine and render players
 * on a 2D canvas minimap instead.
 *
 * When Shallot is ready, swap the stub ECS below for real imports:
 *   import { run, traits, type Config, type Plugin, type System, type State }
 *     from "@dylanebert/shallot";
 */

import { move, getPlayerId, type Player } from "./api";
import { socket, type WSMessage } from "./ws";

// ─── Lightweight ECS stub (replaces @dylanebert/shallot until it's stable) ───

export interface RemotePlayerData {
  id: string;
  username: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  hp: number;
  inCombat: boolean;
}

// World state — single source of truth for the minimap and player list
export const world = {
  localPlayer: null as Player | null,
  remotePlayers: new Map<string, RemotePlayerData>(),
};

// ─── Position sync ────────────────────────────────────────────────────────────

let _lastX = 0, _lastZ = 0;
let _syncInterval: ReturnType<typeof setInterval> | null = null;

/** Call after login to start sending position updates at 10 Hz */
export function startPositionSync() {
  if (_syncInterval) return;
  _syncInterval = setInterval(() => {
    const p = world.localPlayer;
    if (!p) return;
    // In a real 3D scene these come from the camera/character controller.
    // For now we just re-send the stored position so the server stays in sync.
    move(p.pos_x, p.pos_y, p.pos_z, p.rot_y).catch(() => {});
  }, 100);
}

export function stopPositionSync() {
  if (_syncInterval) { clearInterval(_syncInterval); _syncInterval = null; }
}

// ─── WebSocket → world state bridge ──────────────────────────────────────────

type ChangeHandler = () => void;
const changeHandlers: ChangeHandler[] = [];
export function onWorldChange(fn: ChangeHandler) { changeHandlers.push(fn); }
function notifyChange() { for (const fn of changeHandlers) fn(); }

export function setupNetworkBridge() {
  socket.subscribe((msg: WSMessage) => {
    const myId = getPlayerId();

    switch (msg.type) {
      case "PlayerMoved": {
        const { player_id, x, y, z, rot_y } = msg.payload;
        if (player_id === myId) return;
        const p = world.remotePlayers.get(player_id);
        if (p) { p.x = x; p.y = y; p.z = z; p.rotY = rot_y; notifyChange(); }
        break;
      }
      case "PlayerJoinedZone": {
        const { player_id, username, x, y, z } = msg.payload;
        if (player_id === myId) return;
        world.remotePlayers.set(player_id, { id: player_id, username, x, y, z, rotY: 0, hp: 100, inCombat: false });
        notifyChange();
        break;
      }
      case "PlayerLeftZone": {
        world.remotePlayers.delete(msg.payload.player_id);
        notifyChange();
        break;
      }
      case "CombatResult": {
        const { target_id, target_hp } = msg.payload;
        const p = world.remotePlayers.get(target_id);
        if (p) {
          p.hp = target_hp;
          p.inCombat = true;
          setTimeout(() => { p.inCombat = false; notifyChange(); }, 3000);
          notifyChange();
        }
        if (target_id === myId && world.localPlayer) {
          world.localPlayer.hp = target_hp;
          notifyChange();
        }
        break;
      }
      case "PlayerDied": {
        const p = world.remotePlayers.get(msg.payload.player_id);
        if (p) { p.hp = 0; p.inCombat = false; notifyChange(); }
        break;
      }
    }
  });
}
