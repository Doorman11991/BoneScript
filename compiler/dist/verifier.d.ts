/**
 * BoneScript Verifier â€” Stage 7 of the compilation pipeline.
 * Implements spec/07_IR_SPEC.md Â§5 (IR Validation Rules).
 *
 * Checks:
 * - V001: Every dependency target exists as a module
 * - V002: Every event source exists as a module
 * - V003: State machine transitions reference valid events
 * - V004: No circular dependencies between modules
 * - V005: Every method's preconditions reference accessible fields
 * - V006: Every effect targets a field that exists
 * - V007: Every model has a primary key field
 * - V008: Every index references fields that exist
 * - V009: No duplicate module ids
 * - V010: No duplicate event ids
 * - V011: Every authenticated method's module depends on auth
 * - V012: Resolution map is complete
 *
 * Also validates generated code:
 * - All TypeScript files have balanced braces
 * - All SQL files have valid CREATE TABLE structure
 * - All imports reference existing files
 */
import * as IR from "./ir";
import { EmittedFile } from "./emitter";
export interface VerifyIssue {
    code: string;
    severity: "error" | "warning";
    message: string;
    location: string;
}
export interface VerifyResult {
    passed: boolean;
    issues: VerifyIssue[];
}
export declare class Verifier {
    verify(system: IR.IRSystem, files: EmittedFile[]): VerifyResult;
    private checkDependencies;
    private checkDuplicateIds;
    private checkModels;
    private checkStateMachines;
    private checkCircularDeps;
    private checkTypeScriptSyntax;
    private checkSqlSyntax;
    private checkImports;
}
