import type {
  ExplorerActionType,
  ExplorerAffinity,
  ExplorerCandidateAction,
  ExplorerContactability,
  ExplorerDecisionMode,
  ExplorerOverlay,
  ExplorerPrimaryState,
  ExplorerSuppressedAction,
} from '../../types/explorerGrowth';

/**
 * The shape of the Why drilldown's response.
 *
 * Split out of `explorerWhyService.ts` because that file reached 321 lines and
 * this plan's own non-negotiable is 300. The types travel with the service and
 * are re-exported from it, so nothing downstream has to know they moved.
 *
 * These interfaces ARE the contract the controller and the Phase B page consume.
 * Changing a field here is a breaking change, not a refactor.
 */

export interface ExplorerWhyOutcome {
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
}

export interface ExplorerWhyScores {
  e_score: number | null;
  i_score: number | null;
  f_score: number | null;
  primary_state: ExplorerPrimaryState | null;
  overlays: ExplorerOverlay[];
}

export interface ExplorerWhyContent {
  assets: Record<string, unknown>[];
  /**
   * The gap AS THE GOVERNOR NAMED IT, e.g.
   * `no_asset_for_purpose:lesson_recommendation:learning`.
   *
   * Read verbatim out of the decision's own `reason`, not derived. The first
   * draft of this service invented a generic sentence from an empty asset list,
   * which was honest but strictly weaker: "no content was resolved" sends a
   * reader looking, while the named form says exactly which purpose and stage
   * combination is empty and is actionable on sight.
   *
   * Verified on production 2026-09-02: 12 of 153 decisions carry an `asset gaps:`
   * segment, and that is the same 12 whose `selected_content_assets` is empty.
   */
  named_gaps: string[];
  /** A sentence for display. The named gap when there is one, derived otherwise. */
  gap: string | null;
}

export interface ExplorerWhyDrift {
  scores_changed: boolean;
  state_changed: boolean;
  /** Null when the profile has no recompute timestamp to compare against. */
  profile_computed_at: string | null;
}

export interface ExplorerWhyFound {
  found: true;
  enrollment_id: string;
  decision_id: string;
  decision_date: string;
  mode: ExplorerDecisionMode;
  ruleset_version: string;
  holdout_group: string | null;
  experiment_key: string | null;
  outcome: ExplorerWhyOutcome;
  /** As at the decision. The basis on which it was actually made. */
  scores_at_decision: ExplorerWhyScores;
  /** Every action considered, winner included. */
  candidates: ExplorerCandidateAction[];
  /** Every action dropped, each with the reason it lost. The point of this payload. */
  suppressed: ExplorerSuppressedAction[];
  triggering_signals: Record<string, unknown>[];
  deferred_actions: Record<string, unknown>[];
  content: ExplorerWhyContent;
  /** From the profile — current, not as at the decision. Labelled accordingly. */
  contactability: ExplorerContactability | null;
  affinities: ExplorerAffinity[];
  scores_now: ExplorerWhyScores | null;
  days_in_state: number | null;
  days_since_last_activity: number | null;
  drift: ExplorerWhyDrift;
}

export interface ExplorerWhyAbsent {
  found: false;
  enrollment_id: string;
  /** The date asked about, or null when the learner has no decisions at all. */
  decision_date: string | null;
  /** A stated absence, never an empty object. */
  reason: string;
  /** Where to look instead, when something exists on another day. */
  nearest_decision_date: string | null;
  learner_exists: boolean;
}

export type ExplorerWhy = ExplorerWhyFound | ExplorerWhyAbsent;
