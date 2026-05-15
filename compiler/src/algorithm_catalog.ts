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
  inputs: { name: string; type: string; description: string }[];
  output: { type: string; description: string };
  complexity: string;
  emit: (bindings: Record<string, string>) => string;
}

// â”€â”€â”€ Algorithm Implementations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const CATALOG: Record<string, AlgorithmSpec> = {
  // â”€â”€â”€ Graph Algorithms â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  shortest_path: {
    name: "shortest_path",
    category: "graph",
    description: "Dijkstra's algorithm for non-negative weighted shortest path.",
    inputs: [
      { name: "graph", type: "map<string, list<{node: string, weight: number}>>", description: "adjacency list" },
      { name: "source", type: "string", description: "starting node" },
      { name: "target", type: "string", description: "destination node" },
    ],
    output: { type: "{path: string[], distance: number} | null", description: "shortest path or null if unreachable" },
    complexity: "O((V + E) log V)",
    emit: (b) => `
function shortestPath(
  graph: Map<string, { node: string; weight: number }[]>,
  source: string,
  target: string
): { path: string[]; distance: number } | null {
  const distances = new Map<string, number>();
  const previous = new Map<string, string>();
  const queue: { node: string; distance: number }[] = [];

  for (const node of graph.keys()) distances.set(node, Infinity);
  distances.set(source, 0);
  queue.push({ node: source, distance: 0 });

  while (queue.length > 0) {
    queue.sort((a, b) => a.distance - b.distance);
    const current = queue.shift()!;
    if (current.node === target) break;
    if (current.distance > (distances.get(current.node) ?? Infinity)) continue;

    for (const edge of graph.get(current.node) || []) {
      const newDist = current.distance + edge.weight;
      if (newDist < (distances.get(edge.node) ?? Infinity)) {
        distances.set(edge.node, newDist);
        previous.set(edge.node, current.node);
        queue.push({ node: edge.node, distance: newDist });
      }
    }
  }

  if (!previous.has(target) && source !== target) return null;
  const path: string[] = [];
  let current: string | undefined = target;
  while (current !== undefined) {
    path.unshift(current);
    current = previous.get(current);
  }
  return { path, distance: distances.get(target) || 0 };
}
`,
  },

  topological_sort: {
    name: "topological_sort",
    category: "graph",
    description: "Kahn's algorithm â€” produces a linear ordering of a DAG.",
    inputs: [
      { name: "graph", type: "map<string, string[]>", description: "adjacency list" },
    ],
    output: { type: "string[] | null", description: "topological order, or null if cycle exists" },
    complexity: "O(V + E)",
    emit: (b) => `
function topologicalSort(graph: Map<string, string[]>): string[] | null {
  const inDegree = new Map<string, number>();
  for (const node of graph.keys()) inDegree.set(node, 0);
  for (const [, neighbors] of graph) {
    for (const n of neighbors) inDegree.set(n, (inDegree.get(n) || 0) + 1);
  }

  const queue: string[] = [];
  for (const [node, deg] of inDegree) if (deg === 0) queue.push(node);

  const result: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);
    for (const neighbor of graph.get(node) || []) {
      inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
      if (inDegree.get(neighbor) === 0) queue.push(neighbor);
    }
  }

  return result.length === graph.size ? result : null;
}
`,
  },

  // â”€â”€â”€ Search â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  binary_search: {
    name: "binary_search",
    category: "search",
    description: "Find target in sorted array.",
    inputs: [
      { name: "items", type: "T[]", description: "sorted array" },
      { name: "target", type: "T", description: "value to find" },
    ],
    output: { type: "number", description: "index of target or -1 if not found" },
    complexity: "O(log n)",
    emit: (b) => `
function binarySearch<T>(items: T[], target: T): number {
  let low = 0, high = items.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (items[mid] === target) return mid;
    if (items[mid] < target) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}
`,
  },

  // â”€â”€â”€ Matching â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  bipartite_matching: {
    name: "bipartite_matching",
    category: "matching",
    description: "Hopcroft-Karp maximum bipartite matching.",
    inputs: [
      { name: "left", type: "string[]", description: "left vertex set" },
      { name: "right", type: "string[]", description: "right vertex set" },
      { name: "edges", type: "{from: string, to: string}[]", description: "valid pairings" },
    ],
    output: { type: "Map<string, string>", description: "matching from left to right" },
    complexity: "O(E sqrt(V))",
    emit: (b) => `
function bipartiteMatching(
  left: string[],
  right: string[],
  edges: { from: string; to: string }[]
): Map<string, string> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }

  const matchL = new Map<string, string>();
  const matchR = new Map<string, string>();

  function dfs(u: string, visited: Set<string>): boolean {
    for (const v of adj.get(u) || []) {
      if (visited.has(v)) continue;
      visited.add(v);
      if (!matchR.has(v) || dfs(matchR.get(v)!, visited)) {
        matchL.set(u, v);
        matchR.set(v, u);
        return true;
      }
    }
    return false;
  }

  for (const u of left) dfs(u, new Set());
  return matchL;
}
`,
  },

  // â”€â”€â”€ Scheduling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  round_robin: {
    name: "round_robin",
    category: "scheduling",
    description: "Cyclic assignment of items to workers.",
    inputs: [
      { name: "items", type: "T[]", description: "items to assign" },
      { name: "workers", type: "W[]", description: "workers" },
    ],
    output: { type: "Map<W, T[]>", description: "assignments per worker" },
    complexity: "O(n)",
    emit: (b) => `
function roundRobin<T, W>(items: T[], workers: W[]): Map<W, T[]> {
  const result = new Map<W, T[]>();
  for (const w of workers) result.set(w, []);
  for (let i = 0; i < items.length; i++) {
    const w = workers[i % workers.length];
    result.get(w)!.push(items[i]);
  }
  return result;
}
`,
  },

  // â”€â”€â”€ Stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  weighted_average: {
    name: "weighted_average",
    category: "stats",
    description: "Weighted arithmetic mean.",
    inputs: [
      { name: "items", type: "{value: number, weight: number}[]", description: "values with weights" },
    ],
    output: { type: "number", description: "weighted average" },
    complexity: "O(n)",
    emit: (b) => `
function weightedAverage(items: { value: number; weight: number }[]): number {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const item of items) {
    totalWeight += item.weight;
    weightedSum += item.value * item.weight;
  }
  return totalWeight === 0 ? 0 : weightedSum / totalWeight;
}
`,
  },

  percentile: {
    name: "percentile",
    category: "stats",
    description: "Compute the kth percentile of a numeric dataset.",
    inputs: [
      { name: "values", type: "number[]", description: "dataset" },
      { name: "k", type: "number", description: "percentile (0-100)" },
    ],
    output: { type: "number", description: "kth percentile value" },
    complexity: "O(n log n)",
    emit: (b) => `
function percentile(values: number[], k: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (k / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}
`,
  },

  // â”€â”€â”€ Sort â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  rank_by: {
    name: "rank_by",
    category: "sort",
    description: "Stable sort by a numeric scoring function.",
    inputs: [
      { name: "items", type: "T[]", description: "items to rank" },
      { name: "score_fn", type: "(item: T) => number", description: "scoring function" },
      { name: "order", type: "'asc' | 'desc'", description: "sort direction" },
    ],
    output: { type: "T[]", description: "sorted array" },
    complexity: "O(n log n)",
    emit: (b) => `
function rankBy<T>(items: T[], scoreFn: (item: T) => number, order: "asc" | "desc"): T[] {
  const sign = order === "asc" ? 1 : -1;
  return [...items].sort((a, b) => sign * (scoreFn(a) - scoreFn(b)));
}
`,
  },

  // â”€â”€â”€ Crypto / Hashing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  consistent_hash: {
    name: "consistent_hash",
    category: "crypto",
    description: "Consistent hashing for distributing keys across nodes.",
    inputs: [
      { name: "key", type: "string", description: "key to hash" },
      { name: "nodes", type: "string[]", description: "available nodes" },
      { name: "replicas", type: "number", description: "virtual nodes per real node" },
    ],
    output: { type: "string", description: "node assigned to key" },
    complexity: "O(N log N) build, O(log N) lookup",
    emit: (b) => `
function consistentHash(key: string, nodes: string[], replicas: number = 100): string {
  if (nodes.length === 0) throw new Error("No nodes available");

  function fnv1a(s: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i);
      hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
    }
    return hash;
  }

  const ring: { hash: number; node: string }[] = [];
  for (const node of nodes) {
    for (let i = 0; i < replicas; i++) {
      ring.push({ hash: fnv1a(node + ":" + i), node });
    }
  }
  ring.sort((a, b) => a.hash - b.hash);

  const target = fnv1a(key);
  for (const entry of ring) {
    if (entry.hash >= target) return entry.node;
  }
  return ring[0].node;
}
`,
  },
};

// â”€â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function lookupAlgorithm(name: string): AlgorithmSpec | null {
  return CATALOG[name] || null;
}

export function listAlgorithms(): string[] {
  return Object.keys(CATALOG).sort();
}

export function listByCategory(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [name, spec] of Object.entries(CATALOG)) {
    if (!result[spec.category]) result[spec.category] = [];
    result[spec.category].push(name);
  }
  for (const cat in result) result[cat].sort();
  return result;
}
