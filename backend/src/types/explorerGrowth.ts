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

// --- Signals (§6, §7.1-7.2) -------------------------------------------------

/** Which score a signal feeds. */
export type ExplorerSignalBand = 'engagement' | 'intent' | 'friction';

/**
 * Commitment tier for intent signals (§6.2). The whole point of the tiering is
 * that a page view is not readiness: HIGH_INTENT requires at least one T3+
 * signal, so twenty T1 views can never manufacture it.
 *   1 view · 2 click · 3 start · 4 commit
 */
export type ExplorerIntentTier = 1 | 2 | 3 | 4;

/** Where a signal is read from, so the reader knows which query owns it. */
export type ExplorerSignalSource =
  | 'student_navigation_events'
  | 'timeline_card_progress'
  | 'today_feed_impressions'
  | 'student_points_events'
  | 'community_contributions'
  | 'community_members'
  | 'attendance_records'
  | 'assignment_submissions'
  | 'reflection_entries'
  | 'student_architecture_skill'
  | 'projects'
  | 'network_video_views'
  | 'enrollments'
  | 'page_events'
  | 'behavioral_signals'
  | 'interaction_outcomes'
  | 'strategy_calls'
  | 'inbox_cases'
  | 'derived';

export interface ExplorerSignalDefinition {
  band: ExplorerSignalBand;
  /** Contribution of a single fresh occurrence, before decay. */
  weight: number;
  /**
   * Days for a contribution to halve: `2^(-ageDays / halfLifeDays)`.
   * `null` means the signal never decays (a hard bounce does not become
   * untrue with time).
   */
  halfLifeDays: number | null;
  /** Maximum total contribution from this signal, however many occurrences. */
  cap: number;
  /** Intent signals only. Present iff band === 'intent'. */
  tier?: ExplorerIntentTier;
  source: ExplorerSignalSource;
}

/** One occurrence of a signal, as read back from its source table. */
export interface ExplorerSignalOccurrence {
  signal: string;
  occurredAt: Date;
  /** Contribution after decay and before the per-signal cap. */
  weightedValue: number;
}

/** Per-band roll-up returned by the reader. Raw contributions, NOT a 0-100 score. */
export interface ExplorerSignalBandTotal {
  band: ExplorerSignalBand;
  total: number;
  signals: Array<{ signal: string; occurrences: number; contribution: number }>;
}

/** The reader's output — the contract EPIC 3's scorer consumes. */
export interface ExplorerSignalReadout {
  enrollment_id: string;
  lead_id: number | null;
  asOf: Date;
  bands: Record<ExplorerSignalBand, ExplorerSignalBandTotal>;
  /** Highest intent tier observed in the window; drives the HIGH_INTENT gate. */
  highestIntentTier: ExplorerIntentTier | 0;
}

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
