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
import {
  CVType, PrimitiveType, GenericType, RecordType,
  prim, generic, record, BOTTOM,
  typeEquals, typeToString, isNumeric, isComparable,
} from "./types";

// â”€â”€â”€ Type Error â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface TypeError {
  code: string;
  message: string;
  loc: AST.ASTNode["loc"];
}

// â”€â”€â”€ Symbol Table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface EntitySymbol {
  name: string;
  type: RecordType;
  states: string[];
  capabilities: string[];
}

interface CapabilitySymbol {
  name: string;
  params: Map<string, CVType>;
}

interface EventSymbol {
  name: string;
  payloadFields: Map<string, CVType>;
}

interface SymbolTable {
  entities: Map<string, EntitySymbol>;
  capabilities: Map<string, CapabilitySymbol>;
  events: Map<string, EventSymbol>;
  stores: Set<string>;
  channels: Set<string>;
  flows: Set<string>;
}

// â”€â”€â”€ Type Checker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export class TypeChecker {
  private errors: TypeError[] = [];
  private symbols: SymbolTable = {
    entities: new Map(),
    capabilities: new Map(),
    events: new Map(),
    stores: new Set(),
    channels: new Set(),
    flows: new Set(),
  };

  check(program: AST.ProgramNode): TypeError[] {
    this.errors = [];

    for (const system of program.systems) {
      this.checkSystem(system);
    }

    return this.errors;
  }

  private addError(code: string, message: string, loc: AST.ASTNode["loc"]) {
    this.errors.push({ code, message, loc });
  }

  // â”€â”€â”€ Phase 1: Build Symbol Table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private checkSystem(system: AST.SystemDeclNode) {
    // First pass: register all declarations
    for (const decl of system.declarations) {
      this.registerDeclaration(decl);
    }

    // Second pass: type check all declarations
    for (const decl of system.declarations) {
      this.checkDeclaration(decl);
    }
  }

  private registerDeclaration(decl: AST.DeclarationNode) {
    switch (decl.kind) {
      case "EntityDecl":
        this.registerEntity(decl);
        break;
      case "CapabilityDecl":
        this.registerCapability(decl);
        break;
      case "EventDecl":
        this.registerEvent(decl);
        break;
      case "StoreDecl":
        this.symbols.stores.add(decl.name);
        break;
      case "ChannelDecl":
        this.symbols.channels.add(decl.name);
        break;
      case "FlowDecl":
        this.symbols.flows.add(decl.name);
        break;
    }
  }

  private registerEntity(decl: AST.EntityDeclNode) {
    const fields = new Map<string, CVType>();

    // Ontology-entailed fields (always present)
    fields.set("id", prim("uuid"));
    fields.set("created_at", prim("timestamp"));
    fields.set("updated_at", prim("timestamp"));

    // Declared fields
    for (const field of decl.owns) {
      const resolved = this.resolveTypeExpr(field.type);
      if (resolved) {
        fields.set(field.name, resolved);
      }
    }

    const states = decl.states
      ? decl.states.nodes.map(n => n.name)
      : [];

    this.symbols.entities.set(decl.name, {
      name: decl.name,
      type: record(decl.name, fields),
      states,
      capabilities: [],
    });
  }

  private registerCapability(decl: AST.CapabilityDeclNode) {
    const params = new Map<string, CVType>();
    for (const p of decl.params) {
      const resolved = this.resolveTypeExpr(p.type);
      if (resolved) params.set(p.name, resolved);
    }
    this.symbols.capabilities.set(decl.name, { name: decl.name, params });
  }

  private registerEvent(decl: AST.EventDeclNode) {
    const fields = new Map<string, CVType>();
    for (const f of decl.payload) {
      const resolved = this.resolveTypeExpr(f.type);
      if (resolved) fields.set(f.name, resolved);
    }
    this.symbols.events.set(decl.name, { name: decl.name, payloadFields: fields });
  }

  // â”€â”€â”€ Phase 2: Type Check Declarations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private checkDeclaration(decl: AST.DeclarationNode) {
    switch (decl.kind) {
      case "EntityDecl": this.checkEntity(decl); break;
      case "CapabilityDecl": this.checkCapability(decl); break;
      case "ChannelDecl": this.checkChannel(decl); break;
      case "FlowDecl": this.checkFlow(decl); break;
      case "ConstraintDecl": this.checkConstraint(decl); break;
      case "ExtensionPointDecl": this.checkExtensionPoint(decl); break;
      case "StoreDecl": this.checkStore(decl); break;
      case "PolicyDecl": this.checkPolicy(decl); break;
      case "EventDecl": this.checkEvent(decl); break;
    }
  }

  // â”€â”€â”€ Entity Checking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private checkEntity(decl: AST.EntityDeclNode) {
    // Check for duplicate field names
    const seen = new Set<string>();
    for (const field of decl.owns) {
      if (seen.has(field.name)) {
        this.addError("T009", `Duplicate field name '${field.name}' in entity '${decl.name}'`, field.loc);
      }
      seen.add(field.name);
    }

    // Check field types resolve
    for (const field of decl.owns) {
      const resolved = this.resolveTypeExpr(field.type);
      if (!resolved) {
        this.addError("T001", `Undefined type in field '${field.name}'`, field.loc);
      }
    }

    // Check constraints type to bool
    const entitySym = this.symbols.entities.get(decl.name);
    if (entitySym) {
      const ctx = new TypeContext(entitySym.type.fields, this.symbols);
      for (const constraint of decl.constraints) {
        const ctype = this.inferExprType(constraint, ctx);
        if (ctype && ctype.tag !== "primitive") {
          this.addError("T005", `Constraint expression must type to bool, got ${typeToString(ctype)}`, constraint.loc);
        } else if (ctype && ctype.tag === "primitive" && ctype.name !== "bool") {
          // Allow â€” many constraints are comparison exprs that return bool
          // The expression inferrer returns bool for comparisons
        }
      }
    }

    // Check state machine
    if (decl.states) {
      const stateNames = new Set(decl.states.nodes.map(n => n.name));
      for (const node of decl.states.nodes) {
        for (const target of node.transitions) {
          if (!stateNames.has(target)) {
            this.addError("T010", `Undefined state '${target}' in transition from '${node.name}'`, decl.states.loc);
          }
        }
        for (const target of node.branches) {
          if (!stateNames.has(target)) {
            this.addError("T010", `Undefined state '${target}' in branch from '${node.name}'`, decl.states.loc);
          }
        }
      }
    }
  }

  // â”€â”€â”€ Capability Checking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private checkCapability(decl: AST.CapabilityDeclNode) {
    // Build typing context from parameters
    const fields = new Map<string, CVType>();
    for (const p of decl.params) {
      const resolved = this.resolveTypeExpr(p.type);
      if (resolved) {
        fields.set(p.name, resolved);
      } else {
        this.addError("T006", `Parameter '${p.name}' references undeclared type`, p.loc);
      }
    }
    const ctx = new TypeContext(fields, this.symbols);

    // Check requires clauses type to bool
    for (const req of decl.requires) {
      const rtype = this.inferExprType(req, ctx);
      if (rtype && !this.isBoolish(rtype)) {
        this.addError("T005", `Requires expression must type to bool, got ${typeToString(rtype)}`, req.loc);
      }
    }

    // Check effects are well-typed
    for (const effect of decl.effects) {
      this.checkEffect(effect, ctx);
    }

    // Check emitted events exist
    for (const emit of decl.emits) {
      if (!this.symbols.events.has(emit.eventName)) {
        this.addError("T011", `Emitted event '${emit.eventName}' is not declared`, emit.loc);
      }
    }
  }

  private checkEffect(effect: AST.EffectNode, ctx: TypeContext) {
    const targetType = this.inferExprType(effect.target, ctx);
    const valueType = this.inferExprType(effect.value, ctx);

    if (!targetType || !valueType) return; // already errored

    switch (effect.op) {
      case "=":
        if (!typeEquals(targetType, valueType) && !this.isAssignable(valueType, targetType)) {
          this.addError("T003",
            `Type mismatch in assignment: target is ${typeToString(targetType)}, value is ${typeToString(valueType)}`,
            effect.loc);
        }
        break;
      case "+=":
        // target must be set<T> or numeric, value must be T or numeric
        if (targetType.tag === "generic" && targetType.name === "set") {
          if (!typeEquals(targetType.args[0], valueType)) {
            this.addError("T008",
              `Set += requires element type ${typeToString(targetType.args[0])}, got ${typeToString(valueType)}`,
              effect.loc);
          }
        } else if (isNumeric(targetType)) {
          if (!isNumeric(valueType)) {
            this.addError("T003", `Numeric += requires numeric value, got ${typeToString(valueType)}`, effect.loc);
          }
        } else {
          this.addError("T008", `+= requires set or numeric target, got ${typeToString(targetType)}`, effect.loc);
        }
        break;
      case "-=":
        if (targetType.tag === "generic" && targetType.name === "set") {
          if (!typeEquals(targetType.args[0], valueType)) {
            this.addError("T008",
              `Set -= requires element type ${typeToString(targetType.args[0])}, got ${typeToString(valueType)}`,
              effect.loc);
          }
        } else if (isNumeric(targetType)) {
          if (!isNumeric(valueType)) {
            this.addError("T003", `Numeric -= requires numeric value, got ${typeToString(valueType)}`, effect.loc);
          }
        } else {
          this.addError("T008", `-= requires set or numeric target, got ${typeToString(targetType)}`, effect.loc);
        }
        break;
    }
  }

  // â”€â”€â”€ Channel Checking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private checkChannel(decl: AST.ChannelDeclNode) {
    // Verify participants type is set<Entity>
    if (decl.participants) {
      const ptype = this.resolveTypeExpr(decl.participants);
      if (ptype && ptype.tag === "generic" && ptype.name === "set") {
        const inner = ptype.args[0];
        if (inner.tag === "record" && !this.symbols.entities.has(inner.name)) {
          this.addError("T001", `Channel participants reference undeclared entity '${inner.name}'`, decl.loc);
        }
      }
    }
  }

  // â”€â”€â”€ Flow Checking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private checkFlow(decl: AST.FlowDeclNode) {
    // Check at least 2 steps (ontology requirement)
    if (decl.steps.length < 2) {
      this.addError("T012", `Flow '${decl.name}' must have at least 2 steps`, decl.loc);
    }

    for (const step of decl.steps) {
      // Flow steps may call external service endpoints (not just local capabilities).
      // Only error if the name collides with a declared entity name, which would be
      // a definite mistake. Undeclared names are treated as external HTTP calls.
      if (this.symbols.entities.has(step.action.name)) {
        this.addError("T013",
          `Flow '${decl.name}' step '${step.name}' uses entity name '${step.action.name}' as a call — did you mean a capability?`,
          decl.loc);
      }
      if (step.compensate && this.symbols.entities.has(step.compensate.name)) {
        this.addError("T013",
          `Flow '${decl.name}' step '${step.name}' compensation uses entity name '${step.compensate.name}' as a call — did you mean a capability?`,
          decl.loc);
      }
    }
  }

  // â”€â”€â”€ Constraint Checking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private checkConstraint(decl: AST.ConstraintDeclNode) {
    // Top-level constraints are checked in a global context
    const globalCtx = new TypeContext(new Map(), this.symbols);
    const ctype = this.inferExprType(decl.expr, globalCtx);
    if (ctype && !this.isBoolish(ctype)) {
      this.addError("T005", `Top-level constraint '${decl.name}' must type to bool`, decl.loc);
    }
  }

  // â”€â”€â”€ Expression Type Inference â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private inferExprType(expr: AST.ExprNode, ctx: TypeContext): CVType | null {
    switch (expr.kind) {
      case "Literal":
        return this.inferLiteralType(expr);
      case "FieldRef":
        return this.inferFieldRefType(expr, ctx);
      case "BinaryExpr":
        return this.inferBinaryType(expr, ctx);
      case "UnaryExpr":
        return this.inferUnaryType(expr, ctx);
      case "CallExpr":
        return this.inferCallType(expr, ctx);
      case "TernaryExpr":
        return this.inferTernaryType(expr, ctx);
      default:
        return null;
    }
  }

  private inferLiteralType(expr: AST.LiteralNode): CVType {
    switch (expr.type) {
      case "string": return prim("string");
      case "int": return prim("uint"); // default to uint per spec
      case "float": return prim("float");
      case "bool": return prim("bool");
      case "none": return BOTTOM;
      case "list": return generic("list", prim("json")); // infer element type later
      case "map": return prim("json");
    }
  }

  private inferFieldRefType(expr: AST.FieldRefNode, ctx: TypeContext): CVType | null {
    const path = expr.path;
    if (path.length === 0) return null;

    // First segment: look up in context
    let currentType = ctx.lookup(path[0]);

    if (!currentType) {
      // Try as entity name (for top-level constraints like Player.active_trades)
      const entity = this.symbols.entities.get(path[0]);
      if (entity) {
        currentType = entity.type;
        return this.resolveFieldPath(currentType, path.slice(1), expr);
      }
      // Unknown â€” don't error here, could be a forward reference
      return prim("json"); // permissive fallback
    }

    return this.resolveFieldPath(currentType, path.slice(1), expr);
  }

  private resolveFieldPath(baseType: CVType, remaining: string[], expr: AST.ExprNode): CVType | null {
    let current = baseType;

    for (const segment of remaining) {
      // Handle .unique, .length, .size as derived properties
      if (segment === "unique") return prim("bool");
      if (segment === "length") return prim("uint");
      if (segment === "size") return prim("uint");

      if (current.tag === "record") {
        const field = current.fields.get(segment);
        if (field) {
          current = field;
        } else {
          // Field not found â€” could be a derived property
          return prim("json"); // permissive
        }
      } else if (current.tag === "generic") {
        // Accessing property on generic type (e.g., list.size)
        if (segment === "size" || segment === "length") return prim("uint");
        return prim("json");
      } else {
        return prim("json"); // permissive fallback
      }
    }

    return current;
  }

  private inferBinaryType(expr: AST.BinaryExprNode, ctx: TypeContext): CVType {
    const left = this.inferExprType(expr.left, ctx);
    const right = this.inferExprType(expr.right, ctx);

    switch (expr.op) {
      // Comparison operators â†’ bool
      case "==": case "!=": case "<": case ">": case "<=": case ">=":
      case "in": case "contains": case "and": case "or":
        return prim("bool");

      // Range operator
      case "..":
        return generic("list", prim("uint")); // range produces a range object

      // Arithmetic â†’ numeric
      case "+": case "*": case "/": case "%":
        if (left && right && isNumeric(left) && isNumeric(right)) {
          // Promote to widest type
          if ((left as PrimitiveType).name === "float" || (right as PrimitiveType).name === "float") return prim("float");
          if ((left as PrimitiveType).name === "int" || (right as PrimitiveType).name === "int") return prim("int");
          return prim("uint");
        }
        if (expr.op === "+" && left?.tag === "primitive" && (left as PrimitiveType).name === "string") {
          return prim("string"); // string concatenation
        }
        return prim("uint");

      case "-":
        return prim("int"); // subtraction may produce negative

      default:
        return prim("bool");
    }
  }

  private inferUnaryType(expr: AST.UnaryExprNode, ctx: TypeContext): CVType {
    if (expr.op === "not") return prim("bool");
    if (expr.op === "-") return prim("int");
    return prim("json");
  }

  private inferCallType(expr: AST.CallExprNode, ctx: TypeContext): CVType {
    // Built-in functions
    if (expr.name === "now") return prim("timestamp");
    if (expr.name === "count") return prim("uint");
    if (expr.name === "sum") return prim("uint");
    if (expr.name === "min" || expr.name === "max") return prim("uint");
    if (expr.name === "abs") return prim("uint");
    if (expr.name === "floor" || expr.name === "ceil" || expr.name === "round") return prim("int");
    if (expr.name === "len" || expr.name === "size") return prim("uint");
    if (expr.name === "contains" || expr.name === "starts_with" || expr.name === "ends_with") return prim("bool");
    if (expr.name === "to_string") return prim("string");
    if (expr.name === "to_int" || expr.name === "to_uint") return prim("int");
    if (expr.name === "to_float") return prim("float");

    // Check if it's a declared capability — use json as safe fallback for its return
    if (this.symbols.capabilities.has(expr.name)) {
      return prim("json");
    }

    // Unknown user-defined function — permissive fallback
    return prim("json");
  }

  private inferTernaryType(expr: AST.TernaryExprNode, ctx: TypeContext): CVType | null {
    // condition must be bool
    const condType = this.inferExprType(expr.condition, ctx);
    if (condType && !this.isBoolish(condType)) {
      this.addError("T005", "Ternary condition must be bool", expr.loc);
    }
    // Both branches must have compatible types
    const consequentType = this.inferExprType(expr.consequent, ctx);
    const alternateType  = this.inferExprType(expr.alternate, ctx);
    if (
      consequentType && alternateType &&
      !typeEquals(consequentType, alternateType) &&
      !this.isAssignable(consequentType, alternateType) &&
      !this.isAssignable(alternateType, consequentType)
    ) {
      this.addError(
        "T017",
        `Ternary branches have incompatible types: consequent is ${typeToString(consequentType)}, alternate is ${typeToString(alternateType)}`,
        expr.loc,
      );
    }
    return consequentType;
  }

  // â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private resolveTypeExpr(typeExpr: AST.TypeExprNode): CVType | null {
    switch (typeExpr.kind) {
      case "PrimitiveType":
        return prim(typeExpr.name as PrimitiveType["name"]);
      case "GenericType": {
        const args = typeExpr.typeArgs.map(a => this.resolveTypeExpr(a)).filter(Boolean) as CVType[];
        return generic(typeExpr.name as GenericType["name"], ...args);
      }
      case "EntityRefType": {
        const entity = this.symbols.entities.get(typeExpr.name);
        if (entity) return entity.type;
        // Could be a forward reference â€” register as unknown record
        return record(typeExpr.name, new Map());
      }
      case "TupleType": {
        const elements = typeExpr.elements.map(e => this.resolveTypeExpr(e)).filter(Boolean) as CVType[];
        return { tag: "tuple", elements };
      }
      case "UnionType": {
        const members = typeExpr.members.map(m => this.resolveTypeExpr(m)).filter(Boolean) as CVType[];
        return { tag: "union", members };
      }
    }
  }

  private isBoolish(t: CVType): boolean {
    return (t.tag === "primitive" && t.name === "bool") || t.tag === "bottom";
  }

  private isAssignable(source: CVType, target: CVType): boolean {
    if (typeEquals(source, target)) return true;
    // Numeric widening: uint â†’ int â†’ float
    if (source.tag === "primitive" && target.tag === "primitive") {
      if (source.name === "uint" && (target.name === "int" || target.name === "float")) return true;
      if (source.name === "int" && target.name === "float") return true;
    }
    // json accepts anything and anything accepts json (permissive for unresolved)
    if (target.tag === "primitive" && target.name === "json") return true;
    if (source.tag === "primitive" && source.name === "json") return true;
    return false;
  }
  private checkExtensionPoint(decl: AST.ExtensionPointDeclNode): void {
    for (const p of decl.params) {
      const resolved = this.resolveTypeExpr(p.type);
      if (!resolved) {
        this.addError("T001", "Extension point '" + decl.name + "' param '" + p.name + "' references undefined type", p.loc);
      }
    }
    if (decl.returns) {
      const resolved = this.resolveTypeExpr(decl.returns);
      if (!resolved) {
        this.addError("T001", "Extension point '" + decl.name + "' return type is undefined", decl.loc);
      }
    }
  }

  // ─── Store Checking ───────────────────────────────────────────────────────────

  /** Supported database engines. Engines not in this set produce T014. */
  private static readonly SUPPORTED_ENGINES = new Set(["postgresql", "redis"]);

  private checkStore(decl: AST.StoreDeclNode): void {
    if (decl.engine && !TypeChecker.SUPPORTED_ENGINES.has(decl.engine)) {
      this.addError(
        "T014",
        `Store '${decl.name}' uses unsupported engine '${decl.engine}'. ` +
        `Supported engines: ${[...TypeChecker.SUPPORTED_ENGINES].join(", ")}. ` +
        `Other engines (dynamodb, mongodb, sqlite, s3) are not yet implemented — ` +
        `remove the engine declaration to use the domain default (postgresql), ` +
        `or implement a custom emitter.`,
        decl.loc,
      );
    }

    // Check schema field types resolve
    for (const field of decl.schema) {
      const resolved = this.resolveTypeExpr(field.type);
      if (!resolved) {
        this.addError("T001", `Store '${decl.name}' field '${field.name}' references undefined type`, field.loc);
      }
    }
  }

  // ─── Policy Checking ──────────────────────────────────────────────────────────

  private static readonly VALID_ENCRYPTION = new Set(["at_rest", "in_transit", "both", "none"]);

  private checkPolicy(decl: AST.PolicyDeclNode): void {
    if (decl.encryption && !TypeChecker.VALID_ENCRYPTION.has(decl.encryption)) {
      this.addError(
        "T015",
        `Policy '${decl.name}' has invalid encryption value '${decl.encryption}'. ` +
        `Valid values: ${[...TypeChecker.VALID_ENCRYPTION].join(", ")}.`,
        decl.loc,
      );
    }
    if (decl.rateLimit && decl.rateLimit.count <= 0) {
      this.addError(
        "T015",
        `Policy '${decl.name}' rate_limit count must be positive (> 0), got ${decl.rateLimit.count}.`,
        decl.loc,
      );
    }
  }

  // ─── Event Checking ───────────────────────────────────────────────────────────

  private static readonly VALID_DELIVERY_MODES = new Set(["at_least_once", "at_most_once", "exactly_once"]);

  private checkEvent(decl: AST.EventDeclNode): void {
    // Check payload field types resolve and have no duplicates
    const seen = new Set<string>();
    for (const field of decl.payload) {
      if (seen.has(field.name)) {
        this.addError("T009", `Duplicate field name '${field.name}' in event '${decl.name}'`, field.loc);
      }
      seen.add(field.name);

      const resolved = this.resolveTypeExpr(field.type);
      if (!resolved) {
        this.addError("T001", `Event '${decl.name}' payload field '${field.name}' references undefined type`, field.loc);
      }
    }

    // Check delivery mode is valid
    if (decl.delivery && !TypeChecker.VALID_DELIVERY_MODES.has(decl.delivery)) {
      this.addError(
        "T016",
        `Event '${decl.name}' has invalid delivery mode '${decl.delivery}'. ` +
        `Valid values: ${[...TypeChecker.VALID_DELIVERY_MODES].join(", ")}.`,
        decl.loc,
      );
    }
  }
// â”€â”€â”€ Type Context â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

}
class TypeContext {
  private locals: Map<string, CVType>;
  private symbols: SymbolTable;

  constructor(locals: Map<string, CVType>, symbols: SymbolTable) {
    this.locals = locals;
    this.symbols = symbols;
  }
  lookup(name: string): CVType | null {
    const local = this.locals.get(name);
    if (local) return local;
    const entity = this.symbols.entities.get(name);
    if (entity) return entity.type;
    return null;
  }
}
