/**
 * BoneScript Audit Log Emitter
 * Generates audit_log SQL schema and Express audit middleware.
 */
import * as IR from "./ir";
export declare function emitAuditSchema(): string;
export declare function emitAuditMiddleware(system: IR.IRSystem): string;
