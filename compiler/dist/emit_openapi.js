"use strict";
/**
 * BoneScript OpenAPI Emitter
 * Generates OpenAPI 3.0.3 YAML and JSON specs from an IRSystem.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitOpenApiJson = exports.emitOpenApiSpec = void 0;
// ─── Helpers ──────────────────────────────────────────────────────────────────
function toSnakeCase(s) {
    return s.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}
function toDashCase(s) {
    return toSnakeCase(s).replace(/_/g, "-");
}
function toPascalCase(s) {
    return s.replace(/(^|_)([a-z])/g, (_, _p, c) => c.toUpperCase());
}
function irTypeToOpenApi(irType) {
    if (irType === "string")
        return { type: "string" };
    if (irType === "uint" || irType === "int")
        return { type: "integer" };
    if (irType === "float")
        return { type: "number" };
    if (irType === "bool")
        return { type: "boolean" };
    if (irType === "timestamp")
        return { type: "string", format: "date-time" };
    if (irType === "uuid")
        return { type: "string", format: "uuid" };
    if (irType === "bytes")
        return { type: "string", format: "byte" };
    if (irType === "json")
        return { type: "object" };
    const listMatch = irType.match(/^list<(.+)>$/);
    if (listMatch)
        return { type: "array", items: irTypeToOpenApi(listMatch[1]) };
    const setMatch = irType.match(/^set<(.+)>$/);
    if (setMatch)
        return { type: "array", items: irTypeToOpenApi(setMatch[1]) };
    const optMatch = irType.match(/^optional<(.+)>$/);
    if (optMatch)
        return { ...irTypeToOpenApi(optMatch[1]), nullable: true };
    return { type: "string" };
}
function ind(n) {
    return "  ".repeat(n);
}
function yamlValue(v, depth) {
    if (v === null || v === undefined)
        return "null";
    if (typeof v === "boolean")
        return String(v);
    if (typeof v === "number")
        return String(v);
    if (typeof v === "string") {
        if (v.includes(":") ||
            v.includes("#") ||
            v.includes("'") ||
            v.startsWith("{") ||
            v.startsWith("[")) {
            return JSON.stringify(v);
        }
        return v;
    }
    if (Array.isArray(v)) {
        if (v.length === 0)
            return "[]";
        return ("\n" +
            v
                .map((item) => ind(depth) + "- " + yamlValue(item, depth + 1))
                .join("\n"));
    }
    if (typeof v === "object") {
        const entries = Object.entries(v);
        if (entries.length === 0)
            return "{}";
        return ("\n" +
            entries
                .map(([k, val]) => {
                const valStr = yamlValue(val, depth + 1);
                if (valStr.startsWith("\n")) {
                    return ind(depth) + k + ":" + valStr;
                }
                return ind(depth) + k + ": " + valStr;
            })
                .join("\n"));
    }
    return String(v);
}
function objToYaml(obj, depth = 0) {
    const lines = [];
    for (const [k, v] of Object.entries(obj)) {
        const valStr = yamlValue(v, depth + 1);
        if (valStr.startsWith("\n")) {
            lines.push(ind(depth) + k + ":" + valStr);
        }
        else {
            lines.push(ind(depth) + k + ": " + valStr);
        }
    }
    return lines.join("\n");
}
// ─── Spec builder ─────────────────────────────────────────────────────────────
function buildSpec(system) {
    const paths = {};
    const schemas = {};
    for (const mod of system.modules) {
        if (mod.kind !== "api_service" || mod.models.length === 0)
            continue;
        const model = mod.models[0];
        const tableName = toSnakeCase(model.name);
        const modelName = toPascalCase(model.name);
        const collectionPath = "/" + tableName + "s";
        const itemPath = "/" + tableName + "s/{id}";
        const allMethods = mod.interfaces.flatMap((i) => i.methods);
        const crudNames = new Set(["create", "read", "update", "delete", "list"]);
        const capabilityMethods = allMethods.filter((m) => !crudNames.has(m.name.toLowerCase()));
        const securityRef = [{ BearerAuth: [] }];
        const listOp = {
            summary: "List " + modelName,
            operationId: "list" + modelName,
            tags: [modelName],
            parameters: [
                { name: "page", in: "query", schema: { type: "integer", default: 1 } },
                {
                    name: "page_size",
                    in: "query",
                    schema: { type: "integer", default: 50 },
                },
            ],
            responses: {
                "200": {
                    description: "List of " + modelName,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    items: {
                                        type: "array",
                                        items: { $ref: "#/components/schemas/" + modelName },
                                    },
                                    total: { type: "integer" },
                                    page: { type: "integer" },
                                    page_size: { type: "integer" },
                                },
                            },
                        },
                    },
                },
                "401": { description: "Unauthorized" },
            },
        };
        const createOp = {
            summary: "Create " + modelName,
            operationId: "create" + modelName,
            tags: [modelName],
            security: securityRef,
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/" + modelName },
                    },
                },
            },
            responses: {
                "200": {
                    description: "Created",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/" + modelName },
                        },
                    },
                },
                "401": { description: "Unauthorized" },
                "422": { description: "Precondition failed" },
                "400": { description: "Bad request" },
            },
        };
        paths[collectionPath] = { get: listOp, post: createOp };
        const idParam = [
            {
                name: "id",
                in: "path",
                required: true,
                schema: { type: "string", format: "uuid" },
            },
        ];
        paths[itemPath] = {
            get: {
                summary: "Get " + modelName,
                operationId: "get" + modelName,
                tags: [modelName],
                parameters: idParam,
                security: securityRef,
                responses: {
                    "200": {
                        description: "Found",
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/" + modelName },
                            },
                        },
                    },
                    "401": { description: "Unauthorized" },
                    "400": { description: "Not found" },
                },
            },
            put: {
                summary: "Update " + modelName,
                operationId: "update" + modelName,
                tags: [modelName],
                parameters: idParam,
                security: securityRef,
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/" + modelName },
                        },
                    },
                },
                responses: {
                    "200": {
                        description: "Updated",
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/" + modelName },
                            },
                        },
                    },
                    "401": { description: "Unauthorized" },
                    "422": { description: "Precondition failed" },
                    "400": { description: "Bad request" },
                },
            },
            delete: {
                summary: "Delete " + modelName,
                operationId: "delete" + modelName,
                tags: [modelName],
                parameters: idParam,
                security: securityRef,
                responses: {
                    "200": { description: "Deleted" },
                    "401": { description: "Unauthorized" },
                    "400": { description: "Not found" },
                },
            },
        };
        for (const method of capabilityMethods) {
            const capPath = collectionPath + "/" + toDashCase(method.name);
            const capOp = {
                summary: method.name + " on " + modelName,
                operationId: method.name + modelName,
                tags: [modelName],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/" + modelName },
                        },
                    },
                },
                responses: {
                    "200": {
                        description: "Success",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        ok: { type: "boolean" },
                                        action: { type: "string" },
                                    },
                                },
                            },
                        },
                    },
                    "401": { description: "Unauthorized" },
                    "422": { description: "Precondition failed" },
                    "400": { description: "Bad request" },
                },
            };
            if (method.authenticated) {
                capOp.security = securityRef;
            }
            paths[capPath] = { post: capOp };
        }
        const properties = {};
        for (const field of model.fields) {
            properties[field.name] = irTypeToOpenApi(field.type);
        }
        schemas[modelName] = {
            type: "object",
            properties,
        };
    }
    return {
        openapi: "3.0.3",
        info: {
            title: system.name,
            version: system.version,
            description: "Generated by BoneScript compiler",
        },
        servers: [{ url: "http://localhost:3000" }],
        paths,
        components: {
            securitySchemes: {
                BearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                },
            },
            schemas,
        },
    };
}
// ─── Public API ───────────────────────────────────────────────────────────────
function emitOpenApiSpec(system) {
    const spec = buildSpec(system);
    const lines = ["# Generated by BoneScript compiler"];
    lines.push(objToYaml(spec));
    return lines.join("\n") + "\n";
}
exports.emitOpenApiSpec = emitOpenApiSpec;
function emitOpenApiJson(system) {
    return JSON.stringify(buildSpec(system), null, 2);
}
exports.emitOpenApiJson = emitOpenApiJson;
//# sourceMappingURL=emit_openapi.js.map