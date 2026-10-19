/**
 * govBidNarrative — ADVISORY AI text for the gov bid workspace. Two generators, both strictly
 * downstream of the DETERMINISTIC engine: they EXPLAIN inputs, they never set a score or a verdict.
 *
 *   generateRiskNarrative  — a plain-English read of a bid/no-bid decision that the deterministic
 *                            `assessBid` engine already produced (the facts are passed in). The model
 *                            is forbidden to invent numbers, dates, or a different verdict.
 *   generateProposalSummary — "what they want / what we'd build" from the established requirement
 *                            statements only; never invents requirements or scope.
 *   generateClarificationQuestions — "Ask the buyer": finds the AMBIGUOUS requirements and drafts a
 *                            precise question for each, so a vague line like "connect to their system"
 *                            becomes answerable. Every question must cite a REAL requirement id (the
 *                            PURE `sanitizeClarifications` rail drops any that do not), and the email is
 *                            assembled deterministically from the validated questions — so it can never
 *                            ask about a requirement the model invented.
 *
 * Idempotency without a migration: a content-hash in-memory cache (advisory text is cheap and
 * regenerable, so identical inputs return the stored text instead of re-calling the model). The
 * LLM call goes through the instrumented OpenAI client (auto-redaction + cost/observability events),
 * with an explicit timeout and a single retry (failure-first). Fails SOFT: no key / an upstream
 * error returns an `error` string, never throws, so the surrounding workspace route stays up.
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

export interface RiskNarrativeFacts {
  band: 'bid' | 'bid_with_conditions' | 'no_bid';
  pwin: number | null;
  preliminary: boolean;
  expectedValue: number | null;
  daysLeft: number | null;
  knockouts: { category: string; text: string; status: 'pass' | 'conditional' | 'hard_fail' }[];
  factors: { label: string; score: number | null; weight: number }[];
  buyer?: string | null;
  title?: string | null;
}
export interface RiskNarrativeResult { narrative: string; cached: boolean; generatedAt: string; error?: string; }

const BAND_WORD: Record<RiskNarrativeFacts['band'], string> = {
  bid: 'BID', bid_with_conditions: 'BID WITH CONDITIONS', no_bid: 'NO-BID',
};

export async function generateRiskNarrative(facts: RiskNarrativeFacts): Promise<RiskNarrativeResult> {
  const now = () => new Date().toISOString();
  if (!process.env.OPENAI_API_KEY) {
    return { narrative: '', cached: false, generatedAt: now(), error: 'AI narrative is unavailable (no API key configured).' };
  }
  const key = 'risk:' + hash(facts);
  const hit = cacheGet<RiskNarrativeResult>(key);
  if (hit) return { ...hit, cached: true };

  const hard = facts.knockouts.filter((k) => k.status === 'hard_fail');
  const cond = facts.knockouts.filter((k) => k.status === 'conditional');
  const weak = facts.factors.filter((f) => f.score !== null && (f.score as number) <= 2).sort((a, b) => b.weight - a.weight).slice(0, 3);

  const system =
    'You are a government-contract capture advisor. You EXPLAIN a bid/no-bid decision that a deterministic model has ALREADY computed. ' +
    'Never invent numbers, dollar figures, dates, requirements, or a different verdict — explain only the inputs you are given and recommend concrete next actions. ' +
    'Be concise (120-160 words), plain-spoken, for a busy executive. No markdown headers or bullet characters.';
  const user = [
    `Decision: ${BAND_WORD[facts.band]}${facts.pwin != null ? `, win probability ${facts.pwin}%${facts.preliminary ? ' (preliminary — judgment factors unrated)' : ''}` : ''}.`,
    facts.title ? `Opportunity: ${facts.title}${facts.buyer ? ` (${facts.buyer})` : ''}.` : '',
    facts.expectedValue != null ? `Expected value: $${facts.expectedValue.toLocaleString('en-US')}.` : '',
    facts.daysLeft != null ? `Days to deadline: ${facts.daysLeft}.` : '',
    hard.length ? `HARD eligibility fails (force an automatic no-bid): ${hard.map((k) => k.text).join('; ')}.` : '',
    cond.length ? `Conditional eligibility gaps to close before bidding: ${cond.map((k) => `${k.category}: ${k.text}`).join('; ')}.` : 'No open eligibility gaps.',
    weak.length ? `Weakest win factors: ${weak.map((f) => `${f.label} (${f.score}/5)`).join(', ')}.` : '',
    'Write three short paragraphs: (1) the verdict and why in one sentence; (2) the top 2-3 risks, naming the specific eligibility gaps; (3) the concrete next actions that would most improve the win probability.',
  ].filter(Boolean).join('\n');

  try {
    const client = getInstrumentedOpenAI({ workflow_id: 'gov_bid_risk_narrative' }, { timeout: 45000, maxRetries: 1 });
    const res = await client.chat.completions.create({
      model: DEFAULT_MODEL, temperature: 0.5, max_tokens: 420,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    });
    const text = res.choices?.[0]?.message?.content?.trim() || '';
    const result: RiskNarrativeResult = { narrative: text || 'No narrative was generated.', cached: false, generatedAt: now() };
    if (text) cacheSet(key, result);
    return result;
  } catch (err) {
    logFail('gov_bid_risk_narrative', err);
    return { narrative: '', cached: false, generatedAt: now(), error: 'The AI narrative could not be generated right now.' };
  }
}

export interface ProposalSummaryRequest { requirements: { id: string; text: string }[]; title?: string | null; buyer?: string | null; synopsis?: string | null; }
export interface ProposalSummaryResult { whatTheyWant: string; whatWedBuild: string; cached: boolean; generatedAt: string; error?: string; }

export async function generateProposalSummary(req: ProposalSummaryRequest): Promise<ProposalSummaryResult> {
  const now = () => new Date().toISOString();
  if (!process.env.OPENAI_API_KEY) {
    return { whatTheyWant: '', whatWedBuild: '', cached: false, generatedAt: now(), error: 'AI summary is unavailable (no API key configured).' };
  }
  const reqs = (Array.isArray(req.requirements) ? req.requirements : []).slice(0, 120); // bound prompt size
  // At the Snapshot step no requirements are established yet, so fall back to the opportunity's own synopsis (the
  // preliminary summary already shown on the opportunity details). Only truly empty input - no requirements AND no
  // synopsis - still errors.
  const synopsis = clampStr(req.synopsis, 6000);
  if (reqs.length === 0 && !synopsis) {
    return { whatTheyWant: '', whatWedBuild: '', cached: false, generatedAt: now(), error: 'No established requirements to summarize yet.' };
  }
  const key = 'prop:' + hash({ reqs, syn: synopsis || null, t: req.title ?? null, b: req.buyer ?? null });
  const hit = cacheGet<ProposalSummaryResult>(key);
  if (hit) return { ...hit, cached: true };

  const system =
    'You summarize a government solicitation for a small firm deciding what to build. Work ONLY from the requirement statements provided, ' +
    'or, when no requirements are given, from the opportunity synopsis provided - never invent requirements, scope, numbers, or capabilities the inputs do not imply. ' +
    'Return strict JSON {"whatTheyWant": string, "whatWedBuild": string}. whatTheyWant: 3-5 sentences on what the buyer is asking for. ' +
    'whatWedBuild: 3-5 sentences on the solution we would deliver to satisfy it, concrete about the system and the work. Plain prose, no markdown.';
  const basis = reqs.length > 0
    ? `Requirements (${reqs.length}):\n${reqs.map((r) => `- ${r.id}: ${r.text}`).join('\n')}`
    : `Opportunity synopsis (no requirements established yet):\n${synopsis}`;
  const user = `Opportunity: ${req.title || '(untitled)'}${req.buyer ? ` — ${req.buyer}` : ''}\n${basis}`;

  try {
    const client = getInstrumentedOpenAI({ workflow_id: 'gov_proposal_summary' }, { timeout: 60000, maxRetries: 1 });
    const res = await client.chat.completions.create({
      model: DEFAULT_MODEL, temperature: 0.4, max_tokens: 900, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    });
    let parsed: { whatTheyWant?: unknown; whatWedBuild?: unknown } = {};
    try { parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }
    const result: ProposalSummaryResult = {
      whatTheyWant: String(parsed.whatTheyWant ?? '').trim(),
      whatWedBuild: String(parsed.whatWedBuild ?? '').trim(),
      cached: false, generatedAt: now(),
    };
    if (result.whatTheyWant || result.whatWedBuild) cacheSet(key, result);
    return result;
  } catch (err) {
    logFail('gov_proposal_summary', err);
    return { whatTheyWant: '', whatWedBuild: '', cached: false, generatedAt: now(), error: 'The AI summary could not be generated right now.' };
  }
}

export interface ClarificationRequest { requirements: { id: string; text: string }[]; title?: string | null; buyer?: string | null; }
export interface ClarificationQuestion { requirementId: string; ambiguity: string; question: string; }
export interface ClarificationResult { questions: ClarificationQuestion[]; email: string; cached: boolean; generatedAt: string; error?: string; }

const clampStr = (v: unknown, n: number): string => String(v ?? '').trim().slice(0, n);

/**
 * PURE, total: keep only the questions that cite a KNOWN requirement id AND carry a question; cap the list.
 * This is the load-bearing rail — the model may ask about a requirement that exists, it can never invent one
 * to ask about (a question citing an unknown id is dropped). Deterministic; no I/O.
 */
export function sanitizeClarifications(raw: unknown, validIds: Set<string>): ClarificationQuestion[] {
  const r = (raw && typeof raw === 'object') ? raw as { questions?: unknown } : {};
  const arr = Array.isArray(r.questions) ? r.questions : [];
  const out: ClarificationQuestion[] = [];
  for (const q of arr.slice(0, 40) as any[]) {
    const requirementId = clampStr(q?.requirementId, 60);
    const question = clampStr(q?.question, 600);
    if (!requirementId || !validIds.has(requirementId) || !question) continue;
    out.push({ requirementId, ambiguity: clampStr(q?.ambiguity, 400), question });
    if (out.length >= 20) break;
  }
  return out;
}

/** PURE: assemble a ready-to-send clarification email from VALIDATED questions only (no em-dashes). */
export function buildClarificationEmail(questions: ClarificationQuestion[], title?: string | null, buyer?: string | null): string {
  if (questions.length === 0) return '';
  const lines: string[] = [];
  lines.push(`Subject: Clarification questions${title ? `: ${title}` : ''}`);
  lines.push('');
  lines.push(`To the ${buyer || 'contracting officer'}:`);
  lines.push('');
  lines.push(`We are preparing a response${title ? ` to ${title}` : ''} and request clarification on the following items before the question deadline:`);
  lines.push('');
  questions.forEach((q, i) => { lines.push(`${i + 1}. (${q.requirementId}) ${q.question}`); });
  lines.push('');
  lines.push('Thank you for your consideration.');
  return lines.join('\n');
}

/**
 * ADVISORY "Ask the buyer": find the ambiguous requirements and draft a sharp clarification question for each.
 * Grounded ONLY in the requirement statements; cached by input hash; fails SOFT (no key / no requirements /
 * upstream error -> `error`, never throws). The email is built in code from the sanitized questions.
 */
export async function generateClarificationQuestions(req: ClarificationRequest): Promise<ClarificationResult> {
  const now = () => new Date().toISOString();
  if (!process.env.OPENAI_API_KEY) {
    return { questions: [], email: '', cached: false, generatedAt: now(), error: 'AI clarification drafting is unavailable (no API key configured).' };
  }
  const reqs = (Array.isArray(req.requirements) ? req.requirements : []).slice(0, 120); // bound prompt size
  if (reqs.length === 0) {
    return { questions: [], email: '', cached: false, generatedAt: now(), error: 'No established requirements to draft questions from yet.' };
  }
  const key = 'clarify:' + hash({ reqs, t: req.title ?? null, b: req.buyer ?? null });
  const hit = cacheGet<ClarificationResult>(key);
  if (hit) return { ...hit, cached: true };

  const system =
    'You help a small firm find the AMBIGUOUS requirements in a government solicitation and draft precise clarification questions to send the buyer before the question deadline. ' +
    'Work ONLY from the requirement statements provided. For each requirement that is vague, under-specified, or references a system, standard, or interface it does not name (for example "connect to their system"), produce ONE sharp question that would make it concrete and answerable. ' +
    'Skip requirements that are already clear. NEVER invent a requirement, a system name, a date, or a fact; ask about what is missing rather than asserting it. ' +
    'Return strict JSON {"questions": [{"requirementId": string, "ambiguity": string, "question": string}]}. requirementId MUST be one of the provided ids. Keep each question to one or two sentences. No markdown.';
  const user = `Opportunity: ${req.title || '(untitled)'}${req.buyer ? `: ${req.buyer}` : ''}\nRequirements (${reqs.length}):\n${reqs.map((r) => `- ${r.id}: ${r.text}`).join('\n')}`;

  try {
    const client = getInstrumentedOpenAI({ workflow_id: 'gov_clarification_questions' }, { timeout: 60000, maxRetries: 1 });
    const res = await client.chat.completions.create({
      model: DEFAULT_MODEL, temperature: 0.3, max_tokens: 1200, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    });
    let parsed: unknown = {};
    try { parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }
    const questions = sanitizeClarifications(parsed, new Set(reqs.map((r) => r.id)));
    const email = buildClarificationEmail(questions, req.title ?? null, req.buyer ?? null);
    const result: ClarificationResult = { questions, email, cached: false, generatedAt: now() };
    if (questions.length) cacheSet(key, result);
    return result;
  } catch (err) {
    logFail('gov_clarification_questions', err);
    return { questions: [], email: '', cached: false, generatedAt: now(), error: 'The clarification questions could not be generated right now.' };
  }
}

/** Test seam: clear the in-memory advisory cache. */
export function __clearGovNarrativeCache(): void { cache.clear(); }
