/**
 * BoneScript Postman Collection Emitter
 * Generates a Postman Collection v2.1 JSON from an IRSystem.
 */

import * as IR from "./ir";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSnakeCase(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

function toDashCase(s: string): string {
  return toSnakeCase(s).replace(/_/g, "-");
}

function sampleValue(irType: string): unknown {
  if (irType === "string") return "example";
  if (irType === "uint" || irType === "int") return 1;
  if (irType === "float") return 1.0;
  if (irType === "bool") return true;
  if (irType === "uuid") return "00000000-0000-0000-0000-000000000001";
  if (irType === "timestamp") return "2024-01-01T00:00:00.000Z";
  if (irType === "bytes") return "";
  if (irType === "json") return {};
  const listMatch = irType.match(/^list<(.+)>$/);
  if (listMatch) return [];
  const setMatch = irType.match(/^set<(.+)>$/);
  if (setMatch) return [];
  const optMatch = irType.match(/^optional<(.+)>$/);
  if (optMatch) return null;
  return "example";
}

function buildSampleBody(model: IR.IRModel): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of model.fields) {
    body[field.name] = sampleValue(field.type);
  }
  return body;
}

function makeRequest(
  name: string,
  method: string,
  url: string,
  body?: Record<string, unknown>
): Record<string, unknown> {
  const headers = [
    { key: "Content-Type", value: "application/json" },
    { key: "Authorization", value: "Bearer {{token}}" },
  ];

  const req: Record<string, unknown> = {
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
    (req.request as Record<string, unknown>).body = {
      mode: "raw",
      raw: JSON.stringify(body, null, 2),
      options: { raw: { language: "json" } },
    };
  }

  return req;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function emitPostmanCollection(system: IR.IRSystem): string {
  const folders: unknown[] = [];

  for (const mod of system.modules) {
    if (mod.kind !== "api_service" || mod.models.length === 0) continue;

    const model = mod.models[0];
    const tableName = toSnakeCase(model.name);
    const baseUrl = `{{baseUrl}}/${tableName}s`;
    const sampleBody = buildSampleBody(model);

    const items: unknown[] = [
      makeRequest(`List ${model.name}s`, "GET", baseUrl),
      makeRequest(`Create ${model.name}`, "POST", baseUrl, sampleBody),
      makeRequest(`Get ${model.name}`, "GET", `${baseUrl}/:id`),
      makeRequest(`Update ${model.name}`, "PUT", `${baseUrl}/:id`, sampleBody),
      makeRequest(`Delete ${model.name}`, "DELETE", `${baseUrl}/:id`),
    ];

    const crudNames = new Set(["create", "read", "update", "delete", "list"]);
    const allMethods: IR.IRMethod[] = mod.interfaces.flatMap((i) => i.methods);
    const capabilityMethods = allMethods.filter(
      (m) => !crudNames.has(m.name.toLowerCase())
    );

    for (const method of capabilityMethods) {
      const dashName = toDashCase(method.name);
      items.push(
        makeRequest(
          method.name + " " + model.name,
          "POST",
          `${baseUrl}/${dashName}`,
          sampleBody
        )
      );
    }

    folders.push({
      name: mod.name,
      item: items,
    });
  }

  const collection = {
    info: {
      name: system.name,
      schema:
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
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
