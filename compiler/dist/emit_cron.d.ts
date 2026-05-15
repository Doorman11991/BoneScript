/**
 * BoneScript Cron Jobs Emitter
 * Generates src/cron.ts — scheduled background tasks.
 */
import * as IR from "./ir";
export declare function emitCronJobs(system: IR.IRSystem): string;
