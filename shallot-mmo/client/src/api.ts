/**
 * ShallotMMO API client
 * Talks to the BoneScript-generated backend at /api/*
 */

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

let _token: string | null = null;
let _playerId: string | null = null;

export function getToken() { return _token; }
export function getPlayerId() { return _playerId; }

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (_token) headers["Authorization"] = `Bearer ${_token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err?.error?.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface Player {
  id: string;
  username: string;
  pos_x: number;
  pos_y: number;
  pos_z: number;
  rot_y: number;
  zone_id: string;
  hp: number;
  max_hp: number;
  mp: number;
  max_mp: number;
  xp: number;
  level: number;
  gold: number;
  is_online: boolean;
  state: string;
}

/** Hash password client-side (SHA-256 hex) before sending */
async function hashPassword(pw: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function register(username: string, email: string, password: string): Promise<Player> {
  const password_hash = await hashPassword(password);
  const player = await request<Player>("POST", "/players", { username, email, password_hash });
  return player;
}

export async function login(username: string, password: string): Promise<{ token: string; player: Player }> {
  const password_hash = await hashPassword(password);
  // BoneScript generates POST /players/login for the login capability
  const result = await request<{ token: string; player: Player }>("POST", "/players/login", {
    username,
    password_hash,
  });
  _token = result.token;
  _playerId = result.player.id;
  return result;
}

export async function logout(): Promise<void> {
  if (!_playerId) return;
  await request("POST", `/players/${_playerId}/logout`, {}).catch(() => {});
  _token = null;
  _playerId = null;
}

export async function getPlayer(id: string): Promise<Player> {
  return request<Player>("GET", `/players/${id}`);
}

// ─── Movement ─────────────────────────────────────────────────────────────────

export async function move(x: number, y: number, z: number, rot_y: number): Promise<void> {
  if (!_playerId) return;
  await request("POST", `/players/${_playerId}/move`, { x, y, z, rot_y });
}

// ─── Zone ─────────────────────────────────────────────────────────────────────

export interface Zone {
  id: string;
  name: string;
  min_level: number;
  spawn_x: number;
  spawn_y: number;
  spawn_z: number;
  is_pvp: boolean;
}

export async function getZones(): Promise<{ items: Zone[] }> {
  return request<{ items: Zone[] }>("GET", "/zones");
}

export async function changeZone(zoneId: string): Promise<void> {
  if (!_playerId) return;
  await request("POST", `/players/${_playerId}/change-zone`, { zone_id: zoneId });
}

// ─── Combat ───────────────────────────────────────────────────────────────────

export async function attack(targetId: string): Promise<void> {
  if (!_playerId) return;
  await request("POST", `/players/${_playerId}/attack`, { target_id: targetId });
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export async function sendChat(channel: string, content: string): Promise<void> {
  if (!_playerId) return;
  await request("POST", `/players/${_playerId}/send-chat`, { channel, content });
}

// ─── Inventory ────────────────────────────────────────────────────────────────

export interface InventorySlot {
  id: string;
  slot_index: number;
  quantity: number;
  item_id: string;
}

export async function getInventory(): Promise<{ items: InventorySlot[] }> {
  if (!_playerId) return { items: [] };
  return request<{ items: InventorySlot[] }>("GET", `/players/${_playerId}/inventory_slots`);
}
