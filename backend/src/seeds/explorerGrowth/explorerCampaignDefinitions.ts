/**
 * Explorer Growth OS — EPIC 6 T001. The eight campaign definitions.
 *
 * DATA ONLY. No I/O, no Sequelize, no side effects. The seed that writes these is
 * `seedExplorerGrowthCampaigns.ts`; keeping the definitions inert makes them
 * readable in one sitting and testable without a database.
 *
 * KEYED FROM THE SHIPPED GOVERNOR, NOT FROM THE PLAN DOCUMENT. The design doc
 * (`docs/EXPLORER_GROWTH_OS_PLAN.md` §12.2) specifies eight campaigns whose names
 * disagree with what the Governor actually emits — **only 2 of 8 match**. The
 * Governor runs nightly in production and writes these keys into real decision
 * rows; the plan was written before it. Where they disagree the plan is stale,
 * and seeding its names would leave `selected_campaign_id` null forever for six
 * of eight keys — which reads exactly like "the Governor declined to pick one"
 * rather than like a mismatch.
 *
 * `explorer_dormant_reentry` from that document is deliberately absent: nothing
 * emits it. A campaign row nothing can select is worse than no row, because it
 * looks like coverage.
 */

/** What the seed needs to create one campaign. */
export interface ExplorerCampaignDefinition {
  /**
   * The identifier. Stored at `settings.campaign_key` and resolved on, because
   * `campaigns` has no key column and `name` is a human-editable label — someone
   * renaming a campaign in Admin must not break the Governor's resolution.
   */
  key: string;
  /** The label. Safe to edit in Admin; nothing resolves on it. */
  name: string;
  description: string;
  /** §9.1 priority tier the Governor assigns this action. Recorded for operators. */
  tier: number;
  /** The sequence this campaign links to, by name. Created by the same seed. */
  sequenceName: string;
}

/**
 * All eight are `warm_nurture`.
 *
 * NOTE FOR ANYONE ADDING ONE: `alumniReferralService.ts:226-231` falls back to
 * `{ type: 'warm_nurture', status: 'active' }` ordered `created_at DESC` and
 * enrolls a referred lead into whatever it finds. A freshly seeded Explorer
 * campaign is the newest `warm_nurture` row, so it would be selected
 * preferentially. That path is HTTP-reachable by an alumnus with no admin
 * involvement. It is blocked here only because the sequences ship
 * `is_active: false` — see `seedExplorerGrowthCampaigns.ts`.
 */
export const EXPLORER_CAMPAIGN_TYPE = 'warm_nurture';

/**
 * Never name an Explorer campaign anything containing "Cold Outbound".
 *
 * `schedulerService.ts:3251-3261` runs on every scheduler start and flips any
 * campaign matching `%Cold Outbound%` from draft to active. Explorer campaigns
 * escape it by name alone, which is a coincidence rather than a guarantee.
 */
export const FORBIDDEN_NAME_FRAGMENT = 'Cold Outbound';

export const EXPLORER_CAMPAIGNS: ExplorerCampaignDefinition[] = [
  {
    key: 'explorer_activation_never_started',
    name: 'Explorer Activation — Never Started',
    description:
      'A learner who signed up and has never engaged with any content. Points at the first step of the curriculum.',
    tier: 6,
    sequenceName: 'Explorer Activation — Never Started',
  },
  {
    key: 'explorer_activation_restart',
    name: 'Explorer Activation — Restart',
    description:
      'A learner who started and stopped. Distinct from never-started because the message is a return, not an introduction.',
    tier: 6,
    sequenceName: 'Explorer Activation — Restart',
  },
  {
    key: 'explorer_next_lesson',
    name: 'Explorer Learning Momentum',
    description:
      'A learner actively working through the curriculum. Points at the next lesson for their journey stage.',
    tier: 7,
    sequenceName: 'Explorer Learning Momentum',
  },
  {
    key: 'explorer_community_digest',
    name: 'Explorer Community Digest',
    description:
      'A learner connected to the community. NOTE: the content purpose behind this is a declared gap — all community posts are cohort-scoped private discussion, so no cohort-safe projection exists yet.',
    tier: 8,
    sequenceName: 'Explorer Community Digest',
  },
  {
    key: 'explorer_weekly_digest',
    name: 'Explorer Weekly Intelligence Digest',
    description:
      'General nurture, and by volume the one that matters most: 132 of 143 selecting decisions land here.',
    tier: 9,
    sequenceName: 'Explorer Weekly Intelligence Digest',
  },
  {
    key: 'explorer_referral_invite',
    name: 'Explorer Referral Invite',
    description:
      'A learner who has earned the right to be asked for a referral. Content purpose is a declared gap: no referral asset exists.',
    tier: 10,
    sequenceName: 'Explorer Referral Invite',
  },
  {
    key: 'explorer_enrollment_ready',
    name: 'Explorer Accelerator Interest',
    description:
      'A learner showing commercial intent. Content purpose is a declared gap: no offer asset is projected, and no learner currently reaches this state.',
    tier: 5,
    sequenceName: 'Explorer Accelerator Interest',
  },
  {
    key: 'explorer_friction_recovery',
    name: 'Explorer Broken Journey Recovery',
    description:
      'A learner blocked by something the platform did — a failed upload, a broken link, an access problem. Highest priority of the eight because it is our fault, not theirs.',
    tier: 2,
    sequenceName: 'Explorer Broken Journey Recovery',
  },
];

/** Every key this module defines, for coverage checks against the Governor. */
export function definedCampaignKeys(): string[] {
  return EXPLORER_CAMPAIGNS.map((c) => c.key);
}
