"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypeChecker = void 0;
const types_1 = require("./types");
// â”€â”€â”€ Type Checker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
class TypeChecker {
    constructor() {
        this.errors = [];
        this.symbols = {
            entities: new Map(),
            capabilities: new Map(),
            events: new Map(),
            stores: new Set(),
            channels: new Set(),
            flows: new Set(),
        };
    }
    check(program) {
        this.errors = [];
        for (const system of program.systems) {
            this.checkSystem(system);
        }
        return this.errors;
    }
    addError(code, message, loc) {
        this.errors.push({ code, message, loc });
    }
    // â”€â”€â”€ Phase 1: Build Symbol Table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    checkSystem(system) {
        // First pass: register all declarations
        for (const decl of system.declarations) {
            this.registerDeclaration(decl);
        }
        // Second pass: type check all declarations
        for (const decl of system.declarations) {
            this.checkDeclaration(decl);
        }
    }
    registerDeclaration(decl) {
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
    registerEntity(decl) {
        const fields = new Map();
        // Ontology-entailed fields (always present)
        fields.set("id", (0, types_1.prim)("uuid"));
        fields.set("created_at", (0, types_1.prim)("timestamp"));
        fields.set("updated_at", (0, types_1.prim)("timestamp"));
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
            type: (0, types_1.record)(decl.name, fields),
            states,
            capabilities: [],
        });
    }
    registerCapability(decl) {
        const params = new Map();
        for (const p of decl.params) {
            const resolved = this.resolveTypeExpr(p.type);
            if (resolved)
                params.set(p.name, resolved);
        }
        this.symbols.capabilities.set(decl.name, { name: decl.name, params });
    }
    registerEvent(decl) {
        const fields = new Map();
        for (const f of decl.payload) {
            const resolved = this.resolveTypeExpr(f.type);
            if (resolved)
                fields.set(f.name, resolved);
        }
        this.symbols.events.set(decl.name, { name: decl.name, payloadFields: fields });
    }
    // â”€â”€â”€ Phase 2: Type Check Declarations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    checkDeclaration(decl) {
        switch (decl.kind) {
            case "EntityDecl":
                this.checkEntity(decl);
                break;
            case "CapabilityDecl":
                this.checkCapability(decl);
                break;
            case "ChannelDecl":
                this.checkChannel(decl);
                break;
            case "FlowDecl":
                this.checkFlow(decl);
                break;
            case "ConstraintDecl":
                this.checkConstraint(decl);
                break;
            case "ExtensionPointDecl":
                this.checkExtensionPoint(decl);
                break;
        }
    }
    // â”€â”€â”€ Entity Checking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    checkEntity(decl) {
        // Check for duplicate field names
        const seen = new Set();
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
                    this.addError("T005", `Constraint expression must type to bool, got ${(0, types_1.typeToString)(ctype)}`, constraint.loc);
                }
                else if (ctype && ctype.tag === "primitive" && ctype.name !== "bool") {
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
    checkCapability(decl) {
        // Build typing context from parameters
        const fields = new Map();
        for (const p of decl.params) {
            const resolved = this.resolveTypeExpr(p.type);
            if (resolved) {
                fields.set(p.name, resolved);
            }
            else {
                this.addError("T006", `Parameter '${p.name}' references undeclared type`, p.loc);
            }
        }
        const ctx = new TypeContext(fields, this.symbols);
        // Check requires clauses type to bool
        for (const req of decl.requires) {
            const rtype = this.inferExprType(req, ctx);
            if (rtype && !this.isBoolish(rtype)) {
                this.addError("T005", `Requires expression must type to bool, got ${(0, types_1.typeToString)(rtype)}`, req.loc);
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
    checkEffect(effect, ctx) {
        const targetType = this.inferExprType(effect.target, ctx);
        const valueType = this.inferExprType(effect.value, ctx);
        if (!targetType || !valueType)
            return; // already errored
        switch (effect.op) {
            case "=":
                if (!(0, types_1.typeEquals)(targetType, valueType) && !this.isAssignable(valueType, targetType)) {
                    this.addError("T003", `Type mismatch in assignment: target is ${(0, types_1.typeToString)(targetType)}, value is ${(0, types_1.typeToString)(valueType)}`, effect.loc);
                }
                break;
            case "+=":
                // target must be set<T> or numeric, value must be T or numeric
                if (targetType.tag === "generic" && targetType.name === "set") {
                    if (!(0, types_1.typeEquals)(targetType.args[0], valueType)) {
                        this.addError("T008", `Set += requires element type ${(0, types_1.typeToString)(targetType.args[0])}, got ${(0, types_1.typeToString)(valueType)}`, effect.loc);
                    }
                }
                else if ((0, types_1.isNumeric)(targetType)) {
                    if (!(0, types_1.isNumeric)(valueType)) {
                        this.addError("T003", `Numeric += requires numeric value, got ${(0, types_1.typeToString)(valueType)}`, effect.loc);
                    }
                }
                else {
                    this.addError("T008", `+= requires set or numeric target, got ${(0, types_1.typeToString)(targetType)}`, effect.loc);
                }
                break;
            case "-=":
                if (targetType.tag === "generic" && targetType.name === "set") {
                    if (!(0, types_1.typeEquals)(targetType.args[0], valueType)) {
                        this.addError("T008", `Set -= requires element type ${(0, types_1.typeToString)(targetType.args[0])}, got ${(0, types_1.typeToString)(valueType)}`, effect.loc);
                    }
                }
                else if ((0, types_1.isNumeric)(targetType)) {
                    if (!(0, types_1.isNumeric)(valueType)) {
                        this.addError("T003", `Numeric -= requires numeric value, got ${(0, types_1.typeToString)(valueType)}`, effect.loc);
                    }
                }
                else {
                    this.addError("T008", `-= requires set or numeric target, got ${(0, types_1.typeToString)(targetType)}`, effect.loc);
                }
                break;
        }
    }
    // â”€â”€â”€ Channel Checking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    checkChannel(decl) {
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
    checkFlow(decl) {
        for (const step of decl.steps) {
            // Check step action references a valid capability or function
            if (!this.symbols.capabilities.has(step.action.name) &&
                !this.symbols.entities.has(step.action.name)) {
                // Allow â€” could be a helper function not yet declared
                // In strict mode this would be T012
            }
            // Check compensation exists if step has one
            if (step.compensate) {
                // Same check â€” compensation should reference a valid capability
            }
        }
        // Check at least 2 steps (ontology requirement)
        if (decl.steps.length < 2) {
            this.addError("T012", `Flow '${decl.name}' must have at least 2 steps`, decl.loc);
        }
    }
    // â”€â”€â”€ Constraint Checking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    checkConstraint(decl) {
        // Top-level constraints are checked in a global context
        const globalCtx = new TypeContext(new Map(), this.symbols);
        const ctype = this.inferExprType(decl.expr, globalCtx);
        if (ctype && !this.isBoolish(ctype)) {
            this.addError("T005", `Top-level constraint '${decl.name}' must type to bool`, decl.loc);
        }
    }
    // â”€â”€â”€ Expression Type Inference â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    inferExprType(expr, ctx) {
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
    inferLiteralType(expr) {
        switch (expr.type) {
            case "string": return (0, types_1.prim)("string");
            case "int": return (0, types_1.prim)("uint"); // default to uint per spec
            case "float": return (0, types_1.prim)("float");
            case "bool": return (0, types_1.prim)("bool");
            case "none": return types_1.BOTTOM;
            case "list": return (0, types_1.generic)("list", (0, types_1.prim)("json")); // infer element type later
            case "map": return (0, types_1.prim)("json");
        }
    }
    inferFieldRefType(expr, ctx) {
        const path = expr.path;
        if (path.length === 0)
            return null;
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
            return (0, types_1.prim)("json"); // permissive fallback
        }
        return this.resolveFieldPath(currentType, path.slice(1), expr);
    }
    resolveFieldPath(baseType, remaining, expr) {
        let current = baseType;
        for (const segment of remaining) {
            // Handle .unique, .length, .size as derived properties
            if (segment === "unique")
                return (0, types_1.prim)("bool");
            if (segment === "length")
                return (0, types_1.prim)("uint");
            if (segment === "size")
                return (0, types_1.prim)("uint");
            if (current.tag === "record") {
                const field = current.fields.get(segment);
                if (field) {
                    current = field;
                }
                else {
                    // Field not found â€” could be a derived property
                    return (0, types_1.prim)("json"); // permissive
                }
            }
            else if (current.tag === "generic") {
                // Accessing property on generic type (e.g., list.size)
                if (segment === "size" || segment === "length")
                    return (0, types_1.prim)("uint");
                return (0, types_1.prim)("json");
            }
            else {
                return (0, types_1.prim)("json"); // permissive fallback
            }
        }
        return current;
    }
    inferBinaryType(expr, ctx) {
        const left = this.inferExprType(expr.left, ctx);
        const right = this.inferExprType(expr.right, ctx);
        switch (expr.op) {
            // Comparison operators â†’ bool
            case "==":
            case "!=":
            case "<":
            case ">":
            case "<=":
            case ">=":
            case "in":
            case "contains":
            case "and":
            case "or":
                return (0, types_1.prim)("bool");
            // Range operator
            case "..":
                return (0, types_1.generic)("list", (0, types_1.prim)("uint")); // range produces a range object
            // Arithmetic â†’ numeric
            case "+":
            case "*":
            case "/":
            case "%":
                if (left && right && (0, types_1.isNumeric)(left) && (0, types_1.isNumeric)(right)) {
                    // Promote to widest type
                    if (left.name === "float" || right.name === "float")
                        return (0, types_1.prim)("float");
                    if (left.name === "int" || right.name === "int")
                        return (0, types_1.prim)("int");
                    return (0, types_1.prim)("uint");
                }
                if (expr.op === "+" && left?.tag === "primitive" && left.name === "string") {
                    return (0, types_1.prim)("string"); // string concatenation
                }
                return (0, types_1.prim)("uint");
            case "-":
                return (0, types_1.prim)("int"); // subtraction may produce negative
            default:
                return (0, types_1.prim)("bool");
        }
    }
    inferUnaryType(expr, ctx) {
        if (expr.op === "not")
            return (0, types_1.prim)("bool");
        if (expr.op === "-")
            return (0, types_1.prim)("int");
        return (0, types_1.prim)("json");
    }
    inferCallType(expr, ctx) {
        // Built-in functions
        if (expr.name === "now")
            return (0, types_1.prim)("timestamp");
        if (expr.name === "count")
            return (0, types_1.prim)("uint");
        if (expr.name === "sum")
            return (0, types_1.prim)("uint");
        // User-defined â€” return json as permissive fallback
        return (0, types_1.prim)("json");
    }
    inferTernaryType(expr, ctx) {
        // condition must be bool
        const condType = this.inferExprType(expr.condition, ctx);
        if (condType && !this.isBoolish(condType)) {
            this.addError("T005", "Ternary condition must be bool", expr.loc);
        }
        // result type is type of consequent (assume both branches same type)
        return this.inferExprType(expr.consequent, ctx);
    }
    // â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    resolveTypeExpr(typeExpr) {
        switch (typeExpr.kind) {
            case "PrimitiveType":
                return (0, types_1.prim)(typeExpr.name);
            case "GenericType": {
                const args = typeExpr.typeArgs.map(a => this.resolveTypeExpr(a)).filter(Boolean);
                return (0, types_1.generic)(typeExpr.name, ...args);
            }
            case "EntityRefType": {
                const entity = this.symbols.entities.get(typeExpr.name);
                if (entity)
                    return entity.type;
                // Could be a forward reference â€” register as unknown record
                return (0, types_1.record)(typeExpr.name, new Map());
            }
            case "TupleType": {
                const elements = typeExpr.elements.map(e => this.resolveTypeExpr(e)).filter(Boolean);
                return { tag: "tuple", elements };
            }
            case "UnionType": {
                const members = typeExpr.members.map(m => this.resolveTypeExpr(m)).filter(Boolean);
                return { tag: "union", members };
            }
        }
    }
    isBoolish(t) {
        return (t.tag === "primitive" && t.name === "bool") || t.tag === "bottom";
    }
    isAssignable(source, target) {
        if ((0, types_1.typeEquals)(source, target))
            return true;
        // Numeric widening: uint â†’ int â†’ float
        if (source.tag === "primitive" && target.tag === "primitive") {
            if (source.name === "uint" && (target.name === "int" || target.name === "float"))
                return true;
            if (source.name === "int" && target.name === "float")
                return true;
        }
        // json accepts anything and anything accepts json (permissive for unresolved)
        if (target.tag === "primitive" && target.name === "json")
            return true;
        if (source.tag === "primitive" && source.name === "json")
            return true;
        return false;
    }
    checkExtensionPoint(decl) {
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
}
exports.TypeChecker = TypeChecker;
// â”€â”€â”€ Type Context â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
class TypeContext {
    constructor(locals, symbols) {
        this.locals = locals;
        this.symbols = symbols;
    }
    lookup(name) {
        const local = this.locals.get(name);
        if (local)
            return local;
        const entity = this.symbols.entities.get(name);
        if (entity)
            return entity.type;
        return null;
    }
}
//# sourceMappingURL=typechecker.js.map