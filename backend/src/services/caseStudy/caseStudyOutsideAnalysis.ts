/**
 * caseStudyOutsideAnalysis - AI reading of an OUTSIDE case-study document (a PDF/deck from the Drive library).
 *
 * Mirrors `factory/govCapabilityFit.ts` on purpose, because that is the house pattern for an advisory LLM step:
 *   - the instrumented OpenAI client (auto-redaction, cost and observability) with an explicit 90 s timeout and a
 *     single retry (`maxRetries: 1`) - never unbounded;
 *   - a sha256 content-hash in-memory cache (1 h, 100 entries): the same document text is analyzed once;
 *   - the document text is fenced by `untrustedBlock`, because a document can say "ignore your instructions";
 *   - FAIL SOFT: no key, empty text, a timeout, a 5xx/429 or malformed JSON returns `{ analysis: null, error }`
 *     and NEVER throws, so one bad file cannot take down an import batch.
 *
 * WHAT THE OUTPUT IS, AND IS NOT. Every field is a CLAIM made by an outside document, extracted by a model. Nothing
 * here is verified. `sanitizeOutsideAnalysis` therefore forces every metric to `verified: false` whatever the model
 * said, so the existing publish gate keeps protecting them, and clamps every field's type and length so a model
 * that rambles or invents structure cannot write it into the database.
 *
 * Failure-first (root CLAUDE.md): (1) on failure the caller still creates the draft, with `analysisError`;
 * (2) retry: one, at the client; (3) recovery: re-import after the upstream recovers, or fill fields by hand;
 * (4) handled: no key, empty text, upstream error/timeout, non-JSON, wrong shape. Not handled: factual errors in the
 * document itself - those stay claims until a person confirms them.
 */
import crypto from 'crypto';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { DEFAULT_MODEL } from '../components/costEstimationService';
import { untrustedBlock } from '../factory/govUntrustedText';

export interface OutsideMetricClaim { label: string; value: string; verified: false }

export interface OutsideCaseStudyAnalysis {
  title: string | null;
  industry: string | null;
  year: number | null;
  /** Anonymized description of the client ("a major agriculture science company"), never a name we were not given consent for. */
  clientDescriptor: string | null;
  summary: string | null;
  problem: string | null;
  approach: string | null;
  outcomes: string[];
  metrics: OutsideMetricClaim[];
  techStack: string[];
  capabilities: string[];
  keywords: string[];
  suggestedNaics: string[];
}

export interface OutsideAnalysisResult {
  analysis: OutsideCaseStudyAnalysis | null;
  cached: boolean;
  error: string | null;
  /** Stable class for logs/metrics; null on success. */
  errorClass: 'NoApiKey' | 'EmptyDocument' | 'UpstreamError' | 'MalformedOutput' | null;
}

/** Document text sent to the model is capped here; the extractor caps what it reads separately. */
export const MAX_ANALYSIS_CHARS = 24_000;
const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 100;
const cache = new Map<string, { value: OutsideCaseStudyAnalysis; at: number }>();

const str = (v: unknown, n: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, n) : null;
};
const strList = (v: unknown, maxItems: number, maxLen: number): string[] => {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    const s = str(x, maxLen);
    if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
};

/**
 * PURE: clamp the model's raw JSON into the contract. Total - any input yields a valid analysis. Metrics are forced
 * `verified: false`; NAICS keeps only 2-6 digit codes; a year outside 1990..(current+1) is dropped.
 */
export function sanitizeOutsideAnalysis(raw: unknown, nowYear: number = new Date().getUTCFullYear()): OutsideCaseStudyAnalysis {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const yearNum = typeof r.year === 'number' ? r.year : typeof r.year === 'string' ? Number.parseInt(r.year, 10) : NaN;
  const metrics: OutsideMetricClaim[] = [];
  if (Array.isArray(r.metrics)) {
    for (const m of r.metrics) {
      const o = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
      const label = str(o.label, 200);
      const value = str(typeof o.value === 'number' ? String(o.value) : o.value, 120);
      if (label && value) metrics.push({ label, value, verified: false });
      if (metrics.length >= 12) break;
    }
  }
  return {
    title: str(r.title, 280),
    industry: str(r.industry, 120),
    year: Number.isInteger(yearNum) && yearNum >= 1990 && yearNum <= nowYear + 1 ? yearNum : null,
    clientDescriptor: str(r.clientDescriptor, 160),
    summary: str(r.summary, 2000),
    problem: str(r.problem, 2000),
    approach: str(r.approach, 2000),
    outcomes: strList(r.outcomes, 10, 400),
    metrics,
    techStack: strList(r.techStack, 30, 60),
    capabilities: strList(r.capabilities, 12, 120),
    keywords: strList(r.keywords, 30, 60),
    // Filter BEFORE capping: a 7-digit string truncated to 6 would otherwise pass as a code.
    suggestedNaics: strList(r.suggestedNaics, 16, 32).filter((c) => /^\d{2,6}$/.test(c)).slice(0, 8),
  };
}

const SYSTEM =
  'You extract a structured case-study record from a document written by a consulting firm about past client work. ' +
  'Return strict JSON with exactly these keys: {"title","industry","year","clientDescriptor","summary","problem",' +
  '"approach","outcomes","metrics","techStack","capabilities","keywords","suggestedNaics"}. ' +
  'title: the project title. industry: one short industry label. year: the 4-digit year of the work if stated, else null. ' +
  'clientDescriptor: an ANONYMIZED description of the client (e.g. "a major agriculture science company"); never a ' +
  'company or person name, even if the document names one. summary/problem/approach: 1-3 plain sentences each. ' +
  'outcomes: short strings. metrics: [{"label","value"}] ONLY for figures the document states literally; never compute, ' +
  'estimate or invent a number. techStack: tools/platforms named. capabilities: the delivery capabilities shown ' +
  '(e.g. "Predictive analytics", "Pricing optimization"). keywords: short lowercase terms. suggestedNaics: 6-digit NAICS ' +
  'codes that plausibly fit the work. Use null or [] when the document does not say. ';

function logFail(errorClass: string, err: unknown, contentHash: string): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: 'case_study_outside_analysis_failed',
    outcome: 'failure', error_class: errorClass,
    context: { content_hash: contentHash.slice(0, 16), message: String((err as { message?: string })?.message ?? '').slice(0, 300) },
  }));
}

/** Analyze one document's text. Never throws. `contentHash` is the file's sha256 (used as the cache key). */
export async function analyzeOutsideDocument(input: { text: string; fileName: string; contentHash: string }): Promise<OutsideAnalysisResult> {
  if (!process.env.OPENAI_API_KEY) {
    return { analysis: null, cached: false, error: 'AI analysis is unavailable (no API key configured).', errorClass: 'NoApiKey' };
  }
  const text = (input.text || '').trim().slice(0, MAX_ANALYSIS_CHARS);
  if (!text) {
    return { analysis: null, cached: false, error: 'No extractable text in this document, so it could not be analyzed.', errorClass: 'EmptyDocument' };
  }
  const key = crypto.createHash('sha256').update(`outside-cs:v1:${DEFAULT_MODEL}:${text}`).digest('hex');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at <= TTL_MS) return { analysis: hit.value, cached: true, error: null, errorClass: null };
  if (hit) cache.delete(key);

  const { rule, block } = untrustedBlock(text);
  let content: string;
  try {
    const client = getInstrumentedOpenAI({ workflow_id: 'case_study_outside_intake' }, { timeout: 90_000, maxRetries: 1 });
    const res = await client.chat.completions.create({
      model: DEFAULT_MODEL, temperature: 0.2, max_tokens: 1800, response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM + rule },
        { role: 'user', content: `File name: ${input.fileName.slice(0, 200)}\n\nDocument text:\n${block}` },
      ],
    });
    content = res.choices?.[0]?.message?.content || '';
  } catch (err) {
    logFail('UpstreamError', err, input.contentHash);
    return { analysis: null, cached: false, error: 'The AI analysis could not be generated right now.', errorClass: 'UpstreamError' };
  }
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch (err) {
    logFail('MalformedOutput', err, input.contentHash);
    return { analysis: null, cached: false, error: 'The AI analysis returned an unreadable answer.', errorClass: 'MalformedOutput' };
  }
  const analysis = sanitizeOutsideAnalysis(parsed);
  if (!analysis.title && !analysis.summary) {
    logFail('MalformedOutput', new Error('no title and no summary in model output'), input.contentHash);
    return { analysis: null, cached: false, error: 'The AI analysis returned no usable fields.', errorClass: 'MalformedOutput' };
  }
  if (cache.size >= MAX_ENTRIES) { const first = cache.keys().next().value; if (first !== undefined) cache.delete(first); }
  cache.set(key, { value: analysis, at: Date.now() });
  return { analysis, cached: false, error: null, errorClass: null };
}

/** Test seam: clear the in-memory cache. */
export function __clearOutsideAnalysisCache(): void { cache.clear(); }
