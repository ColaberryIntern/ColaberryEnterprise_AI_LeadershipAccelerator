/**
 * Explorer Growth OS — shared domain types.
 * Plan: docs/EXPLORER_GROWTH_OS_PLAN.md §8, §9, §10.
 *
 * These live here rather than inside the Sequelize model files because the
 * scoring, state-machine, and Journey Governor services (EPICs 3-4) are the
 * primary consumers — a service importing its core vocabulary from a model file
 * would invert the dependency direction the repo's layering expects
 * (routes -> controllers -> services -> models).
 *
 * Sibling precedent: src/types/inboxCase.ts, src/types/intelligence.ts.
 */

// --- Journey state (§8) -----------------------------------------------------

/** Exactly one of these holds at a time. Learning states never regress. */
export type ExplorerPrimaryState =
  | 'NEW_EXPLORER'
  | 'ACTIVATING'
  | 'ACTIVE_LEARNER'
  | 'ENGAGED_LEARNER'
  | 'CONNECTED_TO_COMMUNITY'
  | 'CONSIDERING_NEXT_STEP'
  | 'ENROLLMENT_READY'
  | 'CONVERTED';

/** Zero or more, independent of the primary state. Dormancy is an overlay, not a regression. */
export type ExplorerOverlay =
  | 'DORMANT'
  | 'HIGH_INTENT'
  | 'FRICTION'
  | 'NEEDS_SUPPORT'
  | 'EVENT_READY'
  | 'EVENT_REGISTERED'
  | 'EVENT_ATTENDED'
  | 'EVENT_NO_SHOW'
  | 'INTERNSHIP_READY'
  | 'SUBSCRIPTION_READY'
  | 'REFERRAL_READY'
  | 'IN_CONVERSATION';

// --- Contactability + affinity (§7) -----------------------------------------

/** Per-channel eligibility resolved at decision time. Every false carries a reason. */
export interface ExplorerContactability {
  email?: { eligible: boolean; reason?: string };
  sms?: { eligible: boolean; reason?: string };
  voice?: { eligible: boolean; reason?: string };
  in_app?: { eligible: boolean; reason?: string };
  quiet_hours_active?: boolean;
  next_eligible_at?: string | null;
}

export interface ExplorerAffinity {
  tag: string;
  /** 0-1. Recomputed nightly from scratch — a learner is never locked to a persona. */
  confidence: number;
  sources?: string[];
}

// --- Decisions (§9, §17) ----------------------------------------------------

/** Operating mode. Only pilot/limited/full may execute anything. */
export type ExplorerDecisionMode =
  | 'observe'
  | 'shadow'
  | 'test_users'
  | 'pilot'
  | 'limited'
  | 'full';

export type ExplorerActionType =
  | 'SEND_EMAIL'
  | 'SEND_SMS'
  | 'SCHEDULE_VOICE'
  | 'SHOW_IN_APP_NUDGE'
  | 'RECOMMEND_LESSON'
  | 'INVITE_TO_EVENT'
  | 'SEND_ALI_OUTREACH'
  | 'ENTER_SUBCAMPAIGN'
  | 'EXIT_SUBCAMPAIGN'
  | 'CREATE_HUMAN_TASK'
  | 'RECOVER_FRICTION'
  | 'WAIT'
  | 'SUPPRESS_CONTACT';

/** A candidate the Governor generated, with why it ranked where it did. */
export interface ExplorerCandidateAction {
  action_type: ExplorerActionType;
  campaign_key?: string | null;
  /** 0 = hard stop, 10 = referral. Lower wins. See §9.1. */
  priority_tier: number;
  intra_tier_score: number;
  channel?: string | null;
  rationale?: string[];
}

/** A candidate that was dropped, and the machine-readable reason it was dropped. */
export interface ExplorerSuppressedAction {
  action_type: ExplorerActionType;
  campaign_key?: string | null;
  reason: string;
}

// --- Experiments (§25) ------------------------------------------------------

export type ExplorerExperimentVariant = 'treatment' | 'control';

// --- Content registry (§10) -------------------------------------------------

export type ExplorerAssetType =
  | 'CURRICULUM'
  | 'LESSON'
  | 'BLOG'
  | 'VIDEO'
  | 'PODCAST'
  | 'TESTIMONIAL'
  | 'CASE_STUDY'
  | 'EVENT'
  | 'OPEN_HOUSE'
  | 'COHORT'
  | 'CLASS'
  | 'SUBSCRIPTION'
  | 'INTERNSHIP'
  | 'CERTIFICATION'
  | 'COMMUNITY'
  | 'PROJECT'
  | 'PLATFORM_FEATURE'
  | 'ADVISORY_SERVICE'
  | 'TOOL'
  | 'RESOURCE'
  | 'REFERRAL_OPPORTUNITY';
