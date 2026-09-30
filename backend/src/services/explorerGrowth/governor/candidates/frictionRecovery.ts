import type { Candidate, GovernorContext } from '../types';

/**
 * §9.1 tier 2 — active support and friction recovery. EPIC 4 T001.
 *
 * WHY TIER 2 OUTRANKS TIER 3 (§9.1's stated reason): a learner who replied
 * *because* they hit a payment error must get recovery, not a sales reply.
 * Friction wins. The arbiter enforces the ordering; this generator exists to
 * make sure there is something for it to prefer.
 *
 * BUILD PARTIAL. §8.2's NEEDS_SUPPORT has three entry conditions and only one
 * is readable today:
 *
 *   - `email_hard_bounce`     — READABLE (interaction_outcomes)
 *   - open inbox case         — DEFERRED: no `inbox_cases` source in the reader
 *   - reply = NEEDS_HELP      — DEFERRED: interaction_outcomes maps only
 *                               clicked / replied / bounced
 *
 * The two deferrals are asserted absent in the tests rather than silently
 * missing, the same treatment EPIC 3 gave its 13 deferred §8 rules.
 *
 * A hard bounce is also the one friction signal that never decays
 * (`halfLifeDays: null`), so FRICTION can pin permanently once set — which is
 * exactly why recovery must outrank everything commercial rather than
 * competing with it.
 */

/** §6.3: F >= 25 suppresses commercial action. Recovery starts at the same line. */
const FRICTION_THRESHOLD = 25;

export function frictionRecovery(ctx: GovernorContext): Candidate | null {
  const hasFriction = ctx.overlays.includes('FRICTION') || ctx.scores.f >= FRICTION_THRESHOLD;
  const needsSupport = ctx.overlays.includes('NEEDS_SUPPORT');
  if (!hasFriction && !needsSupport) return null;

  // A bounced address cannot be emailed about the bounce. This is the case that
  // most needs a human, so it becomes a task rather than a message into a void.
  const bounced = ctx.contactability?.email?.eligible !== true;

  const rationale = [
    `f=${ctx.scores.f}`,
    needsSupport ? 'NEEDS_SUPPORT overlay' : 'FRICTION overlay',
    bounced ? 'email ineligible — routing to a human' : 'email reachable',
  ];

  if (bounced) {
    return {
      action_type: 'CREATE_HUMAN_TASK',
      campaign_key: null,
      priority_tier: 2,
      // Recovery outranks everything else in its tier; an unreachable learner
      // with unresolved friction is the most urgent case the Governor has.
      intra_tier_score: 95,
      channel: 'none',
      required_assets: [],
      rationale,
    };
  }

  return {
    action_type: 'RECOVER_FRICTION',
    campaign_key: 'explorer_friction_recovery',
    priority_tier: 2,
    intra_tier_score: Math.min(90, 50 + ctx.scores.f),
    channel: 'email',
    required_assets: [
      { asset_type: 'friction_recovery', state: ctx.primary_state },
    ],
    rationale,
  };
}

export const FRICTION_RECOVERY_THRESHOLD = FRICTION_THRESHOLD;
