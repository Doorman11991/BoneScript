"use strict";
/**
 * BoneScript Project Scaffolder â€” `bone init`
 * Creates a new BoneScript project with sensible defaults for a chosen domain.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scaffold = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const TEMPLATES = {
    multiplayer_game: `system MyGame {
  domain: multiplayer_game

  entity Player {
    owns: [
      username: string,
      score: uint
    ]
    constraints: [
      username.unique,
      username.length in 3..32,
      score >= 0
    ]
    states: active -> suspended | deleted
    auth: jwt
  }

  capability award_points(player: Player, points: uint) {
    requires: [points > 0, player.state == "active"]
    effects: [player.score += points]
    sync: eventual
  }

  store PlayerStore {
    engine: postgresql
    schema: {
      id: uuid,
      username: string,
      score: uint,
      state: string
    }
  }

  channel game_lobby {
    transport: websocket
    ordering: causal
    participants: set<Player>
    persistence: last_100
  }
}
`,
    saas_platform: `system MySaaS {
  domain: saas_platform

  entity Tenant {
    owns: [
      name: string,
      plan: string,
      active: bool
    ]
    constraints: [
      name.length in 1..100,
      plan in ["free", "pro", "enterprise"]
    ]
    states: trialing -> active -> suspended | cancelled
    auth: oauth2
  }

  entity User {
    owns: [
      email: string,
      tenant_id: uuid,
      role: string
    ]
    constraints: [
      email.unique,
      role in ["admin", "member", "viewer"]
    ]
    auth: oauth2
  }

  capability invite_user(tenant: Tenant, email: string, role: string) {
    requires: [tenant.state == "active", role in ["admin", "member", "viewer"]]
    effects: []
    emits: UserInvited
    sync: transactional
  }

  event UserInvited {
    payload: {
      tenant_id: uuid,
      email: string,
      role: string,
      invited_at: timestamp
    }
    delivery: at_least_once
    ttl: 7d
  }

  store TenantStore {
    engine: postgresql
    schema: {
      id: uuid,
      name: string,
      plan: string,
      active: bool,
      state: string
    }
  }
}
`,
    iot_system: `system MyIoT {
  domain: iot_system

  entity Device {
    owns: [
      serial: string,
      firmware_version: string,
      last_seen: timestamp,
      battery: uint
    ]
    constraints: [
      serial.unique,
      battery <= 100
    ]
    states: online -> offline -> retired
    auth: apikey
  }

  entity Reading {
    owns: [
      device_id: uuid,
      sensor: string,
      value: float,
      recorded_at: timestamp
    ]
  }

  capability ingest_reading(device: Device, sensor: string, value: float) {
    requires: [device.state == "online"]
    effects: [device.last_seen = now()]
    emits: ReadingRecorded
    sync: eventual
  }

  event ReadingRecorded {
    payload: {
      device_id: uuid,
      sensor: string,
      value: float
    }
    delivery: at_least_once
    ttl: 1d
  }

  store DeviceStore {
    engine: dynamodb
    schema: {
      id: uuid,
      serial: string,
      firmware_version: string,
      battery: uint,
      state: string
    }
  }
}
`,
    social_network: `system MySocial {
  domain: social_network

  entity User {
    owns: [
      handle: string,
      display_name: string,
      followers: set<uuid>,
      following: set<uuid>
    ]
    constraints: [
      handle.unique,
      handle.length in 3..30
    ]
    auth: oauth2
  }

  entity Post {
    owns: [
      author_id: uuid,
      content: string,
      likes: uint
    ]
    constraints: [
      content.length in 1..500
    ]
  }

  capability follow_user(follower: User, target: User) {
    requires: [follower != target]
    effects: [
      follower.following += target.id,
      target.followers += follower.id
    ]
    sync: eventual
  }

  channel feed {
    transport: websocket
    ordering: causal
    participants: set<User>
    persistence: last_100
  }
}
`,
    marketplace: `system MyMarket {
  domain: marketplace

  entity Listing {
    owns: [
      seller_id: uuid,
      title: string,
      price: uint,
      stock: uint
    ]
    constraints: [
      title.length in 1..200,
      price > 0,
      stock >= 0
    ]
    states: draft -> active -> sold_out | archived
    auth: oauth2
  }

  entity Order {
    owns: [
      buyer_id: uuid,
      listing_id: uuid,
      quantity: uint,
      total: uint
    ]
    states: pending -> paid -> shipped -> delivered | cancelled
  }

  capability purchase(buyer: User, listing: Listing, qty: uint) {
    requires: [
      listing.state == "active",
      listing.stock >= qty
    ]
    effects: [
      listing.stock -= qty
    ]
    emits: OrderCreated
    sync: transactional
  }

  event OrderCreated {
    payload: {
      order_id: uuid,
      buyer_id: uuid,
      listing_id: uuid,
      total: uint
    }
    delivery: exactly_once
    ttl: 30d
  }
}
`,
    realtime_collaboration: `system MyCollab {
  domain: realtime_collaboration

  entity Document {
    owns: [
      title: string,
      owner_id: uuid,
      content: json,
      version: uint
    ]
    constraints: [
      version >= 1
    ]
    auth: jwt
  }

  entity Cursor {
    owns: [
      document_id: uuid,
      user_id: uuid,
      position: uint,
      color: string
    ]
  }

  capability apply_change(doc: Document, user: User, change: json) {
    requires: [doc.owner_id == user.id or doc.collaborators contains user.id]
    effects: [
      doc.version += 1,
      doc.content = change
    ]
    emits: DocumentChanged
    sync: realtime
  }

  channel doc_session {
    transport: websocket
    ordering: causal
    participants: set<User>
    persistence: last_1000
  }

  event DocumentChanged {
    payload: {
      document_id: uuid,
      user_id: uuid,
      version: uint
    }
    delivery: at_least_once
    ttl: 1d
  }
}
`,
};
function scaffold(opts) {
    const created = [];
    if (!fs.existsSync(opts.outDir)) {
        fs.mkdirSync(opts.outDir, { recursive: true });
    }
    // Main .bone file
    const mainFile = path.join(opts.outDir, `${opts.name}.bone`);
    let content = TEMPLATES[opts.domain];
    // Replace placeholder system name with provided name
    content = content.replace(/^system \w+ \{/, `system ${pascalCase(opts.name)} {`);
    fs.writeFileSync(mainFile, content, "utf-8");
    created.push(mainFile);
    // README
    const readmePath = path.join(opts.outDir, "README.md");
    fs.writeFileSync(readmePath, `# ${opts.name}

BoneScript project (domain: ${opts.domain}).

## Compile

\`\`\`bash
bone compile ${opts.name}.bone
\`\`\`

The output will be written to \`./output/\` as a complete Node.js project.
`, "utf-8");
    created.push(readmePath);
    return { created };
}
exports.scaffold = scaffold;
function pascalCase(s) {
    return s.replace(/(^|[-_\s])(\w)/g, (_, __, c) => c.toUpperCase());
}
//# sourceMappingURL=scaffold.js.map