/**
 * Explorer Growth OS — experiment assignment and lift. Plan §25; EPIC 12.
 *
 * Two jobs, and the first one is an ethics rule rather than a statistical one.
 *
 * §25.2: "No learner is ever withheld from a message that helps them with a
 * problem they are actually having. Withholding a payment-failure recovery to
 * measure lift is not an experiment, it is negligence. Only PROMOTIONAL
 * interventions are eligible."
 *
 * That rule is enforced here in code rather than left to the caller's judgment,
 * because the caller's judgment is exercised at 3am by a cron. `assignArm`
 * cannot return `control` for an ineligible intervention — not "should not",
 * cannot. The eligible list is an allowlist, so a NEW intervention type is
 * ineligible until someone deliberately adds it. A denylist would mean the
 * failure mode of forgetting is "silently experiment on it".
 *
 * §25.3: both arms get a decision row (control's action becomes WAIT), so the
 * two arms are measured on IDENTICAL eligibility. That structurally prevents
 * the standard trap of comparing "people we messaged" against "everyone else",
 * where the comparison measures who qualified rather than what the message did.
 * This module supplies the assignment and the arithmetic; the Governor writes
 * the rows.
 */
import { wilsonInterval, insufficient, type Measured } from './explorerForecastService';

export type Arm = 'treatment' | 'control';

/**
 * Interventions that may be experimented on. ALLOWLIST, deliberately.
 *
 * Anything not named here cannot be withheld from a learner. Adding a new
 * intervention type is a decision someone has to make on purpose, and the cost
 * of forgetting is a lost experiment rather than a learner left without help
 * they needed.
 */
export const HOLDOUT_ELIGIBLE = [
  'ACTIVATION_NUDGE',
  'RECOMMEND_LESSON',
  'COMMUNITY_INTRO',
  'WEEKLY_DIGEST',
  'EVENT_DISCOVERY',
  'TESTIMONIAL_SHARE',
] as const;

export type HoldoutEligibleIntervention = (typeof HOLDOUT_ELIGIBLE)[number];

export function isHoldoutEligible(intervention: string): boolean {
  return (HOLDOUT_ELIGIBLE as readonly string[]).includes(intervention);
}

/**
 * FNV-1a, 32-bit. Deterministic, dependency-free, and adequate for bucketing.
 *
 * NOT `Math.random()`, and not derived from a clock. Assignment must be stable
 * for the life of the experiment: a learner who lands in control on Monday and
 * treatment on Tuesday is in both arms, which does not merely add noise — it
 * biases the result toward whichever arm they engaged with, and does so
 * invisibly.
 */
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // The FNV prime, via shifts to stay in 32-bit integer arithmetic.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** Stable [0, 1) position for this learner in this experiment. */
export function bucket(experimentKey: string, enrollmentId: string): number {
  // The experiment key is part of the hash so a learner's position is
  // INDEPENDENT per experiment. Hashing the learner alone would put the same
  // people in control every time, and their traits would silently become the
  // control group's definition across every experiment we ever run.
  return fnv1a(`${experimentKey}:${enrollmentId}`) / 0x100000000;
}

export interface AssignmentInput {
  experimentKey: string;
  enrollmentId: string;
  intervention: string;
  /** Share held back as control, 0..0.5. */
  controlShare: number;
}

export interface Assignment {
  arm: Arm;
  /** Present when the intervention was not eligible to be withheld. */
  forcedReason?: string;
  bucket: number;
}

/**
 * Assign an arm, refusing to withhold anything a learner actually needs.
 *
 * An ineligible intervention always returns `treatment` WITH a reason, rather
 * than throwing. Throwing would make the safe path the one that breaks the
 * cron, and a broken nightly job gets "fixed" under time pressure by whoever is
 * on call — often by removing the check.
 */
export function assignArm(input: AssignmentInput): Assignment {
  const { experimentKey, enrollmentId, intervention, controlShare } = input;
  const b = bucket(experimentKey, enrollmentId);

  if (!isHoldoutEligible(intervention)) {
    return {
      arm: 'treatment',
      forcedReason: `${intervention} is not holdout-eligible (§25.2): a learner is never withheld from a message that addresses a problem they are actually having`,
      bucket: b,
    };
  }

  // A control share outside 0..0.5 is a configuration error, and the safe
  // reading of a broken config is "do not withhold from anyone".
  if (!(controlShare > 0) || controlShare > 0.5) {
    return {
      arm: 'treatment',
      forcedReason: `controlShare ${controlShare} outside (0, 0.5] — treated as no holdout`,
      bucket: b,
    };
  }

  return { arm: b < controlShare ? 'control' : 'treatment', bucket: b };
}

/** §25.3 gate: below this per arm, lift is not reported. */
export const MIN_ARM_N = 100;

export interface ArmOutcome {
  /** Learners in this arm. */
  n: number;
  /** Learners in this arm who converted. */
  converted: number;
}

export interface LiftResult {
  treatment: Measured;
  control: Measured;
  /** conv(treatment) − conv(control). */
  lift: Measured;
}

/**
 * Lift between arms, or an explicit refusal below n=100 per arm.
 *
 * The interval is the conservative combination: the widest true difference
 * consistent with both arms' intervals. Subtracting point estimates and
 * quoting that alone would report a difference with no uncertainty attached,
 * and an early experiment's "12% lift" is usually noise — which is exactly the
 * number that gets screenshotted into a decision.
 */
export function computeLift(treatment: ArmOutcome, control: ArmOutcome): LiftResult {
  const t = wilsonInterval(treatment.converted, treatment.n);
  const c = wilsonInterval(control.converted, control.n);

  if (treatment.n < MIN_ARM_N || control.n < MIN_ARM_N) {
    const reason = `n=${treatment.n} treatment / ${control.n} control, needs ${MIN_ARM_N} per arm`;
    return { treatment: t, control: c, lift: insufficient(reason) };
  }
  if (!t.known || !c.known) {
    return { treatment: t, control: c, lift: insufficient('an arm could not be measured') };
  }

  return {
    treatment: t,
    control: c,
    lift: {
      known: true,
      point: t.point - c.point,
      low: t.low - c.high,
      high: t.high - c.low,
    },
  };
}
