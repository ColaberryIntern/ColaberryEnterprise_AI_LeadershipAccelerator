import api from '../utils/api';

/**
 * explorerGrowthApi — typed client for the Explorer Growth Command Center
 * (spec §27). One function per endpoint, twelve in all.
 *
 * Types mirror `backend/src/schemas/explorerGrowthSchema.ts` and the service
 * return shapes BY HAND. There is no shared-types package; `capeApi.ts`
 * documents that as the standing convention in this repo.
 *
 * ── EVERY ENDPOINT IS A GET ─────────────────────────────────────────────────
 *
 * Phase A shipped no write path. §27's seven write routes (`/mode`, `/pause`,
 * `/resume`, `/content/refresh`, `recalculate`, `rerun-decision`, `suppress`)
 * are unbuilt, so there is deliberately nothing here that could call them. The
 * mode switch in particular is a governance boundary rather than a widget: its
 * upper values are what would let this system start sending to real learners.
 *
 * ── THE TYPES ARE WRITTEN OUT RATHER THAN LOOSENED TO `any` ─────────────────
 *
 * The API is fixed for this phase. If a tab wants a field the API does not
 * serve, that should be a compile error — not `undefined` rendering as a blank
 * cell, which is precisely how an empty panel gets mistaken for an empty
 * system.
 */

// ─── Shared vocabulary (mirrors backend/src/types/explorerGrowth.ts) ─────────

export type ExplorerPrimaryState =
  | 'NEW_EXPLORER'
  | 'ACTIVATING'
  | 'ACTIVE_LEARNER'
  | 'ENGAGED_LEARNER'
  | 'CONNECTED_TO_COMMUNITY'
  | 'CONSIDERING_NEXT_STEP'
  | 'ENROLLMENT_READY'
  | 'CONVERTED';

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

/** Ordered for display: the roster reads as a journey, not an alphabet. */
export const PRIMARY_STATE_ORDER: ExplorerPrimaryState[] = [
  'NEW_EXPLORER',
  'ACTIVATING',
  'ACTIVE_LEARNER',
  'ENGAGED_LEARNER',
  'CONNECTED_TO_COMMUNITY',
  'CONSIDERING_NEXT_STEP',
  'ENROLLMENT_READY',
  'CONVERTED',
];

// ─── Overview ───────────────────────────────────────────────────────────────

export interface ExplorerSummary {
  /** The run these counts describe. Null before the first nightly recompute. */
  decision_date: string | null;
  /** Normally one entry; more than one means the mode changed mid-run. */
  modes: string[];
  total: number;
  waited: number;
  actionable: number;
  with_content: number;
  executed: number;
  /** Decisions whose reason names an asset gap. */
  gaps: number;
  learners_with_profile: number;
}

export interface ExplorerStateCount {
  primary_state: ExplorerPrimaryState;
  count: number;
}

export interface ExplorerDistribution {
  today: ExplorerStateCount[];
  trend: { as_of_date: string; counts: ExplorerStateCount[] }[];
  overlays: { overlay: ExplorerOverlay; count: number }[];
}

// ─── Journey ────────────────────────────────────────────────────────────────

export interface ExplorerLearnerRow {
  enrollment_id: string;
  lead_id: number | null;
  email_normalized: string;
  primary_state: ExplorerPrimaryState | null;
  overlays: ExplorerOverlay[];
  e_score: number | null;
  i_score: number | null;
  f_score: number | null;
  days_since_last_activity: number | null;
  state_entered_at: string | null;
  last_decision_at: string | null;
  scores_computed_at: string | null;
}

export interface ExplorerLearnerPage {
  rows: ExplorerLearnerRow[];
  /** BEFORE pagination — the page says "50 of 153", never implies 50 is all. */
  total: number;
  limit: number;
  offset: number;
}

export interface LearnersQuery {
  state?: ExplorerPrimaryState;
  overlay?: ExplorerOverlay;
  e_min?: number;
  e_max?: number;
  i_min?: number;
  i_max?: number;
  f_min?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

// ─── Decisions and Shadow ───────────────────────────────────────────────────

export interface ExplorerDecisionRow {
  id: string;
  enrollment_id: string;
  decision_date: string;
  mode: string;
  selected_action: ExplorerActionType | null;
  channel: string | null;
  executed: boolean;
  reason: string;
  /** How many candidates lost. A row with >0 has a Why worth opening. */
  suppressed_count: number;
  asset_count: number;
  email_normalized: string | null;
  primary_state: string | null;
  e_score: number | null;
  i_score: number | null;
  f_score: number | null;
}

export interface ExplorerDecisionPage {
  rows: ExplorerDecisionRow[];
  total: number;
  limit: number;
  offset: number;
  /** The run these rows belong to, so an older run is never mislabelled today. */
  decision_date: string | null;
}

export interface DecisionsQuery {
  action?: ExplorerActionType;
  date?: string;
  executed?: boolean;
  limit?: number;
  offset?: number;
}

// ─── The Why payload ────────────────────────────────────────────────────────

export interface ExplorerWhyScores {
  e_score: number | null;
  i_score: number | null;
  f_score: number | null;
  primary_state: ExplorerPrimaryState | null;
  overlays: ExplorerOverlay[];
}

export interface ExplorerCandidate {
  action_type: ExplorerActionType;
  campaign_key?: string | null;
  priority_tier: number;
  intra_tier_score: number;
  channel?: string | null;
  rationale?: string[];
  required_assets?: Record<string, unknown>[];
}

/** A candidate that lost, and the machine-readable reason it lost. */
export interface ExplorerSuppressed {
  action_type: ExplorerActionType;
  campaign_key?: string | null;
  reason: string;
}

export interface ExplorerWhy {
  found: true;
  enrollment_id: string;
  decision_id: string;
  decision_date: string;
  mode: string;
  ruleset_version: string;
  holdout_group: string | null;
  experiment_key: string | null;
  outcome: {
    selected_action: ExplorerActionType | null;
    selected_campaign_id: string | null;
    selected_sequence_step: number | null;
    channel: string | null;
    reason: string;
    executed: boolean;
    scheduled_email_id: string | null;
    outcome: string | null;
    outcome_at: string | null;
    ai_involved: boolean;
    ai_rationale: string | null;
  };
  /** As at the decision — the basis it was actually made on. */
  scores_at_decision: ExplorerWhyScores;
  candidates: ExplorerCandidate[];
  /** Every loser. Never truncate this on the way to the screen. */
  suppressed: ExplorerSuppressed[];
  triggering_signals: Record<string, unknown>[];
  deferred_actions: Record<string, unknown>[];
  content: {
    assets: Record<string, unknown>[];
    /** The gap as the Governor named it, e.g. `no_asset_for_purpose:...`. */
    named_gaps: string[];
    gap: string | null;
  };
  contactability: Record<string, unknown> | null;
  affinities: { tag: string; confidence: number; sources?: string[] }[];
  /** From the profile — current, not as at the decision. */
  scores_now: ExplorerWhyScores | null;
  days_in_state: number | null;
  days_since_last_activity: number | null;
  /** Whether the world moved under the decision since it was made. */
  drift: {
    scores_changed: boolean;
    state_changed: boolean;
    profile_computed_at: string | null;
  };
}

// ─── Content ────────────────────────────────────────────────────────────────

export interface ExplorerPurposeCoverage {
  purpose: string;
  supported: boolean;
  /** Present only for a declared gap, read from the Governor's own map. */
  declared_gap_reason: string | null;
  kinds: string[];
  pinned_stages: string[] | null;
  free_preview: number;
  full_access: number;
}

export interface ExplorerContentHealth {
  total: number;
  active: number;
  emailable: number;
  purposes: ExplorerPurposeCoverage[];
  /**
   * stage × audience. DO NOT SUM THE CELLS — 23 assets carry both audience
   * tags, so they total 575 against 552 real assets. The totals are `active`
   * and `emailable`. Each cell is correct as "assets a learner in this stage
   * and tier could receive".
   */
  matrix: { stage: string; audience: string; count: number }[];
  decision_gaps: {
    decision_date: string | null;
    gap_count: number;
    named: string[];
  };
}

// ─── Learner drawer ─────────────────────────────────────────────────────────

export interface LearnerProfile {
  enrollment_id: string;
  lead_id: number | null;
  email_normalized: string;
  primary_state: ExplorerPrimaryState | null;
  overlays: ExplorerOverlay[];
  e_score: number | null;
  i_score: number | null;
  f_score: number | null;
  contactability: Record<string, unknown> | null;
  affinities: Record<string, unknown>[];
  signal_summary: Record<string, unknown> | null;
  days_since_last_activity: number | null;
  state_entered_at: string | null;
  last_decision_at: string | null;
  last_contacted_at: string | null;
  scores_computed_at: string | null;
}

export interface ScorePoint {
  as_of_date: string;
  e_score: number;
  i_score: number;
  f_score: number;
  primary_state: ExplorerPrimaryState;
  overlays: ExplorerOverlay[];
}

export interface LearnerSignals {
  enrollment_id: string;
  summary: Record<string, unknown> | null;
  series: ScorePoint[];
  /**
   * Always false, and the UI must SAY so rather than draw an empty chart.
   * The Governor does not write `triggering_signals` — 0 of 612 production rows
   * — so a per-signal timeline does not exist. An empty chart would claim this
   * learner produced no signals, about learners whose scores demonstrably moved.
   */
  per_signal_timeline_available: false;
  timeline_absent_reason: string;
}

export interface LearnerDecisionSummary {
  id: string;
  decision_date: string;
  mode: string;
  selected_action: string | null;
  channel: string | null;
  executed: boolean;
  suppressed_count: number;
  asset_count: number;
  reason: string;
}

export interface LearnerEligibility {
  enrollment_id: string;
  contactability: Record<string, unknown> | null;
  as_of_decision_date: string | null;
  candidates: Record<string, unknown>[];
  suppressed: Record<string, unknown>[];
  /** Set when the learner exists but has never been decided on. */
  note: string | null;
}

// ─── The twelve calls ───────────────────────────────────────────────────────

const BASE = '/api/admin/explorer-growth';

/**
 * Drops undefined so an unset filter is absent rather than sent as the string
 * "undefined" — which the backend's `.strict()` schemas would reject with a 400,
 * turning "no filter" into an error.
 */
function params<T extends object>(q: T): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null && v !== '') out[k] = String(v);
  }
  return out;
}

export async function getSummary(): Promise<ExplorerSummary> {
  const { data } = await api.get<ExplorerSummary>(`${BASE}/summary`);
  return data;
}

export async function getDistribution(days = 30): Promise<ExplorerDistribution> {
  const { data } = await api.get<ExplorerDistribution>(`${BASE}/distribution`, {
    params: params({ days }),
  });
  return data;
}

export async function getLearners(q: LearnersQuery = {}): Promise<ExplorerLearnerPage> {
  const { data } = await api.get<ExplorerLearnerPage>(`${BASE}/learners`, { params: params(q) });
  return data;
}

export async function getLearner(enrollmentId: string): Promise<LearnerProfile> {
  const { data } = await api.get<LearnerProfile>(`${BASE}/learners/${enrollmentId}`);
  return data;
}

export async function getLearnerSignals(enrollmentId: string, days = 90): Promise<LearnerSignals> {
  const { data } = await api.get<LearnerSignals>(`${BASE}/learners/${enrollmentId}/signals`, {
    params: params({ days }),
  });
  return data;
}

export async function getLearnerScores(
  enrollmentId: string,
  days = 90,
): Promise<{ enrollment_id: string; series: ScorePoint[] }> {
  const { data } = await api.get<{ enrollment_id: string; series: ScorePoint[] }>(
    `${BASE}/learners/${enrollmentId}/scores`,
    { params: params({ days }) },
  );
  return data;
}

export async function getLearnerDecisions(
  enrollmentId: string,
  q: { limit?: number; offset?: number } = {},
): Promise<{ rows: LearnerDecisionSummary[]; total: number; limit: number; offset: number }> {
  const { data } = await api.get<{
    rows: LearnerDecisionSummary[];
    total: number;
    limit: number;
    offset: number;
  }>(`${BASE}/learners/${enrollmentId}/decisions`, { params: params(q) });
  return data;
}

export async function getDecisions(q: DecisionsQuery = {}): Promise<ExplorerDecisionPage> {
  const { data } = await api.get<ExplorerDecisionPage>(`${BASE}/decisions`, { params: params(q) });
  return data;
}

/** The Why drilldown. Keyed on the DECISION id, not the learner's. */
export async function getWhy(decisionId: string): Promise<ExplorerWhy> {
  const { data } = await api.get<ExplorerWhy>(`${BASE}/decisions/${decisionId}`);
  return data;
}

export async function getShadow(
  q: { date?: string; limit?: number; offset?: number } = {},
): Promise<ExplorerDecisionPage> {
  const { data } = await api.get<ExplorerDecisionPage>(`${BASE}/shadow`, { params: params(q) });
  return data;
}

export async function getContentHealth(
  q: { date?: string; limit?: number; offset?: number } = {},
): Promise<ExplorerContentHealth> {
  const { data } = await api.get<ExplorerContentHealth>(`${BASE}/content`, { params: params(q) });
  return data;
}

export async function getEligibility(enrollmentId: string): Promise<LearnerEligibility> {
  const { data } = await api.get<LearnerEligibility>(`${BASE}/eligibility/${enrollmentId}`);
  return data;
}
