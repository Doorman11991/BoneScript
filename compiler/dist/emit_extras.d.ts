/**
 * BoneScript Extras Emitter
 * Handles features that don't fit cleanly into the main emitters:
 * - Derived fields (computed columns / virtual getters)
 * - Channel filter expressions
 * - Flow compensation runtime
 */
import * as IR from "./ir";
import * as AST from "./ast";
export declare function emitDerivedFields(entity: AST.EntityDeclNode): string;
export declare function emitChannelFilters(channels: AST.ChannelDeclNode[]): string;
export declare function emitFlowRuntime(system: IR.IRSystem): string;
