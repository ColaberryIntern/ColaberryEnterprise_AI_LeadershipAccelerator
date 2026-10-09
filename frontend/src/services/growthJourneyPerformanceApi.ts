import api from '../utils/api';

/**
 * The performance reads (Phase 6, T615).
 *
 * ── THREE SEPARATE ENVELOPES, NOT ONE ───────────────────────────────────────
 *
 * `/rates` answers `{ brands, window_days, max_*, scope }` and is UNPAGED.
 * `/receipts` and `/outcomes` answer `{ rows, total, limit, offset, scope }`.
 * `/by-journey` answers `{ journeys, scope }` - `journeys`, not `rows`, with NO
 * total, limit or offset, and no row cap at all. A single generic table component
 * over these four would be wrong on at least two of them.
 *
 * ── A NULL IS NEVER A ZERO, AND IT MEANS FOUR DIFFERENT THINGS ──────────────
 *
 * This is the whole point of the read and the reason the plan's M1 mutation is "a
 * null rate rendered as 0%". The backend's own words: "A rate with nothing in its
 * denominator is `{ value: null, reason: 'no_denominator' }`, never `0`." The four
 * distinct meanings:
 *
 *   `Rate.reason = 'no_denominator'`      nothing to divide by. WHICH denominator
 *                                         differs per field - see `RATE_MEANINGS`.
 *   `MedianHours.reason = 'below_min_samples'`  fewer than 3 samples, so a median
 *                                         would be a number pretending to be a
 *                                         distribution. Covers 0, 1 and 2 samples
 *                                         identically - only `samples` tells them
 *                                         apart.
 *   `BrandRates.reason = 'window_too_large'`    refused rather than truncated, with
 *                                         `capped: true` and the two in-window
 *                                         counts saying how far over.
 *   `JourneyMetricRow.has_leads === false`      the programme is not running yet:
 *                                         every count AND rate is null, including
 *                                         `leads_count`. There is NO reason string
 *                                         here; `has_leads` is the only signal.
 *
 * ── TWO SCALES WITH THE SAME FIELD NAMES ────────────────────────────────────
 *
 * `/rates` returns FRACTIONS (0..1, unrounded). `/by-journey` returns PERCENTAGES
 * (0..100, 2dp). `open_rate` means different things in the two payloads, so the two
 * formatters below are separate on purpose and must not be unified.
 *
 * ── AND `freshness` IS NOT HERE ─────────────────────────────────────────────
 *
 * The plan asks for a freshness badge on every performance value. `MetricFreshness`
 * exists, but only on `/performance/metrics`, which is why that read is included
 * below despite not being in the plan's list: it is the only one that can honour
 * the requirement. For the other three the honest substitute is the per-value
 * `reason`, which this module surfaces rather than hiding behind a dash.
 */

const BASE = '/api/admin/growth-journey/performance';

/** The scope the server applied. `tenant_id` is `''`, not null, for an unscoped caller. */
export interface PerfScope {
  tenant_id: string;
  brand_id: string | null;
  program_id: string | null;
}

// ─── /rates ──────────────────────────────────────────────────────────────────

export interface Rate {
  /** A FRACTION 0..1, unrounded. Null iff `reason` is present. */
  value: number | null;
  numerator: number;
  denominator: number;
  reason?: 'no_denominator';
}

export interface MedianHours {
  value: number | null;
  samples: number;
  reason?: 'below_min_samples';
}

export type OwnerQueue =
  'admissions' | 'sales' | 'solution_architect' | 'support' | 'ali' | 'human_review';

export interface HandoffRates {
  brand_id: string;
  owner_queue: OwnerQueue | 'all';
  window: { from: string; to: string };
  handoffs: number;
  accepted: number;
  verdicts: number;
  acceptance_rate: Rate;
  expiry_rate: Rate;
  connection_rate: Rate;
  meeting_rate: Rate;
  qualification_rate: Rate;
  proposal_rate: Rate;
  conversion_rate: Rate;
  false_positive_handoff_rate: Rate;
  time_to_accept_hours: MedianHours;
  time_to_disposition_hours: MedianHours;
  time_to_first_connection_hours: MedianHours;
}

export interface BrandRates {
  brand_id: string;
  /** Null IFF `capped` - the window was refused, not computed and truncated. */
  rates: { all: HandoffRates; by_queue: Partial<Record<OwnerQueue, HandoffRates>> } | null;
  capped: boolean;
  handoffs_in_window: number;
  outcomes_in_window: number;
  reason?: 'window_too_large';
}

export interface RatesResponse {
  brands: BrandRates[];
  window_days: number;
  max_handoffs_per_brand: number;
  max_outcomes_per_brand: number;
  scope: PerfScope;
}

/**
 * What each `no_denominator` actually means, per field.
 *
 * Without this the UI can only say "no denominator", which tells an operator
 * nothing. The denominators genuinely differ, and the difference is the useful part:
 * "nothing was accepted" and "no human has ruled on anything" are different states
 * of the same queue and lead to different next actions.
 */
export const RATE_MEANINGS: Record<string, string> = {
  acceptance_rate: 'no handoff was created in this window',
  expiry_rate: 'no handoff was created in this window',
  connection_rate: 'nothing was accepted, so there was nothing to connect with',
  meeting_rate: 'nothing was accepted, so no meeting could follow',
  qualification_rate: 'no human has ruled on anything yet',
  conversion_rate: 'no human has ruled on anything yet',
  false_positive_handoff_rate: 'no human has ruled on anything yet',
  proposal_rate: 'nothing reached qualified or converted',
};

/**
 * `program_id` is deliberately NOT a parameter.
 *
 * The handler echoes `scope.program_id` but `readRates` never applies it - a
 * phantom filter. The sibling outcomes handler's own comment names this as the
 * thing to avoid: "echoing back the programme the caller asked for labels
 * brand-wide rows with a filter that was never applied, which is a wrong answer
 * rather than a missing feature". So this client cannot send one, and the tab does
 * not render `scope.program_id` from this read.
 */
export const getRates = (
  q: { tenant_id?: string; brand_id?: string; window_days?: number } = {},
): Promise<RatesResponse> => {
  const sp = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => { if (v !== undefined && v !== '') sp.set(k, String(v)); });
  const s = sp.toString();
  return api.get<RatesResponse>(`${BASE}/rates${s ? `?${s}` : ''}`).then((r) => r.data);
};

// ─── /receipts ───────────────────────────────────────────────────────────────

export interface ReceiptRow {
  id: string;
  brand_id: string;
  program_id: string | null;
  channel: string;
  action_type: string;
  status: string;
  /**
   * NON-NULLABLE on the wire even though the column is nullable, because
   * `safeField` turns a NULL into the literal string `'unknown'`. Three magic
   * values: `'unknown'` (absent), `'redacted'` (held an `@`, with the companion
   * flag true), or the real text truncated to 120 chars. `null` is never one of
   * them, so a null-check here would never fire.
   */
  status_reason: string;
  status_reason_redacted: boolean;
  campaign_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReceiptsResponse {
  rows: ReceiptRow[];
  total: number;
  limit: number;
  offset: number;
  scope: PerfScope;
}

export const getReceipts = (
  q: { brand_id?: string; program_id?: string; status?: string; channel?: string; limit?: number; offset?: number } = {},
): Promise<ReceiptsResponse> => {
  const sp = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => { if (v !== undefined && v !== '') sp.set(k, String(v)); });
  const s = sp.toString();
  return api.get<ReceiptsResponse>(`${BASE}/receipts${s ? `?${s}` : ''}`).then((r) => r.data);
};

// ─── /outcomes ───────────────────────────────────────────────────────────────

export interface OutcomeRow {
  id: string;
  brand_id: string;
  /** A pointer, never an address. */
  subject_ref: string;
  outcome_type: string;
  source: string;
  occurred_at: string;
  handoff_id: string | null;
  decision_id: string | null;
}

export interface OutcomesResponse {
  rows: OutcomeRow[];
  total: number;
  limit: number;
  offset: number;
  /** `program_id` is ALWAYS literal null here: the table has no such column. */
  scope: PerfScope;
}

export const getOutcomes = (
  q: { brand_id?: string; outcome_type?: string; source?: string; limit?: number; offset?: number } = {},
): Promise<OutcomesResponse> => {
  const sp = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => { if (v !== undefined && v !== '') sp.set(k, String(v)); });
  const s = sp.toString();
  return api.get<OutcomesResponse>(`${BASE}/outcomes${s ? `?${s}` : ''}`).then((r) => r.data);
};

// ─── /by-journey ─────────────────────────────────────────────────────────────

export interface JourneyMetricRow {
  brand_id: string;
  program_slug: string;
  program_name: string;
  program_status: string;
  path_slug: string | null;
  /** THE discriminator: false means the programme is not running, and every figure below is null. */
  has_leads: boolean;
  leads_count: number | null;
  /** A byte-identical duplicate of `leads_count` server-side - never render both as independent. */
  classified_count: number | null;
  campaigns_count: number | null;
  emails_sent: number | null;
  opens_count: number | null;
  clicks_count: number | null;
  replies_count: number | null;
  meetings_count: number | null;
  enrollments_count: number | null;
  /** PERCENTAGES 0..100, 2dp - a different scale from `/rates`. */
  open_rate: number | null;
  click_rate: number | null;
  reply_rate: number | null;
  conversion_rate: number | null;
}

export interface ByJourneyResponse {
  journeys: JourneyMetricRow[];
  scope: PerfScope & { start: string | null; end: string | null };
}

export const getByJourney = (
  q: { brand_id?: string; start?: string; end?: string } = {},
): Promise<ByJourneyResponse> => {
  const sp = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => { if (v !== undefined && v !== '') sp.set(k, String(v)); });
  const s = sp.toString();
  return api.get<ByJourneyResponse>(`${BASE}/by-journey${s ? `?${s}` : ''}`).then((r) => r.data);
};

// ─── /metrics - the only read that carries freshness ─────────────────────────

export interface MetricFreshness {
  verdict: 'fresh' | 'stale' | 'never';
  /** Null only on `never`. */
  age_hours: number | null;
  /** A human sentence, not an enum - always says which timestamp was used. */
  reason: string;
  source: string;
  max_age_hours: number;
}

export interface ServedMetric {
  key: string;
  value: number | null;
  freshness: MetricFreshness;
}

export interface MetricsResponse {
  metrics: ServedMetric[];
  computed_at: string;
  scope: PerfScope;
}

export const getMetrics = (
  q: { brand_id?: string; program_id?: string } = {},
): Promise<MetricsResponse> => {
  const sp = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => { if (v !== undefined && v !== '') sp.set(k, String(v)); });
  const s = sp.toString();
  return api.get<MetricsResponse>(`${BASE}/metrics${s ? `?${s}` : ''}`).then((r) => r.data);
};

// ─── the two formatters, deliberately not unified ────────────────────────────

/**
 * A `/rates` FRACTION as a percentage string, or an em dash.
 *
 * Multiplies by 100 because this read returns 0..1. `percentValue` below does not,
 * because `/by-journey` already returns 0..100. Two functions rather than one with
 * a scale flag: a flag is a thing a caller gets wrong, and the two reads use the
 * same field names, so a wrong flag produces a plausible number rather than an
 * error.
 */
export function fractionPct(rate: Rate | undefined): string {
  if (!rate || rate.value === null) return '—';
  return `${(rate.value * 100).toFixed(1)}%`;
}

/** Why a `/rates` value is absent, in an operator's terms. */
export function rateAbsentReason(rate: Rate | undefined, field: string): string | null {
  if (!rate || rate.value !== null) return null;
  return RATE_MEANINGS[field] ?? 'nothing to divide by';
}

/** A `/by-journey` percentage, which is ALREADY 0..100 and must not be multiplied. */
export function percentValue(value: number | null): string {
  if (value === null) return '—';
  return `${value.toFixed(1)}%`;
}
