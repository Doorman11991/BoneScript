/**
 * BoneScript Type Checker â€” Stage 3 of the compilation pipeline.
 * Implements spec/04_TYPE_SYSTEM.md.
 *
 * Responsibilities:
 * 1. Build symbol table from entity declarations
 * 2. Verify all field types resolve to valid types
 * 3. Verify all constraint expressions type to bool
 * 4. Verify capability preconditions type to bool
 * 5. Verify effects are well-typed (target and value match)
 * 6. Verify emitted events exist
 * 7. Verify state machine transitions reference valid states
 * 8. Verify flow steps reference valid capabilities
 *
 * Deterministic: same AST always produces same errors in same order.
 */
import * as AST from "./ast";
export interface TypeError {
    code: string;
    message: string;
    loc: AST.ASTNode["loc"];
}
export declare class TypeChecker {
    private errors;
    private symbols;
    check(program: AST.ProgramNode): TypeError[];
    private addError;
    private checkSystem;
    private registerDeclaration;
    private registerEntity;
    private registerCapability;
    private registerEvent;
    private checkDeclaration;
    private checkEntity;
    private checkCapability;
    private checkEffect;
    private checkChannel;
    private checkFlow;
    private checkConstraint;
    private inferExprType;
    private inferLiteralType;
    private inferFieldRefType;
    private resolveFieldPath;
    private inferBinaryType;
    private inferUnaryType;
    private inferCallType;
    private inferTernaryType;
    private resolveTypeExpr;
    private isBoolish;
    private isAssignable;
    private checkExtensionPoint;
}
