/**
 * BoneScript Algorithm Catalog (Leap 2)
 *
 * A closed catalog of named algorithms. Each entry has:
 *   - inputs: typed parameters the user must bind
 *   - outputs: return type
 *   - description: human-readable explanation
 *   - emit: function that produces a deterministic implementation
 *
 * NEW algorithms can ONLY be added by extending this catalog. The compiler
 * never invents implementations â€” it picks from this list.
 */
export interface AlgorithmSpec {
    name: string;
    category: "graph" | "search" | "sort" | "matching" | "scheduling" | "stats" | "crypto";
    description: string;
    inputs: {
        name: string;
        type: string;
        description: string;
    }[];
    output: {
        type: string;
        description: string;
    };
    complexity: string;
    emit: (bindings: Record<string, string>) => string;
}
export declare const CATALOG: Record<string, AlgorithmSpec>;
export declare function lookupAlgorithm(name: string): AlgorithmSpec | null;
export declare function listAlgorithms(): string[];
export declare function listByCategory(): Record<string, string[]>;
