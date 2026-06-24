/**
 * LLM cost computation (TBI audit P1-3).
 *
 * Converts token usage into a dollar cost so the Trust Command Center can show real spend
 * (cost was previously null/0 everywhere). Prices are OpenAI list prices (USD per 1M tokens)
 * and should be reviewed when OpenAI changes pricing — keep this table the single source of
 * truth. Unknown models return null (we never fabricate a cost).
 */
export interface ModelPrice {
  /** USD per 1,000,000 input (prompt) tokens. */
  inputPerM: number;
  /** USD per 1,000,000 output (completion) tokens. */
  outputPerM: number;
}

// Verified against OpenAI published pricing (review date: 2026-06). Update on price changes.
export const MODEL_PRICING: Record<string, ModelPrice> = {
  'gpt-4o': { inputPerM: 2.5, outputPerM: 10 },
  'gpt-4o-mini': { inputPerM: 0.15, outputPerM: 0.6 },
  'text-embedding-3-small': { inputPerM: 0.02, outputPerM: 0.02 },
  'text-embedding-3-large': { inputPerM: 0.13, outputPerM: 0.13 },
};

// Longest keys first so 'gpt-4o-mini' wins over the 'gpt-4o' prefix.
const PRICING_KEYS = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);

/** Resolve a (possibly date-suffixed) model id to a known pricing key, or null. */
export function resolvePricingKey(model: string): string | null {
  if (!model) return null;
  if (MODEL_PRICING[model]) return model;
  const m = model.toLowerCase();
  for (const key of PRICING_KEYS) {
    if (m.startsWith(key)) return key;
  }
  return null;
}

/**
 * Compute the USD cost of a single call. Returns null for unknown models (so callers can
 * record "unknown" rather than a wrong number). Rounded to 6 decimal places.
 */
export function computeCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number | null {
  const key = resolvePricingKey(model);
  if (!key) return null;
  const p = MODEL_PRICING[key];
  const cost = (promptTokens / 1_000_000) * p.inputPerM + (completionTokens / 1_000_000) * p.outputPerM;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
