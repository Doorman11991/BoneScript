/**
 * BoneScript Runtime Code Emitter
 * Generates runnable service code from IR.
 */
import * as IR from "./ir";
export declare function emitPackageJson(system: IR.IRSystem): string;
export declare function emitTsConfig(): string;
export declare function emitDbClient(system: IR.IRSystem): string;
export declare function emitAuthMiddleware(system: IR.IRSystem): string;
export declare function emitEntityRouter(mod: IR.IRModule, system: IR.IRSystem): string;
export declare function emitStateMachineRuntime(sm: IR.IRStateMachine): string;
export declare function emitIndex(system: IR.IRSystem): string;
export declare function emitMigration(system: IR.IRSystem, schemas: string[]): string;
