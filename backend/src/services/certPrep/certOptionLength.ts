import { RubricItem } from './certQuestionRubric';
import { fnv1a } from '../../data/certBlueprints/items/itemFactory';

/**
 * certOptionLength — where the LONGEST option is allowed to sit.
 *
 * WHY. A model writing an exam item writes the correct answer with care and the
 * wrong ones quickly, and care takes more words. Across the first 150 generated
 * items the key was the longest option in 112 — a 75% hit rate for a student
 * who never read the question. The margin was small (median six characters),
 * which is why no one saw it, and consistent, which is why it matters.
 *
 * THE RULE IS A PLAN, NOT A BAN. "The key must never be the longest" is its own
 * tell: chance is one in four, and a bank where the longest option is never
 * right teaches the same lesson in reverse. So the plan keeps the key longest
 * in a fixed share of items and asks for a longer distractor in the rest. Which
 * items keep it is decided by a hash of the question key — the same device the
 * answer position uses — so the decision is stable across runs, environments
 * and re-exports, and a second run finds nothing to do.
 *
 * PURE. No model, no database. `lengthenDistractor` in the lengthener module
 * does the writing; this module only says whether and where.
 */

/** One item in every KEEP_EVERY keeps its key as the longest option. */
export const KEEP_EVERY = 3;

/** The distractor must clear the key by at least this many characters ... */
export const MIN_MARGIN_CHARS = 6;
/** ... and by no more than this, or the new longest option becomes the tell. */
export const MAX_MARGIN_CHARS = 40;

export interface LengthPlan {
  /** True when the key is currently the longest option by character count. */
  keyIsLongest: boolean;
  /** True when the hash says this item may keep its key longest. */
  keep: boolean;
  /** The distractor to lengthen, or null when nothing should change. */
  target: string | null;
  /** Character bounds for the rewritten distractor when `target` is set. */
  minChars: number;
  maxChars: number;
}

const len = (t: string | null | undefined): number => (t ?? '').trim().length;

/**
 * An option that begins with its own letter — "D. Allocate more capacity" —
 * is a model habit: asked to rewrite option D it answers as if reciting the
 * list. Rendered, the student sees "D. D. Allocate", and the doubled label
 * marks the option as the one that was edited. Four of the first twenty-three
 * lengthened options came back this way.
 */
export const OPTION_LABEL_PREFIX = /^\s*[A-Ea-e]\s*[.):\-–]\s+/;

export function hasOptionLabel(text: string | null | undefined): boolean {
  return OPTION_LABEL_PREFIX.test(text ?? '');
}

/** Strip a leading letter label from every option; reports which changed. */
export function stripOptionLabels<T extends { options: { key: string; text: string }[] }>(item: T): { item: T; changed: string[] } {
  const changed: string[] = [];
  const options = item.options.map((o) => {
    if (!hasOptionLabel(o.text)) return o;
    changed.push(o.key);
    return { ...o, text: o.text.replace(OPTION_LABEL_PREFIX, '') };
  });
  return changed.length ? { item: { ...item, options }, changed } : { item, changed };
}

export function longestOptionKey(item: Pick<RubricItem, 'options'>): string | null {
  let best: { key: string; n: number } | null = null;
  for (const o of item.options ?? []) {
    const n = len(o.text);
    if (!best || n > best.n) best = { key: o.key, n };
  }
  return best?.key ?? null;
}

/**
 * Decide, for one single-select item, whether a distractor should be lengthened
 * and which. Multi-select items are left alone: "the longest option" has no
 * single answer to compare against when two are right.
 *
 * The hash is salted so it does not correlate with the answer position, which
 * is drawn from the bare key. Without the salt, "key at A" and "key allowed to
 * be longest" would move together, and a student could learn the pairing.
 */
export function lengthPlan(item: Pick<RubricItem, 'question_key' | 'options' | 'correct_keys'>): LengthPlan {
  const none: LengthPlan = { keyIsLongest: false, keep: false, target: null, minChars: 0, maxChars: 0 };
  if (item.correct_keys.length !== 1) return none;

  const keyOpt = item.options.find((o) => o.key === item.correct_keys[0]);
  if (!keyOpt) return none;
  const keyIsLongest = longestOptionKey(item) === keyOpt.key;
  const keep = fnv1a(`${item.question_key}:length`) % KEEP_EVERY === 0;
  if (!keyIsLongest || keep) return { ...none, keyIsLongest, keep };

  // Lengthen the distractor that is ALREADY the longest of the wrong options: it
  // needs the smallest change, and a small change is the one least likely to
  // turn a wrong answer into an arguable one.
  const distractors = item.options.filter((o) => o.key !== keyOpt.key);
  const target = distractors.sort((a, b) => len(b.text) - len(a.text))[0];
  const keyLen = len(keyOpt.text);
  return {
    keyIsLongest,
    keep,
    target: target.key,
    minChars: keyLen + MIN_MARGIN_CHARS,
    maxChars: keyLen + MAX_MARGIN_CHARS,
  };
}
