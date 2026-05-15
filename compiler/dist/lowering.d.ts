/**
 * bone ir Lowering ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Stage 4 of the compilation pipeline.
 * Converts typed AST into the Architecture IR (spec/07_IR_SPEC.md).
 *
 * Rules:
 * - One module per semantic component
 * - All IDs are deterministic (derived from system name + component name)
 * - All ontology-entailed fields are inserted
 * - Effects are serialized in declaration order
 */
import * as AST from "./ast";
import * as IR from "./ir";
export declare class Lowering {
    private systemName;
    lower(program: AST.ProgramNode, sourceHash: string): IR.IRSystem[];
    private lowerSystem;
    private lowerStore;
    private lowerEntity;
    private makeCrudMethod;
    private lowerCapability;
    private lowerChannel;
    private lowerEvent;
    private lowerFlow;
    private lowerField;
}
