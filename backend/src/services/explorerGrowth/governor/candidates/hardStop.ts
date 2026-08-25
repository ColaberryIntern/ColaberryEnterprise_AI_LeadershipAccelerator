import type { GovernorContext } from '../types';

/**
 * §9.1 tier 0 — the hard stop. EPIC 4 T001.
 *
 * This is NOT a generator and does not return a Candidate. Tier 0 conditions
 * terminate the decision entirely: a converted learner must never be enqueued
 * at all.
 *
 * WHY THIS RUNS FIRST, from §9.1: the existing engine blocks these at SEND
 * time — after a queue row exists, an AI generation has been paid for, and a
 * campaign has been credited with a touch. Evaluating them here means none of
 * that happens.
 *
 * The seven staff accounts in the production population reach this through
 * `converted`, and that is correct: staff must never receive acquisition
 * messaging.
 */

export type HardStopReason =
  | 'converted'
  | 'unsubscribed'
  | 'dnc'
  | 'consent_revoked'
  | 'kill_switch'
  | 'campaign_inactive';

/**
 * Returns the reason to stop, or null to continue.
 *
 * Order matters only for which reason gets recorded when several apply; any
 * one of them stops the decision. `converted` is checked first because it is
 * the most informative for a human reading the decision row.
 */
export function hardStopReason(ctx: GovernorContext): HardStopReason | null {
  const h = ctx?.hardStop;
  // A missing hardStop block is treated as a stop, not as "nothing to stop".
  // Absent evidence is not evidence of eligibility — the same rule the
  // contact policy and the entitlement check follow.
  if (!h) return 'kill_switch';

  if (h.converted) return 'converted';
  if (h.unsubscribed) return 'unsubscribed';
  if (h.dnc) return 'dnc';
  if (h.consentRevoked) return 'consent_revoked';
  if (h.killSwitch) return 'kill_switch';
  if (h.campaignInactive) return 'campaign_inactive';
  return null;
}

/** True when the Governor may proceed to generate candidates at all. */
export function mayProceed(ctx: GovernorContext): boolean {
  return hardStopReason(ctx) === null;
}
