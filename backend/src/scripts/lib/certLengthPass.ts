import { lengthPlan, stripOptionLabels, LengthPlan } from '../../services/certPrep/certOptionLength';
import { lengthenDistractor } from '../../services/certPrep/certDistractorLengthener';
import { ImproverItem } from '../../services/certPrep/certQuestionImprover';
import { triageQuestion } from '../../services/certPrep/certQuestionTriage';
import { TriageResult } from '../../services/certPrep/triageTypes';

/**
 * One item through the option-length pass: strip letter labels, plan, lengthen
 * the chosen distractor, and have the triage read the result.
 *
 * Shared by the two scripts that run the pass — one over the database for
 * generated items, one over the repo for authored items — so the decision of
 * what a "balanced" item is lives in one place and cannot drift between the
 * halves of the bank. Neither writes here: this returns a verdict and, when
 * there is one, the new item; the caller decides where it goes.
 */
export type PassOutcome =
  /** Nothing to do: key not longest, or hash-kept, and no label to strip. */
  | { status: 'unchanged'; plan: LengthPlan }
  /** Only a letter label was stripped; no model call, no triage needed. */
  | { status: 'relabelled'; item: ImproverItem; plan: LengthPlan; stripped: string[] }
  /** A distractor was lengthened and the triage raised nothing fatal. */
  | { status: 'lengthened'; item: ImproverItem; plan: LengthPlan; stripped: string[]; before: number; after: number; triage: TriageResult }
  /** The lengthener refused its own output (bounds, invariants, rubric, error). */
  | { status: 'refused'; plan: LengthPlan; why: string }
  /** The triage found the lengthened distractor arguable, or could not read it. */
  | { status: 'discarded'; plan: LengthPlan; why: string };

export async function passItem(input: ImproverItem): Promise<PassOutcome> {
  // Labels first, so the plan measures the words and not the "D. " in front.
  const { item, changed: stripped } = stripOptionLabels(input);
  const plan = lengthPlan(item);
  const needsLength = plan.keyIsLongest && !plan.keep;

  if (!needsLength) {
    return stripped.length ? { status: 'relabelled', item, plan, stripped } : { status: 'unchanged', plan };
  }

  const out = await lengthenDistractor(item, plan);
  if (out.status !== 'lengthened') {
    const why = out.status === 'failed' ? `${out.error_class}: ${out.message}`
      : out.status === 'out_of_bounds' ? `got ${out.got}, wanted ${out.min}-${out.max}`
        : out.status === 'not_an_extension' ? out.reason
          : out.status === 'invariant_violated' ? out.reason
            : `rubric ${out.before} -> ${out.after}`;
    return { status: 'refused', plan, why: `${out.status}: ${why}` };
  }

  // The lengthener cannot tell whether the added detail made the distractor
  // arguable. The triage can, and a high-severity concern is a discard.
  const triage = await triageQuestion({
    question_key: out.item.question_key,
    stem: out.item.stem,
    options: out.item.options,
    correct_keys: out.item.correct_keys,
    rationale: out.item.rationale,
    distractor_rationales: out.item.distractor_rationales,
    domain_id: out.item.domain_id,
    objective_id: out.item.objective_id,
  });
  if (triage.verdict === 'error') {
    return { status: 'discarded', plan, why: `triage error: ${triage.errorClass ?? 'unknown'}` };
  }
  if (triage.verdict === 'needs_human' && triage.severity === 'high') {
    return { status: 'discarded', plan, why: `triage high: ${triage.concerns[0]?.detail?.slice(0, 90) ?? ''}` };
  }
  return { status: 'lengthened', item: out.item, plan, stripped, before: out.before, after: out.after, triage };
}
