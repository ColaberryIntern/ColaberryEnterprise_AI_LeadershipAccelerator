import api from '../utils/api';

/**
 * The execution controls: the only WRITE surface this frontend has
 * (Phase 6, T615).
 *
 * ── WHAT A WRITE HERE DOES, AND WHY THE CARE ────────────────────────────────
 *
 * A pause lowers a scope to `off`. A rollout RAISES one brand x programme x
 * channel to `review` or `limited` — which is the only thing in this entire
 * frontend capable of moving the system toward sending. Nothing here fires on
 * mount, nothing has a default-submit, and every call is driven by an explicit
 * operator click with a typed reason. The forms that call these are the only
 * components in the Growth Journey surface with a submit handler at all.
 *
 * `ali_outreach` is a PAUSE channel and NOT a rollout channel. That asymmetry is
 * the backend's and it is deliberate: Ali's personal outreach can be stopped from
 * this screen and cannot be started from it. Copying one channel list into the
 * other would quietly hand this UI a power the API refuses, so the two lists are
 * mirrored separately below and a test asserts they differ.
 *
 * ── EVERY BODY IS `.strict()` ───────────────────────────────────────────────
 *
 * `pauseBodySchema`, `rolloutBodySchema` and `clearControlBodySchema` all carry
 * `.strict()`, so ONE extra key is a 400 — not an ignored field.
 *
 * A CORRECTION to what an earlier draft of this comment claimed: `undefined` keys
 * do NOT serialise. `JSON.stringify({a: 1, b: undefined})` is `{"a":1}`, so a stray
 * `cohort_lead_ids: undefined` was never going to reach the server and the stated
 * reason was wrong. What `compact` actually earns its place for is `''` and `[]`,
 * which DO serialise and which `.strict()` plus `.refine` then refuse — an empty
 * cohort array on a review rollout is a present key with a value. The mode branch
 * in `rolloutBody` is the real guard; `compact` is what stops a blank input
 * becoming a sent field.
 *
 * The cross-field rules are the backend's and are mirrored here so the operator
 * sees them before a round trip, never instead of it — the server remains the
 * authority and its 400 is rendered verbatim:
 *
 *   - a pause must name a brand, a programme, a channel or a subject. The
 *     all-wildcard pause is refused, because it would be a second global kill
 *     switch and `system_kill_switch` is the only one.
 *   - a pause with no brand must name the tenant, and is a super-admin write.
 *   - `limited` needs BOTH `cohort_lead_ids` (1-50 existing lead ids) and
 *     `daily_limit` (1-25). `review` carries NEITHER.
 *   - `reason` is required on both, 1-500 chars.
 *   - a clear carries an EMPTY body: the row has no cleared-reason column, so a
 *     body field would be a dead input on a public contract.
 */

const BASE = '/api/admin/growth-journey';

/** Mirrors `PAUSE_CHANNELS`. Includes `ali_outreach`: stoppable from here. */
export const PAUSE_CHANNELS = ['email', 'in_app', 'ali_outreach'] as const;
/** Mirrors `ROLLOUT_CHANNELS`. Excludes `ali_outreach`: NOT startable from here. */
export const ROLLOUT_CHANNELS = ['email', 'in_app'] as const;
export const ROLLOUT_MODES = ['review', 'limited'] as const;
export const COHORT_MAX = 50;
export const DAILY_LIMIT_MAX = 25;

export type PauseChannel = typeof PAUSE_CHANNELS[number];
export type RolloutChannel = typeof ROLLOUT_CHANNELS[number];
export type RolloutMode = typeof ROLLOUT_MODES[number];

export interface PauseInput {
  tenant_id?: string;
  brand_id?: string;
  program_id?: string;
  channel?: PauseChannel;
  /** `lead:<id>` or `enrollment:<id>` only - the backend regex refuses anything else. */
  subject_ref?: string;
  reason: string;
}

export interface RolloutInput {
  brand_id: string;
  program_id: string;
  channel: RolloutChannel;
  mode: RolloutMode;
  cohort_lead_ids?: number[];
  daily_limit?: number;
  reason: string;
}

/**
 * Drops every undefined, empty-string and empty-array key.
 *
 * `undefined` is dropped by `JSON.stringify` anyway; `''` and `[]` are not, and
 * those are exactly what a blank form field produces.
 */
function compact<T extends object>(body: T): Partial<T> {
  const out: Record<string, unknown> = {};
  Object.entries(body).forEach(([k, v]) => {
    if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) return;
    out[k] = v;
  });
  return out as Partial<T>;
}

/**
 * Why this exists rather than trusting the form: a `review` rollout that carries a
 * `daily_limit` is a 400, and the likeliest way to send one is an operator who
 * typed a limit, switched the mode to review, and left the field populated. The
 * mode decides which keys exist, not the form state.
 */
export function rolloutBody(input: RolloutInput): Partial<RolloutInput> {
  const base = {
    brand_id: input.brand_id,
    program_id: input.program_id,
    channel: input.channel,
    mode: input.mode,
    reason: input.reason,
  };
  if (input.mode === 'review') return compact(base);
  return compact({
    ...base,
    cohort_lead_ids: input.cohort_lead_ids,
    daily_limit: input.daily_limit,
  });
}

export const createPause = (input: PauseInput): Promise<{ id: string }> =>
  api.post<{ id: string }>(`${BASE}/execution/pauses`, compact(input)).then((r) => r.data);

export const clearPause = (id: string): Promise<{ id: string }> =>
  api.post<{ id: string }>(`${BASE}/execution/pauses/${id}/clear`, {}).then((r) => r.data);

export const createRollout = (input: RolloutInput): Promise<{ id: string }> =>
  api.post<{ id: string }>(`${BASE}/execution/rollouts`, rolloutBody(input)).then((r) => r.data);

export const clearRollout = (id: string): Promise<{ id: string }> =>
  api.post<{ id: string }>(`${BASE}/execution/rollouts/${id}/clear`, {}).then((r) => r.data);

// ─── the controls read (T518) ────────────────────────────────────────────────

/**
 * A THIRD envelope family on this surface, and worth stating because assuming
 * otherwise is exactly the class of defect this phase keeps producing.
 *
 * The status reads answer a flat object. The nine inspect reads answer
 * `{ rows, total, limit, offset, … }`. This one answers **`{ controls, count }`** -
 * no `rows`, no `limit`, no `offset`, no `scope`. A component written against the
 * inspect envelope renders an empty table here and looks like a working screen on
 * a system with no controls, which is the worst available failure.
 */
export interface ControlRow {
  id: string;
  tenant_id: string;
  kind: 'rollout' | 'pause';
  /** The canonical scope string the backend derives; the UI never builds one. */
  scope_key: string;
  brand_id: string | null;
  program_id: string | null;
  channel: string | null;
  subject_ref: string | null;
  /** A pause is always `off`; a rollout is `review` or `limited`. */
  mode: 'review' | 'limited' | 'off';
  cohort_lead_ids: number[] | null;
  daily_limit: number | null;
  reason: string | null;
  /** The admin's id, never an email: the email goes to the access audit only. */
  set_by_admin_id: string | null;
  /** A `Date` server-side, an ISO string over the wire. */
  created_at: string;
  cleared_at: string | null;
  cleared_by_admin_id: string | null;
}

export interface ControlsResponse {
  controls: ControlRow[];
  count: number;
}

export const listControls = (
  q: { tenant_id?: string; brand_id?: string; include_cleared?: boolean; limit?: number } = {},
): Promise<ControlsResponse> => {
  const sp = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => {
    if (v === undefined || v === '') return;
    sp.set(k, String(v));
  });
  const qs = sp.toString();
  return api.get<ControlsResponse>(`${BASE}/execution/controls${qs ? `?${qs}` : ''}`).then((r) => r.data);
};

/**
 * The server's own refusal, unwrapped for display.
 *
 * TWO DIFFERENT 400 SHAPES reach here and the first draft of this file handled
 * only one:
 *
 *   - a schema failure comes from `badRequest(res, zodError)` as
 *     `{ error: 'Invalid request', details: [{path, message}] }`;
 *   - a business-rule failure comes from `renderWriteFailure` as
 *     `{ error: <message>, error_class, code?, …detail }` with NO `details` array -
 *     this is the all-wildcard pause, a programme outside its brand, a cohort id
 *     that does not exist, and `sms`.
 *
 * A 409 is `{ error, error_class, scope_key }` and means a second active control
 * for that scope - the database's answer, not a fault. So `scope_key` is surfaced,
 * because "which scope already has one" is the only thing the operator needs next.
 *
 * Both 400 messages are rendered verbatim. They state the cross-field rules in an
 * operator's own words, and a screen that paraphrases its API's rules is a screen
 * that will eventually disagree with them.
 */
export interface ControlRefusal {
  status: number;
  error: string;
  /** Empty for a business-rule refusal, which carries its message in `error`. */
  details: { path: string; message: string }[];
  /** Present on a 409: the scope that already holds an active control. */
  scope_key?: string;
  /** Present on some business-rule refusals, e.g. a named validation code. */
  code?: string;
}

export function controlRefusal(err: unknown): ControlRefusal | null {
  const e = err as {
    response?: {
      status?: number;
      data?: { error?: string; details?: unknown; scope_key?: unknown; code?: unknown };
    };
  };
  const status = e?.response?.status;
  if (status !== 400 && status !== 409) return null;
  const data = e.response?.data;
  if (!data?.error) return null;
  const raw = Array.isArray(data.details) ? data.details : [];
  return {
    status,
    error: data.error,
    details: raw
      .filter((d): d is { path: string; message: string } => typeof d === 'object' && d !== null)
      .map((d) => ({ path: String(d.path ?? ''), message: String(d.message ?? '') })),
    ...(typeof data.scope_key === 'string' ? { scope_key: data.scope_key } : {}),
    ...(typeof data.code === 'string' ? { code: data.code } : {}),
  };
}
