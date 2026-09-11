import {
  FACT_BEARING_PROVENANCES,
  findIntegrityViolations,
  type UnderstandingDimension,
  type UnderstandingItem,
} from '../delivery/projectUnderstanding';

/**
 * intakeReview — "here is what I understood", for a student to correct. PURE.
 *
 * ## Why grouping is a module and not a component
 *
 * The brief calls this the confirmation gate: before a plan is generated, show
 * the student what was understood, split so they can tell the difference
 * between something they said, something the system worked out, and something
 * nobody knows yet. Then let them fix it.
 *
 * That split is a TRUTH question, not a display question. Whether a statement
 * counts as confirmed depends on its provenance, and the rule that decides it
 * is the same one the publish path uses. Putting it in a component would mean
 * two answers to "is this confirmed", and the one on screen would be the one
 * nobody tested.
 *
 * ## What a student is actually being asked
 *
 * Not "is this correct" for forty items. The groups are ordered by what a
 * person can usefully act on:
 *
 *   needsConfirmation  we heard it, nobody has agreed we heard it right
 *   inferences         nothing was said; the system worked it out
 *   openQuestions      it was asked and not answered
 *   unknowns           recorded as unknown, deliberately, and that is allowed
 *   confirmed          already corrected or agreed; shown for context
 *
 * `unknowns` is a group rather than a gap on purpose. The brief is explicit
 * that a student must not be forced to invent a baseline to continue, so an
 * honest unknown is a valid end state and the screen has to be able to show one
 * without it reading as an error.
 *
 * ## Blocking is narrow, deliberately
 *
 * Only a contradiction blocks: an item the contract itself calls invalid. Every
 * other group is informational. A gate that blocks on "you have not confirmed
 * everything" teaches students to click through it, and then it protects
 * nothing.
 */

export type ReviewGroup =
  | 'confirmed'
  | 'needsConfirmation'
  | 'inferences'
  | 'openQuestions'
  | 'unknowns';

export interface ReviewItem {
  /** Stable within one review, so a correction can name which item it fixes. */
  readonly index: number;
  readonly dimension: UnderstandingDimension;
  readonly value: string;
  readonly group: ReviewGroup;
  /** The student's own words this came from, when it came from words. */
  readonly quote: string | null;
}

export interface IntakeReview {
  readonly items: readonly ReviewItem[];
  readonly counts: Readonly<Record<ReviewGroup, number>>;
  /**
   * Contradictions, in the contract's own words. These block, and nothing else
   * does.
   */
  readonly contradictions: readonly string[];
  readonly blocksPlanning: boolean;
}

const HUMAN_CONFIRMED = ['client_confirmed', 'pm_confirmed'];

export function groupOf(item: UnderstandingItem): ReviewGroup {
  if (HUMAN_CONFIRMED.includes(item.provenance)) return 'confirmed';
  if (item.provenance === 'ai_inferred') return 'inferences';
  if (item.dimension === 'unknowns') return 'unknowns';
  if (item.classification === 'QUESTION') return 'openQuestions';
  // Everything left traces to something the student said or wrote, and nobody
  // has yet agreed it was heard correctly.
  return 'needsConfirmation';
}

/** The order a person reads them in: what they can act on first. */
const GROUP_ORDER: readonly ReviewGroup[] = [
  'needsConfirmation', 'inferences', 'openQuestions', 'unknowns', 'confirmed',
];

export function buildIntakeReview(items: readonly UnderstandingItem[]): IntakeReview {
  const reviewItems: ReviewItem[] = items.map((item, index) => ({
    index,
    dimension: item.dimension,
    value: item.value,
    group: groupOf(item),
    quote: item.source_quote ?? null,
  }));

  const counts = GROUP_ORDER.reduce((acc, group) => {
    acc[group] = reviewItems.filter((i) => i.group === group).length;
    return acc;
  }, {} as Record<ReviewGroup, number>);

  // Asked of the same validator the rest of the system uses, so a contradiction
  // here is the same thing a contradiction is anywhere else.
  const contradictions = findIntegrityViolations({
    title: 'intake', proposed_surfaces: [], items: [...items],
  });

  const ordered = [...reviewItems].sort(
    (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.index - b.index,
  );

  return {
    items: ordered,
    counts,
    contradictions,
    blocksPlanning: contradictions.length > 0,
  };
}

export interface CorrectionInput {
  /** Which item, by its index in the stored list. */
  readonly index: number;
  /** The corrected wording, or null to confirm the existing value unchanged. */
  readonly value?: string | null;
}

export type CorrectionResult =
  | { readonly ok: true; readonly items: UnderstandingItem[] }
  | { readonly ok: false; readonly reason: 'unknown_index' | 'empty_value' };

/**
 * Apply one student correction.
 *
 * A corrected item becomes `client_confirmed`, which is fact-bearing, and its
 * quote becomes the student's own corrected words. That is not a downgrade of
 * evidence: a person restating something in their own words IS the strongest
 * provenance this contract has.
 *
 * Confirming without editing is a real action and is recorded as one. It is the
 * difference between "nobody has looked at this" and "somebody read it and it
 * was right", and only the second should survive a re-extraction untouched.
 */
export function applyCorrection(
  items: readonly UnderstandingItem[],
  input: CorrectionInput,
): CorrectionResult {
  const target = items[input.index];
  if (!target) return { ok: false, reason: 'unknown_index' };

  const edited = typeof input.value === 'string' ? input.value.trim() : null;
  // An empty correction is a deletion wearing an edit's clothes. Deleting is a
  // different action with different consequences, so this refuses rather than
  // guessing which one was meant.
  if (edited !== null && edited.length === 0) return { ok: false, reason: 'empty_value' };

  const value = edited ?? target.value;
  const next = [...items];
  next[input.index] = {
    ...target,
    value,
    classification: 'FACT',
    provenance: 'client_confirmed',
    source_quote: value,
  };
  return { ok: true, items: next };
}

/** True when every item has been read by a person. Advisory, never a gate. */
export const fullyReviewed = (items: readonly UnderstandingItem[]): boolean =>
  items.length > 0 && items.every((i) => HUMAN_CONFIRMED.includes(i.provenance));

/** Kept honest against the contract rather than re-listing provenances here. */
export const confirmedIsFactBearing = (): boolean =>
  HUMAN_CONFIRMED.every((p) => (FACT_BEARING_PROVENANCES as readonly string[]).includes(p));
