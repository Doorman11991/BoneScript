# ShallotMMO

A browser-based free MMO built on two open-source projects:

- **[Shallot](https://github.com/dylanebert/shallot)** — WebGPU ECS game engine (client renderer)
- **[BoneScript](https://github.com/Doorman11991/BoneScript)** — declarative backend compiler (server)

The entire backend — players, inventory, combat, guilds, quests, chat, WebSocket channels, PostgreSQL migrations, JWT auth, CI/CD — is generated from `backend/world.bone` by running one command.

---

## Architecture

```
browser
  └── Shallot (WebGPU ECS)
        ├── renders terrain, players, items
        ├── runs physics + input locally
        └── syncs to backend via REST + WebSocket
              │
              ▼
        BoneScript backend (Node.js / Express)
              ├── POST /players/login        auth
              ├── POST /players/:id/move     position sync (10 Hz)
              ├── POST /players/:id/attack   combat resolution
              ├── POST /players/:id/send-chat  chat
              ├── WS  /ws?channel=zone_updates  player positions
              ├── WS  /ws?channel=combat_feed   combat events
              └── WS  /ws?channel=global_chat   chat
                    │
                    ▼
              PostgreSQL (world state, inventory, guilds, quests)
              Redis      (sessions, pub/sub)
```

## What's in world.bone

- **7 entities**: Player, Zone, Item, InventorySlot, Guild, Quest, QuestProgress
- **9 events**: PlayerMoved, PlayerJoinedZone, PlayerLeftZone, CombatResult, PlayerDied, ItemDropped, ChatMessage, QuestCompleted, GuildInviteSent
- **4 WebSocket channels**: zone_updates, combat_feed, global_chat, guild_chat
- **16 capabilities**: register, login, logout, move, change_zone, attack, die, respawn, pick_up_item, drop_item, trade_item, send_chat, create_guild, invite_to_guild, accept_guild_invite, complete_quest
- **2 flows**: player_death_sequence, zone_transfer

---

## Quick Start

### Prerequisites
- Node.js 18+
- Docker (for Postgres + Redis)
- Bun (for Shallot client)
- A browser with WebGPU support (Chrome 113+, Edge 113+)

### 1. Generate and start the backend

```bash
# Install BoneScript compiler
npm install -g bonescript-compiler

# Compile world.bone → complete Node.js backend
bonec compile backend/world.bone

# Configure
cd backend/output
cp .env.example .env
# Edit .env: set JWT_SECRET to a random string
# node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# Start Postgres + Redis
docker compose up -d

# Run migrations
npm install
npm run migrate

# Seed starter zones and items
node seed.js

# Start backend
npm run dev
# → http://localhost:3000
```

### 2. Start the client

```bash
cd client
bun install
bun dev
# → http://localhost:5173
```

Open http://localhost:5173, create an account, and enter the world.

---

## Recompiling after changes

Edit `backend/world.bone`, then:

```bash
bonec compile backend/world.bone
```

The compiler is deterministic — same `.bone` always produces identical output. Your extension point implementations in `src/extensions.ts` are preserved across recompiles.

---

## WebGPU Note

Shallot requires WebGPU. The Vite dev server sets the required COOP/COEP headers automatically. For production, configure your reverse proxy (nginx/Caddy) to add:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```
