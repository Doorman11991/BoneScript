/**
 * BoneScript Constraint Solver â€” Stage 5 of the compilation pipeline.
 * Implements spec/06_CONSTRAINT_SOLVER.md.
 *
 * Resolves all underspecified aspects of the IR into concrete decisions.
 * Uses ONLY: ontology implication rules, domain defaults, structural necessity.
 * NO heuristics. NO probabilistic matching.
 *
 * Phases:
 *   1. Collect â€” gather all constraints
 *   2. Normalize â€” canonical form
 *   3. Propagate â€” unit propagation
 *   4. Check â€” verify consistency
 *   5. Complete â€” fill remaining with defaults
 *   6. Verify â€” final pass
 */
import * as IR from "./ir";
export interface SolverResult {
    resolution: Record<string, string>;
    assumptions: string[];
    warnings: string[];
    errors: string[];
}
export declare class ConstraintSolver {
    solve(system: IR.IRSystem): SolverResult;
}
