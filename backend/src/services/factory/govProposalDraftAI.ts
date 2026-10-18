/**
 * govProposalDraftAI — ADVISORY "Draft with AI" for a proposal response (P5). Given one requirement (and the
 * opportunity's title/buyer), it drafts a response AND, for any fact it cannot ground, adds a typed GAP question
 * instead of inventing it. Strictly ADVISORY: it persists nothing itself and sets no gate; the route stores the
 * result via saveDraftWithGaps (which lands it as `draft`, filler-free until a human marks one).
 *
 * Mirrors govCapabilityFit/govBuildSpec: instrumented OpenAI (auto-redaction + cost), content-hash cache, FAIL SOFT
 * (no key / empty input / upstream error -> `error`, never throws). The PURE guardrail `sanitizeDraft` is the unit-
 * tested rail: the AI NEVER resolves a gap (every gap it returns is `open`), gaps are capped, and a gap with no
 * question is dropped - the model can ask, it can never answer on the firm's behalf.
 */
import crypto from 'crypto';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { DEFAULT_MODEL } from '../components/costEstimationService';

interface CacheEntry<T> { value: T; at: number; }
const TTL_MS = 60 * 60 * 1000;
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
const clampStr = (v: unknown, n: number): string => String(v ?? '').trim().slice(0, n);

function logFail(event: string, err: unknown): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend', event, outcome: 'failure',
    error_class: (err as { constructor?: { name?: string } })?.constructor?.name ?? 'Error',
    context: { message: (err as { message?: string })?.message },
  }));
}

export interface DraftGap { id: string; question: string; suggestions: string[]; resolution: 'open'; }
export interface DraftAIResult { content: string; gaps: DraftGap[]; cached: boolean; generatedAt: string; error?: string; }

/**
 * PURE: turn the model's raw draft into a safe { content, gaps }. Deterministic, total. The guardrail: a gap is
 * always `open` (the AI can ask but never answer), each gap gets a stable id, a gap with no question is dropped,
 * and both content and gaps are capped. Never invents a resolution or an answer.
 */
export function sanitizeDraft(raw: unknown, requirementId: string): { content: string; gaps: DraftGap[] } {
  const r = (raw && typeof raw === 'object') ? raw as any : {};
  const content = clampStr(r.content, 6000);
  const gapsRaw = Array.isArray(r.gaps) ? r.gaps : [];
  const gaps: DraftGap[] = [];
  gapsRaw.slice(0, 12).forEach((g: any, i: number) => {
    const question = clampStr(g?.question, 400);
    if (!question) return;
    gaps.push({
      id: `GAP-${requirementId}-${i + 1}`.slice(0, 60),
      question,
      suggestions: Array.isArray(g?.suggestions) ? g.suggestions.map((s: any) => clampStr(s, 200)).filter(Boolean).slice(0, 6) : [],
      resolution: 'open',
    });
  });
  return { content, gaps };
}

export interface DraftAIRequest { requirementId: string; requirementText: string; title?: string | null; buyer?: string | null; }

export async function generateProposalDraftAI(req: DraftAIRequest): Promise<DraftAIResult> {
  const now = () => new Date().toISOString();
  const requirementText = clampStr(req.requirementText, 2000);
  if (!process.env.OPENAI_API_KEY) {
    return { content: '', gaps: [], cached: false, generatedAt: now(), error: 'AI drafting is unavailable (no API key configured).' };
  }
  if (!requirementText) {
    return { content: '', gaps: [], cached: false, generatedAt: now(), error: 'No requirement text to draft from.' };
  }
  const key = 'draftai:' + hash({ r: requirementText, id: req.requirementId, t: req.title ?? null, b: req.buyer ?? null });
  const hit = cacheGet<DraftAIResult>(key);
  if (hit) return { ...hit, cached: true };

  const system =
    'You help a small firm draft one response to a government solicitation requirement. Draft a clear, professional ' +
    'response to the requirement using ONLY general, verifiable statements. CRITICAL: do NOT invent any specific ' +
    'fact - no client names, project names, metrics, dates, dollar figures, certifications, or personnel. Whenever a ' +
    'strong response WOULD need such a specific fact, leave a placeholder in the content and add the missing fact to ' +
    '"gaps" as a QUESTION the firm must answer, with up to 3 plausible "suggestions" phrased as options to pick from ' +
    '(never as asserted facts). Return strict JSON {"content": "...", "gaps": [{"question": "...", "suggestions": ["..."]}]}. ' +
    'Never answer a gap yourself.';
  const user = [
    `Opportunity: ${req.title || '(untitled)'}${req.buyer ? ` - buyer: ${req.buyer}` : ''}`,
    `Requirement ${req.requirementId}:`,
    requirementText,
  ].join('\n');

  try {
    const client = getInstrumentedOpenAI({ workflow_id: 'gov_proposal_draft' }, { timeout: 90000, maxRetries: 1 });
    const res = await client.chat.completions.create({
      model: DEFAULT_MODEL, temperature: 0.3, max_tokens: 1800, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    });
    let parsed: unknown = {};
    try { parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }
    const { content, gaps } = sanitizeDraft(parsed, req.requirementId);
    const result: DraftAIResult = { content, gaps, cached: false, generatedAt: now() };
    if (content || gaps.length) cacheSet(key, result);
    return result;
  } catch (err) {
    logFail('gov_proposal_draft', err);
    return { content: '', gaps: [], cached: false, generatedAt: now(), error: 'The AI draft could not be generated right now.' };
  }
}

/** Test seam: clear the in-memory advisory cache. */
export function __clearGovProposalDraftCache(): void { cache.clear(); }
