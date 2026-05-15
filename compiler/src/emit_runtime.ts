/**
 * BoneScript Runtime Emitter — barrel re-export.
 *
 * This file previously contained all runtime code generation in one place.
 * It has been split into focused modules:
 *
 *   emit_package.ts   — emitPackageJson, emitTsConfig
 *   emit_database.ts  — emitDbClient, emitMigration
 *   emit_auth.ts      — emitAuthMiddleware
 *   emit_router.ts    — emitEntityRouter, emitCapabilityEndpoint, emitStateMachineRuntime
 *   emit_index.ts     — emitIndex (Express server entry point)
 *
 * All exports are re-exported here so existing imports continue to work.
 */

export { emitPackageJson, emitTsConfig }           from "./emit_package";
export { emitDbClient, emitMigration }             from "./emit_database";
export { emitAuthMiddleware }                      from "./emit_auth";
export { emitEntityRouter, emitStateMachineRuntime, toSnakeCase, toCamelCase, toTsType } from "./emit_router";
export { emitIndex }                               from "./emit_index";
