/**
 * BoneScript Formatter â€” `bone fmt`
 * Canonicalizes whitespace and formatting in .bone source files.
 *
 * Rules:
 * - 2-space indentation
 * - One declaration per logical block, separated by one blank line
 * - Field lists: one per line if more than 2, otherwise inline
 * - Constraints: one per line
 * - Trailing newline at end of file
 * - LF line endings
 */
import * as AST from "./ast";
export declare class Formatter {
    private out;
    private indent;
    format(program: AST.ProgramNode): string;
    private line;
    private blank;
    private formatSystem;
    private formatDeclaration;
    private formatEntity;
    private formatCapability;
    private formatChannel;
    private formatStore;
    private formatEvent;
    private formatConstraint;
    private formatPolicy;
    private formatFlow;
    private formatImport;
    private formatType;
    private formatExpr;
    private formatExtensionPoint;
}
