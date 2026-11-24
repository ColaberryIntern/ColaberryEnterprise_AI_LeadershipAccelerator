/**
 * voice:test:mock engine (VS1.7): one call end to end through the REAL gateway (policy, reservation,
 * dispatch) against the mock provider and an in-memory reservation store. No database, no network.
 *
 * Global fetch is replaced for the duration of the run with a function that refuses and counts, so
 * "zero real calls" is an observed fact of the run, not a promise: networkAttempts is reported and
 * must be 0.
 */
import { authorizeVoiceCall, dispatchAuthorized, GatewayDeps } from './voiceGateway';
import type { ReserveInput, ReserveResult } from './voiceReservation';
import { createMockProvider, MockOutcome } from '../providers/mockProvider';

export interface MockRunReport {
  authorized: boolean;
  blockedReason?: string;
  dispatchOutcome?: string;
  reservationStatus?: string;
  dispatchedCount: number;
  realCalls: 0;
  networkAttempts: number;
}

/** In-memory reservation store with the same counting rule as the database one. */
function memoryReservations() {
  const rows = new Map<string, { key: string; hash: string; status: string }>();
  let seq = 0;
  const reserve = async (i: ReserveInput): Promise<ReserveResult> => {
    for (const [id, r] of rows) if (r.key === i.idempotencyKey) return { outcome: 'reserved', reservationId: id, replay: true };
    const counted = [...rows.values()].filter((r) => r.hash === i.destinationHash && ['held', 'dispatching', 'accepted', 'ambiguous'].includes(r.status)).length;
    if (counted >= i.caps.perDestination24h) return { outcome: 'denied', reason: 'destination_cap' };
    const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
    rows.set(id, { key: i.idempotencyKey, hash: i.destinationHash, status: 'held' });
    return { outcome: 'reserved', reservationId: id, replay: false };
  };
  const next: Record<string, [string[], string]> = {
    markDispatching: [['held'], 'dispatching'], markAccepted: [['dispatching', 'ambiguous'], 'accepted'],
    markRefused: [['dispatching'], 'released'], markAmbiguous: [['dispatching'], 'ambiguous'], expire: [['held'], 'expired'],
  };
  const transition = (async (id: string, name: string) => {
    const r = rows.get(id); const t = next[name];
    if (!r || !t || !t[0].includes(r.status)) return false;
    r.status = t[1]; return true;
  }) as GatewayDeps['transition'];
  return { reserve, transition, statusOf: (id: string) => rows.get(id)?.status };
}

export async function runMockCall(outcome: MockOutcome = 'accepted', timeoutMs = 2000): Promise<MockRunReport> {
  const realFetch = globalThis.fetch;
  let networkAttempts = 0;
  globalThis.fetch = (async () => { networkAttempts += 1; throw new Error('network is forbidden during voice:test:mock'); }) as typeof fetch;
  try {
    const store = memoryReservations();
    const provider = createMockProvider([outcome]);
    const deps: GatewayDeps = {
      mode: 'direct', now: () => new Date('2026-11-24T18:00:00.000Z'), // fixed noon Central, inside every window
      killSwitch: async () => false, voiceEnabled: () => true, pathAllowed: () => true,
      resolveDestination: async () => ({ e164: '+15555550100', timezone: 'America/Chicago' }), // reserved fictional number
      exemptionFor: async () => 'test', consentFor: async () => 'granted', suppressedFor: async () => false,
      resolveRoute: async () => ({ routeId: null, profileVersionId: 'mock-v1', engine: 'conversation_relay', fromNumberRef: 'num:mock', maxDurationSeconds: 180 }),
      reserve: store.reserve, transition: store.transition, log: () => undefined,
    };
    const auth = await authorizeVoiceCall({
      contractVersion: 1, tenantId: 'mock-tenant', brandSlug: 'colaberry', path: 'agent-tool', callType: 'callback', profileId: 'mock',
      recipientRef: 'mock:recipient', idempotencyKey: `mock-run-${Date.now()}`, purpose: 'voice:test:mock', context: {}, testMode: true,
    }, deps);
    if (auth.outcome === 'blocked') return { authorized: false, blockedReason: auth.reason, dispatchedCount: 0, realCalls: 0, networkAttempts };
    const result = await dispatchAuthorized(auth, provider, deps, timeoutMs);
    return {
      authorized: true, dispatchOutcome: result.outcome, reservationStatus: store.statusOf(auth.reservationId),
      dispatchedCount: provider.dispatched.length, realCalls: provider.realCalls, networkAttempts,
    };
  } finally {
    globalThis.fetch = realFetch;
  }
}
