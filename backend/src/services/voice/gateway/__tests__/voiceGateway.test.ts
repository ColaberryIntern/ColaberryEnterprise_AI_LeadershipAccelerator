import { authorizeVoiceCall, dispatchAuthorized, GatewayDeps } from '../voiceGateway';
import { hashDestination } from '../destinationHash';
import type { ReserveInput } from '../voiceReservation';
import type { VoiceProvider } from '../../contracts/providers';
import type { DispatchResult } from '../../contracts/schemas';
import { ContractViolation } from '../../contracts/schemas';

jest.mock('../../../../config/env', () => {
  const actual = jest.requireActual('../../../../config/env');
  return { env: { ...actual.env, jwtSecret: 'test-secret' } };
});

const request = {
  contractVersion: 1, tenantId: 'colaberry', brandSlug: 'colaberry', path: 'agent-tool', callType: 'callback',
  profileId: 'cory-outbound', recipientRef: 'lead:4821', idempotencyKey: 'callback:lead:4821:2026-11-24',
  purpose: 'callback requested', context: {}, testMode: true,
};

function deps(over: Partial<GatewayDeps> = {}) {
  const transitions: Array<[string, string]> = [];
  const logs: Record<string, unknown>[] = [];
  const d: GatewayDeps = {
    mode: 'direct', now: () => new Date('2026-11-24T18:00:00.000Z'),
    killSwitch: async () => false, voiceEnabled: () => true, pathAllowed: () => true,
    resolveDestination: async () => ({ e164: '+15555550123', timezone: 'America/Chicago' }),
    exemptionFor: async () => null, consentFor: async () => 'granted', suppressedFor: async () => false,
    resolveRoute: async () => ({ routeId: null, profileVersionId: 'v1', engine: 'conversation_relay', fromNumberRef: 'num:idle-1', maxDurationSeconds: 180 }),
    reserve: async () => ({ outcome: 'reserved', reservationId: '11111111-1111-4111-8111-111111111111', replay: false }),
    transition: (async (id: string, name: string) => { transitions.push([id, name]); return true; }) as GatewayDeps['transition'],
    log: (e) => logs.push(e),
    ...over,
  };
  return { d, transitions, logs };
}
const provider = (dispatch: VoiceProvider['dispatch']): VoiceProvider => ({
  engine: 'conversation_relay', dispatch, cancel: async () => undefined,
  getStatus: async () => { throw new Error('n/a'); }, normalizeEvent: async () => [], health: async () => ({ provider: 'x', ok: true, checkedAt: new Date().toISOString() }),
});

describe('authorizeVoiceCall', () => {
  it('authorizes and mints a valid AuthorizedDispatch (happy path)', async () => {
    const { d } = deps();
    const r = await authorizeVoiceCall(request, d);
    expect(r.outcome).toBe('authorized');
    if (r.outcome === 'authorized') {
      expect(r.dispatch.destinationE164).toBe('+15555550123');
      expect(r.dispatch.reservationId).toBe('11111111-1111-4111-8111-111111111111');
    }
  });

  it('rejects a malformed request with ContractViolation before reading anything', async () => {
    const { d } = deps({ resolveDestination: jest.fn() });
    await expect(authorizeVoiceCall({ ...request, recipientRef: '+15555550123' }, d)).rejects.toThrow(ContractViolation);
    expect(d.resolveDestination).not.toHaveBeenCalled();
  });

  it('an unreadable kill switch blocks (fail closed)', async () => {
    const { d } = deps({ killSwitch: async () => { throw new Error('db down'); } });
    expect(await authorizeVoiceCall(request, d)).toEqual({ outcome: 'blocked', reason: 'kill_switch_unreadable' });
  });

  it('a consent read that throws blocks as consent_unknown; suppression that throws blocks as suppression_unknown', async () => {
    expect(await authorizeVoiceCall(request, deps({ consentFor: async () => { throw new Error('x'); } }).d)).toEqual({ outcome: 'blocked', reason: 'consent_unknown' });
    expect(await authorizeVoiceCall(request, deps({ suppressedFor: async () => { throw new Error('x'); } }).d)).toEqual({ outcome: 'blocked', reason: 'suppression_unknown' });
  });

  it('a destination lookup that throws blocks with the failing fact named', async () => {
    expect(await authorizeVoiceCall(request, deps({ resolveDestination: async () => { throw new Error('x'); } }).d))
      .toEqual({ outcome: 'blocked', reason: 'fact_unavailable', detail: 'destination' });
  });

  it('never reserves when policy blocks', async () => {
    const reserve = jest.fn();
    await authorizeVoiceCall(request, deps({ pathAllowed: () => false, reserve }).d);
    expect(reserve).not.toHaveBeenCalled();
  });

  it('a reservation denial blocks with its reason; an unconfigured route blocks', async () => {
    expect(await authorizeVoiceCall(request, deps({ reserve: async () => ({ outcome: 'denied', reason: 'destination_cap', detail: '2 in 24h' }) }).d))
      .toEqual({ outcome: 'blocked', reason: 'destination_cap', detail: '2 in 24h' });
    expect(await authorizeVoiceCall(request, deps({ resolveRoute: async () => null }).d)).toEqual({ outcome: 'blocked', reason: 'route_not_configured' });
  });

  it('reserves by a keyed hash, never by the raw number in the hash field', async () => {
    const reserve = jest.fn(async (_input: ReserveInput) => ({ outcome: 'reserved' as const, reservationId: '11111111-1111-4111-8111-111111111111', replay: false }));
    await authorizeVoiceCall(request, deps({ reserve }).d);
    const input = reserve.mock.calls[0]?.[0];
    if (!input) throw new Error('reserve was not called');
    expect(input.destinationHash).toBe(hashDestination('+15555550123', 'voice-destination:test-secret'));
    expect(input.destinationHash).not.toContain('5555550123');
  });

  it('a kill-switch reader that returns undefined is treated as unreadable, not off', async () => {
    const { d } = deps({ killSwitch: (async () => undefined) as unknown as GatewayDeps['killSwitch'] });
    expect(await authorizeVoiceCall(request, d)).toEqual({ outcome: 'blocked', reason: 'kill_switch_unreadable' });
  });

  it('a staff destination whose consent read throws is BLOCKED (no blanket staff exemption)', async () => {
    const { d } = deps({ exemptionFor: async () => 'staff', consentFor: async () => { throw new Error('x'); } });
    expect(await authorizeVoiceCall(request, d)).toEqual({ outcome: 'blocked', reason: 'consent_unknown' });
  });

  it.each([
    ['staff', 48], ['test', 3], [null, 2],
  ] as const)('exemption %s reserves against a finite per-destination budget of %s', async (exemption, budget) => {
    const reserve = jest.fn(async (_input: ReserveInput) => ({ outcome: 'reserved' as const, reservationId: '11111111-1111-4111-8111-111111111111', replay: false }));
    await authorizeVoiceCall(request, deps({ exemptionFor: async () => exemption, consentFor: async () => (exemption === 'staff' ? 'staff_internal' : 'granted'), reserve }).d);
    expect(reserve.mock.calls[0]?.[0].caps.perDestination24h).toBe(budget);
  });

  it('logs blocks without the destination number', async () => {
    const { d, logs } = deps({ consentFor: async () => 'missing' });
    await authorizeVoiceCall(request, d);
    expect(JSON.stringify(logs)).not.toContain('5555550123');
  });
});

describe('dispatchAuthorized', () => {
  async function authorized(d: GatewayDeps) {
    const r = await authorizeVoiceCall(request, d);
    if (r.outcome !== 'authorized') throw new Error('expected authorized');
    return r;
  }

  it('accepted: reservation goes dispatching then accepted', async () => {
    const { d, transitions } = deps();
    const auth = await authorized(d);
    const r = await dispatchAuthorized(auth, provider(async (x) => ({ outcome: 'accepted', callId: x.callId, providerCallId: 'CAxxxx0001', acceptedAt: new Date().toISOString() })), d);
    expect(r.outcome).toBe('accepted');
    expect(transitions.map((t) => t[1])).toEqual(['markDispatching', 'markAccepted']);
  });

  it('refused before acceptance: reservation is released', async () => {
    const { d, transitions } = deps();
    const auth = await authorized(d);
    await dispatchAuthorized(auth, provider(async (x) => ({ outcome: 'refused', callId: x.callId, errorClass: 'CallerIdRejected', retryable: false, detail: '32204' })), d);
    expect(transitions.map((t) => t[1])).toEqual(['markDispatching', 'markRefused']);
  });

  it('timeout: outcome unknown, reservation marked AMBIGUOUS (never released)', async () => {
    const { d, transitions } = deps();
    const auth = await authorized(d);
    const r = await dispatchAuthorized(auth, provider(() => new Promise<DispatchResult>(() => undefined)), d, 20);
    expect(r).toMatchObject({ outcome: 'unknown', errorClass: 'TimeoutError' });
    expect(transitions.map((t) => t[1])).toEqual(['markDispatching', 'markAmbiguous']);
  });

  it('a provider throw is treated as unknown (the request may have reached the carrier)', async () => {
    const { d, transitions } = deps();
    const auth = await authorized(d);
    const r = await dispatchAuthorized(auth, provider(async () => { throw new TypeError('socket hang up'); }), d);
    expect(r).toMatchObject({ outcome: 'unknown', errorClass: 'TypeError' });
    expect(transitions.map((t) => t[1])).toContain('markAmbiguous');
  });

  it('kill switch flipped between authorize and dial: no dial, reservation expired', async () => {
    let on = false;
    const { d, transitions } = deps({ killSwitch: async () => on });
    const auth = await authorized(d);
    on = true;
    const dispatch = jest.fn();
    const r = await dispatchAuthorized(auth, provider(dispatch), d);
    expect(r).toMatchObject({ outcome: 'blocked', reason: 'kill_switch_active' });
    expect(dispatch).not.toHaveBeenCalled();
    expect(transitions.map((t) => t[1])).toEqual(['expire']);
  });

  it('a reservation that cannot move to dispatching (expired lease, or already used) does not dial (idempotency)', async () => {
    const { d } = deps({ transition: (async () => false) as GatewayDeps['transition'] });
    const auth = await authorized(d);
    const dispatch = jest.fn();
    expect(await dispatchAuthorized(auth, provider(dispatch), d)).toMatchObject({ outcome: 'blocked', reason: 'reservation_not_dispatchable' });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
