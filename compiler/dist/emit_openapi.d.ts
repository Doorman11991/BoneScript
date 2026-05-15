/**
 * BoneScript OpenAPI Emitter
 * Generates OpenAPI 3.0.3 YAML and JSON specs from an IRSystem.
 */
import * as IR from "./ir";
export declare function emitOpenApiSpec(system: IR.IRSystem): string;
export declare function emitOpenApiJson(system: IR.IRSystem): string;
