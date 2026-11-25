/**
 * Test Lab (VS2.5): start ONE live test call to the authorized number, through the real gateway.
 *
 * Order (each step can only refuse; nothing dials before the last one):
 *   1. parse the request (strict; no phone number accepted anywhere) -> 400
 *   2. inside a short advisory lock (database work only, never network I/O):
 *        count this run's attempts and any test call in flight -> evaluateStart (CI, flags, 3 attempts,
 *        concurrency 1, budget) -> gateway authorize (kill switch, consent, hours, atomic reservation,
 *        TEST_BUDGET_24H) -> insert the voice_calls row (state dispatching, test_mode)
 *   3. outside the lock: exactly one dispatch through the gateway (15 s timeout, no retry; unknown is
 *      reported as unknown and reconciled, never redialed)
 * The destination is resolved from VOICE_TEST_ALLOWED_NUMBER inside the server; responses and logs
 * never contain it.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { isKillSwitchActiveStrict } from '../../launchSafety';
import { authorizeVoiceCall, dispatchAuthorized, type AuthorizeResult, type GatewayDeps } from '../gateway/voiceGateway';
import { productionDirectProvider } from '../gateway/directEngineProvider';
import { reserveDial, transitionReservation } from '../gateway/voiceReservation';
import type { VoiceProvider } from '../contracts/providers';
import { loadVoiceConfig, type VoiceConfig } from '../voiceConfig';
import { TEST_PROFILE } from '../engines/voiceProfiles';
import { evaluateStart, isCi, parseLiveTestRequest, type LiveTestRequest } from './testLabPolicy';

export const TEST_TENANT_ID = '00000000-0000-4000-8000-0000000007e5';
export const TEST_PATH = 'voice_studio_test';
export const TEST_FROM_NUMBER_REF = 'test-line';

export interface TestLabResult { status: number; body: Record<string, unknown> }

export interface TestLabDeps {
  config: () => VoiceConfig;
  ci: () => boolean;
  withLock: <T>(fn: () => Promise<T>) => Promise<T>;
  countAttempts: (runId: string) => Promise<number>;
  countInFlight: () => Promise<number>;
  gatewayDeps: (req: LiveTestRequest, c: VoiceConfig) => GatewayDeps;
  insertCall: (row: { callId: string; engine: string; idempotencyKey: string; purpose: string }) => Promise<void>;
  /** Refused/blocked -> terminal, unknown -> dispatch_unknown, so a failed dial never blocks the next test as "in flight". */
  recordOutcome: (callId: string, outcome: string, errorClass: string | undefined) => Promise<void>;
  provider: (engine: LiveTestRequest['engine']) => VoiceProvider | { error: string };
  authorize: typeof authorizeVoiceCall;
  dispatch: typeof dispatchAuthorized;
  log: (line: Record<string, unknown>) => void;
}

export async function startLiveTest(body: unknown, operatorId: string, d: TestLabDeps): Promise<TestLabResult> {
  const parsed = parseLiveTestRequest(body);
  if (!parsed.ok) return { status: 400, body: { error: 'ValidationError', issues: parsed.issues } };
  const req = parsed.req;
  const c = d.config();
  const idempotencyKey = (n: number) => `testlab:${req.runId}:${n}`;

  type Locked = { refuse: TestLabResult } | { auth: Extract<AuthorizeResult, { outcome: 'authorized' }>; attempt: number; provider: VoiceProvider };
  const locked: Locked = await d.withLock(async (): Promise<Locked> => {
    const verdict = evaluateStart({ ci: d.ci(), config: c, attemptsInRun: await d.countAttempts(req.runId), inFlight: await d.countInFlight() });
    if (!verdict.ok) return { refuse: { status: verdict.status, body: { error: 'TestRefused', reason: verdict.reason } } };
    const provider = d.provider(req.engine);
    if ('error' in provider) return { refuse: { status: 503, body: { error: 'ProviderUnavailable', reason: provider.error } } };
    const auth = await d.authorize({
      contractVersion: 1, tenantId: TEST_TENANT_ID, brandSlug: 'colaberry', path: TEST_PATH, callType: 'test', profileId: TEST_PROFILE.versionId,
      recipientRef: `approved-destination:${req.destinationId}`, idempotencyKey: idempotencyKey(verdict.attemptNumber),
      consentRef: 'owner-authorization-m0-q4', purpose: `test:${req.script}`, context: { runId: req.runId, operator: operatorId }, testMode: true,
    }, d.gatewayDeps(req, c));
    if (auth.outcome !== 'authorized') return { refuse: { status: 403, body: { error: 'TestRefused', reason: auth.reason } } };
    if (auth.replay) return { refuse: { status: 409, body: { error: 'TestRefused', reason: 'duplicate_attempt' } } };
    await d.insertCall({ callId: auth.dispatch.callId, engine: req.engine, idempotencyKey: idempotencyKey(verdict.attemptNumber), purpose: `test:${req.script}` });
    return { auth, attempt: verdict.attemptNumber, provider };
  }).catch((e: Error): Locked => {
    if (e.name !== 'TestLockBusy') throw e;
    return { refuse: { status: 409, body: { error: 'TestRefused', reason: 'test_starting' } } };
  });
  if ('refuse' in locked) {
    d.log({ level: 'warn', event: 'voice_test_refused', outcome: 'skipped', error_class: 'TestRefused', reason: locked.refuse.body.reason, run_id: req.runId, operator: operatorId });
    return locked.refuse;
  }
  const result = await d.dispatch(locked.auth, locked.provider, d.gatewayDeps(req, c));
  const callId = locked.auth.dispatch.callId;
  const errorClass = result.outcome === 'accepted' ? undefined : ('errorClass' in result ? result.errorClass : result.reason);
  await d.recordOutcome(callId, result.outcome, errorClass);
  d.log({ level: result.outcome === 'accepted' ? 'info' : 'warn', event: 'voice_test_dispatched', outcome: result.outcome, run_id: req.runId, attempt: locked.attempt, engine: req.engine, call_id: callId, operator: operatorId,
    error_class: errorClass });
  // blocked at dial time (kill switch flipped after authorize) is a refusal (403); refused by the carrier is upstream (502).
  const status = result.outcome === 'accepted' || result.outcome === 'unknown' ? 202 : result.outcome === 'blocked' ? 403 : 502;
  return { status, body: { callId, attempt: locked.attempt, outcome: result.outcome, ...(result.outcome === 'unknown' ? { note: 'outcome unknown: reconcile before any retry; no automatic retry happens' } : {}) } };
}

/** Production gateway deps for a test call: direct mode, destination resolved server-side only. */
export function testGatewayDeps(req: LiveTestRequest, c: VoiceConfig): GatewayDeps {
  const allowed = c.VOICE_TEST_ALLOWED_NUMBER ?? null;
  return {
    mode: 'direct',
    now: () => new Date(),
    killSwitch: isKillSwitchActiveStrict,
    voiceEnabled: () => c.valid && c.VOICE_TEST_ENABLED,
    pathAllowed: (p) => p === TEST_PATH,
    resolveDestination: async (ref) => ({ e164: ref === `approved-destination:${req.destinationId}` && req.destinationId === 'test-allowed' ? allowed : null, timezone: 'America/Chicago' }),
    exemptionFor: async (e164) => (allowed && e164 === allowed ? 'test' : null),
    consentFor: async () => 'granted', // the owner authorized this number for test calls (M0 Q4); no other destination resolves
    suppressedFor: async () => false,
    resolveRoute: async () => ({ routeId: null, profileVersionId: TEST_PROFILE.versionId, engine: req.engine, fromNumberRef: TEST_FROM_NUMBER_REF, maxDurationSeconds: c.VOICE_TEST_MAX_DURATION_SECONDS,
      caps: { perDestination24h: c.VOICE_TEST_MAX_ATTEMPTS, perRoutePerDay: null, perTenantPerDay: null } }),
    reserve: reserveDial,
    transition: transitionReservation,
    log: (e) => console.log(JSON.stringify({ level: 'info', service: 'voice-gateway', ...e })),
  };
}

const TERMINAL = "('blocked','completed','busy','no_answer','failed','canceled')";

export function productionTestLabDeps(): TestLabDeps {
  return {
    config: () => loadVoiceConfig(),
    ci: () => isCi(),
    withLock: (fn) => sequelize.transaction(async (t) => {
      // Try, do not wait: waiting requests would each hold a pooled connection while this one needs more.
      const [r] = await sequelize.query<{ ok: boolean }>("SELECT pg_try_advisory_xact_lock(hashtext('voice-test-lab')) AS ok", { transaction: t, type: QueryTypes.SELECT });
      if (!r?.ok) throw Object.assign(new Error('another test is starting'), { name: 'TestLockBusy' });
      return fn();
    }),
    countAttempts: async (runId) => {
      const rows = await sequelize.query<{ n: string }>('SELECT COUNT(*)::text AS n FROM voice_calls WHERE tenant_id = :t AND idempotency_key LIKE :k',
        { replacements: { t: TEST_TENANT_ID, k: `testlab:${runId}:%` }, type: QueryTypes.SELECT });
      return Number(rows[0]?.n ?? 0);
    },
    countInFlight: async () => {
      const rows = await sequelize.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM voice_calls WHERE tenant_id = :t AND test_mode = TRUE AND state NOT IN ${TERMINAL} AND created_at > NOW() - INTERVAL '15 minutes'`,
        { replacements: { t: TEST_TENANT_ID }, type: QueryTypes.SELECT });
      return Number(rows[0]?.n ?? 0);
    },
    gatewayDeps: testGatewayDeps,
    insertCall: async (r) => {
      await sequelize.query(
        `INSERT INTO voice_calls (id, tenant_id, engine, idempotency_key, recipient_ref, consent_ref, purpose, state, test_mode)
         VALUES (:callId, :t, :engine, :key, 'approved-destination:test-allowed', 'owner-authorization-m0-q4', :purpose, 'dispatching', TRUE)
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`,
        { replacements: { callId: r.callId, t: TEST_TENANT_ID, engine: r.engine, key: r.idempotencyKey, purpose: r.purpose } });
    },
    recordOutcome: async (callId, outcome, errorClass) => {
      const state = outcome === 'refused' ? 'failed' : outcome === 'blocked' ? 'blocked' : outcome === 'unknown' ? 'dispatch_unknown' : null;
      if (!state) return;
      await sequelize.query("UPDATE voice_calls SET state = :state, error_class = :ec, updated_at = NOW() WHERE id = :callId AND state = 'dispatching'",
        { replacements: { callId, state, ec: errorClass ?? null } });
    },
    provider: productionDirectProvider,
    authorize: authorizeVoiceCall,
    dispatch: dispatchAuthorized,
    log: (line) => (line.level === 'warn' || line.level === 'error' ? console.warn : console.log)(JSON.stringify({ timestamp: new Date().toISOString(), service: 'voice-studio', ...line })),
  };
}
