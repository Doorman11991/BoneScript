"use strict";
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
exports.mergeWithExisting = exports.validateExtensions = exports.mergeImplementations = exports.extractImplementations = exports.emitExtensionPointStub = exports.isStubImplementation = exports.endSentinel = exports.beginSentinel = void 0;
const fs = __importStar(require("fs"));
// ─── Sentinel Helpers ────────────────────────────────────────────────────────
function beginSentinel(name) {
    return `// <bonescript:ext:${name}:begin>`;
}
exports.beginSentinel = beginSentinel;
function endSentinel(name) {
    return `// <bonescript:ext:${name}:end>`;
}
exports.endSentinel = endSentinel;
function isStubImplementation(code) {
    return code.trim() === "" || code.includes("throw new Error(\"Not implemented:");
}
exports.isStubImplementation = isStubImplementation;
// ─── Stub Generator ──────────────────────────────────────────────────────────
function toTsType(irType) {
    const map = {
        string: "string", uint: "number", int: "number", float: "number",
        bool: "boolean", timestamp: "Date", uuid: "string", bytes: "Buffer", json: "unknown",
    };
    if (map[irType])
        return map[irType];
    const m = irType.match(/^(list|set)<(.+)>$/);
    if (m)
        return `${toTsType(m[2])}[]`;
    const om = irType.match(/^optional<(.+)>$/);
    if (om)
        return `${toTsType(om[1])} | null`;
    return irType;
}
function serializeType(t) {
    switch (t.kind) {
        case "PrimitiveType": return t.name;
        case "GenericType": return `${t.name}<${t.typeArgs.map(serializeType).join(", ")}>`;
        case "EntityRefType": return t.name;
        case "TupleType": return `(${t.elements.map(serializeType).join(", ")})`;
        case "UnionType": return t.members.map(serializeType).join(" | ");
    }
}
function emitExtensionPointStub(ext) {
    const params = ext.params.map(p => `${p.name}: ${toTsType(serializeType(p.type))}`).join(", ");
    const returnType = ext.returns ? toTsType(serializeType(ext.returns)) : "void";
    const lines = [];
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
exports.emitExtensionPointStub = emitExtensionPointStub;
function extractImplementations(existingContent) {
    const result = new Map();
    const beginPattern = /\/\/ <bonescript:ext:([^:]+):begin>/g;
    let match;
    while ((match = beginPattern.exec(existingContent)) !== null) {
        const name = match[1];
        const beginIdx = match.index + match[0].length;
        const endMarker = endSentinel(name);
        const endIdx = existingContent.indexOf(endMarker, beginIdx);
        if (endIdx === -1)
            continue;
        const code = existingContent.slice(beginIdx, endIdx).trim();
        result.set(name, {
            name,
            code,
            isStub: isStubImplementation(code),
        });
    }
    return result;
}
exports.extractImplementations = extractImplementations;
function mergeImplementations(newContent, existingImpls) {
    let result = newContent;
    for (const [name, impl] of existingImpls) {
        if (impl.isStub)
            continue; // don't restore stubs
        const begin = beginSentinel(name);
        const end = endSentinel(name);
        const beginIdx = result.indexOf(begin);
        const endIdx = result.indexOf(end, beginIdx);
        if (beginIdx === -1 || endIdx === -1)
            continue;
        const before = result.slice(0, beginIdx + begin.length);
        const after = result.slice(endIdx);
        result = `${before}\n  ${impl.code}\n  ${after}`;
    }
    return result;
}
exports.mergeImplementations = mergeImplementations;
function validateExtensions(extensions, existingImpls) {
    const errors = [];
    for (const ext of extensions) {
        if (!ext.stable)
            continue;
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
exports.validateExtensions = validateExtensions;
// ─── File-Level Merge ────────────────────────────────────────────────────────
// Called by the emitter when writing output files.
function mergeWithExisting(newContent, outputPath, extensions) {
    let existingImpls = new Map();
    if (fs.existsSync(outputPath)) {
        const existing = fs.readFileSync(outputPath, "utf-8");
        existingImpls = extractImplementations(existing);
    }
    const validationErrors = validateExtensions(extensions, existingImpls);
    const content = mergeImplementations(newContent, existingImpls);
    return { content, validationErrors };
}
exports.mergeWithExisting = mergeWithExisting;
//# sourceMappingURL=extension_manager.js.map