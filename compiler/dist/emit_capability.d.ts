/**
 * BoneScript Capability Body Emitter
 *
 * Translates IR effects and preconditions into real TypeScript + SQL.
 */
import * as IR from "./ir";
export declare function emitCapabilityBody(method: IR.IRMethod, mod: IR.IRModule, system: IR.IRSystem, indent?: string): string;
