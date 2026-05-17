/**
 * Shared utilities used across emitters and pipeline stages.
 * Single source of truth — no more copy-paste.
 */

/** Convert camelCase/PascalCase to snake_case */
export function toSnakeCase(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

/** Convert snake_case to PascalCase */
export function toPascalCase(s: string): string {
  return s.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase());
}

/** Convert snake_case to camelCase */
export function toCamelCase(s: string): string {
  const pascal = toPascalCase(s);
  return pascal[0].toLowerCase() + pascal.slice(1);
}

/** Indent a block of text by n spaces */
export function indent(text: string, spaces: number = 2): string {
  const pad = " ".repeat(spaces);
  return text.split("\n").map(line => line ? pad + line : line).join("\n");
}

/** Map MarrowScript IR types to TypeScript types */
export const TS_TYPE_MAP: Record<string, string> = {
  string: "string",
  uint: "number",
  int: "number",
  float: "number",
  bool: "boolean",
  timestamp: "Date",
  uuid: "string",
  bytes: "Buffer",
  json: "unknown",
};

/** Map MarrowScript IR types to SQL types (Postgres) */
export const SQL_TYPE_MAP: Record<string, string> = {
  string: "VARCHAR",
  uint: "BIGINT",
  int: "BIGINT",
  float: "DOUBLE PRECISION",
  bool: "BOOLEAN",
  timestamp: "TIMESTAMPTZ",
  uuid: "UUID",
  bytes: "BYTEA",
  json: "JSONB",
};

/** Map MarrowScript IR types to SQLite types */
export const SQLITE_TYPE_MAP: Record<string, string> = {
  string: "TEXT",
  uint: "INTEGER",
  int: "INTEGER",
  float: "REAL",
  bool: "INTEGER",
  timestamp: "TEXT",
  uuid: "TEXT",
  bytes: "BLOB",
  json: "TEXT",
};

/** Convert IR type to TypeScript type string */
export function toTsType(irType: string): string {
  if (TS_TYPE_MAP[irType]) return TS_TYPE_MAP[irType];
  const listMatch = irType.match(/^list<(.+)>$/);
  if (listMatch) return `${toTsType(listMatch[1])}[]`;
  const setMatch = irType.match(/^set<(.+)>$/);
  if (setMatch) return `Set<${toTsType(setMatch[1])}>`;
  const mapMatch = irType.match(/^map<(.+),\s*(.+)>$/);
  if (mapMatch) return `Map<${toTsType(mapMatch[1])}, ${toTsType(mapMatch[2])}>`;
  const optMatch = irType.match(/^optional<(.+)>$/);
  if (optMatch) return `${toTsType(optMatch[1])} | null`;
  return irType;
}

/** Convert IR type to SQL type string */
export function toSqlType(irType: string): string {
  if (SQL_TYPE_MAP[irType]) return SQL_TYPE_MAP[irType];
  if (irType.startsWith("list<") || irType.startsWith("set<") || irType.startsWith("map<")) return "JSONB";
  if (irType.startsWith("optional<")) return toSqlType(irType.slice(9, -1));
  return "JSONB";
}

/** Convert IR type to SQLite type string */
export function toSqliteType(irType: string): string {
  if (SQLITE_TYPE_MAP[irType]) return SQLITE_TYPE_MAP[irType];
  if (irType.startsWith("list<") || irType.startsWith("set<") || irType.startsWith("map<")) return "TEXT";
  if (irType.startsWith("optional<")) return toSqliteType(irType.slice(9, -1));
  return "TEXT";
}

/** Parse a duration string (e.g. "30s", "5m", "1h", "7d") to milliseconds */
export function parseDurationMs(dur: string | null): number | null {
  if (!dur) return null;
  const m = dur.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!m) return null;
  const n = parseInt(m[1]);
  switch (m[2]) {
    case "ms": return n;
    case "s": return n * 1000;
    case "m": return n * 60_000;
    case "h": return n * 3_600_000;
    case "d": return n * 86_400_000;
    default: return null;
  }
}
