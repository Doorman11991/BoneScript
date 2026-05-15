/**
 * BoneScript Composition Emitter
 * Generates real implementations for pipeline and algorithm capabilities.
 */
import * as IR from "./ir";
/**
 * Generate the body of a pipeline-based capability.
 * Sequential pipelines thread results step-to-step with auto-rollback on error.
 * Parallel pipelines run all steps concurrently and collect results.
 */
export declare function emitPipelineBody(method: IR.IRMethod, indent?: string): string;
/**
 * Generate the body of an algorithm-based capability by looking up the
 * implementation in the algorithm catalog.
 */
export declare function emitAlgorithmBody(method: IR.IRMethod, indent?: string): string;
/**
 * Emit a single TypeScript file containing all algorithm implementations
 * referenced by capabilities in the system.
 */
export declare function emitAlgorithmsFile(usedAlgorithms: Set<string>): string;
export declare function collectUsedAlgorithms(system: IR.IRSystem): Set<string>;
