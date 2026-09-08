import type OpenAI from 'openai';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import {
  TriageConcern,
  TriageResult,
  TriageSeverity,
  TriageVerdict,
  TRIAGE_MODEL,
  TRIAGE_PROMPT_VERSION,
} from './triageTypes';

/**
 * certQuestionTriage — one question, one adversarial read, one verdict.
 *
 * WHAT THIS IS NOT. It is not verification. Claude authored these questions, and
 * a model reviewing them is closer to a second opinion than to a check: this
 * reviewer is GPT-4o-mini, a different model family, which is more independent
 * than self-review and is still not a person. Everything downstream of this file
 * is built so that distinction survives contact with a human reader.
 *
 * IT CANNOT APPROVE ANYTHING. This module imports no approval path. It does not
 * import `setReviewStatus`, it does not import `CertQuestionRevision`, and it
 * writes nothing at all — it returns a verdict and the caller decides what to
 * persist. There is a test asserting those imports are absent, because the
 * guarantee should hold structurally rather than by everyone remembering.
 *
 * ── WHY THE PROMPT ARGUES AGAINST THE ANSWER ─────────────────────────────────
 * A reviewer asked "is this correct?" agrees with the answer it is shown. The
 * failure mode of a bank written quickly is not the obviously wrong item, which
 * anybody catches; it is the item where a distractor is also defensible and the
 * key is merely one of two good answers. Only a reviewer told to break the
 * question finds those. So the prompt argues the strongest case AGAINST the
 * marked answer first, and only then decides whether the answer survives.
 *
 * ── EXTERNAL CALL RULES (backend/CLAUDE.md) ──────────────────────────────────
 *   timeout   20s, set on the client, not left to the default
 *   retries   2 attempts, and NO retry on a 4xx: a malformed request or a
 *             rejected item does not become well-formed on a second try, and
 *             retrying it just spends money to fail again
 *   errors    every failure carries an `error_class` — TimeoutError,
 *             RateLimitError, ContractViolation, UpstreamUnavailable — so a
 *             failed triage is countable by cause rather than a silent gap
 *
 * A FAILURE IS NEVER SILENT AND NEVER "FINE". An unreadable response returns
 * `verdict: 'error'`, and `needsHuman()` treats an error exactly like a flag: a
 * question the reviewer could not read is a question nobody has looked at.
 * Scoring that as `no_concerns` would be the precise failure this process exists
 * to prevent.
 */

const TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 2;
const MAX_TOKENS = 700;

let client: OpenAI | null = null;
function reviewer(): OpenAI {
  if (!client) {
    client = getInstrumentedOpenAI(
      { workflow_id: 'cert_question_triage', prompt_version: TRIAGE_PROMPT_VERSION },
      { timeout: TIMEOUT_MS, maxRetries: 0 },   // retries handled here, so 4xx can be excluded
    );
  }
  return client;
}

/** Reset between tests; not used in production. */
export function __resetTriageClient(): void { client = null; }

export interface TriageInput {
  question_key: string;
  stem: string;
  options: { key: string; text: string }[];
  correct_keys: string[];
  rationale: string | null;
  distractor_rationales: Record<string, string> | null;
  domain_id: string;
  objective_id: string;
}

const SYSTEM = [
  'You review multiple-choice exam questions for a professional certification.',
  '',
  'Your job is to BREAK the question, not to confirm it. For each item you are given',
  'the marked answer and the author\'s reasoning. Argue the strongest case you can',
  'AGAINST the marked answer being the single best choice, then decide whether it',
  'survives that argument.',
  '',
  'The failures that matter most:',
  '  - a distractor that is also defensible, so the key is one of two good answers',
  '  - a stem that can be read two ways',
  '  - anything asserted that is not true, or was true once and is not now',
  '  - a key that is simply wrong',
  '',
  'Do NOT flag an item for being short, for style, for difficulty, or for what it',
  'omits. A question that is merely easy is not a defect.',
  '',
  'Respond with JSON only:',
  '{"verdict":"no_concerns"|"needs_human",',
  ' "severity":"low"|"medium"|"high"|null,',
  ' "concerns":[{"kind":"defensible_distractor"|"ambiguous_stem"|"factual_error"',
  '              |"answer_disputed"|"outdated"|"other",',
  '              "option":"B"|null,"detail":"one sentence, specific"}]}',
  '',
  'verdict "no_concerns" means you raised no objection. Use it when your best',
  'argument against the answer fails. Return an empty concerns array with it.',
].join('\n');

function userPrompt(q: TriageInput): string {
  const opts = q.options
    .map((o) => {
      const marked = q.correct_keys.includes(o.key) ? '  <-- MARKED CORRECT' : '';
      const why = !q.correct_keys.includes(o.key) ? (q.distractor_rationales ?? {})[o.key] : null;
      return `${o.key}. ${o.text}${marked}${why ? `\n   author says wrong because: ${why}` : ''}`;
    })
    .join('\n');

  return [
    `Domain ${q.domain_id}, objective ${q.objective_id}.`,
    '',
    `QUESTION: ${q.stem}`,
    '',
    opts,
    '',
    q.rationale ? `AUTHOR'S REASONING FOR THE ANSWER: ${q.rationale}` : '',
    '',
    'Argue against the marked answer, then give your verdict as JSON.',
  ].filter(Boolean).join('\n');
}

/** An HTTP status that will not become success on a retry. */
function isClientError(err: any): boolean {
  const status = Number(err?.status ?? err?.response?.status ?? 0);
  return status >= 400 && status < 500 && status !== 429;
}

function classify(err: any): string {
  const status = Number(err?.status ?? err?.response?.status ?? 0);
  if (err?.name === 'APIConnectionTimeoutError' || /timeout/i.test(String(err?.message))) return 'TimeoutError';
  if (status === 429) return 'RateLimitError';
  if (status === 401 || status === 403) return 'AuthError';
  if (status >= 500) return 'UpstreamUnavailable';
  if (status >= 400) return 'ValidationError';
  return 'UnknownError';
}

const VALID_KINDS = new Set([
  'defensible_distractor', 'ambiguous_stem', 'factual_error',
  'answer_disputed', 'outdated', 'other',
]);

/**
 * Parse the reviewer's answer, treating it as untrusted. A model asked for JSON
 * usually returns JSON; "usually" is not a contract, and a shape we half-accept
 * would produce a verdict nobody can act on.
 */
export function parseTriageResponse(raw: string | null | undefined): TriageResult {
  if (!raw || !raw.trim()) {
    return { verdict: 'error', severity: null, concerns: [], errorClass: 'ContractViolation' };
  }
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { verdict: 'error', severity: null, concerns: [], errorClass: 'ContractViolation' };
  }

  const verdict = parsed?.verdict;
  if (verdict !== 'no_concerns' && verdict !== 'needs_human') {
    return { verdict: 'error', severity: null, concerns: [], errorClass: 'ContractViolation' };
  }

  const concerns: TriageConcern[] = Array.isArray(parsed?.concerns)
    ? parsed.concerns
      .filter((c: any) => c && typeof c.detail === 'string' && c.detail.trim())
      .map((c: any) => ({
        kind: VALID_KINDS.has(c.kind) ? c.kind : 'other',
        option: typeof c.option === 'string' && c.option.trim() ? c.option.trim() : null,
        detail: String(c.detail).trim().slice(0, 500),
      }))
    : [];

  // A flag with no reason is not actionable, and the whole promise of this
  // process is that a flagged item tells the human WHY. Treat it as a contract
  // violation rather than passing an empty accusation along.
  if (verdict === 'needs_human' && concerns.length === 0) {
    return { verdict: 'error', severity: null, concerns: [], errorClass: 'ContractViolation' };
  }

  // AND THE MIRROR IMAGE, which is the more dangerous of the two.
  //
  // A reviewer that states a real objection and then labels its own verdict
  // `no_concerns` would be filed as "raised no objection" — and the concern text
  // would ride along in a field the flagged-only report never prints. The item
  // silently leaves the human's list carrying the reason it should have been on
  // it. Between the two signals the model sent, the objection is the one to
  // believe: writing a concern takes effort, mislabelling is a slip.
  if (verdict === 'no_concerns' && concerns.length > 0) {
    return { verdict: 'needs_human', severity: 'medium', concerns };
  }

  const sev = parsed?.severity;
  const severity: TriageSeverity | null =
    sev === 'low' || sev === 'medium' || sev === 'high' ? sev : (verdict === 'needs_human' ? 'medium' : null);

  return { verdict: verdict as TriageVerdict, severity, concerns };
}

/**
 * Triage one question. Never throws — a review that fails is a verdict, not an
 * exception, because one unreadable item must not end a run over 150 of them.
 */
export async function triageQuestion(q: TriageInput): Promise<TriageResult> {
  let lastError: any = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await reviewer().chat.completions.create({
        model: TRIAGE_MODEL,
        temperature: 0,
        max_tokens: MAX_TOKENS,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userPrompt(q) },
        ],
      });
      return parseTriageResponse(res?.choices?.[0]?.message?.content ?? null);
    } catch (err: any) {
      lastError = err;
      // A 4xx will not become a 200. Stop paying for the same failure.
      if (isClientError(err)) break;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
  }

  const errorClass = classify(lastError);
  console.error('[certTriage] review failed', {
    question_key: q.question_key,
    error_class: errorClass,
    message: lastError?.message,
  });
  return { verdict: 'error', severity: null, concerns: [], errorClass };
}
