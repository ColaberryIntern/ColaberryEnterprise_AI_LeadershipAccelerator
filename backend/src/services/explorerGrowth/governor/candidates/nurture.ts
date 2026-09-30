import type { Candidate, GovernorContext } from '../types';

/**
 * §9.1 tiers 3, 7, 8, 9, 10 — the non-commercial remainder. EPIC 4 T001.
 *
 * Grouped in one file because each is a short predicate over the same context,
 * and splitting five ten-line functions across five files would obscure the
 * ordering rather than clarify it. Each is still a separate exported generator.
 *
 * Tier 4 (event logistics) is DEFERRED — there is no event calendar and
 * `EVENT_REGISTERED`'s exit needs `event.ends_at`, which EPIC 3 already
 * deferred to EPIC 7. Its absence is asserted in the tests.
 */

/** Tier 3 — a live conversation. Answer the human before anything else non-urgent. */
export function inConversation(ctx: GovernorContext): Candidate | null {
  if (!ctx.overlays.includes('IN_CONVERSATION')) return null;
  return {
    action_type: 'CREATE_HUMAN_TASK',
    campaign_key: null,
    priority_tier: 3,
    intra_tier_score: 80,
    channel: 'none',
    required_assets: [],
    // A reply is a person waiting. It becomes a human task, never an automated
    // response — answering a real message with a campaign email is worse than
    // not answering at all.
    rationale: ['IN_CONVERSATION overlay — a reply is waiting'],
  };
}

/** Tier 7 — personalised learning. Needs content EPIC 5 supplies. */
export function personalisedLearning(ctx: GovernorContext): Candidate | null {
  const learning = ['ACTIVE_LEARNER', 'ENGAGED_LEARNER', 'CONNECTED_TO_COMMUNITY'];
  if (!learning.includes(ctx.primary_state)) return null;
  if (ctx.contactability?.email?.eligible !== true) return null;

  const tags = ctx.affinities.filter((a) => a.confidence >= 0.35).map((a) => a.tag);

  return {
    action_type: 'RECOMMEND_LESSON',
    campaign_key: 'explorer_next_lesson',
    priority_tier: 7,
    // More affinity evidence means a better recommendation, so rank those
    // higher within the tier — but never above the tier itself.
    intra_tier_score: Math.min(80, 40 + tags.length * 10),
    channel: 'email',
    required_assets: [
      { asset_type: 'lesson_recommendation', affinity_tags: tags, state: ctx.primary_state },
    ],
    rationale: [
      `state=${ctx.primary_state}`,
      tags.length ? `affinities: ${tags.join(', ')}` : 'no affinity evidence yet',
    ],
  };
}

/** Tier 8 — community. */
export function community(ctx: GovernorContext): Candidate | null {
  if (ctx.primary_state !== 'CONNECTED_TO_COMMUNITY') return null;
  if (ctx.contactability?.email?.eligible !== true) return null;
  return {
    action_type: 'SEND_EMAIL',
    campaign_key: 'explorer_community_digest',
    priority_tier: 8,
    intra_tier_score: 50,
    channel: 'email',
    required_assets: [{ asset_type: 'community_digest', state: ctx.primary_state }],
    rationale: ['CONNECTED_TO_COMMUNITY'],
  };
}

/**
 * Tier 9 — general nurture. The realistic default.
 *
 * Deliberately the LAST resort: it fires for anyone reachable who produced
 * nothing better. With 134 learners in ACTIVATING and almost no intent signal,
 * this and tier 6 are what the Governor actually has to say today.
 */
export function generalNurture(ctx: GovernorContext): Candidate | null {
  if (ctx.contactability?.email?.eligible !== true) return null;
  return {
    action_type: 'SEND_EMAIL',
    campaign_key: 'explorer_weekly_digest',
    priority_tier: 9,
    intra_tier_score: 30,
    channel: 'email',
    required_assets: [
      {
        asset_type: 'weekly_digest',
        affinity_tags: ctx.affinities.map((a) => a.tag),
        state: ctx.primary_state,
      },
    ],
    rationale: ['general nurture — no higher-priority candidate applies'],
  };
}

/** Tier 10 — referral. Partial: the completed-project half has no reader source. */
export function referral(ctx: GovernorContext): Candidate | null {
  if (!ctx.overlays.includes('REFERRAL_READY')) return null;
  if (ctx.contactability?.email?.eligible !== true) return null;
  return {
    action_type: 'SEND_EMAIL',
    campaign_key: 'explorer_referral_invite',
    priority_tier: 10,
    intra_tier_score: 40,
    channel: 'email',
    required_assets: [{ asset_type: 'referral_invite', state: ctx.primary_state }],
    // PARTIAL: §8.2's REFERRAL_READY entry is "E >= 60 AND (completed project OR
    // community contribution)". project_build_activity has no reader source
    // query, so only the contribution half can ever fire today.
    rationale: ['REFERRAL_READY overlay (contribution half only — project signal unsourced)'],
  };
}
