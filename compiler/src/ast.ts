/**
 * BoneScript Abstract Syntax Tree
 * Direct representation of the grammar in spec/02_GRAMMAR.peg.
 * Every node type corresponds to a grammar production.
 */

import { SourceLocation } from "./lexer";

// â”€â”€â”€ Base Node â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface ASTNode {
  kind: string;
  loc: SourceLocation;
}

// â”€â”€â”€ Program â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface ProgramNode extends ASTNode {
  kind: "Program";
  systems: SystemDeclNode[];
}

// â”€â”€â”€ System â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface SystemDeclNode extends ASTNode {
  kind: "SystemDecl";
  name: string;
  domain: string | null;
  declarations: DeclarationNode[];
}

export type DeclarationNode =
  | EntityDeclNode
  | CapabilityDeclNode
  | ChannelDeclNode
  | StoreDeclNode
  | EventDeclNode
  | ConstraintDeclNode
  | PolicyDeclNode
  | FlowDeclNode
  | ImportDeclNode
  | ExtensionPointDeclNode;

// â”€â”€â”€ Entity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface EntityDeclNode extends ASTNode {
  kind: "EntityDecl";
  name: string;
  owns: FieldNode[];
  constraints: ExprNode[];
  states: StateGraphNode | null;
  auth: string | null;
  relations: RelationNode[];
  indexes: string[][];
  derived: DerivedFieldNode[];
}

export interface FieldNode extends ASTNode {
  kind: "Field";
  name: string;
  type: TypeExprNode;
  defaultValue: ExprNode | null;
  renamedFrom?: string | null;
  sensitive?: boolean;
}

export interface StateGraphNode extends ASTNode {
  kind: "StateGraph";
  nodes: StateNodeEntry[];
}

export interface StateNodeEntry {
  name: string;
  guard: ExprNode | null;
  transitions: string[]; // names of states this transitions to (via ->)
  branches: string[];    // names of states this branches to (via |)
}

export interface RelationNode extends ASTNode {
  kind: "Relation";
  name: string;
  relationType: "has_one" | "has_many" | "belongs_to" | "many_to_many";
  target: string;
  cardinality: { min: number; max: number | "*" } | null;
}

export interface DerivedFieldNode extends ASTNode {
  kind: "DerivedField";
  name: string;
  expr: ExprNode;
}

// â”€â”€â”€ Capability â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface CapabilityDeclNode extends ASTNode {
  kind: "CapabilityDecl";
  name: string;
  params: ParamNode[];
  requires: ExprNode[];
  effects: EffectNode[];
  emits: EmitNode[];
  sync: string | null;
  timeout: string | null;
  retry: RetryPolicyNode | null;
  idempotent: boolean | null;
  pipeline: PipelineNode | null;
  algorithm: AlgorithmNode | null;
  returns: TypeExprNode | null;
}

export interface PipelineNode extends ASTNode {
  kind: "Pipeline";
  steps: PipelineStepNode[];
  parallel: boolean;
  onError: PipelineErrorHandler | null;
}

export interface PipelineStepNode extends ASTNode {
  kind: "PipelineStep";
  call: CallExprNode;
  bindAs: string | null; // optional `as <name>` to capture output
}

export interface PipelineErrorHandler {
  kind: "PipelineErrorHandler";
  action: "rollback" | "compensate" | "ignore" | "retry";
  call: CallExprNode | null;
}

export interface AlgorithmNode extends ASTNode {
  kind: "Algorithm";
  name: string;             // catalog entry, e.g. "shortest_path"
  using: AlgorithmBinding[]; // typed parameter bindings
}

export interface AlgorithmBinding {
  param: string;
  value: ExprNode;
}

export interface ParamNode extends ASTNode {
  kind: "Param";
  name: string;
  type: TypeExprNode;
}

export interface EffectNode extends ASTNode {
  kind: "Effect";
  target: FieldRefNode;
  op: "=" | "+=" | "-=";
  value: ExprNode;
}

export interface EmitNode extends ASTNode {
  kind: "Emit";
  eventName: string;
  args: ExprNode[];
}

export interface RetryPolicyNode extends ASTNode {
  kind: "RetryPolicy";
  maxAttempts: number | null;
  backoff: string | null;
  interval: string | null;
}

// â”€â”€â”€ Channel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface ChannelDeclNode extends ASTNode {
  kind: "ChannelDecl";
  name: string;
  transport: string | null;
  ordering: string | null;
  participants: TypeExprNode | null;
  persistence: string | null;
  filter: ExprNode | null;
  maxSize: number | null;
}

// â”€â”€â”€ Store â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface StoreDeclNode extends ASTNode {
  kind: "StoreDecl";
  name: string;
  engine: string | null;
  schema: FieldNode[];
  retention: string | null;
  partition: string | null;
  replicas: number | null;
}

// â”€â”€â”€ Event â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface EventDeclNode extends ASTNode {
  kind: "EventDecl";
  name: string;
  payload: FieldNode[];
  delivery: string | null;
  ttl: string | null;
}

// â”€â”€â”€ Constraint â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface ConstraintDeclNode extends ASTNode {
  kind: "ConstraintDecl";
  name: string;
  expr: ExprNode;
}

// â”€â”€â”€ Policy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface PolicyDeclNode extends ASTNode {
  kind: "PolicyDecl";
  name: string;
  rateLimit: { count: number; per: string } | null;
  access: string[];
  audit: boolean | null;
  encryption: string | null;
}

// â”€â”€â”€ Flow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface FlowDeclNode extends ASTNode {
  kind: "FlowDecl";
  name: string;
  steps: FlowStepNode[];
}

export interface FlowStepNode extends ASTNode {
  kind: "FlowStep";
  name: string;
  action: CallExprNode;
  compensate: CallExprNode | null;
}

// â”€â”€â”€ Import â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface ImportDeclNode extends ASTNode {
  kind: "ImportDecl";
  name: string;
  from: string;
}

// â”€â”€â”€ Type Expressions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type TypeExprNode =
  | PrimitiveTypeNode
  | GenericTypeNode
  | EntityRefTypeNode
  | TupleTypeNode
  | UnionTypeNode;

export interface PrimitiveTypeNode extends ASTNode {
  kind: "PrimitiveType";
  name: string; // "string" | "uint" | "int" | "float" | "bool" | "timestamp" | "uuid" | "bytes" | "json"
}

export interface GenericTypeNode extends ASTNode {
  kind: "GenericType";
  name: string; // "set" | "list" | "map" | "optional" | "result"
  typeArgs: TypeExprNode[];
}

export interface EntityRefTypeNode extends ASTNode {
  kind: "EntityRefType";
  name: string;
}

export interface TupleTypeNode extends ASTNode {
  kind: "TupleType";
  elements: TypeExprNode[];
}

export interface UnionTypeNode extends ASTNode {
  kind: "UnionType";
  members: TypeExprNode[];
}

// â”€â”€â”€ Expressions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type ExprNode =
  | BinaryExprNode
  | UnaryExprNode
  | FieldRefNode
  | LiteralNode
  | CallExprNode
  | TernaryExprNode;

export interface BinaryExprNode extends ASTNode {
  kind: "BinaryExpr";
  op: string;
  left: ExprNode;
  right: ExprNode;
}

export interface UnaryExprNode extends ASTNode {
  kind: "UnaryExpr";
  op: string;
  operand: ExprNode;
}

export interface FieldRefNode extends ASTNode {
  kind: "FieldRef";
  path: string[]; // e.g., ["player", "inventory", "size"]
}

export interface LiteralNode extends ASTNode {
  kind: "Literal";
  type: "string" | "int" | "float" | "bool" | "none" | "list" | "map";
  value: string | number | boolean | null | ExprNode[] | [ExprNode, ExprNode][];
}

export interface CallExprNode extends ASTNode {
  kind: "CallExpr";
  name: string;
  args: ExprNode[];
}

export interface TernaryExprNode extends ASTNode {
  kind: "TernaryExpr";
  condition: ExprNode;
  consequent: ExprNode;
  alternate: ExprNode;
}

// ─── Extension Point ─────────────────────────────────────────────────────────
// Declares a named hook that the user fills in with custom TypeScript.
// The compiler reserves a region in generated code that survives recompilation.

export interface ExtensionPointDeclNode extends ASTNode {
  kind: "ExtensionPointDecl";
  name: string;
  params: ParamNode[];
  returns: TypeExprNode | null;
  stable: boolean;  // if true, compiler errors if implementation is missing
}
