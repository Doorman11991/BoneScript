"use strict";
/**
 * BoneScript Type System â€” Internal type representations.
 * Implements spec/04_TYPE_SYSTEM.md.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isComparable = exports.isNumeric = exports.typeToString = exports.typeEquals = exports.BOTTOM = exports.record = exports.generic = exports.prim = void 0;
// â”€â”€â”€ Constructors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function prim(name) {
    return { tag: "primitive", name };
}
exports.prim = prim;
function generic(name, ...args) {
    return { tag: "generic", name, args };
}
exports.generic = generic;
function record(name, fields) {
    return { tag: "record", name, fields };
}
exports.record = record;
exports.BOTTOM = { tag: "bottom" };
// â”€â”€â”€ Type Equality â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function typeEquals(a, b) {
    if (a.tag !== b.tag) {
        // optional<T> accepts T (implicit wrapping)
        if (a.tag === "generic" && a.name === "optional" && typeEquals(a.args[0], b))
            return true;
        if (b.tag === "generic" && b.name === "optional" && typeEquals(b.args[0], a))
            return true;
        // bottom unifies with any optional
        if (a.tag === "bottom" && b.tag === "generic" && b.name === "optional")
            return true;
        if (b.tag === "bottom" && a.tag === "generic" && a.name === "optional")
            return true;
        return false;
    }
    switch (a.tag) {
        case "primitive":
            return a.name === b.name;
        case "generic": {
            const bg = b;
            return a.name === bg.name && a.args.length === bg.args.length &&
                a.args.every((arg, i) => typeEquals(arg, bg.args[i]));
        }
        case "record": {
            const br = b;
            return a.name === br.name; // nominal for records (entity names)
        }
        case "union": {
            const bu = b;
            return a.members.length === bu.members.length &&
                a.members.every((m, i) => typeEquals(m, bu.members[i]));
        }
        case "tuple": {
            const bt = b;
            return a.elements.length === bt.elements.length &&
                a.elements.every((e, i) => typeEquals(e, bt.elements[i]));
        }
        case "bottom":
            return true;
    }
}
exports.typeEquals = typeEquals;
// â”€â”€â”€ Type Display â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function typeToString(t) {
    switch (t.tag) {
        case "primitive": return t.name;
        case "generic": return `${t.name}<${t.args.map(typeToString).join(", ")}>`;
        case "record": return t.name;
        case "union": return t.members.map(typeToString).join(" | ");
        case "tuple": return `(${t.elements.map(typeToString).join(", ")})`;
        case "bottom": return "bottom";
    }
}
exports.typeToString = typeToString;
// â”€â”€â”€ Numeric Type Check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function isNumeric(t) {
    return t.tag === "primitive" && (t.name === "uint" || t.name === "int" || t.name === "float");
}
exports.isNumeric = isNumeric;
function isComparable(t) {
    return isNumeric(t) || (t.tag === "primitive" && (t.name === "string" || t.name === "timestamp"));
}
exports.isComparable = isComparable;
//# sourceMappingURL=types.js.map