import type { GrowthJourneyHandoffSource, GrowthJourneyOwnerQueue } from '../../../models/GrowthJourneyHandoff';
import type { JourneyProgramKind } from '../../../models/JourneyProgram';
import type { LifecycleSourceCounts } from '../decision/lifecycleInputs';

/**
 * The shapes the handoff writer works over (Phase 4 T404).
 *
 * `DecisionRowView` is the persisted `growth_journey_decisions` row AS PLAIN
 * DATA. The writer never imports the decision model: it legitimately updates
 * the mutable handoff row, and the append-only guard fails any growthJourney
 * file that names an append-only model and carries an update call. The
 * decision writer hands the view over after `persistDecision`; the reply hook
 * and the routing action pass `null` (no decision behind them).
 */
export interface DecisionRowView {
  id: string;
  tenant_id: string;
  brand_id: string;
  program_id: string | null;
  subject_ref: string;
  lead_id: number | null;
  enrollment_id: string | null;
  classification_id: string | null;
  decision_date: string;
  selected_action: string | null;
  selected_path: string | null;
  state_at_decision: string | null;
  overlays_at_decision: string[];
  scores: Record<string, unknown> | null;
  score_gaps: string[];
  contact_evidence: Record<string, unknown> | null;
  human_conversation: string;
  sales_capacity: string;
  deferred_actions: unknown[];
  requires_human_review: boolean;
  reason: string;
  ruleset_version: string;
  created_at: Date;
}

/** One thing the pipeline or a human asked for: the reason a handoff exists. */
export interface HandoffTrigger {
  source: GrowthJourneyHandoffSource;
  owner_queue: GrowthJourneyOwnerQueue;
  reason: string;
  urgent_hint?: boolean;
  /** What made this trigger THIS time (a provider message id, a rule firing) - the idempotency key for a trigger with no decision behind it. */
  event_ref?: string;
}

/** Ids of the subject's world, never addresses. */
export interface SubjectRefs {
  tenant_id: string;
  brand_id: string;
  brand_slug: string;
  program: { id: string; slug: string; kind: JourneyProgramKind } | null;
  subject_ref: string;
  lead_id: number | null;
  enrollment_id: string | null;
  /** A family the BRAND may offer, or null - never a family its policy refuses (T414). */
  path: string | null;
  /** `<family>:<gate reason>` when the classification named a family the brand's policy refused. */
  path_refused?: string | null;
}

/** What the loaders read from the existing records, counts and ids only. */
export interface StoredSignals {
  lead: {
    pipeline_stage: string | null;
    industry: string | null;
    employee_count: string | number | null;
    annual_revenue: string | number | null;
    has_company: boolean;
  } | null;
  context: {
    organization_id: string | null;
    first_source_id: string | null;
    first_entry_point_id: string | null;
    first_campaign_id: string | null;
    first_touch_at: Date | null;
  } | null;
  counts: LifecycleSourceCounts | null;
  contacts: {
    by_channel: Record<string, { outbound: number; inbound: number; last_outbound_at: Date | null; last_inbound_at: Date | null }>;
    total_outbound: number;
    total_inbound: number;
  };
  /** An explicit request signal inside the urgency window (§11): a meeting booked, a call answered, a proposal stage. */
  explicit_request: { present: boolean; reasons: string[] };
  sla_hours: number | null;
}
