/**
 * ShallotMMO WebSocket client
 * Connects to the BoneScript-generated WebSocket server.
 * Channels: zone_updates, combat_feed, global_chat, guild_chat
 */

import { getToken, getPlayerId } from "./api";

const WS_BASE = import.meta.env.VITE_WS_URL ?? "ws://localhost:3000";

export type WSMessage =
  | { type: "PlayerMoved";     payload: { player_id: string; x: number; y: number; z: number; rot_y: number; zone_id: string } }
  | { type: "PlayerJoinedZone"; payload: { player_id: string; username: string; zone_id: string; x: number; y: number; z: number } }
  | { type: "PlayerLeftZone";  payload: { player_id: string; zone_id: string } }
  | { type: "CombatResult";    payload: { attacker_id: string; target_id: string; damage: number; attacker_hp: number; target_hp: number } }
  | { type: "PlayerDied";      payload: { player_id: string; killer_id: string; zone_id: string } }
  | { type: "ChatMessage";     payload: { sender_id: string; channel: string; content: string; zone_id: string } }
  | { type: "QuestCompleted";  payload: { player_id: string; quest_id: string; xp_gained: number; gold_gained: number } };

type Handler = (msg: WSMessage) => void;

class MMOSocket {
  private sockets: Map<string, WebSocket> = new Map();
  private handlers: Handler[] = [];
  private reconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  subscribe(handler: Handler): () => void {
    this.handlers.push(handler);
    return () => { this.handlers = this.handlers.filter(h => h !== handler); };
  }

  private emit(msg: WSMessage) {
    for (const h of this.handlers) h(msg);
  }

  connect(channels: string[]) {
    const token = getToken();
    const playerId = getPlayerId();
    if (!token || !playerId) return;

    for (const channel of channels) {
      if (this.sockets.has(channel)) continue;
      this.openChannel(channel, token);
    }
  }

  private openChannel(channel: string, token: string) {
    const url = `${WS_BASE}/ws?channel=${channel}&token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    this.sockets.set(channel, ws);

    ws.onopen = () => {
      console.log(`[WS] Connected: ${channel}`);
      const timer = this.reconnectTimers.get(channel);
      if (timer) { clearTimeout(timer); this.reconnectTimers.delete(channel); }
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as WSMessage;
        this.emit(msg);
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      console.log(`[WS] Disconnected: ${channel} — reconnecting in 3s`);
      this.sockets.delete(channel);
      const timer = setTimeout(() => {
        const t = getToken();
        if (t) this.openChannel(channel, t);
      }, 3000);
      this.reconnectTimers.set(channel, timer);
    };

    ws.onerror = (e) => {
      console.warn(`[WS] Error on ${channel}:`, e);
    };
  }

  disconnectAll() {
    for (const [channel, ws] of this.sockets) {
      ws.close();
      this.sockets.delete(channel);
    }
    for (const timer of this.reconnectTimers.values()) clearTimeout(timer);
    this.reconnectTimers.clear();
  }
}

export const socket = new MMOSocket();
