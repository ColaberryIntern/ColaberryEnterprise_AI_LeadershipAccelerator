import api from '../utils/api';

/**
 * The two Maya admin screens' API client: the go-live console and the outbound review queue.
 *
 * A deliberate field-for-field mirror of `routes/admin/mayaGoLiveRoutes.ts` and
 * `routes/admin/mayaOutboundRoutes.ts`, the same convention `agentEffectiveAccessApi.ts` and
 * `workforceOrgChartApi.ts` use and for the same reason: a frontend module cannot import a
 * backend type.
 *
 * ## Two things this client deliberately cannot do
 *
 * 1. **It cannot name an approver.** `approveOutbound` takes an id and an optional note. The
 *    server reads who decided off the verified session, so there is no parameter for it here -
 *    not an unused one, not an optional one. The defect this whole queue exists to prevent was a
 *    caller writing `decided_by` itself.
 * 2. **It cannot decide more than one message per call.** There is no `approveAll`, no array
 *    overload, and `mayaConsoleApi.test.ts` asserts that by reading this file. The review page
 *    has no bulk control because this client has nothing to call.
 */

export type MayaMode = 'off' | 'shadow' | 'review' | 'live';
/** The three a person can set. `off` is not one: it is a refusal or the kill switch, not a dial. */
export type MayaPromotionState = 'shadow' | 'review' | 'live';

export interface MayaCapabilityRow {
  capability: string;
  mode: MayaMode;
  reason: string;
  /** Refused BY NAME: there is no dial, so there is nothing to set. SMS, voice, campaigns. */
  refused: boolean;
  /** null for a refused capability, which has no shipped default because it has no dial. */
  default_state: MayaPromotionState | null;
  /** null means nobody has set it and the default is in force. Not the same as 'shadow'. */
  stored_state: MayaPromotionState | null;
  tools: string[];
}

export interface MayaToolRow {
  tool: string;
  belts: string[];
  capability: string;
  effect_class: string;
  /** Compiled into the backend. A grant of an unregistered name would change nothing. */
  registered: boolean;
  /** Present in `ai_agents.tools_granted`. */
  granted: boolean;
}

export interface MayaGrantRequestRow {
  id: string;
  title: string;
  status: string;
  requested_at: string | null;
  requested_by_identity: string;
  tool_name: string;
  capability_id: string;
  needed_by: string;
}

export interface MayaAgentRow {
  id: string;
  agent_name: string;
  enabled: boolean;
  status: string;
  autonomy_level: string | null;
  tools_granted: string[];
}

export interface MayaGoLiveReport {
  /** null when her `ai_agents` row is missing, which the console has to be able to say. */
  agent: MayaAgentRow | null;
  /** `unreadable` is its own state: the mode resolver fails CLOSED, so it is not `clear`. */
  kill_switch: 'active' | 'clear' | 'unreadable';
  capabilities: MayaCapabilityRow[];
  tools: MayaToolRow[];
  grant_requests: MayaGrantRequestRow[];
  outbound: { pending: number };
}

export interface MayaOutboundSummary {
  id: string;
  /** Opaque, e.g. `lead:<uuid>`. Never an email address. */
  recipient_ref: string;
  /** Already masked by the server; there is no unmasked form in any response. */
  recipient_masked: string;
  recipient_display: string | null;
  channel: string;
  subject: string | null;
  /** One line, tags stripped, 280 characters. The full bytes come from `getOutboundMessage`. */
  body_preview: string;
  composed_by: string;
  capability: string;
  correlation_id: string;
  status: string;
  created_at: string;
  expires_at: string;
}

export interface MayaOutboundDetail extends MayaOutboundSummary {
  /** The exact bytes that would leave. Unmasked on purpose: this is the thing being approved. */
  body: string;
  body_hash: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  delivered_at: string | null;
  failure_reason: string | null;
  /** OH1o: an Explorer Growth email's brain snapshot (what the brain passed), when it has one. */
  explorer_snapshot?: import('./explorerGrowthApi').BrainSnapshot;
}

export interface MayaOutboundDecision {
  ok: boolean;
  id: string;
  status: string;
}

export function mayaErrorMessage(e: unknown, fallback: string): string {
  const r = e as { response?: { data?: { error?: string } } };
  return r?.response?.data?.error || fallback;
}

export async function getMayaGoLive(): Promise<MayaGoLiveReport> {
  const res = await api.get<MayaGoLiveReport>('/api/admin/maya/golive');
  return res.data;
}

/**
 * Turns her agent row on or off. Enabling is refused with a 403 for anybody but Ali or a
 * super_admin; disabling is open to any admin, because silencing her must never wait on one
 * person. Both answers carry a sentence worth showing verbatim.
 */
export async function setMayaEnabled(
  enabled: boolean, reviewNote: string,
): Promise<{ agent_id: string; enabled: boolean; changed: boolean }> {
  const res = await api.post<{ agent_id: string; enabled: boolean; changed: boolean }>(
    '/api/admin/maya/enable', { enabled, review_note: reviewNote },
  );
  return res.data;
}

/** Moves one capability's dial. Widening is Ali's; narrowing is any admin's. */
export async function setMayaCapabilityState(
  capability: string, state: MayaPromotionState, reviewNote: string,
): Promise<{ capability: string; state: MayaPromotionState; changed: boolean }> {
  const res = await api.post<{ capability: string; state: MayaPromotionState; changed: boolean }>(
    `/api/admin/maya/capabilities/${encodeURIComponent(capability)}/state`,
    { state, review_note: reviewNote },
  );
  return res.data;
}

export async function listOutboundQueue(limit?: number): Promise<{ pending: MayaOutboundSummary[]; count: number }> {
  const res = await api.get<{ pending: MayaOutboundSummary[]; count: number }>(
    '/api/admin/maya/outbound', limit ? { params: { limit } } : undefined,
  );
  return res.data;
}

/** One message, with the bytes. The list does not carry them, so reviewing means fetching one. */
export async function getOutboundMessage(id: string): Promise<MayaOutboundDetail> {
  const res = await api.get<MayaOutboundDetail>(`/api/admin/maya/outbound/${id}`);
  return res.data;
}

/**
 * Approve ONE message and send it. No approver parameter by design: the server reads the decider
 * off the verified session.
 */
export async function approveOutboundMessage(id: string, note?: string): Promise<MayaOutboundDecision> {
  const res = await api.post<MayaOutboundDecision>(
    `/api/admin/maya/outbound/${id}/approve`, note ? { decision_note: note } : {},
  );
  return res.data;
}

/** Reject ONE message. The note is required: a rejection records why. */
export async function rejectOutboundMessage(id: string, note: string): Promise<MayaOutboundDecision> {
  const res = await api.post<MayaOutboundDecision>(
    `/api/admin/maya/outbound/${id}/reject`, { decision_note: note },
  );
  return res.data;
}
