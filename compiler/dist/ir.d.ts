/**
 * bone ir (Intermediate Representation) Ã¢â‚¬â€ Data structures.
 * Implements spec/07_IR_SPEC.md.
 *
 * This is the canonical internal form: language-agnostic, fully resolved,
 * strongly typed, and deterministically serializable.
 */
export type IRPrimitive = "string" | "uint" | "int" | "float" | "bool" | "timestamp" | "uuid" | "bytes" | "json";
export interface IRField {
    name: string;
    type: string;
    nullable: boolean;
    unique: boolean;
    indexed: boolean;
    default_value: string | null;
    renamed_from?: string | null;
    sensitive?: boolean;
}
export interface IRIndex {
    fields: string[];
    unique: boolean;
}
export interface IRModelConstraint {
    kind: "unique" | "non_null" | "range" | "enum" | "check";
    target: string;
    params: Record<string, string | number | string[]>;
}
export interface IRModel {
    name: string;
    fields: IRField[];
    primary_key: string;
    indexes: IRIndex[];
    constraints: IRModelConstraint[];
}
export interface IRPrecondition {
    expression: string;
    description: string;
}
export interface IREffect {
    target: string;
    op: "assign" | "add" | "remove";
    value: string;
}
export interface IRMethod {
    name: string;
    input: IRField[];
    output: string;
    preconditions: IRPrecondition[];
    effects: IREffect[];
    emissions: string[];
    idempotent: boolean;
    authenticated: boolean;
    timeout_ms: number;
    retry: IRRetryPolicy | null;
    pipeline: IRPipeline | null;
    algorithm: IRAlgorithm | null;
    sync: string | null;
}
export interface IRPipeline {
    parallel: boolean;
    steps: IRPipelineStep[];
    on_error: IRPipelineErrorHandler | null;
}
export interface IRPipelineStep {
    call_name: string;
    call_args: string[];
    bind_as: string | null;
}
export interface IRPipelineErrorHandler {
    action: "rollback" | "compensate" | "ignore" | "retry";
    call_name: string | null;
    call_args: string[];
}
export interface IRAlgorithm {
    catalog_name: string;
    bindings: {
        param: string;
        value: string;
    }[];
}
export interface IRRetryPolicy {
    max_attempts: number;
    backoff: "fixed" | "linear" | "exponential";
    interval_ms: number;
}
export interface IRInterface {
    name: string;
    methods: IRMethod[];
}
export type IRDeliveryMode = "at_least_once" | "at_most_once" | "exactly_once";
export type IROrderingMode = "fifo" | "causal" | "total" | "unordered";
export interface IREvent {
    id: string;
    name: string;
    payload: IRField[];
    source: string;
    delivery: IRDeliveryMode;
    ordering: IROrderingMode;
    ttl_ms: number | null;
}
export interface IRTransition {
    from: string;
    to: string;
    trigger: string;
    guard: string | null;
}
export interface IRStateMachine {
    entity: string;
    states: string[];
    initial: string;
    transitions: IRTransition[];
}
export type IRModuleKind = "api_service" | "worker_service" | "realtime_service" | "auth_service" | "data_store" | "event_bus" | "cache" | "gateway" | "frontend";
export interface IRModule {
    id: string;
    kind: IRModuleKind;
    name: string;
    interfaces: IRInterface[];
    models: IRModel[];
    events: IREvent[];
    state_machines: IRStateMachine[];
    relations: IRRelation[];
    dependencies: string[];
    config: Record<string, string | number | boolean>;
}
export interface IRRelation {
    name: string;
    kind: "has_one" | "has_many" | "belongs_to" | "many_to_many";
    from_entity: string;
    to_entity: string;
    from_table: string;
    to_table: string;
    foreign_key: string;
    junction_table?: string;
}
export interface IRInvariant {
    id: string;
    expression: string;
    scope: string;
}
export interface IRFlowStep {
    name: string;
    action: string;
    compensation: string | null;
}
export interface IRFlow {
    name: string;
    steps: IRFlowStep[];
}
export interface IRSystem {
    name: string;
    version: string;
    source_hash: string;
    domain: string | null;
    modules: IRModule[];
    events: IREvent[];
    flows: IRFlow[];
    invariants: IRInvariant[];
    resolution: Record<string, string>;
    extension_points: IRExtensionPoint[];
}
export interface IRExtensionPoint {
    name: string;
    params: {
        name: string;
        type: string;
    }[];
    returns: string | null;
    stable: boolean;
}
