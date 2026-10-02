import api from '../utils/api';

/**
 * The nine Growth Journey inspect reads: classifications, decisions, the two `why`
 * views, score snapshots, transitions, shadow runs, and the two content reads
 * (Phase 6, T614).
 *
 * ── WHY A SECOND CLIENT FILE ────────────────────────────────────────────────
 *
 * `growthJourneyApi.ts` is 323 lines and holds the status reads and the handoff
 * moves. Nine payloads' worth of mirrored types would carry it past this repo's
 * 500-line hard ceiling, and the rule is to split before adding rather than after.
 * These nine also share something the others do not: a `rows/total/limit/offset`
 * envelope and a `limit`/`offset` contract, so they are a coherent module rather
 * than an arbitrary half.
 *
 * ── BASE CARRIES `/api`, AND THAT IS NOT INCIDENTAL ─────────────────────────
 *
 * `growthJourneyApi.ts` shipped T613 with `'/admin/growth-journey'`, which nginx
 * does not proxy and which is itself a React route, so every call returned
 * index.html with 200 OK and no test could see it. `healthContract.test.ts` now
 * pins both files' BASE. Do not "simplify" this string.
 *
 * ── TYPES ARE MIRRORED BY HAND, AND THE WIRE IS THE AUTHORITY ───────────────
 *
 * There is no shared-types package. Every field below is copied from the backend
 * source, with the file and line in a comment where the name is not obvious or
 * where the wire disagrees with the column. The three traps that cost T613:
 *
 *   - a DECIMAL arrives as a STRING (`confidence` is `"0.820"`, not `0.82`), and
 *     the list route does not coerce it even though the `why` route does;
 *   - the DB column name is not always the API field name (`journeyHealth.ts:331`
 *     renames `agent_name` to `agent`), so mirror the PAYLOAD, never the model;
 *   - a field that is masked server-side reports that it was masked, via a
 *     companion `*_redacted` boolean. `'unknown'` means the column was empty;
 *     `'redacted'` means it held an `@`. They are different facts and the UI must
 *     not collapse them into "absent".
 *
 * ── WHAT IS DELIBERATELY ABSENT ─────────────────────────────────────────────
 *
 * No `as_of` or `computed_at`: none of the nine returns one. The honesty marker on
 * these tabs is therefore the echoed envelope - `total`, `limit`, `offset`, `scope`
 * and (for shadow runs) `window_days` - which the SERVER sent, rather than a
 * client-side clock pretending to be server freshness.
 *
 * No write functions. These are reads; the only journey writes are the three
 * handoff moves in the other file, and nothing here sends anything.
 */

const BASE = '/api/admin/growth-journey';

/**
 * Query string from a sparse bag, skipping `undefined`/`''` so an untouched filter
 * is absent rather than sent empty. Copied in shape from `explorerGrowthApi.ts`'s
 * `params(q)`, which is the precedent on this surface; `growthJourneyApi.ts` has
 * none because none of its seven routes takes a parameter.
 *
 * Why it matters here: several of these endpoints answer a malformed value with a
 * 400 rather than an empty list, so sending `status=''` is a visible error, not a
 * no-op.
 */
export function params<T extends object>(q: T): string {
  const sp = new URLSearchParams();
  // Generic over the object rather than typed `Record<string, …>`: TypeScript gives
  // a type ALIAS an implicit index signature but not an INTERFACE, so every one of
  // the nine query interfaces below was rejected by a `Record` parameter. Widening
  // here keeps the nine call-site types precise, which is where the precision is
  // worth having - the alternative was nine type aliases and a looser contract.
  (Object.entries(q) as [string, string | number | undefined][]).forEach(([k, v]) => {
    if (v === undefined || v === '') return;
    sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** Every one of the nine echoes the page it actually served. */
export interface JourneyPage {
  total: number;
  limit: number;
  offset: number;
}

/**
 * The scope the server resolved, which is NOT always the scope requested.
 * `program_id` is hardcoded `null` on every read except `/decisions/transitions`,
 * and `brand_id` is hardcoded `null` on `/shadow/runs` - so a UI that echoes these
 * is reporting what was applied, not what was asked for.
 */
export interface JourneyScope {
  tenant_id: string;
  brand_id: string | null;
  program_id: string | null;
}

export interface JourneyPagedQuery {
  tenant_id?: string;
  brand_id?: string;
  limit?: number;
  offset?: number;
}

// ─── classifications (T605) ──────────────────────────────────────────────────

/** `status` is the echoed filter, and `'all'` is one of its values. */
export type ClassificationStatus = 'proposed' | 'needs_review' | 'confirmed' | 'rejected' | 'all';

export interface ClassificationRow {
  id: string;
  tenant_id: string;
  brand_id: string;
  subject_ref: string;
  lead_id: number | null;
  enrollment_id: string | null;
  trigger: string;
  input_hash: string;
  brand_relationship: string | null;
  journey_program_slug: string | null;
  primary_path: string | null;
  secondary_paths: string[];
  /** Free text, echoed whole with no allow-list. Mask before rendering. */
  intent: string | null;
  /** DECIMAL(4,3): arrives as `"0.820"`. The list route does NOT coerce it. */
  confidence: string | number | null;
  /** Free text, echoed whole. Mask before rendering. */
  evidence: string[];
  source_step: number;
  requires_human_review: boolean;
  status: string;
  locked: boolean;
  /** JSONB echoed whole. Mask before rendering. */
  eligibility: Record<string, unknown> | null;
  referral_target_brand_id: string | null;
  ai_involved: boolean;
  model_version: string | null;
  ruleset_version: string;
  override_of: string | null;
  /**
   * May hold an admin id OR an email: the controller falls back to
   * `req.admin.email`. This is the one field on this row most likely to carry an
   * address, and it is not masked server-side.
   */
  decided_by: string | null;
  idempotency_key: string;
  /** This table has `createdAt` only - there is no `updated_at` to render. */
  created_at: string;
}

export interface ClassificationsResponse extends JourneyPage {
  rows: ClassificationRow[];
  status: ClassificationStatus;
}

export const listClassifications = (
  q: JourneyPagedQuery & { status?: ClassificationStatus } = {},
): Promise<ClassificationsResponse> =>
  api.get<ClassificationsResponse>(`${BASE}/classifications${params(q)}`).then((r) => r.data);

// ─── decisions (T605) ────────────────────────────────────────────────────────

export type DecisionMode = 'shadow' | 'live' | 'all';

export interface DecisionRow {
  id: string;
  tenant_id: string;
  brand_id: string;
  program_id: string | null;
  subject_ref: string;
  classification_id: string | null;
  trigger: string;
  /** DATEONLY: `"2026-09-27"`, not an ISO instant. */
  decision_date: string;
  mode: 'shadow' | 'live';
  selected_action: string | null;
  selected_path: string | null;
  selected_channel: string | null;
  state_at_decision: string | null;
  /** Free text, projected deliberately. Mask before rendering. */
  reason: string;
  requires_human_review: boolean;
  ai_involved: boolean;
  model_version: string | null;
  ruleset_version: string;
  executed: boolean;
  decided_by: string;
  created_at: string;
}

export interface DecisionsResponse extends JourneyPage {
  rows: DecisionRow[];
  mode: DecisionMode;
}

export const listDecisions = (
  q: JourneyPagedQuery & { mode?: DecisionMode; subject_ref?: string } = {},
): Promise<DecisionsResponse> =>
  api.get<DecisionsResponse>(`${BASE}/decisions${params(q)}`).then((r) => r.data);

// ─── the two `why` views (T605) ──────────────────────────────────────────────

/**
 * Both `why` routes answer a FLAT object with no envelope, and both 404 when the
 * row is out of scope or absent. The declared-but-unserved `*WhyAbsent` shapes in
 * the backend are not reachable, so there is no `status: 'absent'` branch to model.
 *
 * Typed as an opaque record on purpose. The payload is a nest of free text and
 * JSONB - `answer.reason`, `candidates`, `suppressed`, `deferred_actions`,
 * `eligibility`, `contact_evidence`, `execution.receipt`, `content.selected`,
 * `scores.dimensions[].factors` - all echoed whole. Mirroring it field by field
 * would invite a component to render a field the API did not send, which is the
 * failure this task's M2 mutation is written to catch. The modal walks what it
 * receives instead.
 */
export type JourneyWhy = Record<string, unknown>;

export const getClassificationWhy = (id: string): Promise<JourneyWhy> =>
  api.get<JourneyWhy>(`${BASE}/classifications/${id}/why`).then((r) => r.data);

export const getDecisionWhy = (id: string): Promise<JourneyWhy> =>
  api.get<JourneyWhy>(`${BASE}/decisions/${id}/why`).then((r) => r.data);

// ─── decisions/snapshots (T607) ──────────────────────────────────────────────

export interface SnapshotScores {
  summary: number | null;
  dimensions: { key: string; value: number }[];
  /**
   * Keys whose stored value was NOT a finite number. These are not zeros, and
   * rendering them as 0 would invent a score the model never produced.
   */
  non_numeric_keys: string[];
}

export interface SnapshotRow {
  id: string;
  brand_id: string;
  subject_ref: string;
  /** DATEONLY. */
  as_of_date: string;
  state: string | null;
  scores: SnapshotScores;
  /** Capped at 50 entries server-side, each already through `safeKey`. */
  score_gaps: string[];
  created_at: string;
}

export interface SnapshotsResponse extends JourneyPage {
  rows: SnapshotRow[];
  scope: JourneyScope;
}

export const listSnapshots = (
  q: JourneyPagedQuery & { subject_ref?: string } = {},
): Promise<SnapshotsResponse> =>
  api.get<SnapshotsResponse>(`${BASE}/decisions/snapshots${params(q)}`).then((r) => r.data);

// ─── decisions/transitions (T607) ────────────────────────────────────────────

export interface TransitionRow {
  id: string;
  brand_id: string;
  program_id: string | null;
  subject_ref: string;
  transition_type: string;
  status: string;
  /** Only `from_value.state` is projected; the JSONB itself never leaves. */
  from_state: string | null;
  to_state: string | null;
  /** Through `safeField`: `'redacted'` when it held an `@`, `'unknown'` when empty. */
  reason: string;
  /** True when the column held an `@`. Distinct from an empty column. */
  reason_redacted: boolean;
  requested_by: string;
  requested_by_redacted: boolean;
  created_at: string;
}

export interface TransitionsResponse extends JourneyPage {
  rows: TransitionRow[];
  scope: JourneyScope;
}

/** The ONE read of the nine that accepts and applies `program_id`. */
export const listTransitions = (
  q: JourneyPagedQuery & { program_id?: string; subject_ref?: string } = {},
): Promise<TransitionsResponse> =>
  api.get<TransitionsResponse>(`${BASE}/decisions/transitions${params(q)}`).then((r) => r.data);

// ─── shadow/runs (T608) ──────────────────────────────────────────────────────

export type ShadowResult = 'success' | 'failed' | 'skipped' | 'pending';

export interface ShadowRunRow {
  id: string;
  agent: string;
  result: string;
  duration_ms: number | null;
  /** The only handle on a failure: `reason` and `stack_trace` are never projected. */
  trace_id: string | null;
  started_at: string;
}

export interface ShadowRunsResponse extends JourneyPage {
  rows: ShadowRunRow[];
  /** The window actually applied after clamping, not the one requested. */
  window_days: number;
  /** Always all three registry agents, never narrowed to the filtered one. */
  agents: readonly string[];
  /**
   * Hard-coded `false`: this table holds no per-run detail, and the backend cannot
   * learn otherwise. Render it as "no per-run counts exist", never as a toggle.
   */
  counts_available: boolean;
  scope: JourneyScope;
}

/**
 * No `brand_id`: the schema does not accept one, zod strips it, and the response
 * echoes `scope.brand_id === null`. Offering a brand filter here would be a control
 * that silently does nothing. This is also the only read of the nine that answers
 * real rows to an admin with no brand membership.
 */
export const listShadowRuns = (
  q: { tenant_id?: string; limit?: number; offset?: number; window_days?: number; agent?: string; result?: ShadowResult } = {},
): Promise<ShadowRunsResponse> =>
  api.get<ShadowRunsResponse>(`${BASE}/shadow/runs${params(q)}`).then((r) => r.data);

// ─── content/policies and content/rules (T606) ───────────────────────────────

export interface OfferPolicyRow {
  id: string;
  brand_id: string;
  offer_family: string;
  /** The row's stored value, not a verdict computed for this request. */
  decision: string;
  status: string;
  effective_from: string;
  effective_to: string | null;
  /** Capped at 25 items server-side, each through `safeKey`. */
  approved_landing_pages: string[];
  /** The TRUE length. Greater than the array means the list was cut at 25. */
  approved_landing_pages_total: number;
  /** A count only: the approved copy itself is never returned. */
  claims_count: number;
  ctas_count: number;
  required_approvals: string[];
}

export interface OfferPoliciesResponse extends JourneyPage {
  rows: OfferPolicyRow[];
  scope: JourneyScope;
}

export const listOfferPolicies = (
  q: JourneyPagedQuery & { offer_family?: string; decision?: 'allow' | 'deny'; status?: string } = {},
): Promise<OfferPoliciesResponse> =>
  api.get<OfferPoliciesResponse>(`${BASE}/content/policies${params(q)}`).then((r) => r.data);

export interface ContentRuleRow {
  id: string;
  brand_id: string;
  offer_family: string | null;
  collection_key: string | null;
  asset_id: string | null;
  version: number;
  /** A bare STRING(16) with no CHECK constraint - not a closed enum. */
  approval_status: string;
  /** Through `safeField`, with its own `*_redacted` companion. */
  approved_by: string;
  approved_by_redacted: boolean;
  approved_at: string | null;
  claims_count: number;
  access_tier: string | null;
  effective_from: string | null;
  expires_at: string | null;
}

export interface ContentRulesResponse extends JourneyPage {
  rows: ContentRuleRow[];
  scope: JourneyScope;
}

/** `approval_status` is a free string server-side, so this filter is not an enum. */
export const listContentRules = (
  q: JourneyPagedQuery & { offer_family?: string; approval_status?: string } = {},
): Promise<ContentRulesResponse> =>
  api.get<ContentRulesResponse>(`${BASE}/content/rules${params(q)}`).then((r) => r.data);
