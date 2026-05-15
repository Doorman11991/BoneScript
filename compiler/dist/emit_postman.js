"use strict";
/**
 * BoneScript Postman Collection Emitter
 * Generates a Postman Collection v2.1 JSON from an IRSystem.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitPostmanCollection = void 0;
// ─── Helpers ──────────────────────────────────────────────────────────────────
function toSnakeCase(s) {
    return s.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}
function toDashCase(s) {
    return toSnakeCase(s).replace(/_/g, "-");
}
function sampleValue(irType) {
    if (irType === "string")
        return "example";
    if (irType === "uint" || irType === "int")
        return 1;
    if (irType === "float")
        return 1.0;
    if (irType === "bool")
        return true;
    if (irType === "uuid")
        return "00000000-0000-0000-0000-000000000001";
    if (irType === "timestamp")
        return "2024-01-01T00:00:00.000Z";
    if (irType === "bytes")
        return "";
    if (irType === "json")
        return {};
    const listMatch = irType.match(/^list<(.+)>$/);
    if (listMatch)
        return [];
    const setMatch = irType.match(/^set<(.+)>$/);
    if (setMatch)
        return [];
    const optMatch = irType.match(/^optional<(.+)>$/);
    if (optMatch)
        return null;
    return "example";
}
function buildSampleBody(model) {
    const body = {};
    for (const field of model.fields) {
        body[field.name] = sampleValue(field.type);
    }
    return body;
}
function makeRequest(name, method, url, body) {
    const headers = [
        { key: "Content-Type", value: "application/json" },
        { key: "Authorization", value: "Bearer {{token}}" },
    ];
    const req = {
        name,
        request: {
            method,
            header: headers,
            url: {
                raw: url,
                host: ["{{baseUrl}}"],
                path: url
                    .replace("{{baseUrl}}/", "")
                    .split("/")
                    .filter(Boolean),
            },
        },
    };
    if (body !== undefined) {
        req.request.body = {
            mode: "raw",
            raw: JSON.stringify(body, null, 2),
            options: { raw: { language: "json" } },
        };
    }
    return req;
}
// ─── Public API ───────────────────────────────────────────────────────────────
function emitPostmanCollection(system) {
    const folders = [];
    for (const mod of system.modules) {
        if (mod.kind !== "api_service" || mod.models.length === 0)
            continue;
        const model = mod.models[0];
        const tableName = toSnakeCase(model.name);
        const baseUrl = `{{baseUrl}}/${tableName}s`;
        const sampleBody = buildSampleBody(model);
        const items = [
            makeRequest(`List ${model.name}s`, "GET", baseUrl),
            makeRequest(`Create ${model.name}`, "POST", baseUrl, sampleBody),
            makeRequest(`Get ${model.name}`, "GET", `${baseUrl}/:id`),
            makeRequest(`Update ${model.name}`, "PUT", `${baseUrl}/:id`, sampleBody),
            makeRequest(`Delete ${model.name}`, "DELETE", `${baseUrl}/:id`),
        ];
        const crudNames = new Set(["create", "read", "update", "delete", "list"]);
        const allMethods = mod.interfaces.flatMap((i) => i.methods);
        const capabilityMethods = allMethods.filter((m) => !crudNames.has(m.name.toLowerCase()));
        for (const method of capabilityMethods) {
            const dashName = toDashCase(method.name);
            items.push(makeRequest(method.name + " " + model.name, "POST", `${baseUrl}/${dashName}`, sampleBody));
        }
        folders.push({
            name: mod.name,
            item: items,
        });
    }
    const collection = {
        info: {
            name: system.name,
            schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        auth: {
            type: "bearer",
            bearer: [{ key: "token", value: "{{token}}", type: "string" }],
        },
        variable: [
            { key: "baseUrl", value: "http://localhost:3000" },
            { key: "token", value: "" },
        ],
        item: folders,
    };
    return JSON.stringify(collection, null, 2);
}
exports.emitPostmanCollection = emitPostmanCollection;
//# sourceMappingURL=emit_postman.js.map