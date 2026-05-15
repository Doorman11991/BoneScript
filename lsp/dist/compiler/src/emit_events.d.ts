/**
 * BoneScript Durable Event System Emitter
 *
 * Generates two event delivery modes:
 *   in_process  — default dev mode, in-memory bus (existing behavior)
 *   durable     — Postgres-backed transactional outbox
 *
 * Durable mode guarantees:
 *   at_least_once  — retry until acknowledged
 *   exactly_once   — deduplicated via event_id table
 */
import * as IR from "./ir";
export declare function emitOutboxSchema(): string;
export declare function emitDurableEventBus(system: IR.IRSystem): string;
