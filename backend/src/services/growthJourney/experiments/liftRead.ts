import { Op } from 'sequelize';
import { GrowthJourneyDecision, GrowthJourneyOutcome } from '../../../models';
import { insufficient, type Measured } from '../../explorerGrowth/explorerForecastService';
import { computeLift, MIN_ARM_N } from '../../explorerGrowth/explorerExperimentService';
import type { GrowthJourneyOutcomeType } from '../../../models/GrowthJourneyOutcome';
import { HOLDOUT_POLICY_TYPE, lookupHoldoutPolicy, type HoldoutAbsence } from './holdoutPolicy';
import { safeKeyList } from '../reads/readPaging';

/**
 * What a holdout experiment measured, per brand (Phase 6, T608).
 *
 * ─── THE ARITHMETIC IS EXPLORER'S, IMPORTED ─────────────────────────────────
 *
 * `computeLift`, `MIN_ARM_N` and `insufficient` come from Explorer. This file
 * supplies four numbers - people and conversions, per arm - and does no
 * statistics of its own: the Wilson interval, the floor at 100 per arm and the
 * "an arm could not be measured" case are all already written and tested there.
 *
 * The plan asked for `{known:false, reason:'below_min_arm_n'}` below the floor.
 * That is not what `computeLift` answers: it returns the full
 * `{treatment, control, lift}` with `lift` an `insufficient(...)` carrying the
 * real counts ("n=12 treatment / 9 control, needs 100 per arm"). Inventing a
 * second shape would have meant a second thing for a screen to understand, so
 * the read passes Explorer's result through unchanged.
 *
 * ─── AN UNCOUNTED ARM IS NEVER A ZERO ──────────────────────────────────────
 *
 * The T608 verifier caught this and it was the right catch. An earlier version
 * answered `{ n, converted: 0 }` for an arm over the cap and handed that to
 * `computeLift` - and `wilsonInterval(0, n)` with `n >= 100` answers
 * `{ known: true, point: 0 }`. So a capped arm served a MEASURED zero, and a
 * capped treatment arm against a real control served a known NEGATIVE lift:
 * the read would have reported that the message made things worse, from a
 * numerator nobody counted. That is the "null never zero" rule, and the class
 * of defect Explorer's own header names: "say 'insufficient data', not a
 * plausible-looking number."
 *
 * So a capped arm reports `converted: null` - never 0 - and the lift is
 * `insufficient('arm_capped: ...')`. `computeLift` is not called at all when
 * either arm is capped, because there is no numerator to give it.
 *
 * ─── THE UNIT IS PEOPLE, NOT ROWS ──────────────────────────────────────────
 *
 * `ArmOutcome.n` upstream means "learners in this arm" and `MIN_ARM_N = 100` is
 * a floor on people. `growth_journey_decisions` is APPEND-ONLY - one row per
 * subject per `decision_date` - so counting rows over a 90-day window would
 * inflate `n` by roughly the number of days a subject stays eligible. Worse, it
 * would inflate the arms UNEVENLY: a control subject keeps receiving `WAIT`
 * rows every night, while a treatment subject who is sent to and converts stops
 * producing them, so the control denominator would grow faster and the rate
 * would be biased in treatment's favour. Both counts are therefore DISTINCT
 * `subject_ref`.
 *
 * ─── BOUNDED, AND PARAMETERISED - NO SQL IS BUILT FROM A STRING ────────────
 *
 * Counting conversions per arm means relating two tables, and no association is
 * declared between these models. The obvious shortcut is a `literal` subquery
 * with the brand and the experiment key interpolated into it. This file did
 * that for one draft and it was wrong: "untrusted input is never interpolated
 * into SQL" has no validated-input exemption.
 *
 * So: count the arm's distinct subjects (served by `idx_gj_decisions_experiment`
 * on `(experiment_key, holdout_group)`); read the brand's CONVERSION outcomes'
 * `decision_id`s in the window, bounded; then count the arm's distinct subjects
 * among those decisions. Every value is a bound parameter, and each read has an
 * explicit `LIMIT`. Anything over a cap answers `capped: true` rather than a
 * number computed over part of the population.
 */

/**
 * What counts as a conversion: a deliberate allowlist, like the eligibility one in
 * `assignJourneyArm.ts`. Only the three commercial commitments.
 *
 * A `meeting_booked` is a step toward one, not one. `reply` and the `contact_*` types are
 * ENGAGEMENT, and counting engagement as conversion would make every promotional holdout look
 * like it worked - a message sent gets replies, and the arm that was sent nothing cannot reply to
 * it. That is the measurement error the whole experiment exists to avoid, so it is closed off here
 * rather than left to whoever builds the screen.
 */
export const CONVERSION_OUTCOMES = ['enrolled_paid', 'subscription_active', 'project_started'] as const satisfies readonly GrowthJourneyOutcomeType[];

export const DEFAULT_LIFT_WINDOW_DAYS = 90;
export const MAX_LIFT_WINDOW_DAYS = 365;

/**
 * How many people per arm, and how many conversion rows per brand, this read
 * will count before refusing to.
 *
 * Generous next to `MIN_ARM_N = 100`: an arm this big is a very large
 * experiment, and the answer then is a narrower window rather than a count over
 * an arbitrary slice of it.
 */
export const MAX_ARM_DECISIONS = 5_000;

export interface ArmCount {
  /** Distinct subjects in this arm. */
  n: number;
  /** Distinct subjects in this arm who converted - NULL when the arm was not counted. */
  converted: number | null;
  capped: boolean;
}

export interface ArmLift {
  experiment_key: string;
  window_days: number;
  treatment: ArmCount;
  control: ArmCount;
  lift: Measured;
  /** Explorer's floor, echoed so a screen can say how far off it is. */
  min_arm_n: number;
  capped: boolean;
  max_arm_decisions: number;
}

export interface BrandExperiment {
  brand_id: string;
  /** `'active'` plus the policy, or why there is nothing to measure. */
  status: HoldoutAbsence | 'active';
  policy: { experiment_key: string; control_share: number; candidate_types?: readonly string[] } | null;
  lift: ArmLift | null;
}

/** `^[a-z0-9_]+$` by the policy schema - re-checked here so this file cannot be mis-called. */
const SAFE_KEY = /^[a-z0-9_]+$/;

/**
 * `candidate_types` is OPERATOR-AUTHORED JSONB with no charset constraint
 * (`z.array(z.string().min(1).max(48))`), and this read puts it in an HTTP response. So it goes
 * through the same `safeKeyList` every other JSONB-derived string list on this surface uses - a
 * value carrying an `@` reads `redacted`.
 *
 * The T608 verifier caught this on the second pass and was right to: T607's fix pass established
 * the rule one commit earlier, and `contentReads.ts` states it in terms for its own two lists -
 * "operator-authored config rather than anything a subject wrote, so this is belt and braces - but a
 * `mailto:` ... would otherwise have put an address in the response, which the phase's hard stop
 * forbids without qualification". `experiment_key` was protected by its own regex; its sibling was
 * not, and it was the only list on the surface that was not.
 *
 * Scrubbed on the way OUT rather than rejected at the schema, deliberately: a `candidate_types`
 * entry that is not an action type is already harmless behaviourally - it narrows the allowlist to
 * nothing, so no candidate is eligible and nobody is withheld - and rejecting the whole row would
 * turn a cosmetic typo into a silently absent experiment. Scrubbing makes it visible instead.
 */
const safeCandidateTypes = (v: readonly string[] | undefined): string[] | undefined =>
  (v === undefined ? undefined : safeKeyList(v, 12, 48));

/** The decision ids of this brand's conversions in the window, bounded. */
async function convertedDecisionIds(brandId: string, from: Date): Promise<string[] | null> {
  const rows = await GrowthJourneyOutcome.findAll({
    where: {
      brand_id: brandId,
      outcome_type: { [Op.in]: [...CONVERSION_OUTCOMES] },
      occurred_at: { [Op.gte]: from },
      decision_id: { [Op.ne]: null },
    },
    attributes: ['decision_id'],
    limit: MAX_ARM_DECISIONS + 1,
  });
  if (rows.length > MAX_ARM_DECISIONS) return null; // too many to count honestly
  return rows.map((r) => String(r.get('decision_id')));
}

async function armCount(
  brandId: string,
  experimentKey: string,
  arm: 'treatment' | 'control',
  from: Date,
  convertedIds: string[] | null,
): Promise<ArmCount> {
  const where = { brand_id: brandId, experiment_key: experimentKey, holdout_group: arm, created_at: { [Op.gte]: from } };
  const n = await GrowthJourneyDecision.count({ where, distinct: true, col: 'subject_ref' });
  if (n === 0) return { n: 0, converted: 0, capped: false };
  // An uncounted arm reports null, never 0 - see the header.
  if (n > MAX_ARM_DECISIONS || convertedIds === null) return { n, converted: null, capped: true };
  if (convertedIds.length === 0) return { n, converted: 0, capped: false };
  const rows = await GrowthJourneyDecision.findAll({
    where: { ...where, id: { [Op.in]: convertedIds } },
    attributes: ['subject_ref'],
    limit: MAX_ARM_DECISIONS,
  });
  return { n, converted: new Set(rows.map((r) => String(r.get('subject_ref')))).size, capped: false };
}

/**
 * One brand's experiment and its lift, or the reason there is none.
 *
 * A brand with no policy does NO counting: there is no experiment key to count
 * by, and counting decisions with a null arm would answer a number about
 * everything rather than about an experiment.
 */
export async function readBrandExperiment(brandId: string, windowDays = DEFAULT_LIFT_WINDOW_DAYS): Promise<BrandExperiment> {
  const days = Math.min(Math.max(1, Math.floor(windowDays)), MAX_LIFT_WINDOW_DAYS);
  const { policy, reason } = await lookupHoldoutPolicy(brandId);
  if (!policy || !SAFE_KEY.test(policy.experiment_key)) {
    return { brand_id: brandId, status: policy ? 'settings_invalid' : reason, policy: null, lift: null };
  }
  const from = new Date(Date.now() - days * 86_400_000);
  const convertedIds = await convertedDecisionIds(brandId, from);
  const treatment = await armCount(brandId, policy.experiment_key, 'treatment', from, convertedIds);
  const control = await armCount(brandId, policy.experiment_key, 'control', from, convertedIds);
  const capped = treatment.capped || control.capped;

  // `computeLift` is not called at all when an arm is capped: it would be handed a numerator
  // nobody counted, and would answer a point estimate that reads as measured.
  // The reason names WHICH read hit its cap: an arm over the cap is a different problem from this
  // brand's conversion read being over it, and an operator narrowing the window wants to know which.
  const armsOver = [treatment.capped && 'treatment', control.capped && 'control'].filter(Boolean).join(' and ');
  const lift: Measured = capped
    ? insufficient(
      `${convertedIds === null ? 'conversions_over_cap' : `arm_capped:${armsOver}`}: `
      + `treatment n=${treatment.n}, control n=${control.n}, this read counts at most `
      + `${MAX_ARM_DECISIONS} per arm - narrow the window`,
    )
    : computeLift(
      { n: treatment.n, converted: treatment.converted as number },
      { n: control.n, converted: control.converted as number },
    ).lift;

  return {
    brand_id: brandId,
    status: 'active',
    policy: {
      experiment_key: policy.experiment_key,
      control_share: policy.control_share,
      candidate_types: safeCandidateTypes(policy.candidate_types),
    },
    lift: {
      experiment_key: policy.experiment_key,
      window_days: days,
      treatment,
      control,
      lift,
      min_arm_n: MIN_ARM_N,
      capped,
      max_arm_decisions: MAX_ARM_DECISIONS,
    },
  };
}

export interface ExperimentsResult {
  brands: BrandExperiment[];
  window_days: number;
  policy_type: string;
  conversion_outcomes: readonly string[];
}

/** Every brand in the caller's scope. An empty scope reads nothing. */
export async function readExperiments(scope: { brandIds: readonly string[]; windowDays?: number }): Promise<ExperimentsResult> {
  const days = Math.min(Math.max(1, Math.floor(scope.windowDays ?? DEFAULT_LIFT_WINDOW_DAYS)), MAX_LIFT_WINDOW_DAYS);
  const brands: BrandExperiment[] = [];
  for (const brandId of scope.brandIds) brands.push(await readBrandExperiment(brandId, days));
  return { brands, window_days: days, policy_type: HOLDOUT_POLICY_TYPE, conversion_outcomes: CONVERSION_OUTCOMES };
}
