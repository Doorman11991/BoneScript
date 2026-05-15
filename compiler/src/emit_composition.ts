/**
 * BoneScript Composition Emitter
 * Generates real implementations for pipeline and algorithm capabilities.
 */

import * as IR from "./ir";
import { lookupAlgorithm } from "./algorithm_catalog";

// â”€â”€â”€ Pipeline Emission (Leap 1) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Generate the body of a pipeline-based capability.
 * Sequential pipelines thread results step-to-step with auto-rollback on error.
 * Parallel pipelines run all steps concurrently and collect results.
 */
export function emitPipelineBody(method: IR.IRMethod, indent: string = "    "): string {
  if (!method.pipeline) return "";
  const lines: string[] = [];
  const p = method.pipeline;

  if (p.parallel) {
    return emitParallelPipeline(method, indent);
  }

  // Sequential pipeline
  lines.push(`${indent}// Pipeline: ${p.steps.length} step(s), sequential`);
  lines.push(`${indent}const __pipeline_completed: { step: string; rollback: (() => Promise<void>) | null }[] = [];`);
  lines.push(`${indent}const __pipeline_results: Record<string, unknown> = {};`);
  lines.push(``);
  lines.push(`${indent}try {`);

  for (const step of p.steps) {
    const callExpr = generateStepCall(step);
    if (step.bind_as) {
      lines.push(`${indent}  __pipeline_results["${step.bind_as}"] = await ${callExpr};`);
    } else {
      lines.push(`${indent}  await ${callExpr};`);
    }
    lines.push(`${indent}  __pipeline_completed.push({ step: "${step.call_name}", rollback: null });`);
    lines.push(`${indent}  counter("pipeline.step_completed", { method: "${method.name}", step: "${step.call_name}" });`);
  }

  lines.push(`${indent}  return { ok: true, value: __pipeline_results } as any;`);
  lines.push(`${indent}} catch (__err: any) {`);

  // Error handler
  if (p.on_error) {
    if (p.on_error.action === "rollback") {
      lines.push(`${indent}  // on_error: rollback completed steps in reverse order`);
      lines.push(`${indent}  for (const c of [...__pipeline_completed].reverse()) {`);
      lines.push(`${indent}    if (c.rollback) await c.rollback().catch(() => {});`);
      lines.push(`${indent}  }`);
    } else if (p.on_error.action === "compensate" && p.on_error.call_name) {
      lines.push(`${indent}  // on_error: invoke compensation`);
      const args = p.on_error.call_args.join(", ");
      lines.push(`${indent}  await ${p.on_error.call_name}(${args}).catch(() => {});`);
    } else if (p.on_error.action === "ignore") {
      lines.push(`${indent}  // on_error: ignore â€” log only`);
    } else if (p.on_error.action === "retry") {
      // on_error: retry — re-run the entire pipeline with exponential backoff.
      // Wraps the pipeline steps in a retry loop. The outer try/catch feeds __err here.
      lines.push(`${indent}  // on_error: retry with exponential backoff`);
      lines.push(`${indent}  const __maxAttempts = ${method.retry?.max_attempts ?? 3};`);
      lines.push(`${indent}  const __backoffMs = ${method.retry?.interval_ms ?? 1000};`);
      lines.push(`${indent}  let __lastErr = __err;`);
      lines.push(`${indent}  for (let __attempt = 1; __attempt <= __maxAttempts; __attempt++) {`);
      lines.push(`${indent}    await new Promise(r => setTimeout(r, __backoffMs * Math.pow(2, __attempt - 1)));`);
      lines.push(`${indent}    try {`);
      // Re-emit all pipeline steps inside the retry loop
      for (const step of p.steps) {
        const callExpr = generateStepCall(step);
        if (step.bind_as) {
          lines.push(`${indent}      __pipeline_results["${step.bind_as}"] = await ${callExpr};`);
        } else {
          lines.push(`${indent}      await ${callExpr};`);
        }
      }
      lines.push(`${indent}      return { ok: true, value: __pipeline_results } as any; // retry succeeded`);
      lines.push(`${indent}    } catch (__retryErr: any) {`);
      lines.push(`${indent}      __lastErr = __retryErr;`);
      lines.push(`${indent}    }`);
      lines.push(`${indent}  }`);
      lines.push(`${indent}  return { ok: false, error: { code: "PIPELINE_RETRY_EXHAUSTED", message: __lastErr.message, attempts: __maxAttempts } } as any;`);
    }
  } else {
    // Default: rollback on error
    lines.push(`${indent}  // Default: rollback completed steps in reverse order`);
    lines.push(`${indent}  for (const c of [...__pipeline_completed].reverse()) {`);
    lines.push(`${indent}    if (c.rollback) await c.rollback().catch(() => {});`);
    lines.push(`${indent}  }`);
  }

  lines.push(`${indent}  counter("pipeline.failed", { method: "${method.name}" });`);
  lines.push(`${indent}  logger.error("pipeline_failed", { event: "${method.name}", metadata: { error: __err.message } });`);
  lines.push(`${indent}  return { ok: false, error: { code: "PIPELINE_FAILED", message: __err.message } } as any;`);
  lines.push(`${indent}}`);

  return lines.join("\n");
}

function emitParallelPipeline(method: IR.IRMethod, indent: string): string {
  if (!method.pipeline) return "";
  const lines: string[] = [];
  const p = method.pipeline;

  lines.push(`${indent}// Pipeline: ${p.steps.length} step(s), parallel`);
  lines.push(`${indent}try {`);
  lines.push(`${indent}  const __results = await Promise.all([`);

  for (const step of p.steps) {
    lines.push(`${indent}    ${generateStepCall(step)},`);
  }

  lines.push(`${indent}  ]);`);
  lines.push(`${indent}  counter("pipeline.parallel_completed", { method: "${method.name}", count: "${p.steps.length}" });`);
  lines.push(`${indent}  return { ok: true, value: __results } as any;`);
  lines.push(`${indent}} catch (__err: any) {`);
  lines.push(`${indent}  logger.error("parallel_pipeline_failed", { event: "${method.name}", metadata: { error: __err.message } });`);
  lines.push(`${indent}  return { ok: false, error: { code: "PIPELINE_FAILED", message: __err.message } } as any;`);
  lines.push(`${indent}}`);

  return lines.join("\n");
}

function generateStepCall(step: IR.IRPipelineStep): string {
  // Substitute any arg that references a previous step's bind_as result
  // e.g. if a prior step bound its result as "payment", an arg of "payment"
  // becomes __pipeline_results["payment"]
  const args = step.call_args.map(arg => {
    // Simple identifier that looks like a binding reference
    if (/^\w+$/.test(arg.trim())) {
      return `(__pipeline_results["${arg.trim()}"] ?? ${arg.trim()})`;
    }
    // Dotted path like "payment.id" — resolve the root from pipeline results
    const dotMatch = arg.trim().match(/^(\w+)(\..+)$/);
    if (dotMatch) {
      return `(__pipeline_results["${dotMatch[1]}"] as any)${dotMatch[2]} ?? undefined`;
    }
    return arg;
  });
  return `${step.call_name}(${args.join(", ")})`;
}

// â”€â”€â”€ Algorithm Emission (Leap 2) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Generate the body of an algorithm-based capability by looking up the
 * implementation in the algorithm catalog.
 */
export function emitAlgorithmBody(method: IR.IRMethod, indent: string = "    "): string {
  if (!method.algorithm) return "";

  const spec = lookupAlgorithm(method.algorithm.catalog_name);
  if (!spec) {
    return `${indent}return { ok: false, error: { code: "UNKNOWN_ALGORITHM", message: "Algorithm '${method.algorithm.catalog_name}' not in catalog" } } as any;`;
  }

  const lines: string[] = [];
  lines.push(`${indent}// Algorithm: ${spec.name} (${spec.complexity})`);
  lines.push(`${indent}// ${spec.description}`);
  lines.push(``);
  lines.push(`${indent}try {`);

  // Bind named arguments to algorithm parameters
  const argNames: string[] = [];
  for (const input of spec.inputs) {
    const binding = method.algorithm.bindings.find(b => b.param === input.name);
    if (binding) {
      argNames.push(binding.value);
    } else {
      argNames.push(input.name); // assume it's a method parameter
    }
  }

  const fnName = camelize(spec.name);
  lines.push(`${indent}  const __result = ${fnName}(${argNames.join(", ")});`);
  lines.push(`${indent}  counter("algorithm.invoked", { algorithm: "${spec.name}" });`);
  lines.push(`${indent}  return { ok: true, value: __result } as any;`);
  lines.push(`${indent}} catch (__err: any) {`);
  lines.push(`${indent}  logger.error("algorithm_failed", { event: "${spec.name}", metadata: { error: __err.message } });`);
  lines.push(`${indent}  return { ok: false, error: { code: "ALGORITHM_FAILED", message: __err.message } } as any;`);
  lines.push(`${indent}}`);

  return lines.join("\n");
}

function camelize(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// â”€â”€â”€ Algorithms File Emission â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Emit a single TypeScript file containing all algorithm implementations
 * referenced by capabilities in the system.
 */
export function emitAlgorithmsFile(usedAlgorithms: Set<string>): string {
  if (usedAlgorithms.size === 0) return "";

  const lines: string[] = [];
  lines.push(`// Generated by BoneScript compiler. DO NOT EDIT.`);
  lines.push(`// Algorithm implementations from BoneScript catalog.`);
  lines.push(``);

  for (const name of [...usedAlgorithms].sort()) {
    const spec = lookupAlgorithm(name);
    if (!spec) continue;
    lines.push(`// â”€â”€â”€ ${spec.name} (${spec.category}, ${spec.complexity}) â”€â”€â”€â”€â”€`);
    lines.push(`// ${spec.description}`);
    lines.push(`export ${spec.emit({}).trim()}`);
    lines.push(``);
  }

  return lines.join("\n");
}

// â”€â”€â”€ Collect Used Algorithms â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function collectUsedAlgorithms(system: IR.IRSystem): Set<string> {
  const used = new Set<string>();
  for (const mod of system.modules) {
    for (const iface of mod.interfaces) {
      for (const method of iface.methods) {
        if (method.algorithm) used.add(method.algorithm.catalog_name);
      }
    }
  }
  return used;
}
