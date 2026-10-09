import api from '../utils/api';
import { params } from './growthJourneyInspectApi';
import type { JourneyPage, JourneyScope } from './growthJourneyInspectApi';

/**
 * T615's two reads: the ranked handoff queue and the holdout-lift experiments
 * (Phase 6, T615).
 *
 * ── A SPLIT FORCED BY THE CEILING, AND THE RIGHT SEAM ANYWAY ────────────────
 *
 * Adding these two carried `growthJourneyInspectApi.ts` to 503 lines, past this
 * repo's 500-line hard ceiling. The rule is to split BEFORE adding rather than
 * after, so they live here - and the seam is the honest one regardless: that file
 * holds T614's nine inspect reads, these are T615's two, and they share neither an
 * envelope nor a task.
 *
 * `params`, `JourneyPage` and `JourneyScope` are imported rather than copied. A
 * second query-string builder would be a second thing to get wrong, and the whole
 * point of `params` is that a blank filter is omitted rather than sent empty -
 * several of these endpoints answer a malformed value with a 400.
 *
 * ── FOUR ENVELOPE FAMILIES ON ONE SURFACE, AND THESE ADD THE FOURTH ─────────
 *
 * The status reads answer a flat object. The nine inspect reads answer
 * `{ rows, total, limit, offset, scope }`. `/execution/controls` answers
 * `{ controls, count }`. The handoff queue answers `{ rows, total, limit, offset }`
 * plus two echoed filters and NO `scope`; `/experiments` answers
 * `{ brands, window_days, policy_type, conversion_outcomes, scope }` with no paging
 * at all. Nothing generic works across all of them, and pretending otherwise is how
 * a tab renders an empty table on a system that has data.
 */

/**
 * `/api`, not `/admin`. The same string as the two sibling clients, and pinned by
 * `healthContract.test.ts` for the same reason: T613 shipped a page whose BASE
 * lacked this prefix, nginx proxies only `location /api/`, and because
 * `/admin/growth-journey` is also a React route every call came back as index.html
 * with 200 OK. The split that created this file dropped the constant and `tsc`
 * caught it; the contract test is what catches it being wrong rather than missing.
 */
const BASE = '/api/admin/growth-journey';

// ─── the handoff queue (T517) ────────────────────────────────────────────────

/**
 * The ranked queue. Its own envelope again: `rows/total/limit/offset` plus the two
 * echoed filters, and NO `scope` - unlike the five inspect reads and unlike
 * receipts/outcomes. Four envelope families on one surface now.
 */
export interface HandoffQueueRow {
  id: string;
  tenant_id: string;
  brand_id: string;
  program_id: string | null;
  subject_ref: string;
  lead_id: number | null;
  enrollment_id: string | null;
  decision_id: string | null;
  owner_queue: 'admissions' | 'sales' | 'solution_architect' | 'support' | 'ali' | 'human_review';
  assigned_to_type: string | null;
  /** A HUMAN identifier from the tickets actor vocabulary - never an AiAgent id. */
  assigned_to_id: string | null;
  ticket_id: string | null;
  assignment_blocked_reason: string | null;
  priority: 'critical' | 'high' | 'medium' | 'low';
  /** DECIMAL over JSON: the string `"1500.00"`, not a number. Use `decimalText`. */
  expected_value: string | null;
  urgent: boolean;
  /** Free text, the AI's own prose, echoed RAW. On T612's privacy allowlist. */
  reason: string;
  best_channel: string | null;
  consent_basis: string | null;
  sla_due_at: string | null;
  status: 'queued' | 'assigned' | 'accepted' | 'dispositioned' | 'returned_to_ai' | 'expired' | 'cancelled';
  disposition: string | null;
  /** Free text, the human reviewer's prose, echoed RAW. */
  disposition_reason: string | null;
  disposition_at: string | null;
  dispositioned_by: string | null;
  return_to_ai: { program_slug: string; cooldown_until: string; reason: string } | null;
  integration_refused: string | null;
  accepted_at: string | null;
  expired_at: string | null;
  source: 'decision_deferral' | 'human_review' | 'reply_route' | 'manual';
  created_at: string;
  updated_at: string;
}

export interface HandoffQueueResponse extends JourneyPage {
  rows: HandoffQueueRow[];
  status: string;
  owner_queue: string | null;
}

export const listHandoffQueue = (
  q: { brand_id?: string; status?: string; owner_queue?: string; limit?: number; offset?: number } = {},
): Promise<HandoffQueueResponse> =>
  api.get<HandoffQueueResponse>(`${BASE}/handoffs${params(q)}`).then((r) => r.data);

// ─── experiments / holdout lift (T610) ───────────────────────────────────────

/**
 * A measurement that cannot be mistaken for a number.
 *
 * The backend's own comment on this type is the best statement of why it is shaped
 * this way: "`number | null` invites `?? 0` and `|| 1`, which is precisely how a
 * fabricated benchmark gets created." So an unknown lift carries no `point` field
 * AT ALL - there is nothing to accidentally render - and a known one carries its
 * Wilson interval alongside the estimate, because a point estimate without its
 * bounds is a precision claim the data does not support.
 */
export type Measured =
  | { known: true; point: number; low: number; high: number }
  | { known: false; reason: string };

export interface ArmCount {
  /** Distinct subjects in this arm. */
  n: number;
  /** NULL when the arm was not counted at all - not zero conversions. */
  converted: number | null;
  capped: boolean;
}

export interface ArmLift {
  experiment_key: string;
  window_days: number;
  treatment: ArmCount;
  control: ArmCount;
  lift: Measured;
  /** The floor an arm must reach, echoed so a screen can say how far off it is. */
  min_arm_n: number;
  capped: boolean;
  max_arm_decisions: number;
}

/** Why there is nothing to measure, when `status` is not `'active'`. */
export type HoldoutAbsence = 'no_policy' | 'not_active' | 'settings_invalid' | 'lookup_failed';

export interface BrandExperiment {
  brand_id: string;
  status: HoldoutAbsence | 'active';
  policy: { experiment_key: string; control_share: number; candidate_types?: readonly string[] } | null;
  lift: ArmLift | null;
}

export interface ExperimentsResponse {
  brands: BrandExperiment[];
  window_days: number;
  policy_type: string;
  conversion_outcomes: readonly string[];
  scope: JourneyScope;
}

export const listExperiments = (
  q: { brand_id?: string; window_days?: number } = {},
): Promise<ExperimentsResponse> =>
  api.get<ExperimentsResponse>(`${BASE}/experiments${params(q)}`).then((r) => r.data);
