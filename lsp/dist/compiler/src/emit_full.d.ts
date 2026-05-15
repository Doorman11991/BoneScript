/**
 * BoneScript Full Emitter Ã¢â‚¬â€ Produces a complete, runnable project.
 * Combines schema generation with runtime service code.
 */
import * as IR from "./ir";
import { EmittedFile } from "./emitter";
export declare class FullEmitter {
    private schemaEmitter;
    emit(system: IR.IRSystem): EmittedFile[];
    private emitEnvExample;
    private emitDockerCompose;
    private emitReadme;
}
