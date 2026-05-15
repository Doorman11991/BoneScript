import {
  createConnection, TextDocuments, ProposedFeatures,
  InitializeParams, InitializeResult, TextDocumentSyncKind,
  CompletionItem, CompletionItemKind, CompletionParams,
  Diagnostic, DiagnosticSeverity,
  Hover, TextDocumentPositionParams, MarkupKind,
  Location, Range, Position,
  DocumentSymbol, SymbolKind, DocumentSymbolParams,
  SignatureHelp, SignatureInformation, ParameterInformation, SignatureHelpParams,
  CodeAction, CodeActionKind, CodeActionParams, TextEdit, WorkspaceEdit,
  RenameParams, PrepareRenameParams,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Lexer, LexerError } from 'bonescript-compiler';
import { Parser } from 'bonescript-compiler';
import { ParseError } from 'bonescript-compiler';
import { TypeChecker } from 'bonescript-compiler';
import { AST } from 'bonescript-compiler';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// ─── Symbol Cache ─────────────────────────────────────────────────────────────

interface DocSymbols {
  entities: Map<string, AST.EntityDeclNode>;
  capabilities: Map<string, AST.CapabilityDeclNode>;
  events: Map<string, AST.EventDeclNode>;
  stores: Map<string, AST.StoreDeclNode>;
  channels: Map<string, AST.ChannelDeclNode>;
  ast: AST.ProgramNode | null;
}
const symbolCache = new Map<string, DocSymbols>();

function emptySymbols(): DocSymbols {
  return { entities: new Map(), capabilities: new Map(), events: new Map(),
           stores: new Map(), channels: new Map(), ast: null };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wordAt(doc: TextDocument, pos: Position): string {
  const line = doc.getText(Range.create(pos.line, 0, pos.line, 1000));
  const b = line.slice(0, pos.character).match(/[\w]+$/) ?? [''];
  const a = line.slice(pos.character).match(/^[\w]+/) ?? [''];
  return b[0] + a[0];
}

function lineAt(doc: TextDocument, pos: Position): string {
  return doc.getText(Range.create(pos.line, 0, pos.line, 1000));
}

// ─── Initialization ───────────────────────────────────────────────────────────

connection.onInitialize((_: InitializeParams): InitializeResult => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    completionProvider: { triggerCharacters: ['.', ':', ' '], resolveProvider: false },
    hoverProvider: true,
    definitionProvider: true,
    documentSymbolProvider: true,
    signatureHelpProvider: { triggerCharacters: ['(', ','] },
    codeActionProvider: { codeActionKinds: ['quickfix'] },
    renameProvider: { prepareProvider: true },
  },
}));

// ─── Validation + Symbol Extraction ──────────────────────────────────────────

documents.onDidChangeContent(change => validateAndExtract(change.document));

function validateAndExtract(doc: TextDocument): void {
  const text = doc.getText();
  const diagnostics: Diagnostic[] = [];
  const symbols = emptySymbols();

  let tokens;
  try {
    tokens = new Lexer(text).tokenize();
  } catch (e) {
    if (e instanceof LexerError) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: Range.create(e.loc.line - 1, e.loc.column - 1, e.loc.line - 1, e.loc.column + 10),
        message: e.message, source: 'bone-lexer',
      });
    }
    connection.sendDiagnostics({ uri: doc.uri, diagnostics });
    symbolCache.set(doc.uri, symbols);
    return;
  }

  let ast: AST.ProgramNode;
  try {
    ast = new Parser(tokens).parse();
    symbols.ast = ast;
    for (const sys of ast.systems) {
      for (const decl of sys.declarations) {
        switch (decl.kind) {
          case 'EntityDecl': symbols.entities.set(decl.name, decl); break;
          case 'CapabilityDecl': symbols.capabilities.set(decl.name, decl); break;
          case 'EventDecl': symbols.events.set(decl.name, decl); break;
          case 'StoreDecl': symbols.stores.set(decl.name, decl); break;
          case 'ChannelDecl': symbols.channels.set(decl.name, decl); break;
        }
      }
    }
  } catch (e) {
    if (e instanceof ParseError) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: Range.create(e.loc.line - 1, e.loc.column - 1, e.loc.line - 1, e.loc.column + 20),
        message: e.message, source: 'bone-parser',
      });
    }
    connection.sendDiagnostics({ uri: doc.uri, diagnostics });
    symbolCache.set(doc.uri, symbols);
    return;
  }

  const typeErrors = new TypeChecker().check(ast);
  for (const err of typeErrors) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: Range.create(err.loc.line - 1, err.loc.column - 1, err.loc.line - 1, err.loc.column + 20),
      message: `${err.code}: ${err.message}`, source: 'bone-typechecker',
    });
  }
  symbolCache.set(doc.uri, symbols);
  connection.sendDiagnostics({ uri: doc.uri, diagnostics });
}

// ─── Context Detection ────────────────────────────────────────────────────────

type BoneContext = 'top_level' | 'system_body' | 'entity_body' | 'capability_body'
  | 'channel_body' | 'store_body' | 'event_body' | 'policy_body' | 'flow_body'
  | 'field_type' | 'field_access';

function detectContext(doc: TextDocument, pos: Position): BoneContext {
  const text = doc.getText();
  const offset = doc.offsetAt(pos);
  const before = text.slice(0, offset);
  const opens: string[] = [];
  for (let i = 0; i < before.length; i++) {
    if (before[i] === '{') {
      const pre = before.slice(Math.max(0, i - 120), i);
      // capability uses `name(params) {` — match name followed by optional (…) before {
      const kw = pre.match(/\b(system|entity|capability|channel|store|event|policy|flow)\s+\w+(?:\s*\([^)]*\))?\s*$/);
      opens.push(kw ? kw[1] : 'unknown');
    } else if (before[i] === '}') { opens.pop(); }
  }
  if (opens.length === 0) return 'top_level';
  const current = opens[opens.length - 1];
  const currentLine = before.slice(before.lastIndexOf('\n') + 1);
  if (currentLine.match(/\w+\.\w*$/)) return 'field_access';
  if (currentLine.match(/:\s*\w*$/) && ['entity','store','event','capability'].includes(current)) return 'field_type';
  const map: Record<string, BoneContext> = {
    system: 'system_body', entity: 'entity_body', capability: 'capability_body',
    channel: 'channel_body', store: 'store_body', event: 'event_body',
    policy: 'policy_body', flow: 'flow_body',
  };
  return map[current] ?? 'system_body';
}

// ─── Type Completions ─────────────────────────────────────────────────────────

const TYPE_ITEMS: CompletionItem[] = [
  { label: 'string', kind: CompletionItemKind.TypeParameter, detail: 'UTF-8 text' },
  { label: 'uint', kind: CompletionItemKind.TypeParameter, detail: 'Unsigned 64-bit integer' },
  { label: 'int', kind: CompletionItemKind.TypeParameter, detail: 'Signed 64-bit integer' },
  { label: 'float', kind: CompletionItemKind.TypeParameter, detail: '64-bit float' },
  { label: 'bool', kind: CompletionItemKind.TypeParameter, detail: 'Boolean' },
  { label: 'timestamp', kind: CompletionItemKind.TypeParameter, detail: 'UTC timestamp' },
  { label: 'uuid', kind: CompletionItemKind.TypeParameter, detail: 'UUID v4' },
  { label: 'bytes', kind: CompletionItemKind.TypeParameter, detail: 'Raw bytes' },
  { label: 'json', kind: CompletionItemKind.TypeParameter, detail: 'Arbitrary JSON' },
  { label: 'list', kind: CompletionItemKind.TypeParameter, insertText: 'list<${1:type}>', insertTextFormat: 2 },
  { label: 'set', kind: CompletionItemKind.TypeParameter, insertText: 'set<${1:type}>', insertTextFormat: 2 },
  { label: 'map', kind: CompletionItemKind.TypeParameter, insertText: 'map<${1:key}, ${2:value}>', insertTextFormat: 2 },
  { label: 'optional', kind: CompletionItemKind.TypeParameter, insertText: 'optional<${1:type}>', insertTextFormat: 2 },
];

// ─── Completions ──────────────────────────────────────────────────────────────

connection.onCompletion((params: CompletionParams): CompletionItem[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const ctx = detectContext(doc, params.position);
  const sym = symbolCache.get(params.textDocument.uri) ?? emptySymbols();
  const line = lineAt(doc, params.position);

  if (ctx === 'field_access') {
    const m = line.slice(0, params.position.character).match(/(\w+)\.\w*$/);
    if (m) {
      const entity = sym.entities.get(m[1]) ?? [...sym.entities.values()].find(e => e.name.toLowerCase() === m[1].toLowerCase());
      if (entity) {
        const items: CompletionItem[] = [
          { label: 'id', kind: CompletionItemKind.Field, detail: 'uuid' },
          { label: 'created_at', kind: CompletionItemKind.Field, detail: 'timestamp' },
          { label: 'updated_at', kind: CompletionItemKind.Field, detail: 'timestamp' },
          { label: 'state', kind: CompletionItemKind.Field, detail: 'string (state machine)' },
        ];
        for (const f of entity.owns) {
          const t = f.type.kind === 'PrimitiveType' ? f.type.name : f.type.kind === 'EntityRefType' ? f.type.name : '...';
          items.push({ label: f.name, kind: CompletionItemKind.Field, detail: t });
        }
        return items;
      }
    }
    return [];
  }

  const entityNames = [...sym.entities.keys()].map(n => ({ label: n, kind: CompletionItemKind.Class, detail: 'entity' }));
  const eventNames = [...sym.events.keys()].map(n => ({ label: n, kind: CompletionItemKind.Event, detail: 'event' }));
  const capNames = [...sym.capabilities.keys()].map(n => ({ label: n, kind: CompletionItemKind.Function, detail: 'capability' }));

  switch (ctx) {
    case 'top_level': return [{ label: 'system', kind: CompletionItemKind.Keyword, insertText: 'system ${1:Name} {\n  domain: ${2:saas_platform}\n\n  $0\n}', insertTextFormat: 2 }];
    case 'system_body': return [
      { label: 'entity', kind: CompletionItemKind.Class, insertText: 'entity ${1:Name} {\n  owns: [\n    ${2:field}: ${3:string}\n  ]\n  $0\n}', insertTextFormat: 2 },
      { label: 'capability', kind: CompletionItemKind.Function, insertText: 'capability ${1:name}(${2:param}: ${3:Type}) {\n  requires: [$0]\n  effects: []\n  sync: eventual\n}', insertTextFormat: 2 },
      { label: 'channel', kind: CompletionItemKind.Interface, insertText: 'channel ${1:name} {\n  transport: websocket\n  ordering: fifo\n  participants: set<${2:Entity}>\n}', insertTextFormat: 2 },
      { label: 'store', kind: CompletionItemKind.Module, insertText: 'store ${1:Name}Store {\n  engine: postgresql\n  schema: {\n    $0\n  }\n}', insertTextFormat: 2 },
      { label: 'event', kind: CompletionItemKind.Event, insertText: 'event ${1:Name} {\n  payload: {\n    $0\n  }\n  delivery: at_least_once\n  ttl: 7d\n}', insertTextFormat: 2 },
      { label: 'policy', kind: CompletionItemKind.Property, insertText: 'policy ${1:name} {\n  rate_limit: ${2:100} per ${3:1m}\n  access: [${4:user}]\n  audit: true\n}', insertTextFormat: 2 },
      { label: 'flow', kind: CompletionItemKind.Struct, insertText: 'flow ${1:name} {\n  step ${2:first}: ${3:action}($4)\n    compensate: ${5:undo}($6)\n  step ${7:second}: ${8:action2}($9)\n    compensate: ${10:undo2}($11)\n}', insertTextFormat: 2 },
      { label: 'constraint', kind: CompletionItemKind.Constant, insertText: 'constraint ${1:name}: ${0}', insertTextFormat: 2 },
      { label: 'extension_point', kind: CompletionItemKind.Interface, insertText: 'extension_point ${1:name}(${2:param}: ${3:Type}) {\n  returns: ${4:void}\n  stable: true\n}', insertTextFormat: 2 },
      ...entityNames, ...eventNames,
    ];
    case 'entity_body': return [
      { label: 'owns', kind: CompletionItemKind.Keyword, insertText: 'owns: [\n  ${1:field}: ${2:string}\n]', insertTextFormat: 2 },
      { label: 'constraints', kind: CompletionItemKind.Keyword, insertText: 'constraints: [$0]', insertTextFormat: 2 },
      { label: 'states', kind: CompletionItemKind.Keyword, insertText: 'states: ${1:active} -> ${2:inactive}', insertTextFormat: 2 },
      { label: 'auth', kind: CompletionItemKind.Keyword, insertText: 'auth: ${1|jwt,oauth2,apikey,session,none|}', insertTextFormat: 2 },
      { label: 'index', kind: CompletionItemKind.Keyword, insertText: 'index: [${1:field}]', insertTextFormat: 2 },
      { label: 'relation', kind: CompletionItemKind.Keyword, insertText: 'relation ${1:name}: ${2|has_one,has_many,belongs_to,many_to_many|} ${3:Entity}', insertTextFormat: 2 },
      { label: 'derived', kind: CompletionItemKind.Keyword, insertText: 'derived ${1:name}: ${0}', insertTextFormat: 2 },
      ...TYPE_ITEMS,
    ];
    case 'capability_body': return [
      { label: 'requires', kind: CompletionItemKind.Keyword, insertText: 'requires: [$0]', insertTextFormat: 2 },
      { label: 'effects', kind: CompletionItemKind.Keyword, insertText: 'effects: [$0]', insertTextFormat: 2 },
      { label: 'emits', kind: CompletionItemKind.Keyword, insertText: 'emits: ${1:EventName}', insertTextFormat: 2 },
      { label: 'sync', kind: CompletionItemKind.Keyword, insertText: 'sync: ${1|transactional,eventual,realtime,batch|}', insertTextFormat: 2 },
      { label: 'timeout', kind: CompletionItemKind.Keyword, insertText: 'timeout: ${1:30s}', insertTextFormat: 2 },
      { label: 'idempotent', kind: CompletionItemKind.Keyword, insertText: 'idempotent: ${1|true,false|}', insertTextFormat: 2 },
      { label: 'retry', kind: CompletionItemKind.Keyword, insertText: 'retry: { max_attempts: ${1:3}, backoff: ${2|exponential,linear,fixed|}, interval: ${3:1s} }', insertTextFormat: 2 },
      { label: 'pipeline', kind: CompletionItemKind.Keyword, insertText: 'pipeline: {\n  ${1:step}($2)\n  on_error: rollback\n}', insertTextFormat: 2 },
      { label: 'algorithm', kind: CompletionItemKind.Keyword, insertText: 'algorithm: ${1|shortest_path,rank_by,percentile,bipartite_matching,round_robin,consistent_hash,binary_search,topological_sort,weighted_average|}', insertTextFormat: 2 },
      ...eventNames,
    ];
    case 'channel_body': return [
      { label: 'transport', kind: CompletionItemKind.Keyword, insertText: 'transport: ${1|websocket,sse,polling,grpc_stream|}', insertTextFormat: 2 },
      { label: 'ordering', kind: CompletionItemKind.Keyword, insertText: 'ordering: ${1|causal,fifo,total,unordered|}', insertTextFormat: 2 },
      { label: 'participants', kind: CompletionItemKind.Keyword, insertText: 'participants: set<${1:Entity}>', insertTextFormat: 2 },
      { label: 'persistence', kind: CompletionItemKind.Keyword, insertText: 'persistence: ${1|none,last_100,full|}', insertTextFormat: 2 },
      { label: 'max_size', kind: CompletionItemKind.Keyword, insertText: 'max_size: ${1:10000}', insertTextFormat: 2 },
      { label: 'filter', kind: CompletionItemKind.Keyword, insertText: 'filter: ${0}', insertTextFormat: 2 },
    ];
    case 'store_body': return [
      { label: 'engine', kind: CompletionItemKind.Keyword, insertText: 'engine: ${1|postgresql,redis,mongodb,sqlite,s3,dynamodb|}', insertTextFormat: 2 },
      { label: 'schema', kind: CompletionItemKind.Keyword, insertText: 'schema: {\n  $0\n}', insertTextFormat: 2 },
      { label: 'retention', kind: CompletionItemKind.Keyword, insertText: 'retention: ${1:30d}', insertTextFormat: 2 },
      { label: 'partition', kind: CompletionItemKind.Keyword, insertText: 'partition: ${1:id}', insertTextFormat: 2 },
      { label: 'replicas', kind: CompletionItemKind.Keyword, insertText: 'replicas: ${1:2}', insertTextFormat: 2 },
    ];
    case 'event_body': return [
      { label: 'payload', kind: CompletionItemKind.Keyword, insertText: 'payload: {\n  $0\n}', insertTextFormat: 2 },
      { label: 'delivery', kind: CompletionItemKind.Keyword, insertText: 'delivery: ${1|at_least_once,at_most_once,exactly_once|}', insertTextFormat: 2 },
      { label: 'ttl', kind: CompletionItemKind.Keyword, insertText: 'ttl: ${1:7d}', insertTextFormat: 2 },
    ];
    case 'policy_body': return [
      { label: 'rate_limit', kind: CompletionItemKind.Keyword, insertText: 'rate_limit: ${1:100} per ${2:1m}', insertTextFormat: 2 },
      { label: 'access', kind: CompletionItemKind.Keyword, insertText: 'access: [${1:user}]', insertTextFormat: 2 },
      { label: 'audit', kind: CompletionItemKind.Keyword, insertText: 'audit: ${1|true,false|}', insertTextFormat: 2 },
      { label: 'encryption', kind: CompletionItemKind.Keyword, insertText: 'encryption: ${1|both,at_rest,in_transit,none|}', insertTextFormat: 2 },
    ];
    case 'flow_body': return [
      { label: 'step', kind: CompletionItemKind.Keyword, insertText: 'step ${1:name}: ${2:capability}($3)\n  compensate: ${4:undo}($5)', insertTextFormat: 2 },
      ...capNames,
    ];
    case 'field_type': return TYPE_ITEMS;
    default: return TYPE_ITEMS;
  }
});

// ─── Hover ────────────────────────────────────────────────────────────────────

const KEYWORD_DOCS: Record<string, string> = {
  system: '**system** — Top-level declaration. A bounded, deployable software system.',
  entity: '**entity** — A uniquely identifiable, stateful data object. Gets `id`, `created_at`, `updated_at` automatically.',
  capability: '**capability** — A named, atomic operation that changes system state.',
  channel: '**channel** — A communication pathway between participants.',
  store: '**store** — A persistence mechanism. Supports: postgresql, redis, mongodb, sqlite, s3, dynamodb.',
  event: '**event** — An immutable record of something that happened.',
  flow: '**flow** — A multi-step orchestrated process (saga). Each step must have a compensation.',
  policy: '**policy** — Security and rate-limiting rules.',
  constraint: '**constraint** — A cross-entity invariant that must always hold.',
  extension_point: '**extension_point** — Escape hatch for custom TypeScript. Code between sentinels is preserved on recompile.',
  jwt: '**jwt** — JSON Web Token authentication. Stateless, token-based.',
  oauth2: '**oauth2** — OAuth 2.0 delegated authentication.',
  apikey: '**apikey** — API key authentication.',
  websocket: '**websocket** — Full-duplex WebSocket transport. Best for realtime.',
  sse: '**sse** — Server-Sent Events. One-way server to client streaming.',
  postgresql: '**postgresql** — Relational database. ACID transactions, rich queries.',
  redis: '**redis** — In-memory store. Best for sessions, caching, pub/sub.',
  mongodb: '**mongodb** — Document database. Flexible schema.',
  dynamodb: '**dynamodb** — AWS managed NoSQL. Best for IoT/high-throughput.',
  realtime: '**realtime** — Synchronous, immediate consistency. Wraps in WebSocket broadcast.',
  eventual: '**eventual** — Asynchronous, eventual consistency. Events queued via outbox.',
  transactional: '**transactional** — Full ACID transaction. Wraps in BEGIN/COMMIT/ROLLBACK.',
  batch: '**batch** — Queued batch processing. Items collected and flushed on interval.',
  exactly_once: '**exactly_once** — Each event delivered exactly once. Uses transactional outbox + deduplication.',
  at_least_once: '**at_least_once** — Each event delivered at least once. Consumers must be idempotent.',
  at_most_once: '**at_most_once** — Each event delivered at most once. No retry on failure.',
  causal: '**causal** — Causally related messages delivered in order.',
  fifo: '**fifo** — First-in, first-out ordering.',
  shortest_path: '**shortest_path** — Dijkstra algorithm. O((V+E) log V).',
  rank_by: '**rank_by** — Stable sort by scoring function. O(n log n).',
  percentile: '**percentile** — Compute kth percentile of a dataset.',
  bipartite_matching: '**bipartite_matching** — Hopcroft-Karp maximum matching.',
  round_robin: '**round_robin** — Cyclic assignment of items to workers.',
  consistent_hash: '**consistent_hash** — Consistent hashing for key distribution.',
};

connection.onHover((params: TextDocumentPositionParams): Hover | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const word = wordAt(doc, params.position);
  if (!word) return null;

  const kwDoc = KEYWORD_DOCS[word];
  if (kwDoc) return { contents: { kind: MarkupKind.Markdown, value: kwDoc } };

  const sym = symbolCache.get(params.textDocument.uri);
  if (!sym) return null;

  const entity = sym.entities.get(word);
  if (entity) {
    const fields = entity.owns.map(f => {
      const t = f.type.kind === 'PrimitiveType' ? f.type.name
        : f.type.kind === 'GenericType' ? `${f.type.name}<...>`
        : f.type.kind === 'EntityRefType' ? f.type.name : 'unknown';
      return `  ${f.name}: ${t}`;
    });
    const allFields = ['  id: uuid', '  created_at: timestamp', '  updated_at: timestamp', ...fields];
    const states = entity.states ? `\n\n**States:** ${entity.states.nodes.map((n: any) => n.name).join(' -> ')}` : '';
    const auth = entity.auth ? `\n\n**Auth:** ${entity.auth}` : '';
    const constraintCount = entity.constraints.length;
    const constraintNote = constraintCount > 0 ? `\n\n**Constraints:** ${constraintCount}` : '';
    return { contents: { kind: MarkupKind.Markdown, value: `**entity ${word}**\n\n\`\`\`bone\n${allFields.join('\n')}\n\`\`\`${states}${auth}${constraintNote}` } };
  }

  const cap = sym.capabilities.get(word);
  if (cap) {
    const ps = cap.params.map((p: any) => {
      const t = p.type.kind === 'PrimitiveType' ? p.type.name : p.type.kind === 'EntityRefType' ? p.type.name : '...';
      return `${p.name}: ${t}`;
    }).join(', ');
    const sync = cap.sync ? `\n\n**sync:** \`${cap.sync}\`` : '';
    const emits = cap.emits.length > 0 ? `\n\n**emits:** ${cap.emits.map((e: any) => e.eventName).join(', ')}` : '';
    const pre = cap.requires.length > 0 ? `\n\n**requires:** ${cap.requires.length} precondition(s)` : '';
    const eff = cap.effects.length > 0 ? `\n\n**effects:** ${cap.effects.length} effect(s)` : '';
    return { contents: { kind: MarkupKind.Markdown, value: `**capability ${word}**(${ps})${sync}${pre}${eff}${emits}` } };
  }

  const ev = sym.events.get(word);
  if (ev) {
    const fields = ev.payload.map((f: any) => `  ${f.name}: ${f.type.kind === 'PrimitiveType' ? f.type.name : '...'}`);
    const delivery = ev.delivery ? `\n\n**delivery:** \`${ev.delivery}\`` : '';
    const ttl = ev.ttl ? `\n\n**ttl:** ${ev.ttl}` : '';
    return { contents: { kind: MarkupKind.Markdown, value: `**event ${word}**\n\n\`\`\`bone\n${fields.join('\n')}\n\`\`\`${delivery}${ttl}` } };
  }

  const store = sym.stores.get(word);
  if (store) {
    return { contents: { kind: MarkupKind.Markdown, value: `**store ${word}**\n\n**engine:** ${store.engine || 'postgresql'}\n\n**fields:** ${store.schema.length}` } };
  }

  const channel = sym.channels.get(word);
  if (channel) {
    return { contents: { kind: MarkupKind.Markdown, value: `**channel ${word}**\n\n**transport:** ${(channel as any).transport || 'websocket'}\n\n**ordering:** ${(channel as any).ordering || 'fifo'}\n\n**persistence:** ${(channel as any).persistence || 'none'}` } };
  }

  return null;
});

// ─── Go-to-Definition ─────────────────────────────────────────────────────────

connection.onDefinition((params: TextDocumentPositionParams): Location | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const word = wordAt(doc, params.position);
  if (!word) return null;
  const sym = symbolCache.get(params.textDocument.uri);
  if (!sym) return null;
  const maps = [sym.entities, sym.capabilities, sym.events, sym.stores, sym.channels];
  for (const map of maps) {
    const node = (map as Map<string, AST.ASTNode>).get(word);
    if (node) {
      const line = node.loc.line - 1;
      return Location.create(params.textDocument.uri, Range.create(line, 0, line, 200));
    }
  }
  return null;
});

// ─── Document Symbols (Outline) ───────────────────────────────────────────────

connection.onDocumentSymbol((params: DocumentSymbolParams): DocumentSymbol[] => {
  const sym = symbolCache.get(params.textDocument.uri);
  if (!sym?.ast) return [];
  const result: DocumentSymbol[] = [];
  for (const sys of sym.ast.systems) {
    const sysLine = sys.loc.line - 1;
    const children: DocumentSymbol[] = [];
    const kindMap: Record<string, SymbolKind> = {
      EntityDecl: SymbolKind.Class, CapabilityDecl: SymbolKind.Function,
      EventDecl: SymbolKind.Event, StoreDecl: SymbolKind.Module,
      ChannelDecl: SymbolKind.Interface, FlowDecl: SymbolKind.Struct,
      PolicyDecl: SymbolKind.Property, ConstraintDecl: SymbolKind.Constant,
      ExtensionPointDecl: SymbolKind.Interface,
    };
    for (const decl of sys.declarations) {
      const kind = kindMap[decl.kind];
      if (!kind) continue;
      const name = (decl as any).name as string;
      const line = decl.loc.line - 1;
      children.push({ name, kind, range: Range.create(line, 0, line + 20, 0), selectionRange: Range.create(line, 0, line, name.length + 10) });
    }
    result.push({ name: sys.name, kind: SymbolKind.Namespace, range: Range.create(sysLine, 0, sysLine + 200, 0), selectionRange: Range.create(sysLine, 0, sysLine, sys.name.length + 7), children });
  }
  return result;
});

// ─── Signature Help ───────────────────────────────────────────────────────────

connection.onSignatureHelp((params: SignatureHelpParams): SignatureHelp | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const line = lineAt(doc, params.position);
  const before = line.slice(0, params.position.character);
  const m = before.match(/(\w+)\s*\(([^)]*)$/);
  if (!m) return null;
  const sym = symbolCache.get(params.textDocument.uri);
  if (!sym) return null;
  const cap = sym.capabilities.get(m[1]);
  if (!cap) return null;
  const paramLabels = cap.params.map((p: any) => {
    const t = p.type.kind === 'PrimitiveType' ? p.type.name : p.type.kind === 'EntityRefType' ? p.type.name : '...';
    return `${p.name}: ${t}`;
  });
  const sig: SignatureInformation = {
    label: `${m[1]}(${paramLabels.join(', ')})`,
    documentation: { kind: MarkupKind.Markdown, value: `**capability** ${m[1]}` },
    parameters: paramLabels.map((l: string) => ({ label: l } as ParameterInformation)),
  };
  return { signatures: [sig], activeSignature: 0, activeParameter: Math.min(m[2].split(',').length - 1, cap.params.length - 1) };
});

// ─── Start ────────────────────────────────────────────────────────────────────

documents.listen(connection);
connection.listen();

// ─── Feature 1: Expression Completions ───────────────────────────────────────
// Detects when cursor is inside requires:[...] or effects:[...] of a capability
// and suggests the capability's parameter names + entity field names.

function detectCapabilityExprContext(doc: TextDocument, pos: Position): {
  inExpression: boolean;
  clauseType: 'requires' | 'effects' | 'emits' | null;
  capabilityName: string | null;
} {
  const text = doc.getText();
  const offset = doc.offsetAt(pos);
  const before = text.slice(0, offset);

  // Find which capability we're inside
  const capMatch = [...before.matchAll(/\bcapability\s+(\w+)\s*\(/g)];
  if (capMatch.length === 0) return { inExpression: false, clauseType: null, capabilityName: null };
  const capName = capMatch[capMatch.length - 1][1];

  // Find the last clause keyword before cursor
  const clauseMatch = before.match(/\b(requires|effects|emits)\s*:\s*\[([^\]]*)$/);
  if (!clauseMatch) return { inExpression: false, clauseType: null, capabilityName: capName };

  return {
    inExpression: true,
    clauseType: clauseMatch[1] as 'requires' | 'effects' | 'emits',
    capabilityName: capName,
  };
}

// Patch the onCompletion handler to add expression completions
// We do this by wrapping — the original handler is stored and called first
const _originalOnCompletion = (connection as any)._handlers?.['textDocument/completion'];

connection.onCompletion((params: CompletionParams): CompletionItem[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];

  const sym = symbolCache.get(params.textDocument.uri) ?? emptySymbols();

  // Check if we're inside a capability expression clause
  const exprCtx = detectCapabilityExprContext(doc, params.position);
  if (exprCtx.inExpression && exprCtx.capabilityName) {
    const cap = sym.capabilities.get(exprCtx.capabilityName);
    const items: CompletionItem[] = [];

    if (cap) {
      // Suggest capability parameters
      for (const p of cap.params) {
        const typeName = p.type.kind === 'PrimitiveType' ? p.type.name
          : p.type.kind === 'EntityRefType' ? p.type.name : '...';
        items.push({
          label: p.name,
          kind: CompletionItemKind.Variable,
          detail: `param: ${typeName}`,
          documentation: { kind: MarkupKind.Markdown, value: `Capability parameter \`${p.name}: ${typeName}\`` },
        });

        // If param is an entity, also suggest its fields as dotted paths
        const entity = sym.entities.get(p.type.kind === 'EntityRefType' ? p.type.name : '');
        if (entity) {
          for (const f of entity.owns) {
            const ft = f.type.kind === 'PrimitiveType' ? f.type.name : '...';
            items.push({
              label: `${p.name}.${f.name}`,
              kind: CompletionItemKind.Field,
              detail: ft,
              documentation: { kind: MarkupKind.Markdown, value: `Field \`${f.name}: ${ft}\` of \`${p.type.kind === 'EntityRefType' ? p.type.name : ''}\`` },
            });
          }
          // Auto-fields
          items.push({ label: `${p.name}.id`, kind: CompletionItemKind.Field, detail: 'uuid' });
          items.push({ label: `${p.name}.state`, kind: CompletionItemKind.Field, detail: 'string' });
          items.push({ label: `${p.name}.created_at`, kind: CompletionItemKind.Field, detail: 'timestamp' });
        }
      }

      // For effects: suggest assignment operators
      if (exprCtx.clauseType === 'effects') {
        items.push({ label: '=', kind: CompletionItemKind.Operator, detail: 'assign' });
        items.push({ label: '+=', kind: CompletionItemKind.Operator, detail: 'add / set append' });
        items.push({ label: '-=', kind: CompletionItemKind.Operator, detail: 'subtract / set remove' });
      }

      // For requires: suggest comparison operators and common patterns
      if (exprCtx.clauseType === 'requires') {
        items.push({ label: '==', kind: CompletionItemKind.Operator, detail: 'equals' });
        items.push({ label: '!=', kind: CompletionItemKind.Operator, detail: 'not equals' });
        items.push({ label: '>', kind: CompletionItemKind.Operator, detail: 'greater than' });
        items.push({ label: '>=', kind: CompletionItemKind.Operator, detail: 'greater than or equal' });
        items.push({ label: 'now()', kind: CompletionItemKind.Function, detail: 'current timestamp' });
      }

      // For emits: suggest declared events
      for (const evName of sym.events.keys()) {
        items.push({ label: evName, kind: CompletionItemKind.Event, detail: 'event' });
      }
    }

    return items;
  }

  // Fall through to context-based completions (already registered above)
  // Return empty here — the original handler runs via the switch statement
  return [];
});

// ─── Feature 2: Code Actions ──────────────────────────────────────────────────
// Provides quick fixes for common type errors.


// Track diagnostics per document for code action lookup
const documentDiagnostics = new Map<string, Diagnostic[]>();

// Override sendDiagnostics to also cache them
const _origSend = connection.sendDiagnostics.bind(connection);
connection.sendDiagnostics = (params) => {
  documentDiagnostics.set(params.uri, params.diagnostics);
  return _origSend(params);
};

connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];

  const actions: CodeAction[] = [];
  const sym = symbolCache.get(params.textDocument.uri);

  for (const diag of params.context.diagnostics) {
    const line = diag.range.start.line;
    const lineText = doc.getText(Range.create(line, 0, line, 1000));
    const indent = lineText.match(/^(\s*)/)?.[1] ?? '  ';

    // T012: Flow must have at least 2 steps
    if (diag.message.includes('T012') || diag.message.includes('at least 2 steps')) {
      actions.push({
        title: 'Add missing flow step',
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit: {
          changes: {
            [params.textDocument.uri]: [{
              range: Range.create(line + 1, 0, line + 1, 0),
              newText: `${indent}  step second_step: action($1)\n${indent}    compensate: undo($2)\n`,
            }],
          },
        },
      });
    }

    // T009: Duplicate field name
    if (diag.message.includes('T009') || diag.message.includes('Duplicate field')) {
      actions.push({
        title: 'Remove duplicate field',
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit: {
          changes: {
            [params.textDocument.uri]: [{
              range: Range.create(line, 0, line + 1, 0),
              newText: '',
            }],
          },
        },
      });
    }

    // T011: Emitted event not declared — offer to create it
    const eventMatch = diag.message.match(/Emitted event '(\w+)' is not declared/);
    if (eventMatch) {
      const evName = eventMatch[1];
      // Find end of system body to insert event declaration
      const text = doc.getText();
      const lastBrace = text.lastIndexOf('}');
      const insertLine = doc.positionAt(lastBrace).line;
      actions.push({
        title: `Create event '${evName}'`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit: {
          changes: {
            [params.textDocument.uri]: [{
              range: Range.create(insertLine, 0, insertLine, 0),
              newText: `  event ${evName} {\n    payload: {\n      id: uuid,\n      timestamp: timestamp\n    }\n    delivery: at_least_once\n    ttl: 7d\n  }\n\n`,
            }],
          },
        },
      });
    }

    // T001: Undefined type — offer to create entity
    const typeMatch = diag.message.match(/Undefined type.*'(\w+)'/);
    if (typeMatch && diag.message.includes('T001')) {
      const typeName = typeMatch[1];
      if (!sym?.entities.has(typeName)) {
        const text = doc.getText();
        const lastBrace = text.lastIndexOf('}');
        const insertLine = doc.positionAt(lastBrace).line;
        actions.push({
          title: `Create entity '${typeName}'`,
          kind: CodeActionKind.QuickFix,
          diagnostics: [diag],
          edit: {
            changes: {
              [params.textDocument.uri]: [{
                range: Range.create(insertLine, 0, insertLine, 0),
                newText: `  entity ${typeName} {\n    owns: [\n      id: uuid\n    ]\n  }\n\n`,
              }],
            },
          },
        });
      }
    }

    // Missing required clause in capability — offer to add it
    if (diag.message.includes('requires') && diag.message.includes('missing')) {
      actions.push({
        title: 'Add requires clause',
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit: {
          changes: {
            [params.textDocument.uri]: [{
              range: Range.create(line + 1, 0, line + 1, 0),
              newText: `${indent}  requires: []\n`,
            }],
          },
        },
      });
    }
  }

  return actions;
});

// ─── Feature 3: Rename Symbol ─────────────────────────────────────────────────
// Finds all references to a symbol and renames them.


connection.onPrepareRename((params: PrepareRenameParams) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const word = wordAt(doc, params.position);
  if (!word) return null;

  const sym = symbolCache.get(params.textDocument.uri);
  if (!sym) return null;

  // Only allow renaming user-defined symbols
  const isDefined = sym.entities.has(word) || sym.capabilities.has(word) ||
    sym.events.has(word) || sym.stores.has(word) || sym.channels.has(word);
  if (!isDefined) return null;

  // Return the range of the word at cursor
  const line = params.position.line;
  const lineText = doc.getText(Range.create(line, 0, line, 1000));
  const col = params.position.character;
  const start = lineText.slice(0, col).search(/\w+$/) ?? col;
  const end = col + (lineText.slice(col).match(/^\w+/)?.[0].length ?? 0);
  return Range.create(line, start, line, end);
});

connection.onRenameRequest((params: RenameParams): WorkspaceEdit | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const oldName = wordAt(doc, params.position);
  if (!oldName) return null;
  const newName = params.newName;
  if (!newName || newName === oldName) return null;

  const sym = symbolCache.get(params.textDocument.uri);
  if (!sym) return null;

  // Verify it's a renameable symbol
  const isDefined = sym.entities.has(oldName) || sym.capabilities.has(oldName) ||
    sym.events.has(oldName) || sym.stores.has(oldName) || sym.channels.has(oldName);
  if (!isDefined) return null;

  // Find all occurrences of the word in the document
  const text = doc.getText();
  const edits: TextEdit[] = [];
  const pattern = new RegExp(`\\b${oldName}\\b`, 'g');
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const startPos = doc.positionAt(match.index);
    const endPos = doc.positionAt(match.index + oldName.length);
    edits.push({ range: Range.create(startPos, endPos), newText: newName });
  }

  if (edits.length === 0) return null;

  return {
    changes: {
      [params.textDocument.uri]: edits,
    },
  };
});


documents.listen(connection);
connection.listen();
