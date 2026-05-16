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
/**
 * A migration block paired with a stable identifier and content checksum.
 * - `id` is a human-readable, ordered name (e.g. "0001_create_sellers").
 * - `checksum` is a sha256 of the SQL body — used by the ledger to detect
 *   tampering with already-applied migrations.
 */
export interface MigrationBlock {
    id: string;
    checksum: string;
    sql: string;
}
/**
 * Build deterministic migration blocks from raw schema strings.
 * The order of `schemas` is preserved; each block gets a zero-padded prefix
 * so lexicographic sort matches insertion order.
 */
export declare function buildMigrationBlocks(schemas: string[]): MigrationBlock[];
export declare function emitMigration(_system: IR.IRSystem, schemas: string[]): string;
