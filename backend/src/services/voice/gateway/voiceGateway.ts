/**
 * Voice Gateway (VS1.5): the ONLY place an AuthorizedDispatch is minted and a provider is dialed.
 *
 *   authorizeVoiceCall: request -> facts -> policy verdict -> atomic reservation -> AuthorizedDispatch
 *   dispatchAuthorized: re-check kill switch -> mark dispatching -> provider.dispatch (bounded by a
 *                       timeout) -> accepted | refused (reservation released) | unknown (reservation
 *                       kept AMBIGUOUS, never released, never retried)
 *
 * Every external fact arrives through injected deps, so the orchestration is unit-tested without a
 * database or a network, and VS1.6 wires the real ones (settings, consent, suppression, Twilio or the
 * legacy Synthflow adapter). Nothing in this module dials by itself.
 *
 * Failure modes handled: unreadable kill switch (blocked), any fact read throwing (blocked with the
 * failing fact named), reservation DB failure (blocked), provider throw before acceptance (refused,
 * reservation released only if the provider says nothing was created), provider timeout (unknown).
 * Not handled here: reconciliation of ambiguous dispatches (VS4.5 voice:reconcile).
 */
import { randomUUID } from 'crypto';
import type { AuthorizedDispatch, DispatchResult, VoiceEngine, VoiceRequest } from '../contracts/schemas';
import { parseContract, VoiceRequestSchema, CONTRACT_VERSION } from '../contracts/schemas';
import type { VoiceProvider } from '../contracts/providers';
import { evaluateVoicePolicy, BlockReason, ConsentStatus, Exemption, PolicyMode } from './voicePolicy';
import { hashDestination } from './destinationHash';
import { DEFAULT_CAPS, ReservationCaps, ReserveInput, ReserveResult, transitionReservation } from './voiceReservation';

export interface ResolvedDestination { e164: string | null; timezone: string | null }
export interface RouteResolution { routeId: string | null; profileVersionId: string; engine: VoiceEngine; fromNumberRef: string; maxDurationSeconds: number; caps?: ReservationCaps }

export interface GatewayDeps {
  mode: PolicyMode;
  now: () => Date;
  killSwitch: () => Promise<boolean>;          // throws when unreadable
  voiceEnabled: () => boolean;
  pathAllowed: (pathKey: string) => boolean;
  resolveDestination: (recipientRef: string) => Promise<ResolvedDestination>;
  exemptionFor: (e164: string) => Promise<Exemption>;
  consentFor: (req: VoiceRequest) => Promise<ConsentStatus>;
  suppressedFor: (req: VoiceRequest, e164: string) => Promise<boolean>;
  resolveRoute: (req: VoiceRequest) => Promise<RouteResolution | null>;
  reserve: (input: ReserveInput) => Promise<ReserveResult>;
  transition: typeof transitionReservation;
  log: (event: Record<string, unknown>) => void;
}

export type AuthorizeResult =
  | { outcome: 'authorized'; dispatch: AuthorizedDispatch; reservationId: string; replay: boolean }
  | { outcome: 'blocked'; reason: BlockReason | 'route_not_configured' | 'fact_unavailable' | ReserveDenied; detail?: string };
type ReserveDenied = Extract<ReserveResult, { outcome: 'denied' }>['reason'];

async function fact<T>(name: string, f: () => Promise<T>): Promise<{ ok: true; v: T } | { ok: false; name: string }> {
  try { return { ok: true, v: await f() }; } catch { return { ok: false, name }; }
}

export async function authorizeVoiceCall(raw: unknown, deps: GatewayDeps): Promise<AuthorizeResult> {
  const req = parseContract(VoiceRequestSchema, 'VoiceRequest', raw);
  let ks: 'on' | 'off' | 'unreadable' = 'unreadable';
  try { ks = (await deps.killSwitch()) ? 'on' : 'off'; } catch { ks = 'unreadable'; }

  const dest = await fact('destination', () => deps.resolveDestination(req.recipientRef));
  if (!dest.ok) return { outcome: 'blocked', reason: 'fact_unavailable', detail: dest.name };
  const e164 = dest.v.e164;
  const exemption = e164 ? await fact('exemption', () => deps.exemptionFor(e164)) : { ok: true as const, v: null };
  const consent = await fact('consent', () => deps.consentFor(req));
  const suppressed = e164 ? await fact('suppression', () => deps.suppressedFor(req, e164)) : { ok: true as const, v: false };

  const verdict = evaluateVoicePolicy({
    mode: deps.mode, killSwitch: ks, voiceEnabled: deps.voiceEnabled(), pathAllowed: deps.pathAllowed(req.path),
    destinationE164: e164, exemption: exemption.ok ? exemption.v : null,
    consent: consent.ok ? consent.v : 'unknown', suppressed: suppressed.ok ? suppressed.v : null,
    recipientTimezone: dest.v.timezone, now: deps.now(),
  });
  if (!verdict.ok) {
    deps.log({ event: 'voice_call_blocked', outcome: 'skipped', reason: verdict.reason, path: req.path, tenant: req.tenantId });
    return { outcome: 'blocked', reason: verdict.reason };
  }

  const route = await fact('route', () => deps.resolveRoute(req));
  if (!route.ok || !route.v) return { outcome: 'blocked', reason: 'route_not_configured' };

  const reservation = await deps.reserve({
    tenantId: req.tenantId, idempotencyKey: req.idempotencyKey, destinationHash: hashDestination(e164 as string),
    destinationE164: e164 as string, routeId: route.v.routeId, purpose: req.purpose, caps: route.v.caps ?? DEFAULT_CAPS,
  });
  if (reservation.outcome === 'denied') {
    deps.log({ event: 'voice_call_blocked', outcome: 'skipped', reason: reservation.reason, path: req.path, tenant: req.tenantId });
    return { outcome: 'blocked', reason: reservation.reason, detail: reservation.detail };
  }

  const dispatch: AuthorizedDispatch = {
    contractVersion: CONTRACT_VERSION, callId: randomUUID(), reservationId: reservation.reservationId,
    engine: route.v.engine, routeId: route.v.routeId ?? 'unrouted', profileVersionId: route.v.profileVersionId,
    destinationE164: e164 as string, fromNumberRef: route.v.fromNumberRef, maxDurationSeconds: route.v.maxDurationSeconds,
    testMode: req.testMode, authorizedAt: deps.now().toISOString(),
  };
  return { outcome: 'authorized', dispatch, reservationId: reservation.reservationId, replay: reservation.replay };
}

export const DISPATCH_TIMEOUT_MS = 15_000;

export async function dispatchAuthorized(
  auth: Extract<AuthorizeResult, { outcome: 'authorized' }>, provider: VoiceProvider, deps: GatewayDeps, timeoutMs = DISPATCH_TIMEOUT_MS,
): Promise<DispatchResult | { outcome: 'blocked'; callId: string; reason: 'kill_switch_active' | 'kill_switch_unreadable' | 'reservation_not_dispatchable' }> {
  const callId = auth.dispatch.callId;
  // The switch may have been flipped between authorize and dial: check it again, strictly.
  try {
    if (await deps.killSwitch()) { await deps.transition(auth.reservationId, 'expire'); return { outcome: 'blocked', callId, reason: 'kill_switch_active' }; }
  } catch {
    await deps.transition(auth.reservationId, 'expire');
    return { outcome: 'blocked', callId, reason: 'kill_switch_unreadable' };
  }
  if (!(await deps.transition(auth.reservationId, 'markDispatching', callId))) {
    return { outcome: 'blocked', callId, reason: 'reservation_not_dispatchable' };
  }

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<DispatchResult>((resolve) => {
    timer = setTimeout(() => resolve({ outcome: 'unknown', callId, errorClass: 'TimeoutError', detail: `no provider response in ${timeoutMs} ms` }), timeoutMs);
  });
  let result: DispatchResult;
  try {
    result = await Promise.race([provider.dispatch(auth.dispatch), timeout]);
  } catch (err) {
    // A throw does not prove the carrier created nothing (the request may have been sent): unknown.
    result = { outcome: 'unknown', callId, errorClass: err instanceof Error ? err.constructor.name : 'UnknownError', detail: 'provider threw during dispatch' };
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (result.outcome === 'accepted') await deps.transition(auth.reservationId, 'markAccepted', callId);
  else if (result.outcome === 'refused') await deps.transition(auth.reservationId, 'markRefused', callId);
  else await deps.transition(auth.reservationId, 'markAmbiguous', callId);
  deps.log({ event: 'voice_dispatch', outcome: result.outcome, engine: auth.dispatch.engine, call_id: callId,
    error_class: result.outcome === 'accepted' ? undefined : result.errorClass });
  return result;
}
