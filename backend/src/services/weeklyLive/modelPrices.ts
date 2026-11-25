/**
 * Model prices for the Studio's paid calls, per million tokens, from developers.openai.com/api/docs/pricing,
 * read 2026-11-25. A model that is not listed is charged at its reservation, never at zero.
 */
const PRICES: Readonly<Record<string, { input: number; output: number }>> = {
  'gpt-6.2-sol': { input: 2, output: 10 }, 'gpt-6.2-astra': { input: 8, output: 40 }, 'gpt-6.1-terra': { input: 1, output: 5 }, 'gpt-4o': { input: 2.5, output: 10 },
};
export const isPriced = (model: string): boolean => model in PRICES;

export function callCost(model: string, usage: { input_tokens?: number; output_tokens?: number } | undefined, reserveUsd: number): number {
  const p = PRICES[model];
  if (!usage || !p) return reserveUsd;
  return ((usage.input_tokens || 0) * p.input + (usage.output_tokens || 0) * p.output) / 1_000_000;
}

const UNPRICED_RESERVE = { input: 10, output: 50 };
/** The most a call can cost: its model's price, or a high stand-in for a model not listed here. */
export function reserveFor(model: string, maxInputTokens: number, maxOutputTokens: number): number {
  const p = PRICES[model] || UNPRICED_RESERVE;
  return (maxInputTokens * p.input + maxOutputTokens * p.output) / 1_000_000;
}
