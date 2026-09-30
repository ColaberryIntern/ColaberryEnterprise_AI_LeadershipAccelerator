import { itemsFromIntake, type IntakeTruthInput } from './intakeTruth';
import { buildIntakeReview, type IntakeReview } from './intakeReview';
import { remainingAngles } from './projectDiscoveryCall';
import { UNANSWERED_COST } from './story000Truth';

/**
 * intakePreview — the confirmation gate, before anything is stored. PURE.
 *
 * ## Why a preview and not a read
 *
 * The wizard's review step runs BEFORE `startBuild`, and `startBuild` is where
 * the truth row is written. So at the moment a student is asked "is this what
 * you meant", there is nothing in the database to show them.
 *
 * The obvious fix is to write the row earlier. It is the wrong fix: a student
 * who reviews, goes back, and changes an answer would leave a row behind that
 * disagrees with what they finally submitted, and every downstream reader
 * would trust it.
 *
 * So this computes the review from the SAME functions that will store it.
 * What the student sees is exactly what `saveIntakeTruth` will write, because
 * it is the same code with the same input. There is no second implementation
 * on the client to drift from the first.
 *
 * ## What it must not do
 *
 * Touch the database, invent an answer, or upgrade an inference. It reports
 * unmapped answers as a count rather than hiding them, because an answer the
 * server could not file is something the student should know before they
 * confirm, not after.
 */

export interface IntakePreview {
  readonly review: IntakeReview;
  /** Still unanswered, in the reader's language, so the gaps are visible now. */
  readonly unanswered: readonly string[];
  /** Angles the description already answered, quoted back as a receipt. */
  readonly covered: readonly { angle: string; evidence: string }[];
  /** Answers the server could not file by angle. Reported, never guessed. */
  readonly unmapped: number;
}

export function previewIntake(input: IntakeTruthInput): IntakePreview {
  const { items, unmapped } = itemsFromIntake(input);
  return {
    review: buildIntakeReview(items),
    unanswered: remainingAngles(items)
      .map((angle) => UNANSWERED_COST[angle])
      .filter((s): s is string => Boolean(s)),
    covered: (input.covered ?? []).filter((c) => c.angle && c.evidence && c.evidence.trim()),
    unmapped: unmapped.length,
  };
}
