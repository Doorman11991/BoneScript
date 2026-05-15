/**
 * BoneScript Extension Manager
 *
 * Handles the escape hatch system: extension_point declarations.
 *
 * How it works:
 * 1. Compiler emits a stub with sentinel comments around the implementation region.
 * 2. On recompile, the merger reads the existing output file and extracts any
 *    user code between the sentinels.
 * 3. The user's code is re-injected into the newly generated file.
 * 4. If stable: true and no implementation exists, compilation fails.
 *
 * Sentinel format (must be unique and parseable):
 *   // <bonescript:ext:NAME:begin>
 *   ... user code here ...
 *   // <bonescript:ext:NAME:end>
 */

import * as fs from "fs";
import * as path from "path";
import * as AST from "./ast";

// ─── Sentinel Helpers ────────────────────────────────────────────────────────

export function beginSentinel(name: string): string {
  return `// <bonescript:ext:${name}:begin>`;
}

export function endSentinel(name: string): string {
  return `// <bonescript:ext:${name}:end>`;
}

export function isStubImplementation(code: string): boolean {
  return code.trim() === "" || code.includes("throw new Error(\"Not implemented:");
}

// ─── Stub Generator ──────────────────────────────────────────────────────────

function toTsType(irType: string): string {
  const map: Record<string, string> = {
    string: "string", uint: "number", int: "number", float: "number",
    bool: "boolean", timestamp: "Date", uuid: "string", bytes: "Buffer", json: "unknown",
  };
  if (map[irType]) return map[irType];
  const m = irType.match(/^(list|set)<(.+)>$/);
  if (m) return `${toTsType(m[2])}[]`;
  const om = irType.match(/^optional<(.+)>$/);
  if (om) return `${toTsType(om[1])} | null`;
  return irType;
}

function serializeType(t: AST.TypeExprNode): string {
  switch (t.kind) {
    case "PrimitiveType": return t.name;
    case "GenericType": return `${t.name}<${t.typeArgs.map(serializeType).join(", ")}>`;
    case "EntityRefType": return t.name;
    case "TupleType": return `(${t.elements.map(serializeType).join(", ")})`;
    case "UnionType": return t.members.map(serializeType).join(" | ");
  }
}

export function emitExtensionPointStub(ext: AST.ExtensionPointDeclNode): string {
  const params = ext.params.map(p => `${p.name}: ${toTsType(serializeType(p.type))}`).join(", ");
  const returnType = ext.returns ? toTsType(serializeType(ext.returns)) : "void";
  const lines: string[] = [];

  lines.push(`/**`);
  lines.push(` * Extension point: ${ext.name}`);
  lines.push(` * ${ext.stable ? "STABLE — implementation required." : "Optional — stub used if not implemented."}`);
  lines.push(` * Params: ${ext.params.map(p => `${p.name}: ${serializeType(p.type)}`).join(", ") || "none"}`);
  lines.push(` * Returns: ${ext.returns ? serializeType(ext.returns) : "void"}`);
  lines.push(` */`);
  lines.push(`export function ${ext.name}(${params}): ${returnType} {`);
  lines.push(`  ${beginSentinel(ext.name)}`);
  lines.push(`  throw new Error("Not implemented: ${ext.name}");`);
  lines.push(`  ${endSentinel(ext.name)}`);
  lines.push(`}`);

  return lines.join("\n");
}

// ─── Extension Merger ────────────────────────────────────────────────────────
// Reads an existing generated file and extracts user implementations.

export interface ExtractedImpl {
  name: string;
  code: string;
  isStub: boolean;
}

export function extractImplementations(existingContent: string): Map<string, ExtractedImpl> {
  const result = new Map<string, ExtractedImpl>();
  const beginPattern = /\/\/ <bonescript:ext:([^:]+):begin>/g;
  let match: RegExpExecArray | null;

  while ((match = beginPattern.exec(existingContent)) !== null) {
    const name = match[1];
    const beginIdx = match.index + match[0].length;
    const endMarker = endSentinel(name);
    const endIdx = existingContent.indexOf(endMarker, beginIdx);

    if (endIdx === -1) continue;

    const code = existingContent.slice(beginIdx, endIdx).trim();
    result.set(name, {
      name,
      code,
      isStub: isStubImplementation(code),
    });
  }

  return result;
}

export function mergeImplementations(
  newContent: string,
  existingImpls: Map<string, ExtractedImpl>
): string {
  let result = newContent;

  for (const [name, impl] of existingImpls) {
    if (impl.isStub) continue; // don't restore stubs

    const begin = beginSentinel(name);
    const end = endSentinel(name);
    const beginIdx = result.indexOf(begin);
    const endIdx = result.indexOf(end, beginIdx);

    if (beginIdx === -1 || endIdx === -1) continue;

    const before = result.slice(0, beginIdx + begin.length);
    const after = result.slice(endIdx);
    result = `${before}\n  ${impl.code}\n  ${after}`;
  }

  return result;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface ExtensionValidationError {
  name: string;
  message: string;
}

export function validateExtensions(
  extensions: AST.ExtensionPointDeclNode[],
  existingImpls: Map<string, ExtractedImpl>
): ExtensionValidationError[] {
  const errors: ExtensionValidationError[] = [];

  for (const ext of extensions) {
    if (!ext.stable) continue;

    const impl = existingImpls.get(ext.name);
    if (!impl || impl.isStub) {
      errors.push({
        name: ext.name,
        message: `Extension point '${ext.name}' is marked stable: true but has no implementation. ` +
          `Add your implementation between the sentinel comments in the generated file.`,
      });
    }
  }

  return errors;
}

// ─── File-Level Merge ────────────────────────────────────────────────────────
// Called by the emitter when writing output files.

export async function mergeWithExisting(
  newContent: string,
  outputPath: string,
  extensions: AST.ExtensionPointDeclNode[]
): Promise<{ content: string; validationErrors: ExtensionValidationError[] }> {
  let existingImpls = new Map<string, ExtractedImpl>();

  try {
    const existing = await fs.promises.readFile(outputPath, "utf-8");
    existingImpls = extractImplementations(existing);
  } catch {
    // File doesn't exist yet — start with empty implementations
  }

  const validationErrors = validateExtensions(extensions, existingImpls);
  const content = mergeImplementations(newContent, existingImpls);

  return { content, validationErrors };
}
