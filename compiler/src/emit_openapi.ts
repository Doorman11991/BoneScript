/**
 * BoneScript OpenAPI Emitter
 * Generates OpenAPI 3.0.3 YAML and JSON specs from an IRSystem.
 */

import * as IR from "./ir";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSnakeCase(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

function toDashCase(s: string): string {
  return toSnakeCase(s).replace(/_/g, "-");
}

function toPascalCase(s: string): string {
  return s.replace(/(^|_)([a-z])/g, (_: string, _p: string, c: string) => c.toUpperCase());
}

function irTypeToOpenApi(irType: string): Record<string, unknown> {
  if (irType === "string") return { type: "string" };
  if (irType === "uint" || irType === "int") return { type: "integer" };
  if (irType === "float") return { type: "number" };
  if (irType === "bool") return { type: "boolean" };
  if (irType === "timestamp") return { type: "string", format: "date-time" };
  if (irType === "uuid") return { type: "string", format: "uuid" };
  if (irType === "bytes") return { type: "string", format: "byte" };
  if (irType === "json") return { type: "object" };
  const listMatch = irType.match(/^list<(.+)>$/);
  if (listMatch) return { type: "array", items: irTypeToOpenApi(listMatch[1]) };
  const setMatch = irType.match(/^set<(.+)>$/);
  if (setMatch) return { type: "array", items: irTypeToOpenApi(setMatch[1]) };
  const optMatch = irType.match(/^optional<(.+)>$/);
  if (optMatch) return { ...irTypeToOpenApi(optMatch[1]), nullable: true };
  return { type: "string" };
}

function ind(n: number): string {
  return "  ".repeat(n);
}

function yamlValue(v: unknown, depth: number): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return String(v);
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    if (
      v.includes(":") ||
      v.includes("#") ||
      v.includes("'") ||
      v.startsWith("{") ||
      v.startsWith("[")
    ) {
      return JSON.stringify(v);
    }
    return v;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    return (
      "\n" +
      v
        .map((item) => ind(depth) + "- " + yamlValue(item, depth + 1))
        .join("\n")
    );
  }
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    return (
      "\n" +
      entries
        .map(([k, val]) => {
          const valStr = yamlValue(val, depth + 1);
          if (valStr.startsWith("\n")) {
            return ind(depth) + k + ":" + valStr;
          }
          return ind(depth) + k + ": " + valStr;
        })
        .join("\n")
    );
  }
  return String(v);
}

function objToYaml(obj: Record<string, unknown>, depth = 0): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const valStr = yamlValue(v, depth + 1);
    if (valStr.startsWith("\n")) {
      lines.push(ind(depth) + k + ":" + valStr);
    } else {
      lines.push(ind(depth) + k + ": " + valStr);
    }
  }
  return lines.join("\n");
}

// ─── Spec builder ─────────────────────────────────────────────────────────────

function buildSpec(system: IR.IRSystem): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  const schemas: Record<string, unknown> = {};

  for (const mod of system.modules) {
    if (mod.kind !== "api_service" || mod.models.length === 0) continue;

    const model = mod.models[0];
    const tableName = toSnakeCase(model.name);
    const modelName = toPascalCase(model.name);
    const collectionPath = "/" + tableName + "s";
    const itemPath = "/" + tableName + "s/{id}";

    const allMethods: IR.IRMethod[] = mod.interfaces.flatMap((i) => i.methods);
    const crudNames = new Set(["create", "read", "update", "delete", "list"]);
    const capabilityMethods = allMethods.filter(
      (m) => !crudNames.has(m.name.toLowerCase())
    );

    const securityRef = [{ BearerAuth: [] }];

    const listOp: Record<string, unknown> = {
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

    const createOp: Record<string, unknown> = {
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
      const capOp: Record<string, unknown> = {
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

    const properties: Record<string, unknown> = {};
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

export function emitOpenApiSpec(system: IR.IRSystem): string {
  const spec = buildSpec(system);
  const lines: string[] = ["# Generated by BoneScript compiler"];
  lines.push(objToYaml(spec));
  return lines.join("\n") + "\n";
}

export function emitOpenApiJson(system: IR.IRSystem): string {
  return JSON.stringify(buildSpec(system), null, 2);
}
