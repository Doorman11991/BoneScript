/**
 * BoneScript Type System â€” Internal type representations.
 * Implements spec/04_TYPE_SYSTEM.md.
 */
export type CVType = PrimitiveType | GenericType | RecordType | UnionType | TupleType | BottomType;
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
    name: string;
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
    tag: "bottom";
}
export declare function prim(name: PrimitiveType["name"]): PrimitiveType;
export declare function generic(name: GenericType["name"], ...args: CVType[]): GenericType;
export declare function record(name: string, fields: Map<string, CVType>): RecordType;
export declare const BOTTOM: BottomType;
export declare function typeEquals(a: CVType, b: CVType): boolean;
export declare function typeToString(t: CVType): string;
export declare function isNumeric(t: CVType): boolean;
export declare function isComparable(t: CVType): boolean;
