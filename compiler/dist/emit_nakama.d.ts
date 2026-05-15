/**
 * BoneScript Nakama Emitter
 *
 * Generates a Nakama TypeScript runtime module from an IRSystem.
 * Output is a self-contained src/index.ts that registers:
 *   - nk.registerRpc()  for every capability  (capability -> RPC)
 *   - nk.registerMatch() for every realtime_service module (channel -> match handler)
 *   - Storage helpers    for every entity/model (entity -> storage object)
 *   - Event hooks        for every event emission (event -> stream send)
 *
 * Deploy with: nakama migrate up && nakama --runtime.path ./build
 * Docs: https://heroiclabs.com/docs/nakama/server-framework/typescript-runtime/
 */
import * as IR from "./ir";
export interface NakamaEmittedFile {
    path: string;
    content: string;
    language: "typescript" | "json" | "markdown";
    source_module: string;
}
export declare class NakamaEmitter {
    emit(system: IR.IRSystem): NakamaEmittedFile[];
}
