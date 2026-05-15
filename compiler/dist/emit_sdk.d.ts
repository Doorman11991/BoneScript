/**
 * BoneScript TypeScript SDK Emitter
 * Generates a typed fetch client SDK from an IRSystem.
 */
import * as IR from "./ir";
export declare function emitTypescriptSdk(system: IR.IRSystem): string;
export declare function emitSdkPackageJson(system: IR.IRSystem): string;
