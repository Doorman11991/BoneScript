/**
 * BoneScript Extras Emitter
 * Handles features that don't fit cleanly into the main emitters:
 * - Derived fields (computed columns / virtual getters)
 * - Channel filter expressions
 * - Flow compensation runtime
 */

import * as IR from "./ir";
import * as AST from "./ast";
import { toSnakeCase } from "./lowering_helpers";

// â”€â”€â”€ Derived Field Emission â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Derived fields become PostgreSQL generated columns (when expression supports it)
// or TypeScript getters in the model class.

export function emitDerivedFields(entity: AST.EntityDeclNode): string {
  if (entity.derived.length === 0) return "";
  const lines: string[] = [];
  lines.push(`// Derived fields for ${entity.name}`);
  lines.push(`export const ${entity.name.toUpperCase()}_DERIVED = {`);
  for (const d of entity.derived) {
    lines.push(`  ${d.name}: (entity: any): unknown => {`);
    lines.push(`    // ${serializeExpr(d.expr)}`);
    lines.push(`    return ${jsExpr(d.expr)};`);
    lines.push(`  },`);
  }
  lines.push(`};`);
  return lines.join("\n");
}

function serializeExpr(e: AST.ExprNode): string {
  switch (e.kind) {
    case "Literal":
      if (e.type === "string") return `"${e.value}"`;
      return String(e.value);
    case "FieldRef": return e.path.join(".");
    case "BinaryExpr": return `${serializeExpr(e.left)} ${e.op} ${serializeExpr(e.right)}`;
    case "UnaryExpr": return `${e.op}${serializeExpr(e.operand)}`;
    case "CallExpr": return `${e.name}(${e.args.map(serializeExpr).join(", ")})`;
    case "TernaryExpr": return `${serializeExpr(e.condition)} ? ${serializeExpr(e.consequent)} : ${serializeExpr(e.alternate)}`;
  }
}

function jsExpr(e: AST.ExprNode): string {
  switch (e.kind) {
    case "Literal":
      if (e.type === "string") return JSON.stringify(e.value);
      if (e.type === "none") return "null";
      return String(e.value);
    case "FieldRef":
      return `entity.${e.path.join(".")}`;
    case "BinaryExpr": {
      const op = e.op === "and" ? "&&" : e.op === "or" ? "||" : e.op === "==" ? "===" : e.op === "!=" ? "!==" : e.op;
      return `(${jsExpr(e.left)} ${op} ${jsExpr(e.right)})`;
    }
    case "UnaryExpr":
      return `(${e.op === "not" ? "!" : e.op}${jsExpr(e.operand)})`;
    case "CallExpr":
      if (e.name === "now") return "Date.now()";
      return `${e.name}(${e.args.map(jsExpr).join(", ")})`;
    case "TernaryExpr":
      return `(${jsExpr(e.condition)} ? ${jsExpr(e.consequent)} : ${jsExpr(e.alternate)})`;
  }
}

// â”€â”€â”€ Channel Filter Emission â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Channels with filter expressions get a TypeScript predicate function attached
// to the WebSocket subscription logic.

export function emitChannelFilters(channels: AST.ChannelDeclNode[]): string {
  const filtered = channels.filter(c => c.filter);
  if (filtered.length === 0) return "";

  const lines: string[] = [];
  lines.push(`// Generated channel filter predicates`);
  lines.push(`// Each filter is a deterministic function: (event, participant) -> bool`);
  lines.push(``);
  lines.push(`export const CHANNEL_FILTERS: Record<string, (event: any, participant: any) => boolean> = {`);
  for (const ch of filtered) {
    lines.push(`  "${ch.name}": (event, participant) => {`);
    lines.push(`    // Filter expression: ${ch.filter ? serializeExpr(ch.filter) : "true"}`);
    lines.push(`    return ${ch.filter ? channelFilterExpr(ch.filter) : "true"};`);
    lines.push(`  },`);
  }
  lines.push(`};`);
  lines.push(``);
  lines.push(`export function shouldDeliver(channel: string, event: any, participant: any): boolean {`);
  lines.push(`  const filter = CHANNEL_FILTERS[channel];`);
  lines.push(`  return filter ? filter(event, participant) : true;`);
  lines.push(`}`);

  return lines.join("\n");
}

function channelFilterExpr(e: AST.ExprNode): string {
  // Channel filters reference 'event' and 'participant' as implicit names
  switch (e.kind) {
    case "Literal":
      if (e.type === "string") return JSON.stringify(e.value);
      if (e.type === "none") return "null";
      return String(e.value);
    case "FieldRef": {
      // Resolve event.* and participant.* explicitly
      if (e.path[0] === "event" || e.path[0] === "participant") {
        return e.path.join(".");
      }
      return `event.${e.path.join(".")}`;
    }
    case "BinaryExpr": {
      const op = e.op === "and" ? "&&" : e.op === "or" ? "||" : e.op === "==" ? "===" : e.op === "!=" ? "!==" : e.op;
      return `(${channelFilterExpr(e.left)} ${op} ${channelFilterExpr(e.right)})`;
    }
    case "UnaryExpr":
      return `(${e.op === "not" ? "!" : e.op}${channelFilterExpr(e.operand)})`;
    case "CallExpr":
      return `${e.name}(${e.args.map(channelFilterExpr).join(", ")})`;
    case "TernaryExpr":
      return `(${channelFilterExpr(e.condition)} ? ${channelFilterExpr(e.consequent)} : ${channelFilterExpr(e.alternate)})`;
  }
}

// â”€â”€â”€ Flow Saga Runtime â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function emitFlowRuntime(system: IR.IRSystem): string {
  if (system.flows.length === 0) return "";

  const lines: string[] = [];
  lines.push(`// Generated by BoneScript compiler. DO NOT EDIT.`);
  lines.push(`// Saga runtime â€” implements flow declarations with backward compensation.`);
  lines.push(`//`);
  lines.push(`// On step failure, executes compensations for ALL completed steps in reverse order.`);
  lines.push(``);
  lines.push(`import { logger } from "./logger";`);
  lines.push(`import { counter } from "./metrics";`);
  lines.push(``);

  lines.push(`export interface FlowStep {`);
  lines.push(`  name: string;`);
  lines.push(`  action: (ctx: any) => Promise<void>;`);
  lines.push(`  compensation: ((ctx: any) => Promise<void>) | null;`);
  lines.push(`}`);
  lines.push(``);

  lines.push(`export interface FlowResult {`);
  lines.push(`  ok: boolean;`);
  lines.push(`  failed_step?: string;`);
  lines.push(`  compensated: string[];`);
  lines.push(`  error?: string;`);
  lines.push(`}`);
  lines.push(``);

  lines.push(`export async function executeFlow(name: string, steps: FlowStep[], ctx: any): Promise<FlowResult> {`);
  lines.push(`  const completed: { step: string; compensation: ((c: any) => Promise<void>) | null }[] = [];`);
  lines.push(``);
  lines.push(`  for (const step of steps) {`);
  lines.push(`    try {`);
  lines.push(`      logger.info("flow_step_started", { event: name + "." + step.name });`);
  lines.push(`      await step.action(ctx);`);
  lines.push(`      completed.push({ step: step.name, compensation: step.compensation });`);
  lines.push(`      counter("flow.step_completed", { flow: name, step: step.name });`);
  lines.push(`    } catch (e: any) {`);
  lines.push(`      logger.error("flow_step_failed", { event: name + "." + step.name, metadata: { error: e.message } });`);
  lines.push(`      counter("flow.step_failed", { flow: name, step: step.name });`);
  lines.push(``);
  lines.push(`      // Backward compensation in reverse order`);
  lines.push(`      const compensated: string[] = [];`);
  lines.push(`      for (const c of [...completed].reverse()) {`);
  lines.push(`        if (!c.compensation) continue;`);
  lines.push(`        try {`);
  lines.push(`          await c.compensation(ctx);`);
  lines.push(`          compensated.push(c.step);`);
  lines.push(`          logger.info("flow_compensated", { event: name + "." + c.step });`);
  lines.push(`        } catch (compErr: any) {`);
  lines.push(`          logger.error("flow_compensation_failed", { event: name + "." + c.step, metadata: { error: compErr.message } });`);
  lines.push(`          // Continue with other compensations even if one fails`);
  lines.push(`        }`);
  lines.push(`      }`);
  lines.push(``);
  lines.push(`      return { ok: false, failed_step: step.name, compensated, error: e.message };`);
  lines.push(`    }`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  counter("flow.completed", { flow: name });`);
  lines.push(`  return { ok: true, compensated: [] };`);
  lines.push(`}`);
  lines.push(``);

  // Emit each flow's step definitions
  for (const flow of system.flows) {
    lines.push(`// Flow: ${flow.name}`);
    lines.push(`// ctx must contain: { req, res, auth, client? } for transactional flows`);
    lines.push(`export async function execute_${flow.name}(ctx: { req: any; res: any; auth: any; client?: any }): Promise<FlowResult> {`);
    lines.push(`  const steps: FlowStep[] = [`);
    for (const step of flow.steps) {
      // Parse the action string: "capabilityName(arg1, arg2)"
      const actionMatch = step.action.match(/^(\w+)\((.*)\)$/);
      const actionFn = actionMatch ? actionMatch[1] : step.action;
      const actionArgs = actionMatch ? actionMatch[2] : "";

      lines.push(`    {`);
      lines.push(`      name: "${step.name}",`);
      lines.push(`      action: async (ctx) => {`);
      lines.push(`        // Calls capability: ${step.action}`);
      lines.push(`        const response = await fetch(\`\${process.env.SERVICE_BASE_URL || "http://localhost:3000"}/${toSnakeCase(actionFn).replace(/_/g, "-")}\`, {`);
      lines.push(`          method: "POST",`);
      lines.push(`          headers: { "Content-Type": "application/json", "Authorization": ctx.req.headers.authorization || "" },`);
      lines.push(`          body: JSON.stringify(ctx.req.body),`);
      lines.push(`        });`);
      lines.push(`        if (!response.ok) throw new Error(\`Step ${step.name} failed: \${await response.text()}\`);`);
      lines.push(`        ctx.${step.name}_result = await response.json();`);
      lines.push(`      },`);

      if (step.compensation) {
        const compMatch = step.compensation.match(/^(\w+)\((.*)\)$/);
        const compFn = compMatch ? compMatch[1] : step.compensation;
        lines.push(`      compensation: async (ctx) => {`);
        lines.push(`        // Compensates: ${step.compensation}`);
        lines.push(`        await fetch(\`\${process.env.SERVICE_BASE_URL || "http://localhost:3000"}/${toSnakeCase(compFn).replace(/_/g, "-")}\`, {`);
        lines.push(`          method: "POST",`);
        lines.push(`          headers: { "Content-Type": "application/json", "Authorization": ctx.req.headers.authorization || "" },`);
        lines.push(`          body: JSON.stringify({ ...ctx.req.body, _compensating: true }),`);
        lines.push(`        });`);
        lines.push(`      },`);
      } else {
        lines.push(`      compensation: null,`);
      }
      lines.push(`    },`);
    }
    lines.push(`  ];`);
    lines.push(`  return executeFlow("${flow.name}", steps, ctx);`);
    lines.push(`}`);
    lines.push(``);
  }

  return lines.join("\n");
}
