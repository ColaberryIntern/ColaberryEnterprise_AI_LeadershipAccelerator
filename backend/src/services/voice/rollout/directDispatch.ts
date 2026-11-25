/**
 * Direct dispatch (VS4.5): place one real call on a direct engine, through every gate. NOTHING CALLS THIS
 * YET: connecting a dialing path is the owner's M3 decision.
 *
 *   allocation (done by the caller) -> load the published version and check it again -> render the call ->
 *   gateway (kill switch, hours, consent, opt-out, caps, atomic reservation) -> write the call row ->
 *   pin the session -> carrier -> record the outcome.
 *
 * One provider, no retry, no fallback dial: if anything after the reservation is unclear the call is
 * `dispatch_unknown` and stays that way until voice:reconcile. The row is written BEFORE the carrier is
 * asked, because webhooks and single-use tokens need it; a second attempt with the same key stops there.
 * Right before the row is written the claim is confirmed against the route: a rollback in between means no dial.
 * Every exit that dialed nothing gives back its reservation and its claim.
 */
import { authorizeVoiceCall, dispatchAuthorized, type GatewayDeps } from '../gateway/voiceGateway';
import type { VoiceProvider } from '../contracts/providers';
import type { Allocation } from './allocation';
import { subjectRefFrom } from '../../identity/identifierPrecedence';
import { renderCall, VersionContentSchema, type VersionContent } from '../profiles/versionContent';
import { effectiveVoiceTools } from '../profiles/voiceToolPolicy';
import type { RegisteredTool } from '../engines/toolBroker';
import { pinSession, unpinSession } from './callSessions';

export interface DirectCallRequest {
  allocation: Extract<Allocation, { provider: 'direct' }>;
  tenantId: string; brandSlug: string; pathKey: string; callType: string; purpose: string;
  leadId: number;
  /** "lead:<id>": the reference the allocation was made for. */
  recipientRef: string;
  idempotencyKey: string;
  prompt?: string;
  variables?: Record<string, string>;
}

export interface LoadedVersion { id: string; tenantId: string; profileId: string; brandSlug: string; status: string; agentKey: string; content: unknown }

export interface DirectDispatchDeps {
  /** The emergency and feature switches, destination, consent, opt-out and reservation wiring. */
  gateway: GatewayDeps; // its resolveRoute supplies only the from-number and the caps
  loadVersion: (versionId: string) => Promise<LoadedVersion | null>;
  registeredTools: () => readonly RegisteredTool[];
  /** VS4.5: right before dialing, does the route still permit this claim? Throws count as no. */
  confirm: (claimId: string) => Promise<boolean>;
  /** Nothing was dialed. reserved = the key's reservation exists, so the key is finished. */
  releaseClaim: (claimId: string, reserved: boolean) => Promise<void>;
  /** false = this logical call already has a row: stop. */
  insertCall: (row: { callId: string; engine: string; routeId: string; versionId: string }) => Promise<boolean>;
  recordOutcome: (callId: string, outcome: string, errorClass: string | undefined) => Promise<void>;
  provider: (engine: 'conversation_relay' | 'openai_realtime') => VoiceProvider | { error: string };
  log: (line: Record<string, unknown>) => void;
}

export type DirectResult =
  | { outcome: 'accepted'; callId: string }
  | { outcome: 'refused'; reason: string; callId?: string }
  | { outcome: 'unknown'; callId: string };

export async function dispatchDirect(r: DirectCallRequest, d: DirectDispatchDeps): Promise<DirectResult> {
  const claimId = r.allocation.claimId;
  let reservationId: string | null = null;
  /** Every exit that dialed nothing: give back what it holds, then say why. A failure to give back is logged, never thrown. */
  const refuse = async (reason: string, callId?: string): Promise<DirectResult> => {
    const safe = async (what: string, f: () => Promise<unknown>) => { try { await f(); } catch (e) { d.log({ level: 'error', event: 'voice_direct_release_failed', outcome: 'failure', error_class: (e as Error).name || 'DatabaseError', what, call_id: callId ?? null }); } };
    const held = reservationId;
    if (held) await safe('reservation', () => d.gateway.transition(held, 'expire'));
    if (claimId && reason !== 'already_dispatched') await safe('claim', () => d.releaseClaim(claimId, held !== null));
    if (callId) await safe('call', () => d.recordOutcome(callId, 'blocked', reason));
    d.log({ level: 'warn', event: 'voice_direct_refused', outcome: 'skipped', error_class: 'DirectRefused', reason, path: r.pathKey, call_id: callId ?? null });
    return { outcome: 'refused', reason, ...(callId ? { callId } : {}) };
  };
  if (!claimId) return refuse('not_claimed');
  if (r.recipientRef !== subjectRefFrom({ leadId: r.leadId })) return refuse('recipient_mismatch');

  // The version could have been retired between allocation and here.
  let v: LoadedVersion | null;
  let wiring: Awaited<ReturnType<GatewayDeps['resolveRoute']>>;
  try {
    v = await d.loadVersion(r.allocation.versionId);
    wiring = await d.gateway.resolveRoute({} as never);
  } catch (e) {
    d.log({ level: 'error', event: 'voice_direct_facts_failed', outcome: 'failure', error_class: (e as Error).name || 'DatabaseError' });
    return refuse('fact_unavailable');
  }
  if (!v || v.status !== 'published' || v.brandSlug !== r.brandSlug || v.tenantId !== r.tenantId) return refuse('version_not_published');
  const parsed = VersionContentSchema.safeParse(v.content);
  if (!parsed.success) return refuse('version_content_invalid');
  const content: VersionContent = parsed.data;
  if (content.engine !== r.allocation.engine) return refuse('engine_mismatch');
  if (content.engine === 'openai_realtime') return refuse('engine_b_test_only'); // it cannot hear an opt-out yet
  const rendered = renderCall(content, { prompt: r.prompt, variables: r.variables });
  if (!rendered.ok) return refuse(rendered.reason);
  const provider = d.provider(r.allocation.engine);
  if ('error' in provider) return refuse('provider_unavailable');
  const policy = effectiveVoiceTools({ agentKey: v.agentKey, brandSlug: v.brandSlug, versionPermissions: content.tool_permissions, registered: d.registeredTools() });

  if (!wiring?.fromNumberRef) return refuse('no_from_number');
  const line = wiring;
  const version = v;
  let auth: Awaited<ReturnType<typeof authorizeVoiceCall>>;
  try {
    auth = await authorizeVoiceCall({
    contractVersion: 1, tenantId: r.tenantId, brandSlug: r.brandSlug, path: r.pathKey, callType: r.callType, profileId: v.profileId,
    recipientRef: r.recipientRef, idempotencyKey: r.idempotencyKey, purpose: r.purpose, context: {}, testMode: false,
  }, { ...d.gateway, mode: 'direct', resolveRoute: async () => ({ routeId: r.allocation.routeId, profileVersionId: version.id, engine: r.allocation.engine, fromNumberRef: line.fromNumberRef, maxDurationSeconds: content.max_call_seconds, caps: line.caps }) });
  } catch (e) {
    d.log({ level: 'error', event: 'voice_direct_authorize_failed', outcome: 'failure', error_class: (e as Error).name || 'GatewayError' });
    return refuse('not_authorized');
  }
  if (auth.outcome === 'blocked') return refuse(auth.reason);
  if (auth.replay) return refuse('already_dispatched');
  reservationId = auth.reservationId;
  const callId = auth.dispatch.callId;

  let confirmed = false;
  try { confirmed = await d.confirm(claimId); } catch (e) { d.log({ level: 'error', event: 'voice_direct_confirm_failed', outcome: 'failure', error_class: (e as Error).name || 'DatabaseError' }); }
  if (!confirmed) return refuse('route_changed');
  try {
    if (!(await d.insertCall({ callId, engine: r.allocation.engine, routeId: r.allocation.routeId, versionId: v.id }))) return refuse('call_row_exists');
  } catch (e) {
    d.log({ level: 'error', event: 'voice_direct_insert_failed', outcome: 'failure', error_class: (e as Error).name || 'DatabaseError', call_id: callId });
    return refuse('call_row_failed');
  }
  try {
    pinSession(callId, { profile: { versionId: v.id, greeting: rendered.greeting, system: rendered.system, language: content.language }, tools: policy.allowed, agentKey: v.agentKey, held: policy.held });
  } catch {
    return refuse('session_store_full', callId); // the store logs nothing about a person
  }

  // From here the phone may ring. Nothing below may throw: an error is not "not dialed".
  let result: Awaited<ReturnType<typeof dispatchAuthorized>>;
  try {
    result = await dispatchAuthorized(auth, provider, d.gateway);
  } catch (e) {
    result = { outcome: 'unknown', callId, errorClass: (e as Error).name || 'DispatchError', detail: 'bookkeeping failed around the dial' };
  }
  const errorClass = result.outcome === 'accepted' ? undefined : 'errorClass' in result ? result.errorClass : result.reason;
  try { await d.recordOutcome(callId, result.outcome, errorClass); } catch (e) {
    d.log({ level: 'error', event: 'voice_direct_record_failed', outcome: 'failure', error_class: (e as Error).name || 'DatabaseError', call_id: callId, dispatch: result.outcome });
    if (result.outcome !== 'accepted') return { outcome: 'unknown', callId }; // our record disagrees with the carrier until reconcile
  }
  d.log({ level: result.outcome === 'accepted' ? 'info' : 'warn', event: 'voice_direct_dispatched', outcome: result.outcome, engine: r.allocation.engine, call_id: callId, error_class: errorClass });
  if (result.outcome === 'accepted') return { outcome: 'accepted', callId };
  if (result.outcome === 'unknown') return { outcome: 'unknown', callId }; // the session stays pinned: the phone may still ring
  unpinSession(callId);
  try { await d.releaseClaim(claimId, true); } catch (e) { d.log({ level: 'error', event: 'voice_direct_release_failed', outcome: 'failure', error_class: (e as Error).name || 'DatabaseError', what: 'claim', call_id: callId }); }
  d.log({ level: 'warn', event: 'voice_direct_refused', outcome: 'skipped', error_class: 'DirectRefused', reason: errorClass ?? result.outcome, path: r.pathKey, call_id: callId });
  return { outcome: 'refused', reason: errorClass ?? result.outcome, callId };
}
