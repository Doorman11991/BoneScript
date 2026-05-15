/**
 * BoneScript Full Emitter Ã¢â‚¬â€ Produces a complete, runnable project.
 * Combines schema generation with runtime service code.
 */
import * as IR from "./ir";
import { EmittedFile } from "./emitter";
export interface FullEmitterOptions {
    noSdk?: boolean;
    noOpenApi?: boolean;
    noSeed?: boolean;
}
export declare class FullEmitter {
    private schemaEmitter;
    emit(system: IR.IRSystem, options?: FullEmitterOptions): EmittedFile[];
    private emitEnvExample;
    private emitDockerCompose;
    private emitReadme;
}
