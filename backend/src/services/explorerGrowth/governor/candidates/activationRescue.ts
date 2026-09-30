import type { Candidate, GovernorContext } from '../types';

/**
 * §9.1 tier 6 — activation rescue. EPIC 4 T001.
 *
 * THE TIER THAT ACTUALLY MATTERS TODAY. 134 of the 153 production Explorers are
 * `ACTIVATING`: they signed up, the 72-hour clock elapsed, and they have not
 * completed a card. Tiers 5 and above cannot fire for them — max intent across
 * the whole population is 2 — so if this tier does not produce something
 * sensible, the Governor has nothing to say to 88% of the audience.
 *
 * Deliberately NOT commercial. These learners have shown no buying intent; the
 * job is to get them back into the product, not to sell to them.
 */

/** Beyond this, a learner is cold rather than merely un-started. */
const DORMANT_DAYS = 14;

export function activationRescue(ctx: GovernorContext): Candidate | null {
  const s = ctx.primary_state;

  // Only pre-completion states. Once a card is done the learner belongs to
  // personalised learning (tier 7), not rescue.
  if (s !== 'NEW_EXPLORER' && s !== 'ACTIVATING') return null;

  // Nothing to rescue them with if we cannot reach them at all. The channel
  // check is here rather than in the policy layer because a candidate proposing
  // an unusable channel is noise in the decision row.
  const emailOk = ctx.contactability?.email?.eligible === true;
  const inAppOk = ctx.contactability?.in_app?.eligible === true;
  if (!emailOk && !inAppOk) return null;

  const dormant = ctx.overlays.includes('DORMANT');
  const daysSince = ctx.readout?.lastEngagementAt
    ? Math.floor(
        (ctx.asOf.getTime() - new Date(ctx.readout.lastEngagementAt).getTime()) / 86_400_000,
      )
    : null;

  // A learner who has NEVER engaged and one who engaged then stopped need
  // different messages, so they get different scores and rationales rather than
  // being collapsed into one candidate.
  const neverEngaged = daysSince === null;

  const rationale = [
    `state=${s}`,
    neverEngaged ? 'never engaged' : `last engagement ${daysSince}d ago`,
    dormant ? `dormant (>${DORMANT_DAYS}d)` : 'recently active',
  ];

  // Two NON-OVERLAPPING bands, so the never-started and lapsed cases can always
  // be told apart by score alone.
  //
  // A first version scaled lapsed as `40 + min(days,30) * 1.5` and fixed
  // never-engaged at 70 — which collide exactly at 20 days lapsed, the most
  // common case in this population. Caught by the real-distribution test, and
  // worth stating: a scoring scheme whose two branches can land on the same
  // number is not distinguishing anything.
  //
  // Lapsed occupies 40-70 and rises with silence. Never-started sits above the
  // whole band at 75: someone who never took a first step needs a different
  // message more urgently than someone who took several and paused.
  const NEVER_STARTED_SCORE = 75;
  const intra_tier_score = neverEngaged
    ? NEVER_STARTED_SCORE
    : Math.min(70, 40 + Math.min(daysSince ?? 0, 30));

  return {
    action_type: emailOk ? 'SEND_EMAIL' : 'SHOW_IN_APP_NUDGE',
    campaign_key: neverEngaged ? 'explorer_activation_never_started' : 'explorer_activation_restart',
    priority_tier: 6,
    intra_tier_score: Math.round(intra_tier_score),
    channel: emailOk ? 'email' : 'in_app',
    required_assets: [
      {
        asset_type: neverEngaged ? 'activation_first_step' : 'activation_restart',
        affinity_tags: ctx.affinities.map((a) => a.tag),
        state: s,
      },
    ],
    rationale,
  };
}
