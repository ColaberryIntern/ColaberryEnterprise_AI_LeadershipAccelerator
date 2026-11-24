/**
 * triggerVoiceCall -> Voice Gateway bridge (VS1.6). Runs a legacy Synthflow call through the gateway's
 * policy and ATOMIC reservation when VOICE_GATEWAY_LEGACY_ENABLED=true, and maps the result back to the
 * exact { success, data: { skipped, reason } | call data, error } shape every existing caller reads.
 * With the flag off (the default) this module is never called and triggerVoiceCall is unchanged.
 *
 * What changes when the flag is on: the count-then-record voiceDialGuard is replaced by the gateway's
 * transactional reservation, so concurrent dials can no longer race past the 2/24h cap; a timeout is
 * recorded as an ambiguous reservation instead of a forgotten one.
 *
 * What deliberately does NOT change yet (directive: preserve response semantics until each consumer is
 * migrated): consent and suppression stay owned by each caller, exactly as today (INVENTORY F-02). The
 * facade therefore reports consent 'granted' (or 'staff_internal' for our alert phones) with the
 * provenance 'legacy_caller_owned' in its log. Moving each caller's consent into the gateway is per-route
 * work in Phase 3 and Phase 5, tracked in MIGRATION_MATRIX.md.
 *
 * Known limit: while the flag is on, dials are counted in voice_dial_reservations, not voice_dial_log.
 * Turning the flag back off within 24 h lets the legacy guard under-count those dials for the rest of
 * that window (it never over-dials beyond what the reservations admitted before the switch).
 */
import { randomUUID } from 'crypto';
import { env } from '../../../config/env';
import { isKillSwitchActiveStrict } from '../../launchSafety';
import { isStaffAlertNumber } from '../voiceDialGuard';
import { isVoicePathAllowed } from '../voiceCallPaths';
import { loadVoiceConfig } from '../voiceConfig';
import { authorizeVoiceCall, dispatchAuthorized, GatewayDeps } from './voiceGateway';
import { reserveDial, transitionReservation } from './voiceReservation';
import { createSynthflowLegacyProvider, extractSynthflowCallId } from '../providers/synthflowLegacyProvider';

/** Same validated source as synthflowService and the boot log (VS1.7): invalid voice config = off. */
export function isLegacyGatewayEnabled(): boolean {
  return loadVoiceConfig().VOICE_GATEWAY_LEGACY_ENABLED;
}

/** The single tenant today's legacy calls belong to, until tenant provisioning (VS6.1) maps real ones. */
export const LEGACY_TENANT_ID = '00000000-0000-4000-8000-00000000c01a';

/** Gateway block reasons expressed in the reason vocabulary existing callers already understand. */
export const LEGACY_REASON: Record<string, string> = {
  destination_cap: 'number_dialed_recently',
  outside_call_hours: 'outside_call_hours',
  kill_switch_active: 'kill_switch_active',
  kill_switch_unreadable: 'kill_switch_active',
  feature_disabled: 'feature_disabled',
  path_not_allowed: 'path_not_allowed',
  invalid_destination: 'invalid_phone',
  reservation_unavailable: 'dial_guard_unavailable',
  reservation_not_dispatchable: 'dial_guard_unavailable',
};

export interface LegacyFacadeInput {
  pathKey: string;
  callType: string;
  brandSlug?: string;
  phoneE164: string;
  apiKey: string;
  requestBody: Record<string, unknown>;
}
export interface LegacyFacadeResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  status?: number;
  rawBody?: string;
  /** For synthflowService's failure event: set when Synthflow answered non-2xx or the request did not complete. */
  failure?: { status?: number; message: string };
}

export function legacyGatewayDeps(phoneE164: string, overrides: Partial<GatewayDeps> = {}): GatewayDeps {
  return {
    mode: 'legacy',
    now: () => new Date(),
    killSwitch: isKillSwitchActiveStrict,
    voiceEnabled: () => env.enableVoiceCalls,
    pathAllowed: (p) => isVoicePathAllowed(p),
    resolveDestination: async () => ({ e164: phoneE164, timezone: null }),
    exemptionFor: async (e164) => ((await isStaffAlertNumber(e164)) ? 'staff' : null),
    consentFor: async () => ((await isStaffAlertNumber(phoneE164)) ? 'staff_internal' : 'granted'),
    suppressedFor: async () => false,
    resolveRoute: async () => ({ routeId: null, profileVersionId: 'legacy-synthflow', engine: 'synthflow_legacy', fromNumberRef: 'synthflow-agent', maxDurationSeconds: 3600 }),
    reserve: reserveDial,
    transition: transitionReservation,
    log: (e) => console.log(JSON.stringify({ level: 'info', service: 'voice-gateway', consent_provenance: 'legacy_caller_owned', ...e })),
    ...overrides,
  };
}

export async function dispatchLegacyViaGateway(input: LegacyFacadeInput, depsOverride: Partial<GatewayDeps> = {}, fetchImpl?: typeof fetch): Promise<LegacyFacadeResult> {
  const deps = legacyGatewayDeps(input.phoneE164, depsOverride);
  const auth = await authorizeVoiceCall({
    contractVersion: 1, tenantId: LEGACY_TENANT_ID, brandSlug: input.brandSlug || 'colaberry', path: input.pathKey || '(none)',
    callType: input.callType, profileId: 'legacy-synthflow', recipientRef: `legacy-dial:${input.callType}`,
    idempotencyKey: `legacy:${randomUUID()}`, purpose: `legacy ${input.callType}`, context: {}, testMode: false,
  }, deps);
  if (auth.outcome === 'blocked') {
    return { success: true, data: { skipped: true, reason: LEGACY_REASON[auth.reason] ?? auth.reason } };
  }

  const provider = createSynthflowLegacyProvider(input.apiKey, input.requestBody, fetchImpl);
  const result = await dispatchAuthorized(auth, provider, deps);
  if (result.outcome === 'blocked') {
    return { success: true, data: { skipped: true, reason: LEGACY_REASON[result.reason] ?? result.reason } };
  }
  const resp = provider.lastResponse;
  if (result.outcome === 'accepted') {
    const d = resp?.data ?? {};
    return { success: true, data: { ...d, call_id: extractSynthflowCallId(d) } };
  }
  if (result.outcome === 'refused') {
    const raw = resp?.raw ?? '';
    return { success: false, error: `Synthflow HTTP ${resp?.status}: ${raw.slice(0, 500)}`, status: resp?.status, rawBody: raw.slice(0, 2000),
      failure: { status: resp?.status, message: raw } };
  }
  const message = resp?.errorMessage ?? result.detail;
  return { success: false, error: message, failure: { message } };
}
