/**
 * BoneScript Lowering Helpers
 * Shared utilities used across all lowering phases:
 *   - Deterministic ID generation
 *   - Duration string parsing
 *   - AST type/expression serialization
 */

import { createHash } from "crypto";
import * as AST from "./ast";

// ─── Deterministic ID Generation ─────────────────────────────────────────────

export function makeId(systemName: string, kind: string, name: string): string {
  return createHash("sha256")
    .update(`${systemName}.${kind}.${name}`)
    .digest("hex")
    .slice(0, 16);
}

// ─── Duration Parsing ─────────────────────────────────────────────────────────

export function parseDurationMs(dur: string | null): number | null {
  if (!dur) return null;
  const match = dur.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case "ms": return value;
    case "s":  return value * 1_000;
    case "m":  return value * 60_000;
    case "h":  return value * 3_600_000;
    case "d":  return value * 86_400_000;
    default:   return null;
  }
}

// ─── Type Expression Serialization ───────────────────────────────────────────

export function serializeType(t: AST.TypeExprNode): string {
  switch (t.kind) {
    case "PrimitiveType":  return t.name;
    case "GenericType":    return `${t.name}<${t.typeArgs.map(serializeType).join(", ")}>`;
    case "EntityRefType":  return t.name;
    case "TupleType":      return `(${t.elements.map(serializeType).join(", ")})`;
    case "UnionType":      return t.members.map(serializeType).join(" | ");
  }
}

// ─── Expression Serialization ─────────────────────────────────────────────────

export function serializeExpr(e: AST.ExprNode): string {
  switch (e.kind) {
    case "Literal":
      if (e.type === "string") return `"${e.value}"`;
      if (e.type === "list")   return `[${(e.value as AST.ExprNode[]).map(serializeExpr).join(", ")}]`;
      return String(e.value);
    case "FieldRef":
      return e.path.join(".");
    case "BinaryExpr":
      return `(${serializeExpr(e.left)} ${e.op} ${serializeExpr(e.right)})`;
    case "UnaryExpr":
      return `(${e.op} ${serializeExpr(e.operand)})`;
    case "CallExpr":
      return `${e.name}(${e.args.map(serializeExpr).join(", ")})`;
    case "TernaryExpr":
      return `(${serializeExpr(e.condition)} ? ${serializeExpr(e.consequent)} : ${serializeExpr(e.alternate)})`;
  }
}

// ─── Shared snake_case helper ─────────────────────────────────────────────────

export function toSnakeCase(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}
