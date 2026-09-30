import type { Candidate, GovernorContext } from '../types';

/**
 * §9.1 tier 5 — high commercial intent. EPIC 4 T001.
 *
 * THIS IS EXPECTED TO FIRE FOR NOBODY, AND THAT IS CORRECT.
 *
 * Max intent score across all 153 production Explorers is **2**. `HIGH_INTENT`
 * requires `i >= 60` AND a tier-3+ signal within 14 days AND a tier-2+ signal
 * within 21 days (`explorerStateMachine.ts`). The `i >= 60` conjunct alone puts
 * it out of reach by a factor of thirty.
 *
 * Intent signals barely exist yet because `page_events.lead_id` — the column
 * that links a page view to a person — was only fixed in EPIC 1, and it has had
 * days rather than months to accumulate. This tier will start firing as that
 * data builds. Until then, a tier-5 candidate is a DEFECT, not a lucky find,
 * and the test asserts zero against the real distribution.
 *
 * The threshold is deliberately NOT lowered to make the tier "work". A
 * commercial push to someone who has viewed two pages is the exact failure the
 * tiering exists to prevent.
 */

const REQUIRED_INTENT_SCORE = 60;

export function highIntent(ctx: GovernorContext): Candidate | null {
  // The state machine already encodes the full HIGH_INTENT rule; trusting its
  // overlay rather than re-deriving it here keeps one definition, not two.
  if (!ctx.overlays.includes('HIGH_INTENT')) return null;

  // Belt and braces: the overlay should imply this, but a commercial action is
  // the most expensive thing to get wrong, so the score is re-checked rather
  // than assumed.
  if (ctx.scores.i < REQUIRED_INTENT_SCORE) return null;

  // Friction outranks selling. A learner whose payment just failed gets
  // recovery (tier 2), never a sales push — §9.1's stated reason for tier 2
  // beating tier 3, applied here too.
  if (ctx.scores.f >= 25) return null;

  if (ctx.contactability?.email?.eligible !== true) return null;

  return {
    action_type: 'SEND_EMAIL',
    campaign_key: 'explorer_enrollment_ready',
    priority_tier: 5,
    intra_tier_score: Math.min(100, ctx.scores.i),
    channel: 'email',
    required_assets: [
      {
        asset_type: 'enrollment_offer',
        affinity_tags: ctx.affinities.map((a) => a.tag),
        state: ctx.primary_state,
      },
    ],
    rationale: [
      `i=${ctx.scores.i} (>= ${REQUIRED_INTENT_SCORE})`,
      `recentIntentTier=${ctx.readout?.recentIntentTier ?? 0}`,
      `f=${ctx.scores.f} (< 25)`,
      'HIGH_INTENT overlay present',
    ],
  };
}

export const HIGH_INTENT_REQUIRED_SCORE = REQUIRED_INTENT_SCORE;
