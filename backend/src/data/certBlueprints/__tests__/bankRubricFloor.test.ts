import { CCAR_F_ALL_ITEMS } from '../items';
import { scoreItem, RubricItem } from '../../../services/certPrep/certQuestionRubric';
import { RubricDimension } from '../ccarRubric';

/**
 * The bank's rubric score, gated.
 *
 * WHY THIS FILE EXISTS. `certQuestionRubric.test.ts` tests the SCORER — that it
 * is deterministic, does not mutate its input, and refuses to call a definitional
 * stem a scenario. Those are good tests and they say nothing whatever about the
 * bank. Before this file, all 150 items could have regressed from 86% to 10% on
 * the rubric and every suite would still have been green, because the only thing
 * reading the rubric against real items was a report script nobody runs in CI.
 *
 * That is the same defect this bank keeps producing in other forms: a check that
 * reports success for something narrower than its name suggests. The rubric was
 * built on 2026-09-08 and the 150-item rewrite that followed moved the bank from
 * 1% to 86%; nothing was stopping the next author giving it all back.
 *
 * WHAT IS GATED, AND WHY THESE FOUR ARE ABSOLUTE. Four of the six dimensions are
 * met by every single item in the bank today, so they are asserted at 100% with
 * no allowance: a new item that does not meet them is a regression, full stop.
 * They are also the four an author controls completely — length and articulation
 * are decisions, not measurements of anything uncertain.
 *
 * The two that are NOT absolute:
 *
 *   option_count       — three items (A2, B3, D3) are multi-select by design and
 *                        can never meet a dimension defined as four-option
 *                        single-select. See `ccarFoundationsItems.ts`.
 *   scenario_framing   — the detector is a deliberately narrow proxy that
 *                        under-counts. 18 items open with a genuine observation
 *                        in words its marker list does not enumerate; they are
 *                        named in `ccarRubric.ts`. The floor is set below the
 *                        measured rate rather than at it, so a new item is not
 *                        forced to be phrased to suit a word list.
 *
 * THE FLOORS ARE DELIBERATELY BELOW TODAY'S NUMBERS. A gate pinned exactly to
 * the current value fails on the next legitimately-added item and gets raised by
 * whoever it inconveniences, which is how a gate becomes a formality. These have
 * room for ordinary growth and none for a collapse.
 */

const items: RubricItem[] = CCAR_F_ALL_ITEMS.map((i) => ({
  question_key: i.question_key,
  domain_id: i.domain_id,
  objective_id: i.objective_id,
  stem: i.stem,
  options: i.options,
  correct_keys: i.correct_keys,
  rationale: i.rationale,
  distractor_rationales: i.distractor_rationales,
}));

const scores = items.map((i) => ({ key: i.question_key, score: scoreItem(i) }));

/** Every key whose named dimension is not met. Returned so a failure names names. */
const failing = (dimension: RubricDimension): string[] => scores
  .filter(({ score }) => score.dimensions.find((d) => d.id === dimension)?.verdict !== 'meets')
  .map(({ key }) => key);

const rate = (dimension: RubricDimension): number =>
  (items.length - failing(dimension).length) / items.length;

describe('the bank holds its shape against the rubric', () => {
  /**
   * Asserted as an empty ARRAY rather than a count, so the failure message is the
   * list of offending keys. A count tells you the bank got worse; the list tells
   * you which item to open.
   */
  it('every item has a stem of reference length', () => {
    expect(failing('stem_length')).toEqual([]);
  });

  it('every item has options of reference length', () => {
    expect(failing('option_length')).toEqual([]);
  });

  it('every item offers articulated approaches rather than labels', () => {
    expect(failing('options_are_approaches')).toEqual([]);
  });

  it('every item explains every one of its wrong options', () => {
    expect(failing('rationale_names_distractors')).toEqual([]);
  });

  /**
   * The three known multi-select items, by key. Asserted as the exact set rather
   * than a count: a fourth multi-select item should be a deliberate decision that
   * updates this list and the note in `ccarFoundationsItems.ts`, not something
   * that slips in under a threshold.
   */
  it('only the three documented multi-select items miss option_count', () => {
    expect(failing('option_count').sort()).toEqual(['CCARF-A2', 'CCARF-B3', 'CCARF-D3']);
  });

  /**
   * Measured 88% on 2026-09-08 against a reference rate of 100%, with the 18
   * false negatives enumerated in `ccarRubric.ts`. Floored at 80%: enough room to
   * add items without contorting their phrasing, not enough to drift back toward
   * the definitional bank this rubric was built to replace.
   */
  it('keeps scenario framing well above the pre-rewrite level', () => {
    expect(rate('scenario_framing')).toBeGreaterThanOrEqual(0.8);
  });

  /**
   * The headline number: items meeting ALL SIX. 86% on 2026-09-08, up from 1%
   * before the rewrite. Floored at 75% because the two non-absolute dimensions
   * above already carry their own allowances and this must not become a third
   * place to spend them.
   */
  it('keeps most of the bank meeting every dimension at once', () => {
    const fullyMeets = scores.filter(({ score }) => score.met === score.of).length;
    expect(fullyMeets / items.length).toBeGreaterThanOrEqual(0.75);
  });
});
