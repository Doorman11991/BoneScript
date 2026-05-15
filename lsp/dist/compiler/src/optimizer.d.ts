/**
 * BoneScript IR Optimizer — Stage 4.5 (between lowering and codegen).
 * Implements spec/07_IR_SPEC.md §6 (IR Optimization).
 *
 * Passes (applied in order, each idempotent):
 * 1. Dead module elimination
 * 2. Store merging (same engine, no conflicting schemas)
 * 3. Event deduplication
 * 4. Dependency minimization (remove transitive deps)
 * 5. Index optimization (remove prefix indexes)
 */
import * as IR from "./ir";
interface OptimizationLog {
    pass: string;
    action: string;
    target: string;
}
export interface OptimizationResult {
    system: IR.IRSystem;
    log: OptimizationLog[];
    modulesRemoved: number;
    eventsDeduped: number;
    depsRemoved: number;
}
export declare function optimize(system: IR.IRSystem): OptimizationResult;
export {};
