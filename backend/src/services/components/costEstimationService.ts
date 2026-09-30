/**
 * costEstimationService — deterministic AI cost / token / runtime estimation for
 * Experience Builder components. Pure functions (no I/O) so they are fully
 * unit-testable and identical across preview, admin, and runtime.
 *
 * Pricing is table-driven (per 1M tokens) and centrally editable — never a
 * hardcoded constant at a call site. Token counts use the standard ~4-chars/token
 * heuristic; runtime uses a base latency + per-output-token decode rate.
 */

export interface ModelPricing {
  input_per_1m: number;    // USD per 1M input tokens
  output_per_1m: number;   // USD per 1M output tokens
  decode_tokens_per_sec: number;
  base_latency_ms: number;
}

/** Central pricing table. Prod runs gpt-4o-mini (see reference_prod_openai_key). */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-4o-mini': { input_per_1m: 0.15, output_per_1m: 0.60, decode_tokens_per_sec: 90, base_latency_ms: 550 },
  'gpt-4o': { input_per_1m: 2.50, output_per_1m: 10.0, decode_tokens_per_sec: 60, base_latency_ms: 700 },
  'gpt-4.1-mini': { input_per_1m: 0.40, output_per_1m: 1.60, decode_tokens_per_sec: 90, base_latency_ms: 550 },
};
export const DEFAULT_MODEL = 'gpt-4o-mini';

export interface Estimate {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  runtime_ms: number;
}

/** ~4 characters per token (OpenAI BPE heuristic). Empty/undefined -> 0. */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Estimate one generation call: `inputText` is everything sent (prompts +
 * variables), `expectedOutputTokens` is the anticipated completion size.
 */
export function estimate(
  inputText: string,
  expectedOutputTokens: number,
  model: string = DEFAULT_MODEL,
): Estimate {
  const p = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
  const input_tokens = estimateTokens(inputText);
  const output_tokens = Math.max(0, Math.round(expectedOutputTokens));
  const cost_usd = (input_tokens * p.input_per_1m + output_tokens * p.output_per_1m) / 1_000_000;
  const runtime_ms = Math.round(p.base_latency_ms + (output_tokens / p.decode_tokens_per_sec) * 1000);
  return { model, input_tokens, output_tokens, cost_usd: Number(cost_usd.toFixed(6)), runtime_ms };
}

/**
 * Estimate an AI Component from its prompt bundle. Input = all non-empty prompts
 * concatenated; output size scales with the component's difficulty (build/stretch
 * components produce longer artifacts).
 */
export function estimateComponent(
  component: {
    renderer_prompt?: string | null; generation_prompt?: string | null;
    evaluation_prompt?: string | null; reflection_prompt?: string | null;
    github_prompt?: string | null; improvement_prompt?: string | null;
    difficulty?: string | null;
  },
  model: string = DEFAULT_MODEL,
): Estimate {
  const promptText = [
    component.generation_prompt, component.renderer_prompt, component.evaluation_prompt,
    component.reflection_prompt, component.github_prompt, component.improvement_prompt,
  ].filter(Boolean).join('\n\n');
  const outByDifficulty: Record<string, number> = { intro: 350, core: 700, stretch: 1200 };
  const expectedOutput = outByDifficulty[component.difficulty || 'core'] ?? 700;
  return estimate(promptText, expectedOutput, model);
}
