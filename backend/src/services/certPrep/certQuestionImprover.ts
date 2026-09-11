import type OpenAI from 'openai';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { scoreItem, RubricItem, RubricScore } from './certQuestionRubric';
import { RubricDimension, SCENARIO_FALSE_NEGATIVES } from '../../data/certBlueprints/ccarRubric';
import { REFERENCE, RUBRIC } from '../../data/certBlueprints/ccarRubric';

/**
 * certQuestionImprover — rewrite ONE item toward a higher rubric score.
 *
 * WHAT THIS IS FOR. The rubric can say a question does not look like a real exam
 * item and exactly which dimensions miss. Acting on that by hand across a bank of
 * 150 is a week of work; acting on it per item is what this does.
 *
 * IT CANNOT APPROVE, AND IT CANNOT WRITE. Like `certQuestionTriage`, this module
 * imports no model, no `setReviewStatus`, and no database. It takes an item and
 * returns a candidate. The caller decides whether the candidate is better and
 * whether to persist it. There is a test asserting those imports are absent,
 * because the guarantee should hold structurally rather than by everyone
 * remembering it.
 *
 * ── THE MEASUREMENT IS THE JUDGE, NOT THE MODEL ──────────────────────────────
 * The model proposes; the rubric decides. A candidate that scores no better than
 * the original is REJECTED here, not passed up with a hopeful note. That is the
 * whole reason this is safe to run in a loop: the loop cannot drift downhill,
 * because every step has to prove itself against a deterministic scorer that the
 * model does not get to influence.
 *
 * ── WHAT MUST NOT CHANGE ─────────────────────────────────────────────────────
 * The improver is told, and then CHECKED, on four invariants: the concept being
 * tested, the number of options, that exactly the same number of options are
 * correct, and that the correct answer still says the same thing. A rewrite that
 * quietly changes which answer is right is not an improvement, it is a different
 * question wearing the same key — and it would sail through the rubric, which
 * measures shape and has no opinion about correctness.
 *
 * ── EXTERNAL CALL RULES (backend/CLAUDE.md) ──────────────────────────────────
 *   timeout   30s on the client — a rewrite is a longer generation than a triage
 *   retries   2 attempts, NO retry on 4xx: a rejected request does not become
 *             well-formed on a second try
 *   errors    every failure carries an `error_class`
 */

export const IMPROVER_MODEL = 'gpt-4o';
export const IMPROVER_PROMPT_VERSION = 'v2-median-and-measured';

const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 2;

export interface ImproverItem extends RubricItem {
  difficulty?: string | null;
  scenario_family?: string | null;
}

export type ImproveOutcome =
  | { status: 'improved'; item: ImproverItem; before: RubricScore; after: RubricScore }
  | { status: 'no_better'; before: RubricScore; after: RubricScore }
  | { status: 'invariant_violated'; before: RubricScore; reason: string }
  | { status: 'already_meets'; before: RubricScore }
  | { status: 'failed'; before: RubricScore; error_class: string; message: string };

let client: OpenAI | null = null;
function openai(): OpenAI {
  if (!client) {
    client = getInstrumentedOpenAI(
      { workflow_id: 'certprep_question_improve', prompt_version: IMPROVER_PROMPT_VERSION },
      { timeout: TIMEOUT_MS, maxRetries: 0 },
    );
  }
  return client;
}

function errorClass(err: any): string {
  if (err?.name === 'APIConnectionTimeoutError' || /timeout/i.test(String(err?.message))) return 'TimeoutError';
  if (err?.status === 429) return 'RateLimitError';
  if (err?.status === 401 || err?.status === 403) return 'AuthError';
  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500) return 'BadRequestError';
  if (typeof err?.status === 'number' && err.status >= 500) return 'UpstreamUnavailable';
  return 'UnknownError';
}

/** A 4xx will not fix itself; retrying one only spends money to fail again. */
const isRetryable = (err: any): boolean => {
  const status = err?.status;
  if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429) return false;
  return true;
};

/**
 * The instruction, built from the rubric itself rather than restated by hand.
 *
 * Restating the targets in prose would give this file its own copy of the
 * reference numbers, and the two would drift the first time the rubric moved.
 * They are read from `ccarRubric.ts`, which is the only place they are measured.
 */
export function buildImprovePrompt(item: ImproverItem, score: RubricScore): string {
  const missed = score.dimensions.filter((d) => d.verdict !== 'meets');
  const spec = (id: string) => RUBRIC.find((r) => r.id === id);

  const faults = missed.map((d) => {
    const s = spec(d.id);
    return `- ${s?.label ?? d.id}: ${d.note ?? 'does not meet'}\n  Reference: ${s?.reference ?? ''}\n  Why it matters: ${s?.why ?? ''}`;
  }).join('\n');

  return [
    'You are rewriting one multiple-choice item for a professional certification exam.',
    '',
    'THE ITEM AS IT STANDS:',
    JSON.stringify({
      stem: item.stem,
      options: item.options,
      correct_keys: item.correct_keys,
      rationale: item.rationale,
      distractor_rationales: item.distractor_rationales,
    }, null, 2),
    '',
    'WHAT IS WRONG WITH IT, MEASURED:',
    faults,
    '',
    'TARGETS, measured from the published sample items:',
    `- stem ${REFERENCE.stemWords.min}-${REFERENCE.stemWords.max} words, aim for ${REFERENCE.stemWords.target}`,
    `- each option ${REFERENCE.optionWords.min}-${REFERENCE.optionWords.max} words, aim for ${REFERENCE.optionWords.target}`,
    `- exactly ${REFERENCE.optionCount} options`,
    '- the stem opens by reporting something OBSERVED — a measured rate, a log line,',
    '  a user complaint, an intermittent failure — and says who observed it, before',
    '  it asks anything. Do not write a definitional stem.',
    '- every option is a complete course of action, not a label',
    '- the rationale explains why the key wins; every wrong option gets its own',
    '  one-line explanation of why it loses',
    '',
    'WHAT YOU MUST NOT CHANGE:',
    '- the concept being tested, and which answer is correct. The correct option',
    '  must still say the same thing it says now, in better words.',
    `- the number of options (${item.options.length}) and how many are correct (${item.correct_keys.length})`,
    '- do not invent a product, a version number, a price or a date',
    '',
    'Return ONLY JSON: {"stem": string, "options": [{"key": string, "text": string}],',
    '"correct_keys": [string], "rationale": string, "distractor_rationales": {key: string}}',
  ].join('\n');
}

/**
 * Dimensions this item can NEVER meet, given what a rewrite is allowed to change.
 *
 * WHY THIS EXISTS. The first live sweep spent a model call on `CCARF-A2` and
 * reported it stalled at 5/6. A2 is multi-select by design: `option_count` is
 * defined as four options AND single select, and `checkInvariants` forbids
 * changing how many answers are correct. So the improver is structurally
 * incapable of fixing that dimension, and a sweep aiming at a flat 6/6 would
 * re-spend on it on every run, for ever, and call the result a failure.
 *
 * A target an item cannot reach is not a standard, it is a bug in the check.
 * The ceiling is what this item could achieve if every fixable dimension were
 * fixed, and that is what the sweep aims at.
 */
export function unachievableDimensions(item: ImproverItem): RubricDimension[] {
  const out: RubricDimension[] = [];
  // `option_count` requires exactly one correct answer, and the number of
  // correct answers is an invariant. See the multi-select note in
  // `ccarFoundationsItems.ts` for why those three items stay as they are.
  if (item.correct_keys.length !== 1) out.push('option_count');
  // These eighteen stems DO open with an observation, in words the detector's
  // marker list does not enumerate. They were hand-checked one by one and are
  // recorded in `ccarRubric.ts`. Their only missing dimension is scenario
  // framing, so the sole way a rewrite could score higher is by inserting a
  // marker phrase — changing text that is already right to satisfy a proxy. The
  // detector is the thing that is wrong here, and a sweep must not "fix" a
  // question to make a known-imperfect measurement happy.
  if (SCENARIO_FALSE_NEGATIVES.includes(item.question_key)) out.push('scenario_framing');
  return out;
}

/** The highest score this item can reach without violating an invariant. */
export function achievableScore(item: ImproverItem, of: number): number {
  return of - unachievableDimensions(item).length;
}

/**
 * The invariant check, run on the candidate before its score is even considered.
 *
 * Deliberately structural rather than semantic. We cannot verify that the model
 * preserved the concept — that is what the human reading it is for — but we can
 * refuse a candidate that changed the shape of the answer, and those are the
 * changes that would otherwise pass silently because the rubric has no opinion
 * about which option is right.
 */
export function checkInvariants(before: ImproverItem, after: ImproverItem): string | null {
  if (after.options.length !== before.options.length) {
    return `option count changed: ${before.options.length} -> ${after.options.length}`;
  }
  if (after.correct_keys.length !== before.correct_keys.length) {
    return `correct count changed: ${before.correct_keys.length} -> ${after.correct_keys.length}`;
  }
  const keys = new Set(after.options.map((o) => o.key));
  for (const k of after.correct_keys) {
    if (!keys.has(k)) return `correct key ${k} is not one of the options`;
  }
  for (const o of after.options) {
    if (!o.text || !o.text.trim()) return `option ${o.key} is empty`;
  }
  if (!after.stem || !after.stem.trim()) return 'stem is empty';
  // The rationale is REQUIRED by `DraftRevisionInput` and by the rubric, which
  // scores whether every wrong option is explained. A candidate without one
  // cannot be persisted, so refusing it here is better than discovering it at
  // the write site with a half-finished sweep.
  if (!after.rationale || !after.rationale.trim()) return 'rationale is empty';
  const wrong = after.options.filter((o) => !after.correct_keys.includes(o.key));
  for (const o of wrong) {
    if (!after.distractor_rationales?.[o.key]?.trim()) {
      return `no rationale for wrong option ${o.key}`;
    }
  }
  return null;
}

function parseCandidate(raw: string, before: ImproverItem): ImproverItem {
  const parsed = JSON.parse(raw);
  return {
    ...before,
    stem: String(parsed.stem ?? ''),
    options: Array.isArray(parsed.options)
      ? parsed.options.map((o: any) => ({ key: String(o.key), text: String(o.text ?? '') }))
      : [],
    correct_keys: Array.isArray(parsed.correct_keys) ? parsed.correct_keys.map(String) : [],
    rationale: parsed.rationale ? String(parsed.rationale) : null,
    distractor_rationales: parsed.distractor_rationales ?? null,
  };
}

/**
 * Write a BRAND NEW item for a given objective and scenario.
 *
 * Same contract as `improveItem`: proposes, never writes, never approves. The
 * caller scores it, decides whether it is good enough, and persists it as a
 * draft if so.
 *
 * WHY GENERATION AND IMPROVEMENT SHARE THIS FILE. They share the thing that
 * matters — the rubric decides, not the model — and they share `checkInvariants`
 * for everything except the "did the answer change" comparisons, which have no
 * meaning when there is no previous version. Splitting them would have produced
 * two prompts describing the same target shape, and they would have drifted.
 *
 * WHAT IT IS NOT ALLOWED TO DO. The prompt forbids inventing a product, a
 * version number, a price or a date, for the same reason the improver does: an
 * exam item that asserts a fact about the world is wrong the moment the world
 * moves, and nothing downstream re-checks it.
 */
export async function generateItem(spec: {
  question_key: string;
  domain_id: string;
  domain_label: string;
  objective_id: string;
  objective_label: string;
  scenario_id: string;
  scenario_label: string;
  scenario_summary: string;
  difficulty: 'easy' | 'medium' | 'hard';
  avoidStems: string[];
}): Promise<
  | { status: 'generated'; item: ImproverItem; score: RubricScore }
  | { status: 'invariant_violated'; reason: string }
  | { status: 'failed'; error_class: string; message: string }
> {
  const prompt = [
    'Write ONE multiple-choice item for a professional certification exam.',
    '',
    `DOMAIN: ${spec.domain_id} — ${spec.domain_label}`,
    `OBJECTIVE (this is what the question must test): ${spec.objective_id} — ${spec.objective_label}`,
    `SCENARIO (the world it is set in): ${spec.scenario_id} — ${spec.scenario_label}`,
    `  ${spec.scenario_summary}`,
    `DIFFICULTY: ${spec.difficulty}`,
    '',
    'SHAPE, measured from the published sample items. These are TARGETS, not floors:',
    `- stem about ${REFERENCE.stemWords.target} words (the published range is ${REFERENCE.stemWords.min}-${REFERENCE.stemWords.max})`,
    `- exactly ${REFERENCE.optionCount} options, exactly ONE correct`,
    `- each option about ${REFERENCE.optionWords.target} words (published range ${REFERENCE.optionWords.min}-${REFERENCE.optionWords.max}).`,
    '  An option of seven words is a label with a verb in front of it. Write the',
    '  full course of action: what is done, to what, and what that changes.',
    '',
    'THE STEM MUST CONTAIN A MEASUREMENT. Open with a specific thing somebody',
    'observed, and quantify it: a rate ("about one run in six"), a count ("two',
    'changes merged last week without review"), a duration, a log line. "Occasionally',
    'fails" is not an observation, it is a summary of one. Say who saw it.',
    '',
    'THE KEY MUST RESOLVE THE STEM. Read your own stem back and confirm the correct',
    'option addresses the thing that was actually observed. A retry fixes a call',
    'that failed; it does not fix a call that succeeded with a wrong answer. If the',
    'key does not follow from the observation, rewrite the stem.',
    '',
    'AT LEAST ONE WRONG OPTION MUST BE GENUINELY DEFENSIBLE. A competent engineer',
    'should have to think. "Disable the feature" is never a defensible distractor;',
    'nobody picks it, so it measures nothing. The best distractor is a real approach',
    'that addresses a nearby problem, or the right approach applied one layer too',
    'early or too late.',
    '',
    '- the rationale explains why the key wins; every wrong option gets its own',
    '  one-line explanation of why it loses, naming what the option would have fixed',
    '',
    'HARD RULES:',
    '- do not invent a product, a version number, a price or a date',
    '- do not reproduce or paraphrase any existing certification question',
    '- the question must be answerable from the objective above, not from trivia',
    '',
    spec.avoidStems.length > 0
      ? `DO NOT REPEAT these existing questions in this objective:
${spec.avoidStems.map((s) => `- ${s}`).join('\n')}`
      : '',
    '',
    'Return ONLY JSON: {"stem": string, "options": [{"key":"A","text":string}, ...],',
    '"correct_keys": [string], "rationale": string, "distractor_rationales": {key: string}}',
  ].filter(Boolean).join('\n');

  let lastErr: any = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await openai().chat.completions.create({
        model: IMPROVER_MODEL,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You write certification exam items. You return only JSON.' },
          { role: 'user', content: prompt },
        ],
      });
      const parsed = JSON.parse(res.choices?.[0]?.message?.content ?? '{}');
      const item: ImproverItem = {
        question_key: spec.question_key,
        domain_id: spec.domain_id,
        objective_id: spec.objective_id,
        stem: String(parsed.stem ?? ''),
        options: Array.isArray(parsed.options)
          ? parsed.options.map((o: any) => ({ key: String(o.key), text: String(o.text ?? '') }))
          : [],
        correct_keys: Array.isArray(parsed.correct_keys) ? parsed.correct_keys.map(String) : [],
        rationale: parsed.rationale ? String(parsed.rationale) : null,
        distractor_rationales: parsed.distractor_rationales ?? null,
        difficulty: spec.difficulty,
        scenario_family: spec.scenario_id,
      };

      // A generated item has no "before", so the shape rules are checked against
      // itself: four options, exactly one correct, nothing empty, every wrong
      // option explained.
      const violation = checkInvariants(item, item)
        ?? (item.options.length !== REFERENCE.optionCount
          ? `expected ${REFERENCE.optionCount} options, got ${item.options.length}`
          : null)
        ?? (item.correct_keys.length !== 1
          ? `expected exactly one correct answer, got ${item.correct_keys.length}`
          : null);
      if (violation) return { status: 'invariant_violated', reason: violation };

      return { status: 'generated', item, score: scoreItem(item) };
    } catch (err: any) {
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_ATTEMPTS) break;
    }
  }
  return {
    status: 'failed',
    error_class: errorClass(lastErr),
    message: String(lastErr?.message ?? 'unknown'),
  };
}

/**
 * Propose one improved version of an item. Never writes; never approves.
 *
 * Returns `no_better` rather than the candidate when the rubric does not improve.
 * The caller must treat that as a stop condition, not as something to retry
 * forever — see the sweep script, which escalates to replacement instead.
 */
export async function improveItem(item: ImproverItem): Promise<ImproveOutcome> {
  const before = scoreItem(item);
  // Measured against what this item CAN reach, not a flat six. See
  // `unachievableDimensions`: a multi-select item can never meet `option_count`,
  // and aiming at six would re-spend on it on every run.
  if (before.met >= achievableScore(item, before.of)) return { status: 'already_meets', before };

  let lastErr: any = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await openai().chat.completions.create({
        model: IMPROVER_MODEL,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You rewrite certification exam items. You return only JSON.' },
          { role: 'user', content: buildImprovePrompt(item, before) },
        ],
      });
      const raw = res.choices?.[0]?.message?.content ?? '';
      const candidate = parseCandidate(raw, item);

      const violation = checkInvariants(item, candidate);
      if (violation) return { status: 'invariant_violated', before, reason: violation };

      const after = scoreItem(candidate);
      // The measurement decides. A candidate that is not better is not used, and
      // "not worse" is not good enough — an equal score means a rewrite that
      // changed the words and fixed nothing.
      if (after.met <= before.met) return { status: 'no_better', before, after };

      return { status: 'improved', item: candidate, before, after };
    } catch (err: any) {
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_ATTEMPTS) break;
    }
  }
  return {
    status: 'failed',
    before,
    error_class: errorClass(lastErr),
    message: String(lastErr?.message ?? 'unknown'),
  };
}
