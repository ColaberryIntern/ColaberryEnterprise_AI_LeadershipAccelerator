/**
 * govBuildSpec — ADVISORY AI for the post-approval Build step. Strictly downstream of the
 * DETERMINISTIC `deriveGovBuildPlan` projection: it EXPLAINS and ENRICHES, it never sets a gate
 * and never produces a requirement-cited build story (that stays deterministic).
 *
 *   generateBuildSpec — from the established requirement statements + opportunity context, produces
 *     (1) a LENGTHY build SPEC: the capabilities and functionality we would build, grounded ONLY in
 *         the requirements provided (never invents a requirement, number, date, or scope); and
 *     (2) buyer-system RESEARCH: the platform(s) the buyer likely runs so a vague requirement such as
 *         "connect to their system" becomes a concrete integration target. This is LLM-knowledge-based
 *         (the backend has no web-search service), so it is explicitly ADVISORY — every claim is framed
 *         "likely / to verify", never asserted as established fact.
 *
 * Mirrors govBidNarrative: a content-hash in-memory cache (advisory text is cheap and regenerable, so
 * identical inputs return the stored text instead of re-calling the model — idempotent without a
 * migration), the instrumented OpenAI client (auto-redaction + cost/observability events) with an
 * explicit timeout and a single retry, and it FAILS SOFT — no key / an upstream error returns an
 * `error` string, never throws, so the Build-step route stays up.
 */
import crypto from 'crypto';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { DEFAULT_MODEL } from '../components/costEstimationService';

interface CacheEntry<T> { value: T; at: number; }
const TTL_MS = 60 * 60 * 1000; // 1h — advisory text, regenerable
const MAX_ENTRIES = 100;
const cache = new Map<string, CacheEntry<unknown>>();
function cacheGet<T>(key: string): T | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.at > TTL_MS) { cache.delete(key); return null; }
  return e.value as T;
}
function cacheSet<T>(key: string, value: T): void {
  if (cache.size >= MAX_ENTRIES) { const first = cache.keys().next().value; if (first !== undefined) cache.delete(first); }
  cache.set(key, { value, at: Date.now() });
}
const hash = (o: unknown): string => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');

function logFail(event: string, err: unknown): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend', event, outcome: 'failure',
    error_class: (err as { constructor?: { name?: string } })?.constructor?.name ?? 'Error',
    context: { message: (err as { message?: string })?.message },
  }));
}

export interface BuildSpecRequest {
  requirements: { id: string; text: string }[];
  title?: string | null;
  buyer?: string | null;
  daysLeft?: number | null;
}
export interface BuildSpecResult {
  /** A lengthy capabilities/functionality description grounded ONLY in the requirements provided. */
  spec: string;
  /** Advisory buyer-system research (likely platforms / integration targets to verify). */
  research: string;
  cached: boolean;
  generatedAt: string;
  error?: string;
}

export async function generateBuildSpec(req: BuildSpecRequest): Promise<BuildSpecResult> {
  const now = () => new Date().toISOString();
  if (!process.env.OPENAI_API_KEY) {
    return { spec: '', research: '', cached: false, generatedAt: now(), error: 'AI build spec is unavailable (no API key configured).' };
  }
  const reqs = (Array.isArray(req.requirements) ? req.requirements : []).slice(0, 120); // bound prompt size
  if (reqs.length === 0) {
    return { spec: '', research: '', cached: false, generatedAt: now(), error: 'No established requirements to build a spec from yet.' };
  }
  const key = 'buildspec:' + hash({ reqs, t: req.title ?? null, b: req.buyer ?? null, d: req.daysLeft ?? null });
  const hit = cacheGet<BuildSpecResult>(key);
  if (hit) return { ...hit, cached: true };

  const system =
    'You are a solution architect helping a small firm plan a government-contract build. You produce two things from ' +
    'the established requirement statements provided. Work ONLY from those requirements plus the named buyer — ' +
    'NEVER invent requirements, scope, numbers, dollar figures, or dates the requirements do not state. Return strict JSON ' +
    '{"spec": string, "research": string}. ' +
    'spec: a LENGTHY, structured capabilities-and-functionality description of the system we would build to satisfy these ' +
    'requirements — cover the major capabilities, the functional modules, the data and integration points the requirements ' +
    'imply, and the acceptance evidence each capability would produce. Be concrete about the system and the work; cite the ' +
    'requirement ids inline where a capability traces to one. Plain prose and short labelled sections, no markdown headers. ' +
    'research: buyer-system research — the platform(s) and systems the named buyer most LIKELY runs today, so a vague ' +
    'requirement like "connect to their system" becomes a concrete integration target. You have no live web access, so this ' +
    'is advisory: frame every claim as "likely" / "commonly" and end with an explicit "Verify:" list of what to confirm ' +
    'with the buyer or the solicitation before relying on it. Never assert a buyer system as established fact.';
  const user = [
    `Opportunity: ${req.title || '(untitled)'}${req.buyer ? ` — buyer: ${req.buyer}` : ''}`,
    req.daysLeft != null ? `Days to submission deadline: ${req.daysLeft}.` : '',
    `Established requirements (${reqs.length}):`,
    reqs.map((r) => `- ${r.id}: ${r.text}`).join('\n'),
  ].filter(Boolean).join('\n');

  try {
    const client = getInstrumentedOpenAI({ workflow_id: 'gov_build_spec' }, { timeout: 90000, maxRetries: 1 });
    const res = await client.chat.completions.create({
      model: DEFAULT_MODEL, temperature: 0.4, max_tokens: 2200, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    });
    let parsed: { spec?: unknown; research?: unknown } = {};
    try { parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }
    const result: BuildSpecResult = {
      spec: String(parsed.spec ?? '').trim(),
      research: String(parsed.research ?? '').trim(),
      cached: false, generatedAt: now(),
    };
    if (result.spec || result.research) cacheSet(key, result);
    return result;
  } catch (err) {
    logFail('gov_build_spec', err);
    return { spec: '', research: '', cached: false, generatedAt: now(), error: 'The AI build spec could not be generated right now.' };
  }
}

/** Test seam: clear the in-memory advisory cache. */
export function __clearGovBuildSpecCache(): void { cache.clear(); }
