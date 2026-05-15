/**
 * BoneScript GraphQL Schema Emitter
 * Generates schema.graphql from an IRSystem.
 */
import * as IR from "./ir";
export declare function emitGraphQLSchema(system: IR.IRSystem): string;
