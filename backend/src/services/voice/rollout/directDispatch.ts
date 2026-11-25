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
 */
import { authorizeVoiceCall, dispatchAuthorized, type GatewayDeps } from '../gateway/voiceGateway';
import type { VoiceProvider } from '../contracts/providers';
import type { Allocation } from './allocation';
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

export interface LoadedVersion { id: string; profileId: string; brandSlug: string; status: string; agentKey: string; content: unknown }

export interface DirectDispatchDeps {
  /** The emergency and feature switches, destination, consent, opt-out and reservation wiring. */
  gateway: GatewayDeps; // its resolveRoute supplies only the from-number and the caps
  loadVersion: (versionId: string) => Promise<LoadedVersion | null>;
  registeredTools: () => readonly RegisteredTool[];
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
  const refuse = (reason: string, callId?: string): DirectResult => {
    d.log({ level: 'warn', event: 'voice_direct_refused', outcome: 'skipped', error_class: 'DirectRefused', reason, path: r.pathKey, call_id: callId ?? null });
    return { outcome: 'refused', reason, ...(callId ? { callId } : {}) };
  };
  if (r.recipientRef !== `lead:${r.leadId}`) return refuse('recipient_mismatch');

  // The version could have been retired between allocation and here.
  const v = await d.loadVersion(r.allocation.versionId);
  if (!v || v.status !== 'published' || v.brandSlug !== r.brandSlug) return refuse('version_not_published');
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

  const wiring = await d.gateway.resolveRoute({} as never);
  if (!wiring?.fromNumberRef) return refuse('no_from_number');
  const auth = await authorizeVoiceCall({
    contractVersion: 1, tenantId: r.tenantId, brandSlug: r.brandSlug, path: r.pathKey, callType: r.callType, profileId: v.profileId,
    recipientRef: r.recipientRef, idempotencyKey: r.idempotencyKey, purpose: r.purpose, context: {}, testMode: false,
  }, { ...d.gateway, mode: 'direct', resolveRoute: async () => ({ routeId: r.allocation.routeId, profileVersionId: v.id, engine: r.allocation.engine, fromNumberRef: wiring.fromNumberRef, maxDurationSeconds: content.max_call_seconds, caps: wiring.caps }) });
  if (auth.outcome === 'blocked') return refuse(auth.reason);
  if (auth.replay) return refuse('already_dispatched');
  const callId = auth.dispatch.callId;
  if (!(await d.insertCall({ callId, engine: r.allocation.engine, routeId: r.allocation.routeId, versionId: v.id }))) return refuse('already_dispatched');

  try {
    pinSession(callId, { profile: { versionId: v.id, greeting: rendered.greeting, system: rendered.system, language: content.language }, tools: policy.allowed, agentKey: v.agentKey, held: policy.held });
  } catch (e) {
    await d.gateway.transition(auth.reservationId, 'expire');
    await d.recordOutcome(callId, 'blocked', (e as Error).name);
    return refuse('session_store_full', callId);
  }
  const result = await dispatchAuthorized(auth, provider, d.gateway);
  const errorClass = result.outcome === 'accepted' ? undefined : 'errorClass' in result ? result.errorClass : result.reason;
  await d.recordOutcome(callId, result.outcome, errorClass);
  d.log({ level: result.outcome === 'accepted' ? 'info' : 'warn', event: 'voice_direct_dispatched', outcome: result.outcome, engine: r.allocation.engine, call_id: callId, error_class: errorClass });
  if (result.outcome === 'accepted') return { outcome: 'accepted', callId };
  if (result.outcome === 'unknown') return { outcome: 'unknown', callId }; // the session stays pinned: the phone may still ring
  unpinSession(callId);
  return refuse(errorClass ?? result.outcome, callId);
}
