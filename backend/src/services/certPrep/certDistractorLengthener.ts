import type OpenAI from 'openai';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { scoreItem } from './certQuestionRubric';
import { checkInvariants, errorClass, isRetryable, ImproverItem } from './certQuestionImprover';
import { LengthPlan, OPTION_LABEL_PREFIX } from './certOptionLength';

/**
 * certDistractorLengthener — rewrite ONE wrong option so it is longer than the
 * key, without making it any less wrong.
 *
 * This is the writing half of `certOptionLength`. That module decides whether
 * an item's key is the longest option and which distractor should overtake it;
 * this one asks the model for the words and then refuses them unless they fit.
 *
 * WHAT IS CHECKED, in order, before a candidate is returned:
 *   1. Only the target option changed. The stem, the key, the other distractors
 *      and every rationale are copied from the original, never from the model.
 *   2. The new text lands inside the plan's character bounds. Too short and the
 *      tell survives; too long and the distractor becomes the new tell.
 *   3. `checkInvariants` still holds — nothing emptied, nothing re-keyed.
 *   4. The rubric score did not drop. The rubric measures option length, and a
 *      distractor that overshoots the published range would cost a dimension.
 *
 * WHAT IS NOT CHECKED HERE. Whether the longer distractor is now arguably
 * correct. Only the adversarial triage can say, and the caller runs it; this
 * module has no opinion about correctness, by design (see the improver header).
 *
 * ── EXTERNAL CALL RULES (backend/CLAUDE.md) ──────────────────────────────────
 *   timeout   20s — one short option, not a whole item
 *   retries   2 attempts, no retry on 4xx; a second attempt also fires when the
 *             first came back outside the bounds, because that IS retryable
 *   errors    every failure carries an `error_class`
 */

export const LENGTHENER_MODEL = 'gpt-4o';
export const LENGTHENER_PROMPT_VERSION = 'v1-same-wrongness';
const TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 2;

export type LengthenOutcome =
  | { status: 'lengthened'; item: ImproverItem; before: number; after: number }
  | { status: 'out_of_bounds'; got: number; min: number; max: number }
  | { status: 'invariant_violated'; reason: string }
  | { status: 'score_dropped'; before: number; after: number }
  | { status: 'failed'; error_class: string; message: string };

let client: OpenAI | null = null;
function openai(): OpenAI {
  if (!client) {
    client = getInstrumentedOpenAI(
      { workflow_id: 'certprep_option_length', prompt_version: LENGTHENER_PROMPT_VERSION },
      { timeout: TIMEOUT_MS, maxRetries: 0 },
    );
  }
  return client;
}

/** Exported for tests, which need to swap the client between cases. */
export function __resetLengthenerClient(): void { client = null; }

export function buildLengthenPrompt(item: ImproverItem, plan: LengthPlan): string {
  const target = item.options.find((o) => o.key === plan.target)!;
  const key = item.options.find((o) => o.key === item.correct_keys[0])!;
  const why = item.distractor_rationales?.[target.key] ?? '(no rationale recorded)';
  return [
    'You are editing ONE wrong option of a multiple-choice certification item.',
    '',
    `STEM: ${item.stem}`,
    '',
    'OPTIONS:',
    ...item.options.map((o) => `  ${o.key}. ${o.text}`),
    '',
    `CORRECT: ${key.key}`,
    `OPTION TO REWRITE: ${target.key}`,
    `WHY ${target.key} IS WRONG (from the author): ${why}`,
    '',
    `Rewrite option ${target.key} so that it is between ${plan.minChars} and ${plan.maxChars}`,
    'characters long (it must end up LONGER than the correct option, which is',
    `${key.text.trim().length} characters). Add specificity — what is done, to what, and`,
    'what it is expected to change — in the same voice as the other options.',
    '',
    'HARD RULES:',
    `- it must stay wrong for exactly the reason given above; do not make it a`,
    '  better answer, a partial version of the correct answer, or a hedge',
    '- keep its approach and meaning; you are adding detail, not changing the idea',
    '- do not mention the correct option, the stem, or that it is wrong',
    `- return the option TEXT only: do not begin it with "${target.key}." or any letter`,
    '- do not invent a product, a version number, a price or a date',
    '',
    'Return ONLY JSON: {"text": string}',
  ].join('\n');
}

/**
 * Apply a plan to an item. Returns a NEW item when the rewrite fits, and never
 * mutates the one it was given. Refuses a plan with no target rather than
 * calling the model for nothing.
 */
export async function lengthenDistractor(item: ImproverItem, plan: LengthPlan): Promise<LengthenOutcome> {
  if (!plan.target) return { status: 'invariant_violated', reason: 'plan has no target' };
  const before = scoreItem(item);

  let lastErr: any = null;
  let lastBounds: { got: number } | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await openai().chat.completions.create({
        model: LENGTHENER_MODEL,
        temperature: 0.5,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You edit certification exam options. You return only JSON.' },
          { role: 'user', content: buildLengthenPrompt(item, plan) },
        ],
      });
      const parsed = JSON.parse(res.choices?.[0]?.message?.content ?? '{}');
      // The model often answers "D. <text>" when asked to rewrite option D.
      // Stripped here rather than refused: it is a habit, not a defect in the
      // words, and refusing would spend a second attempt on the same habit.
      const text = String(parsed.text ?? '').replace(OPTION_LABEL_PREFIX, '').trim();
      const got = text.length;
      if (got < plan.minChars || got > plan.maxChars) {
        lastBounds = { got };
        continue; // a miss on length is worth one more try
      }

      const candidate: ImproverItem = {
        ...item,
        options: item.options.map((o) => (o.key === plan.target ? { key: o.key, text } : { ...o })),
      };
      const violation = checkInvariants(item, candidate);
      if (violation) return { status: 'invariant_violated', reason: violation };

      const after = scoreItem(candidate);
      if (after.met < before.met) return { status: 'score_dropped', before: before.met, after: after.met };

      const targetBefore = item.options.find((o) => o.key === plan.target)!.text.trim().length;
      return { status: 'lengthened', item: candidate, before: targetBefore, after: got };
    } catch (err: any) {
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_ATTEMPTS) break;
    }
  }
  if (lastBounds && !lastErr) {
    return { status: 'out_of_bounds', got: lastBounds.got, min: plan.minChars, max: plan.maxChars };
  }
  return { status: 'failed', error_class: errorClass(lastErr), message: String(lastErr?.message ?? 'unknown') };
}
