/**
 * BoneScript WebSocket Runtime Emitter
 * Generates runnable WebSocket servers for `channel` declarations.
 */
import * as IR from "./ir";
export declare function emitWebSocketServer(system: IR.IRSystem): string;
