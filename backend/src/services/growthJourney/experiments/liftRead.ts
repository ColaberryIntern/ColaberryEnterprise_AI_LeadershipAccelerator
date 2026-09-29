import { Op } from 'sequelize';
import { GrowthJourneyDecision, GrowthJourneyOutcome } from '../../../models';
import { computeLift, MIN_ARM_N, type ArmOutcome, type LiftResult } from '../../explorerGrowth/explorerExperimentService';
import { HOLDOUT_POLICY_TYPE, lookupHoldoutPolicy, type HoldoutAbsence } from './holdoutPolicy';

/**
 * What a holdout experiment measured, per brand (Phase 6, T608).
 *
 * ─── THE ARITHMETIC IS EXPLORER'S, IMPORTED ─────────────────────────────────
 *
 * `computeLift` and `MIN_ARM_N` come from `explorerExperimentService`. This file
 * supplies four numbers - n and converted, per arm - and does no statistics of
 * its own: the Wilson interval, the floor at 100 per arm and the "an arm could
 * not be measured" case are all already written and already tested there.
 *
 * The plan asked for `{known:false, reason:'below_min_arm_n'}` below the floor.
 * That is not what `computeLift` answers: it returns the full
 * `{treatment, control, lift}` with `lift` an `insufficient(...)` carrying the
 * real counts ("n=12 treatment / 9 control, needs 100 per arm"). Inventing a
 * second shape would have meant a second thing for a screen to understand, so
 * the read passes Explorer's result through unchanged.
 *
 * ─── WHAT COUNTS AS A CONVERSION IS CODE, AND IT IS NARROW ──────────────────
 *
 * `CONVERSION_OUTCOMES` is a deliberate allowlist, like the eligibility one in
 * `assignJourneyArm.ts`. Only the three commercial commitments count. A
 * `meeting_booked` is a step toward one, not one; `reply` and the `contact_*`
 * types are engagement, and counting engagement as conversion would make every
 * promotional holdout look like it worked - a message sent gets replies, and
 * the arm that was sent nothing cannot reply to it. That is the measurement
 * error the whole experiment exists to avoid, so it is closed off here rather
 * than left to whoever builds the screen.
 *
 * ─── BOUNDED, AND PARAMETERISED - NO SQL IS BUILT FROM A STRING ────────────
 *
 * Counting conversions per arm means relating two tables, and no association is
 * declared between these models. The obvious shortcut is a `literal` subquery
 * with the brand and the experiment key interpolated into it. This file did
 * that for one draft and it was wrong: "untrusted input is never interpolated
 * into SQL" has no validated-input exemption, and the moment a reader sees one
 * interpolation they have to re-derive whether every caller validates.
 *
 * So: `count` the arm's decisions (served by `idx_gj_decisions_experiment`, on
 * exactly `(experiment_key, holdout_group)`), then read that arm's ids with an
 * explicit `LIMIT` and count outcomes with `decision_id IN (:ids)` - every value
 * a bound parameter. An arm larger than `MAX_ARM_DECISIONS` answers
 * `capped: true` with its size rather than a number computed over a truncated
 * arm, which is T606's shape for the same problem: a rate over part of the
 * population is a different number wearing the same name.
 */

/** The outcomes that count as a conversion. Allowlist; see the header. */
export const CONVERSION_OUTCOMES = ['enrolled_paid', 'subscription_active', 'project_started'] as const;

export const DEFAULT_LIFT_WINDOW_DAYS = 90;
export const MAX_LIFT_WINDOW_DAYS = 365;

export interface ArmLift {
  experiment_key: string;
  window_days: number;
  treatment: ArmOutcome;
  control: ArmOutcome;
  lift: LiftResult['lift'];
  /** Explorer's floor, echoed so a screen can say how far off it is. */
  min_arm_n: number;
  /** True when either arm holds more decisions than this read will count. */
  capped: boolean;
  max_arm_decisions: number;
}

/**
 * How many decisions per arm this read will count before refusing to.
 *
 * Generous next to `MIN_ARM_N = 100`: an arm this big is a very large
 * experiment, and the answer then is a narrower window rather than a conversion
 * count over an arbitrary slice of it.
 */
export const MAX_ARM_DECISIONS = 5_000;

export interface BrandExperiment {
  brand_id: string;
  /** `'active'` plus the policy, or why there is nothing to measure. */
  status: HoldoutAbsence | 'active';
  policy: { experiment_key: string; control_share: number; candidate_types?: readonly string[] } | null;
  lift: ArmLift | null;
}

/** `^[a-z0-9_]+$` by the policy schema - re-checked here so this file cannot be mis-called. */
const SAFE_KEY = /^[a-z0-9_]+$/;

async function armOutcome(
  brandId: string,
  experimentKey: string,
  arm: 'treatment' | 'control',
  from: Date,
): Promise<{ outcome: ArmOutcome; capped: boolean }> {
  const where = { brand_id: brandId, experiment_key: experimentKey, holdout_group: arm, created_at: { [Op.gte]: from } };
  const n = await GrowthJourneyDecision.count({ where });
  if (n === 0) return { outcome: { n: 0, converted: 0 }, capped: false };
  if (n > MAX_ARM_DECISIONS) return { outcome: { n, converted: 0 }, capped: true };
  const rows = await GrowthJourneyDecision.findAll({ where, attributes: ['id'], limit: MAX_ARM_DECISIONS });
  const ids = rows.map((r) => String(r.get('id')));
  const converted = await GrowthJourneyOutcome.count({
    distinct: true,
    col: 'decision_id',
    where: {
      brand_id: brandId,
      outcome_type: { [Op.in]: [...CONVERSION_OUTCOMES] },
      decision_id: { [Op.in]: ids },
    },
  });
  return { outcome: { n, converted }, capped: false };
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
  const [t, c] = await Promise.all([
    armOutcome(brandId, policy.experiment_key, 'treatment', from),
    armOutcome(brandId, policy.experiment_key, 'control', from),
  ]);
  const treatment = t.outcome;
  const control = c.outcome;
  const computed = computeLift(treatment, control);
  return {
    brand_id: brandId,
    status: 'active',
    policy: {
      experiment_key: policy.experiment_key,
      control_share: policy.control_share,
      candidate_types: policy.candidate_types,
    },
    lift: {
      experiment_key: policy.experiment_key,
      window_days: days,
      treatment,
      control,
      lift: computed.lift,
      min_arm_n: MIN_ARM_N,
      capped: t.capped || c.capped,
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
