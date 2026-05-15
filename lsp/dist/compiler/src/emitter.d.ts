/**
 * BoneScript Code Emitter â€” Stage 6 of the compilation pipeline.
 * Implements spec/09_CODEGEN.md.
 *
 * Generates target code from the IR. Every IR node maps to code.
 * No orphan logic. No hidden behavior. Deterministic formatting.
 */
import * as IR from "./ir";
export interface EmittedFile {
    path: string;
    content: string;
    language: "typescript" | "sql" | "yaml" | "json";
    source_module: string;
}
export declare class Emitter {
    emit(system: IR.IRSystem): EmittedFile[];
    private emitSchema;
    private emitSharedTypes;
    private emitEventTypes;
    private emitService;
    private emitMethod;
    private emitStateMachine;
    private emitServiceConfig;
    private emitInfraConfig;
}
