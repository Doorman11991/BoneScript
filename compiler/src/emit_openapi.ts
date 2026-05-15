/**
 * BoneScript OpenAPI 3.1 Schema Emitter
 * Generates a complete openapi.json for each api_service module.
 * Implements spec/09_CODEGEN.md §2 (ApiService → JSON secondary target).
 *
 * Produces: openapi.json at the project root.
 */

import * as IR from "./ir";

// ─── Type mapping ─────────────────────────────────────────────────────────────

function irTypeToJsonSchema(irType: string): Record<string, unknown> {
  switch (irType) {
    case "string":    return { type: "string" };
    case "uint":      return { type: "integer", minimum: 0 };
    case "int":       return { type: "integer" };
    case "float":     return { type: "number" };
    case "bool":      return { type: "boolean" };
    case "timestamp": return { type: "string", format: "date-time" };
    case "uuid":      return { type: "string", format: "uuid" };
    case "bytes":     return { type: "string", format: "byte" };
    case "json":      return {};
    default: {
      const listMatch = irType.match(/^list<(.+)>$/);
      if (listMatch) return { type: "array", items: irTypeToJsonSchema(listMatch[1]) };
      const setMatch = irType.match(/^set<(.+)>$/);
      if (setMatch) return { type: "array", items: irTypeToJsonSchema(setMatch[1]), uniqueItems: true };
      const optMatch = irType.match(/^optional<(.+)>$/);
      if (optMatch) return { oneOf: [irTypeToJsonSchema(optMatch[1]), { type: "null" }] };
      // Entity reference — use $ref
      return { $ref: `#/components/schemas/${irType}` };
    }
  }
}

function modelToSchema(model: IR.IRModel): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const field of model.fields) {
    if (field.default_value?.startsWith("GENERATED ALWAYS")) continue;
    properties[field.name] = irTypeToJsonSchema(field.type);
    if (!field.nullable && !field.default_value) {
      required.push(field.name);
    }
  }

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

function toSnakeCase(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

// ─── Main emitter ─────────────────────────────────────────────────────────────

export function emitOpenApiSchema(system: IR.IRSystem): string {
  const apiModules = system.modules.filter(m => m.kind === "api_service" && m.models.length > 0);
  if (apiModules.length === 0) return "";

  // ── Collect all schemas ──────────────────────────────────────────────────
  const schemas: Record<string, unknown> = {};

  // Standard error schema
  schemas["Error"] = {
    type: "object",
    required: ["error"],
    properties: {
      error: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: { type: "string" },
          message: { type: "string" },
        },
      },
    },
  };

  // Paginated result wrapper
  schemas["PaginatedResult"] = {
    type: "object",
    required: ["items", "total", "page", "page_size"],
    properties: {
      items: { type: "array", items: {} },
      total: { type: "integer", minimum: 0 },
      page: { type: "integer", minimum: 1 },
      page_size: { type: "integer", minimum: 1 },
    },
  };

  for (const mod of apiModules) {
    for (const model of mod.models) {
      schemas[model.name] = modelToSchema(model);

      // Create input schema (omit server-set fields)
      const createProps: Record<string, unknown> = {};
      const createRequired: string[] = [];
      for (const field of model.fields) {
        if (["id", "created_at", "updated_at"].includes(field.name)) continue;
        if (field.default_value?.startsWith("GENERATED ALWAYS")) continue;
        createProps[field.name] = irTypeToJsonSchema(field.type);
        if (!field.nullable && !field.default_value) createRequired.push(field.name);
      }
      schemas[`Create${model.name}Input`] = {
        type: "object",
        properties: createProps,
        ...(createRequired.length > 0 ? { required: createRequired } : {}),
      };

      // Update input schema (all optional)
      const updateProps: Record<string, unknown> = {};
      for (const field of model.fields) {
        if (["id", "created_at", "updated_at"].includes(field.name)) continue;
        if (field.default_value?.startsWith("GENERATED ALWAYS")) continue;
        updateProps[field.name] = irTypeToJsonSchema(field.type);
      }
      schemas[`Update${model.name}Input`] = {
        type: "object",
        properties: updateProps,
      };
    }
  }

  // Event payload schemas
  for (const ev of system.events) {
    const props: Record<string, unknown> = {};
    for (const field of ev.payload) {
      props[field.name] = irTypeToJsonSchema(field.type);
    }
    schemas[`${ev.name}Payload`] = { type: "object", properties: props };
  }

  // ── Build paths ──────────────────────────────────────────────────────────
  const paths: Record<string, unknown> = {};

  for (const mod of apiModules) {
    const model = mod.models[0];
    const basePath = `/${toSnakeCase(model.name)}s`;
    const tag = mod.name;

    // GET / — list
    paths[basePath] = {
      get: {
        tags: [tag],
        summary: `List ${model.name}s`,
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "page_size", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
        ],
        responses: {
          "200": {
            description: `List of ${model.name}s`,
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/PaginatedResult" },
                    { properties: { items: { type: "array", items: { $ref: `#/components/schemas/${model.name}` } } } },
                  ],
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: [tag],
        summary: `Create ${model.name}`,
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: `#/components/schemas/Create${model.name}Input` },
            },
          },
        },
        responses: {
          "201": {
            description: `${model.name} created`,
            content: { "application/json": { schema: { $ref: `#/components/schemas/${model.name}` } } },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    };

    // GET /:id, PUT /:id, DELETE /:id
    const idPath = `${basePath}/{id}`;
    paths[idPath] = {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      get: {
        tags: [tag],
        summary: `Get ${model.name} by id`,
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: `${model.name}`, content: { "application/json": { schema: { $ref: `#/components/schemas/${model.name}` } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      put: {
        tags: [tag],
        summary: `Update ${model.name}`,
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: `#/components/schemas/Update${model.name}Input` } } },
        },
        responses: {
          "200": { description: `Updated ${model.name}`, content: { "application/json": { schema: { $ref: `#/components/schemas/${model.name}` } } } },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: [tag],
        summary: `Delete ${model.name}`,
        security: [{ bearerAuth: [] }],
        responses: {
          "204": { description: "Deleted" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    };

    // Capability endpoints
    for (const iface of mod.interfaces) {
      for (const method of iface.methods) {
        if (["create", "read", "update", "delete", "list"].includes(method.name)) continue;

        const capPath = `${basePath}/${method.name.replace(/_/g, "-")}`;
        const inputProps: Record<string, unknown> = {};
        for (const param of method.input) {
          inputProps[param.name] = irTypeToJsonSchema(param.type);
        }

        paths[capPath] = {
          post: {
            tags: [tag],
            summary: method.name.replace(/_/g, " "),
            description: [
              method.preconditions.length > 0 ? `**Preconditions:** ${method.preconditions.map(p => p.description).join("; ")}` : "",
              method.effects.length > 0 ? `**Effects:** ${method.effects.map(e => `${e.target} ${e.op === "assign" ? "=" : e.op === "add" ? "+=" : "-="} ${e.value}`).join("; ")}` : "",
              method.sync ? `**Sync:** ${method.sync}` : "",
            ].filter(Boolean).join("\n\n"),
            security: [{ bearerAuth: [] }],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: { type: "object", properties: inputProps },
                },
              },
            },
            responses: {
              "200": { description: "Success", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, action: { type: "string" } } } } } },
              "401": { $ref: "#/components/responses/Unauthorized" },
              "422": { description: "Precondition failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            },
          },
        };
      }
    }
  }

  // ── Assemble document ────────────────────────────────────────────────────
  const doc = {
    openapi: "3.1.0",
    info: {
      title: system.name,
      version: system.version,
      description: `Generated by BoneScript compiler. Source hash: ${system.source_hash}`,
    },
    servers: [
      { url: "http://localhost:3000", description: "Local development" },
    ],
    tags: apiModules.map(m => ({ name: m.name, description: `${m.name} endpoints` })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas,
      responses: {
        Unauthorized: {
          description: "Authentication required",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        NotFound: {
          description: "Resource not found",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        BadRequest: {
          description: "Invalid request",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
      },
    },
  };

  return JSON.stringify(doc, null, 2);
}
