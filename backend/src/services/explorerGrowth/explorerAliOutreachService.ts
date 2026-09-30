/**
 * Explorer Growth OS — Ali personal outreach eligibility. Plan §13.4 (C24),
 * §16.1; EPIC 8.
 *
 * The narrowest gate in the system, because the message is the least scalable
 * thing we send: a short personal note from a named human. Its value comes
 * entirely from being rare and real, and volume is what destroys it.
 *
 * THE CAP IS SHARED ACROSS LEADS AND EXPLORERS, AND THAT IS THE POINT.
 * Plan §11 rejected a separate Explorer campaign precisely because it "splits
 * Ali's daily cap across two campaigns where it would no longer be enforced".
 * Two caps of ten are not one cap of ten; they are a cap of twenty that reads
 * as ten in both places. So `aliSendsToday` MUST be the count across every
 * audience — the caller has to count the whole population, not the slice it
 * happens to be looking at.
 *
 * FAILS CLOSED, and reports EVERY failing gate rather than the first. A gate
 * that stops at the first failure sends whoever is debugging back for another
 * round per reason, and the reasons here are the audit trail for why a real
 * person was or was not written to.
 *
 * PURE. Every input is supplied, so the whole gate is testable without a
 * database — which matters because "would we have emailed this person" should
 * be answerable without a network.
 */

/** §16.1. Shared across leads AND Explorers. */
export const ALI_DAILY_CAP = 10;

/** §16.1: no Ali outreach to the same learner inside this window. */
export const ALI_COOLDOWN_DAYS = 45;

/** §16.1: E ≥ 25 — they have actually engaged. */
export const MIN_E_SCORE = 25;

/** §16.1: F < 25 — not fighting the platform. */
export const MAX_F_SCORE = 25;

/** §16.1: HIGH_INTENT requires a tier-3+ signal to count here. */
export const MIN_SIGNAL_TIER = 3;

export interface AliOutreachContext {
  /** Journey overlays currently on the learner. */
  overlays: readonly string[];
  /** Highest signal tier observed. HIGH_INTENT alone is not enough. */
  highestSignalTier: number;
  eScore: number;
  fScore: number;
  isConverted: boolean;
  /** From the contactability service. Already fail-closed there. */
  emailEligible: boolean;
  /** Null when Ali has never written to them. */
  daysSinceLastAliOutreach: number | null;
  /**
   * Ali's sends TODAY across every audience — CRM leads and Explorers together.
   * An Explorer-only count silently doubles his real volume.
   */
  aliSendsToday: number;
  /** `EXPLORER_ALI_OUTREACH_ENABLED`, read via isExplorerFeatureEnabled. */
  flagEnabled: boolean;
}

export interface AliOutreachVerdict {
  eligible: boolean;
  /** Every gate that failed, in evaluation order. Empty when eligible. */
  reasons: string[];
}

/**
 * Evaluate the full §16.1 gate.
 *
 * Every condition must hold. The list is deliberately explicit rather than a
 * clever composition, because each line is a decision about contacting a real
 * person and should read as one.
 */
export function evaluateAliOutreachEligibility(ctx: AliOutreachContext): AliOutreachVerdict {
  const reasons: string[] = [];

  if (!ctx.flagEnabled) {
    reasons.push('EXPLORER_ALI_OUTREACH_ENABLED is off');
  }

  if (!ctx.overlays.includes('HIGH_INTENT')) {
    reasons.push('no HIGH_INTENT overlay');
  }

  if (!(ctx.highestSignalTier >= MIN_SIGNAL_TIER)) {
    // HIGH_INTENT without a tier-3 signal behind it is the overlay firing on
    // accumulated weak activity. Ali's note is for someone who did something
    // deliberate, not someone who browsed a lot.
    reasons.push(
      `highest signal tier ${ctx.highestSignalTier} < ${MIN_SIGNAL_TIER}`,
    );
  }

  if (!(ctx.eScore >= MIN_E_SCORE)) {
    reasons.push(`E score ${ctx.eScore} < ${MIN_E_SCORE} — they have not really engaged`);
  }

  if (!(ctx.fScore < MAX_F_SCORE)) {
    // High friction means something is broken for them. A warm personal note
    // that ignores the problem they are having reads as tone-deaf, and the
    // friction path should reach them first.
    reasons.push(`F score ${ctx.fScore} >= ${MAX_F_SCORE} — resolve their friction first`);
  }

  if (ctx.isConverted) {
    reasons.push('already converted — acquisition outreach does not apply');
  }

  if (!ctx.emailEligible) {
    reasons.push('not email eligible');
  }

  if (ctx.daysSinceLastAliOutreach !== null && ctx.daysSinceLastAliOutreach < ALI_COOLDOWN_DAYS) {
    reasons.push(
      `last Ali outreach was ${ctx.daysSinceLastAliOutreach}d ago, cooldown is ${ALI_COOLDOWN_DAYS}d`,
    );
  }

  if (ctx.aliSendsToday >= ALI_DAILY_CAP) {
    reasons.push(
      `Ali has already sent ${ctx.aliSendsToday} today (cap ${ALI_DAILY_CAP}, shared across leads and Explorers)`,
    );
  }

  // Anything unmeasurable is a failure, not a pass. A NaN score reaching a
  // comparison silently answers false to every bound, so it must be named.
  if (!Number.isFinite(ctx.eScore) || !Number.isFinite(ctx.fScore)) {
    reasons.push('scores are not finite — cannot evaluate');
  }

  return { eligible: reasons.length === 0, reasons };
}

/**
 * How many more Ali notes may go out today, across every audience.
 *
 * Clamped at zero: a negative remaining budget is meaningless and would read as
 * "capacity" to any caller doing arithmetic on it.
 */
export function remainingAliCapacity(aliSendsToday: number): number {
  if (!Number.isFinite(aliSendsToday)) return 0;
  return Math.max(0, ALI_DAILY_CAP - Math.max(0, aliSendsToday));
}
