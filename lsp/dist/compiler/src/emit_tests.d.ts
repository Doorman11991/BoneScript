/**
 * BoneScript Test Emitter
 * Generates regression tests derived from capability declarations.
 * Implements spec/10 §7 (Regression Tests).
 *
 * For each capability, generates:
 * - Happy path test (valid preconditions → effects applied)
 * - Precondition failure test (invalid state → 422)
 * - Idempotency test (if idempotent: true)
 * For each state machine:
 * - Valid transition tests
 * - Invalid transition rejection tests
 */
import * as IR from "./ir";
export declare function emitTestSuite(system: IR.IRSystem): string;
