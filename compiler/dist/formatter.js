"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Formatter = void 0;
class Formatter {
    constructor() {
        this.out = [];
        this.indent = 0;
    }
    format(program) {
        this.out = [];
        this.indent = 0;
        for (let i = 0; i < program.systems.length; i++) {
            this.formatSystem(program.systems[i]);
            if (i < program.systems.length - 1)
                this.line("");
        }
        return this.out.join("\n") + "\n";
    }
    line(s) {
        this.out.push("  ".repeat(this.indent) + s);
    }
    blank() {
        this.out.push("");
    }
    formatSystem(sys) {
        this.line(`system ${sys.name} {`);
        this.indent++;
        if (sys.domain) {
            this.line(`domain: ${sys.domain}`);
            this.blank();
        }
        for (let i = 0; i < sys.declarations.length; i++) {
            this.formatDeclaration(sys.declarations[i]);
            if (i < sys.declarations.length - 1)
                this.blank();
        }
        this.indent--;
        this.line(`}`);
    }
    formatDeclaration(decl) {
        switch (decl.kind) {
            case "EntityDecl":
                this.formatEntity(decl);
                break;
            case "CapabilityDecl":
                this.formatCapability(decl);
                break;
            case "ChannelDecl":
                this.formatChannel(decl);
                break;
            case "StoreDecl":
                this.formatStore(decl);
                break;
            case "EventDecl":
                this.formatEvent(decl);
                break;
            case "ConstraintDecl":
                this.formatConstraint(decl);
                break;
            case "PolicyDecl":
                this.formatPolicy(decl);
                break;
            case "FlowDecl":
                this.formatFlow(decl);
                break;
            case "ImportDecl":
                this.formatImport(decl);
                break;
            case "ExtensionPointDecl":
                this.formatExtensionPoint(decl);
                break;
        }
    }
    formatEntity(e) {
        this.line(`entity ${e.name} {`);
        this.indent++;
        if (e.owns.length > 0) {
            if (e.owns.length <= 2) {
                const fields = e.owns.map(f => this.formatField(f)).join(", ");
                this.line(`owns: [${fields}]`);
            }
            else {
                this.line(`owns: [`);
                this.indent++;
                for (let i = 0; i < e.owns.length; i++) {
                    const f = e.owns[i];
                    const comma = i < e.owns.length - 1 ? "," : "";
                    this.line(`${this.formatField(f)}${comma}`);
                }
                this.indent--;
                this.line(`]`);
            }
        }
        if (e.constraints.length > 0) {
            this.line(`constraints: [`);
            this.indent++;
            for (let i = 0; i < e.constraints.length; i++) {
                const comma = i < e.constraints.length - 1 ? "," : "";
                this.line(`${this.formatExpr(e.constraints[i])}${comma}`);
            }
            this.indent--;
            this.line(`]`);
        }
        if (e.states) {
            const path = e.states.nodes.map(n => n.name).join(" -> ");
            this.line(`states: ${path}`);
        }
        if (e.auth)
            this.line(`auth: ${e.auth}`);
        for (const idx of e.indexes) {
            this.line(`index: [${idx.join(", ")}]`);
        }
        this.indent--;
        this.line(`}`);
    }
    formatCapability(c) {
        const params = c.params.map(p => `${p.name}: ${this.formatType(p.type)}`).join(", ");
        this.line(`capability ${c.name}(${params}) {`);
        this.indent++;
        if (c.requires.length > 0) {
            this.line(`requires: [`);
            this.indent++;
            for (let i = 0; i < c.requires.length; i++) {
                const comma = i < c.requires.length - 1 ? "," : "";
                this.line(`${this.formatExpr(c.requires[i])}${comma}`);
            }
            this.indent--;
            this.line(`]`);
        }
        if (c.effects.length > 0) {
            this.line(`effects: [`);
            this.indent++;
            for (let i = 0; i < c.effects.length; i++) {
                const eff = c.effects[i];
                const comma = i < c.effects.length - 1 ? "," : "";
                this.line(`${eff.target.path.join(".")} ${eff.op} ${this.formatExpr(eff.value)}${comma}`);
            }
            this.indent--;
            this.line(`]`);
        }
        if (c.emits.length > 0) {
            const emits = c.emits.map(e => {
                const args = e.args.map(a => this.formatExpr(a)).join(", ");
                return args ? `${e.eventName}(${args})` : e.eventName;
            }).join(", ");
            this.line(`emits: ${emits}`);
        }
        if (c.sync)
            this.line(`sync: ${c.sync}`);
        if (c.timeout)
            this.line(`timeout: ${c.timeout}`);
        if (c.idempotent !== null)
            this.line(`idempotent: ${c.idempotent}`);
        this.indent--;
        this.line(`}`);
    }
    formatChannel(c) {
        this.line(`channel ${c.name} {`);
        this.indent++;
        if (c.transport)
            this.line(`transport: ${c.transport}`);
        if (c.ordering)
            this.line(`ordering: ${c.ordering}`);
        if (c.participants)
            this.line(`participants: ${this.formatType(c.participants)}`);
        if (c.persistence)
            this.line(`persistence: ${c.persistence}`);
        if (c.maxSize !== null)
            this.line(`max_size: ${c.maxSize}`);
        if (c.filter)
            this.line(`filter: ${this.formatExpr(c.filter)}`);
        this.indent--;
        this.line(`}`);
    }
    formatStore(s) {
        this.line(`store ${s.name} {`);
        this.indent++;
        if (s.engine)
            this.line(`engine: ${s.engine}`);
        if (s.schema.length > 0) {
            this.line(`schema: {`);
            this.indent++;
            for (let i = 0; i < s.schema.length; i++) {
                const f = s.schema[i];
                const comma = i < s.schema.length - 1 ? "," : "";
                this.line(`${f.name}: ${this.formatType(f.type)}${comma}`);
            }
            this.indent--;
            this.line(`}`);
        }
        if (s.retention)
            this.line(`retention: ${s.retention}`);
        if (s.partition)
            this.line(`partition: ${s.partition}`);
        if (s.replicas !== null)
            this.line(`replicas: ${s.replicas}`);
        this.indent--;
        this.line(`}`);
    }
    formatEvent(e) {
        this.line(`event ${e.name} {`);
        this.indent++;
        if (e.payload.length > 0) {
            this.line(`payload: {`);
            this.indent++;
            for (let i = 0; i < e.payload.length; i++) {
                const f = e.payload[i];
                const comma = i < e.payload.length - 1 ? "," : "";
                this.line(`${f.name}: ${this.formatType(f.type)}${comma}`);
            }
            this.indent--;
            this.line(`}`);
        }
        if (e.delivery)
            this.line(`delivery: ${e.delivery}`);
        if (e.ttl)
            this.line(`ttl: ${e.ttl}`);
        this.indent--;
        this.line(`}`);
    }
    formatConstraint(c) {
        this.line(`constraint ${c.name}: ${this.formatExpr(c.expr)}`);
    }
    formatPolicy(p) {
        this.line(`policy ${p.name} {`);
        this.indent++;
        if (p.rateLimit)
            this.line(`rate_limit: ${p.rateLimit.count} per ${p.rateLimit.per}`);
        if (p.access.length > 0)
            this.line(`access: [${p.access.join(", ")}]`);
        if (p.audit !== null)
            this.line(`audit: ${p.audit}`);
        if (p.encryption)
            this.line(`encryption: ${p.encryption}`);
        this.indent--;
        this.line(`}`);
    }
    formatFlow(f) {
        this.line(`flow ${f.name} {`);
        this.indent++;
        for (let i = 0; i < f.steps.length; i++) {
            const step = f.steps[i];
            const args = step.action.args.map(a => this.formatExpr(a)).join(", ");
            this.line(`step ${step.name}: ${step.action.name}(${args})`);
            if (step.compensate) {
                const cargs = step.compensate.args.map(a => this.formatExpr(a)).join(", ");
                this.indent++;
                this.line(`compensate: ${step.compensate.name}(${cargs})`);
                this.indent--;
            }
            if (i < f.steps.length - 1)
                this.blank();
        }
        this.indent--;
        this.line(`}`);
    }
    formatImport(i) {
        this.line(`import ${i.name} from "${i.from}"`);
    }
    formatType(t) {
        switch (t.kind) {
            case "PrimitiveType": return t.name;
            case "GenericType": return `${t.name}<${t.typeArgs.map(a => this.formatType(a)).join(", ")}>`;
            case "EntityRefType": return t.name;
            case "TupleType": return `(${t.elements.map(e => this.formatType(e)).join(", ")})`;
            case "UnionType": return t.members.map(m => this.formatType(m)).join(" | ");
        }
    }
    formatField(f) {
        let s = `${f.name}: ${this.formatType(f.type)}`;
        if (f.renamedFrom)
            s += ` @renamed_from(${f.renamedFrom})`;
        if (f.sensitive)
            s += ` @sensitive`;
        return s;
    }
    formatExpr(e) {
        switch (e.kind) {
            case "Literal":
                if (e.type === "string")
                    return `"${e.value}"`;
                if (e.type === "list")
                    return `[${e.value.map(v => this.formatExpr(v)).join(", ")}]`;
                if (e.type === "none")
                    return "none";
                return String(e.value);
            case "FieldRef":
                return e.path.join(".");
            case "BinaryExpr":
                if (e.op === "..")
                    return `${this.formatExpr(e.left)}..${this.formatExpr(e.right)}`;
                return `${this.formatExpr(e.left)} ${e.op} ${this.formatExpr(e.right)}`;
            case "UnaryExpr":
                return `${e.op} ${this.formatExpr(e.operand)}`;
            case "CallExpr":
                return `${e.name}(${e.args.map(a => this.formatExpr(a)).join(", ")})`;
            case "TernaryExpr":
                return `${this.formatExpr(e.condition)} ? ${this.formatExpr(e.consequent)} : ${this.formatExpr(e.alternate)}`;
        }
    }
    formatExtensionPoint(e) {
        const params = e.params.map(p => `${p.name}: ${this.formatType(p.type)}`).join(", ");
        this.line(`extension_point ${e.name}(${params}) {`);
        this.indent++;
        if (e.returns)
            this.line(`returns: ${this.formatType(e.returns)}`);
        this.line(`stable: ${e.stable}`);
        this.indent--;
        this.line(`}`);
    }
}
exports.Formatter = Formatter;
//# sourceMappingURL=formatter.js.map