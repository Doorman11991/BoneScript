/**
 * BoneScript Type System â€” Internal type representations.
 * Implements spec/04_TYPE_SYSTEM.md.
 */

export type CVType =
  | PrimitiveType
  | GenericType
  | RecordType
  | UnionType
  | TupleType
  | BottomType;

export interface PrimitiveType {
  tag: "primitive";
  name: "string" | "uint" | "int" | "float" | "bool" | "timestamp" | "uuid" | "bytes" | "json";
}

export interface GenericType {
  tag: "generic";
  name: "list" | "set" | "map" | "optional" | "result";
  args: CVType[];
}

export interface RecordType {
  tag: "record";
  name: string; // entity name
  fields: Map<string, CVType>;
}

export interface UnionType {
  tag: "union";
  members: CVType[];
}

export interface TupleType {
  tag: "tuple";
  elements: CVType[];
}

export interface BottomType {
  tag: "bottom"; // unifies with any optional<T>
}

// â”€â”€â”€ Constructors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function prim(name: PrimitiveType["name"]): PrimitiveType {
  return { tag: "primitive", name };
}

export function generic(name: GenericType["name"], ...args: CVType[]): GenericType {
  return { tag: "generic", name, args };
}

export function record(name: string, fields: Map<string, CVType>): RecordType {
  return { tag: "record", name, fields };
}

export const BOTTOM: BottomType = { tag: "bottom" };

// â”€â”€â”€ Type Equality â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function typeEquals(a: CVType, b: CVType): boolean {
  if (a.tag !== b.tag) {
    // optional<T> accepts T (implicit wrapping)
    if (a.tag === "generic" && a.name === "optional" && typeEquals(a.args[0], b)) return true;
    if (b.tag === "generic" && b.name === "optional" && typeEquals(b.args[0], a)) return true;
    // bottom unifies with any optional
    if (a.tag === "bottom" && b.tag === "generic" && b.name === "optional") return true;
    if (b.tag === "bottom" && a.tag === "generic" && a.name === "optional") return true;
    return false;
  }

  switch (a.tag) {
    case "primitive":
      return a.name === (b as PrimitiveType).name;
    case "generic": {
      const bg = b as GenericType;
      return a.name === bg.name && a.args.length === bg.args.length &&
        a.args.every((arg, i) => typeEquals(arg, bg.args[i]));
    }
    case "record": {
      const br = b as RecordType;
      return a.name === br.name; // nominal for records (entity names)
    }
    case "union": {
      const bu = b as UnionType;
      return a.members.length === bu.members.length &&
        a.members.every((m, i) => typeEquals(m, bu.members[i]));
    }
    case "tuple": {
      const bt = b as TupleType;
      return a.elements.length === bt.elements.length &&
        a.elements.every((e, i) => typeEquals(e, bt.elements[i]));
    }
    case "bottom":
      return true;
  }
}

// â”€â”€â”€ Type Display â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function typeToString(t: CVType): string {
  switch (t.tag) {
    case "primitive": return t.name;
    case "generic": return `${t.name}<${t.args.map(typeToString).join(", ")}>`;
    case "record": return t.name;
    case "union": return t.members.map(typeToString).join(" | ");
    case "tuple": return `(${t.elements.map(typeToString).join(", ")})`;
    case "bottom": return "bottom";
  }
}

// â”€â”€â”€ Numeric Type Check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function isNumeric(t: CVType): boolean {
  return t.tag === "primitive" && (t.name === "uint" || t.name === "int" || t.name === "float");
}

export function isComparable(t: CVType): boolean {
  return isNumeric(t) || (t.tag === "primitive" && (t.name === "string" || t.name === "timestamp"));
}
