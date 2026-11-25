import { z } from 'zod';
import { getInstrumentedOpenAI } from '../../openaiInstrumented';
import { emitAiEvent } from '../../aiEventService';
import { redactSensitive } from '../../../utils/piiRedaction';
import { ensureTraceId } from '../../../utils/requestContext';
import { classifyError } from '../../../utils/errorClassifier';
import { MODEL_PRICING } from '../../components/costEstimationService';
import { allWeeks } from '../../../data/canonicalCourse';
import { VIRAL_FACTORS } from '../scoring';
import { withBudget } from './researchBudget';

/**
 * Find candidate news items with OpenAI's web search tool (M0: the production OpenAI key). The answer
 * is only a list of CANDIDATES: nothing here is stored until signalsJob has fetched the page and read
 * the date off it. One call per group of factors, 180 s each, no SDK retry (a retry could bill
 * twice against one reservation), each call under the cap. The instrumented client wraps only chat
 * completions, so this redacts the prompt and records the ai_event itself.
 */
export const SEARCH_MODEL = process.env.WEEKLY_LIVE_SEARCH_MODEL || 'gpt-6.2-sol';
const WEB_SEARCH_CALL_USD = 0.01;
/** Worst case reserved per call: about 100k input and 8k output tokens, plus MAX_SEARCHES searches. */
export const SEARCH_RESERVE_USD = 0.45;
const MAX_SEARCHES = 10;
/** Per call, so the fetch stage has a bound: five calls, two rounds, at most 80 pages. */
export const MAX_CANDIDATES = 8;
const TIMEOUT_MS = 180_000;
/** Outlets that refuse our page reader (seen 2026-11-25). A story there needs an alternate the reader can open. */
const UNREADABLE = ['axios.com', 'apnews.com', 'lemonde.fr', 'time.com', 'newegg.com', 'glassdoor.com'];
const WORKFLOW = 'weekly_live_signals';

/** A story tagged with everything says nothing, and would satisfy the three-factor rule by itself. */
export const MAX_FACTORS = 3;
export const FACTOR_GROUPS: readonly (readonly number[])[] = [[1, 6], [2, 7], [3, 4], [5, 10], [8, 9]];

const Url = z.string().max(1000).regex(/^https?:\/\//);
export const CandidateSchema = z.object({
  headline: z.string().min(5).max(500),
  publisher: z.string().max(200).default(''),
  url: Url,
  alternate_url: Url.nullish().catch(null),
  factors: z.array(z.number().int().min(1).max(10)).min(1),
  fits_weeks: z.array(z.number().int().min(1).max(12)).default([]),
  idea: z.string().max(300).default(''),
});
export type Candidate = z.infer<typeof CandidateSchema>;

/** Keep the valid items of a model answer; a malformed item is dropped, never repaired. */
export function parseCandidates(text: string): Candidate[] {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return [];
  let raw: unknown;
  try { raw = JSON.parse(m[0]); } catch { return []; }
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((i) => { const p = CandidateSchema.safeParse(i); return p.success ? [{ ...p.data, factors: [...new Set(p.data.factors)].slice(0, MAX_FACTORS) }] : []; });
}

export interface SearchInput { planId: string; from: string; to: string; airDate: string; forceNews?: string; avoid?: string; have?: string[]; }

function prompt(group: readonly number[], s: SearchInput): string {
  const factors = group.map((f) => `${f} = ${VIRAL_FACTORS[f]}`).join('; ');
  const weeks = allWeeks().map((w) => `${w.week_number}. ${w.theme}`).join('; ');
  return `Search the web for news about AI and work that a live class for working professionals could open with on ${s.airDate}.
Find 6 to 8 real, separate stories published between ${s.from} and ${s.to}. For trends, entertainment and seasonal events, an event in the week of ${s.airDate} also counts.
Look for these kinds of story: ${factors}.
${s.forceNews ? `Also find the story behind this, from the user: ${JSON.stringify(s.forceNews)}.` : ''}
${s.avoid ? `Leave out anything about: ${JSON.stringify(s.avoid)}.` : ''}
Each must be ONE story reported by a newspaper, magazine, broadcaster, trade publication, or the company itself. Never a weekly roundup, newsletter, digest, statistics page, home page, topic page or PDF.
These sites cannot be opened by our reader: ${UNREADABLE.join(', ')}. Do not use them as the url; find the same story elsewhere. Give every story an alternate_url at a different outlet when one exists.
Use a spread of outlets, at most two stories from any one.
${s.have?.length ? `Already found, do not repeat: ${s.have.map((h) => JSON.stringify(h)).join('; ')}.` : ''}
Course weeks: ${weeks}.
Return JSON only: {"items":[{"headline":"","publisher":"","url":"the article itself","alternate_url":"the same story at another outlet or null","factors":[the 1 to 3 strongest, strongest first, numbers 1 to 10: ${Object.entries(VIRAL_FACTORS).map(([k, v]) => `${k} ${v}`).join('; ')}],"fits_weeks":[1 to 3 course week numbers],"idea":"one-line opening hook, plain words, no statistics, no prices"}]}
Only use URLs you found in this search.`;
}

export interface SearchUsage { input_tokens?: number; output_tokens?: number; }
export function searchCost(model: string, usage: SearchUsage | undefined, searches: number): number {
  if (!usage) return SEARCH_RESERVE_USD; // unknown usage is charged at the worst case, never zero
  const p = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o'];
  return ((usage.input_tokens || 0) * p.input_per_1m + (usage.output_tokens || 0) * p.output_per_1m) / 1_000_000 + searches * WEB_SEARCH_CALL_USD;
}

export async function searchGroup(group: readonly number[], s: SearchInput): Promise<Candidate[]> {
  return withBudget(s.planId, `signals:${group.join('+')}`, SEARCH_RESERVE_USD, async () => {
    const client = getInstrumentedOpenAI({ workflow_id: WORKFLOW }, { timeout: TIMEOUT_MS, maxRetries: 0 });
    const t0 = Date.now();
    const event = { event_type: 'llm.call' as const, external_system: 'openai', workflow_id: WORKFLOW, trace_id: ensureTraceId(), model: SEARCH_MODEL, cache_hit: false };
    try {
      const res = await client.responses.create({
        model: SEARCH_MODEL, tools: [{ type: 'web_search', search_context_size: 'medium' }], input: redactSensitive(prompt(group, s)), max_output_tokens: 8000, max_tool_calls: MAX_SEARCHES,
      });
      const searches = res.output.filter((o) => o.type === 'web_search_call').length;
      const costUsd = searchCost(SEARCH_MODEL, res.usage, searches);
      emitAiEvent({ ...event, outcome: 'success', prompt_tokens: res.usage?.input_tokens ?? null, completion_tokens: res.usage?.output_tokens ?? null,
        total_tokens: res.usage?.total_tokens ?? null, cost_usd: costUsd, duration_ms: Date.now() - t0 }).catch(() => undefined); // telemetry never fails the search
      return { value: parseCandidates(res.output_text || '').slice(0, MAX_CANDIDATES), costUsd };
    } catch (e) {
      emitAiEvent({ ...event, outcome: 'failure', error_class: classifyError(e), duration_ms: Date.now() - t0 }).catch(() => undefined);
      throw e;
    }
  });
}
