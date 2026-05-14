/**
 * BoneScript Batch Executor Emitter
 * Generates a batch processing module for sync: batch capabilities.
 * Batch capabilities are queued and processed in configurable intervals.
 */
import * as IR from "./ir";
export declare function emitBatchExecutor(system: IR.IRSystem): string;
