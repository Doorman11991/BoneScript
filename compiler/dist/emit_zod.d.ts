/**
 * BoneScript Zod Schema Emitter
 * Generates Zod v3 validation schemas from an IRSystem.
 */
import * as IR from "./ir";
export declare function emitZodSchemas(system: IR.IRSystem): string;
export declare function emitZodPackageAdditions(): string;
