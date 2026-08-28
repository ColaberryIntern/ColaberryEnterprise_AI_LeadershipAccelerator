import {
  EXPLORER_ASSET_PURPOSES,
  type ExplorerAssetPurpose,
  type ExplorerAssetType,
  type ExplorerPrimaryState,
  type ExplorerStageTag,
} from '../../../types/explorerGrowth';

/**
 * Explorer Growth OS — EPIC 5 T002. The two translations, and nothing else.
 *
 * PURE. No I/O, no database, no clock. Everything here is a lookup table, which
 * is the point: the defect this epic exists to fix was two vocabularies meeting
 * with no translation between them, and a translation you cannot read at a
 * glance is barely better than none.
 *
 * THE RULE FOR BOTH MAPS: `Record` over a union, no `default:` branch, no index
 * fallback. Adding a purpose or a primary state fails the BUILD until someone
 * decides what it means. A fallback would turn that decision into a silent
 * default, which is how `weekly_digest` came to be requested for months against
 * a registry that could never answer.
 */

/** A purpose that maps onto real content. */
export interface SupportedPurpose {
  supported: true;
  /** Registry kinds that can answer this purpose. Never empty. */
  kinds: ExplorerAssetType[];
  /**
   * A stage this purpose REQUIRES, regardless of where the learner is.
   *
   * `activation_first_step` means the first step whether or not the learner's
   * state agrees. When absent, the learner's state supplies the stage through
   * `PRIMARY_STATE_TO_STAGE` — the two are alternatives, and the resolver must
   * never apply both.
   */
  stageTags?: ExplorerStageTag[];
  /** How many assets an action of this purpose can carry. */
  limit: number;
}

/**
 * A purpose nothing can answer today.
 *
 * A first-class outcome, not an error. The contract is explicit: a missing asset
 * is REPORTED, never invented and never quietly substituted. Carrying the reason
 * on the spec is what lets the gap report say why rather than just how many.
 */
export interface UnsupportedPurpose {
  supported: false;
  reason: string;
}

export type PurposeSpec = SupportedPurpose | UnsupportedPurpose;

/**
 * MAP A — what each message purpose is asking the registry for.
 *
 * Only `LESSON` appears today because `timeline_cards` is the only substrate
 * being projected (T003). That is a statement about what exists, not a ceiling:
 * adding `EVENT` or `TESTIMONIAL` here is a one-line change once something syncs
 * them.
 */
export const PURPOSE_SPECS: Record<ExplorerAssetPurpose, PurposeSpec> = {
  /**
   * Someone who has never engaged. Pin the stage: the point is the FIRST step,
   * so a learner who has drifted forward in state still gets the beginning.
   */
  activation_first_step: {
    supported: true,
    kinds: ['LESSON'],
    stageTags: ['activation'],
    limit: 1,
  },

  /** Someone who started and stopped. Same substrate, same pinning, same reason. */
  activation_restart: {
    supported: true,
    kinds: ['LESSON'],
    stageTags: ['activation'],
    limit: 1,
  },

  /**
   * The next thing to learn. NO pinned stage — this one follows the learner,
   * which is the whole difference between it and the two above.
   */
  lesson_recommendation: {
    supported: true,
    kinds: ['LESSON'],
    limit: 1,
  },

  /**
   * The general nurture fallback, and by volume the one that matters most: 133
   * of the 153 shadow decisions land here. Three assets rather than one because
   * a digest of a single item is not a digest.
   */
  weekly_digest: {
    supported: true,
    kinds: ['LESSON'],
    limit: 3,
  },

  /**
   * DECLARED GAP, and the reason is a privacy boundary rather than a shortage.
   *
   * All 62 community posts carry a non-null `cohort_id` — every one belongs to a
   * paying cohort's private discussion. A registry row is cohort-blind by
   * construction, so once such a post is a row, only the resolver stands between
   * it and a different cohort's learner. Audience-scoped resolution is a design
   * decision worth making deliberately, not a sub-task, for a purpose two people
   * request — one of whom has zero posts in their own cohort anyway.
   */
  community_digest: {
    supported: false,
    reason:
      'community_posts are 100% cohort-scoped private discussion; no cohort-safe projection is defined',
  },

  /**
   * DECLARED GAPS. No substrate exists and, measured across the 153 shadow
   * decisions, nobody is currently in a state that requests them: no learner
   * carries a FRICTION overlay, reaches ENROLLMENT_READY, or is REFERRAL_READY.
   *
   * Reported rather than filled. An invented "we noticed you got stuck" email
   * nobody wrote is worse than an empty registry, because it looks ready.
   */
  friction_recovery: {
    supported: false,
    reason: 'no friction-recovery content exists; zero learners currently request it',
  },
  enrollment_offer: {
    supported: false,
    reason: 'no offer asset is projected yet; zero learners currently reach ENROLLMENT_READY',
  },
  referral_invite: {
    supported: false,
    reason: 'no referral asset exists; zero learners currently reach REFERRAL_READY',
  },
};

/**
 * MAP B — the translation that was missing, and whose absence reproduced this
 * epic's own bug inside its own fix.
 *
 * A learner has an `ExplorerPrimaryState` (`ACTIVATING`). A card carries an
 * `ExplorerStageTag` (`activation`). **These sets share zero members.** The
 * first draft of the resolver compared them directly, and because every
 * generator sets `state` on every asset query, it would have matched nothing for
 * all 153 learners — and been reported as a content gap rather than a bug.
 *
 * This map is the ONLY sanctioned bridge between the two. Nothing else may
 * compare a state to a stage tag.
 */
export const PRIMARY_STATE_TO_STAGE: Record<ExplorerPrimaryState, ExplorerStageTag> = {
  // Not started, or barely. The beginning is what is useful.
  NEW_EXPLORER: 'activation',
  ACTIVATING: 'activation',

  // Underway. Week-2-and-beyond material is what moves them.
  ACTIVE_LEARNER: 'learning',
  ENGAGED_LEARNER: 'learning',
  CONNECTED_TO_COMMUNITY: 'learning',

  // Past the learning arc, or deciding about it. Undated material travels best:
  // week-pinned content would mostly be behind them, and this is exactly where a
  // stale "start here" card would read as the system not knowing who they are.
  CONSIDERING_NEXT_STEP: 'evergreen',
  ENROLLMENT_READY: 'evergreen',
  CONVERTED: 'evergreen',
};

/**
 * The stage a query should filter on.
 *
 * Returns null when the purpose pins no stage AND the query carries no state —
 * meaning "do not filter by stage", which is different from "match nothing".
 * The caller must keep that distinction; collapsing it is the same mistake as
 * reading an empty affinity list as a refusal.
 */
export function stageTagsFor(
  spec: SupportedPurpose,
  state: ExplorerPrimaryState | undefined,
): ExplorerStageTag[] | null {
  if (spec.stageTags?.length) return spec.stageTags;
  if (!state) return null;
  return [PRIMARY_STATE_TO_STAGE[state]];
}

/** Every purpose, for callers that need to enumerate rather than look up. */
export function allPurposes(): readonly ExplorerAssetPurpose[] {
  return EXPLORER_ASSET_PURPOSES;
}

/** The declared gaps, for the content gap report T007 produces. */
export function unsupportedPurposes(): { purpose: ExplorerAssetPurpose; reason: string }[] {
  return EXPLORER_ASSET_PURPOSES.filter((p) => !PURPOSE_SPECS[p].supported).map((p) => ({
    purpose: p,
    reason: (PURPOSE_SPECS[p] as UnsupportedPurpose).reason,
  }));
}
