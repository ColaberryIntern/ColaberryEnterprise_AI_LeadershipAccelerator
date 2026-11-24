import { dispatchLegacyViaGateway, LEGACY_REASON } from '../legacyFacade';
import type { GatewayDeps } from '../voiceGateway';
import type { ReserveInput } from '../voiceReservation';

jest.mock('../../../launchSafety', () => ({ isKillSwitchActiveStrict: jest.fn(async () => false) }));
jest.mock('../../voiceDialGuard', () => ({ isStaffAlertNumber: jest.fn(async () => false) }));

const PHONE = '+15555550123';
const input = { pathKey: 'agent-tool', callType: 'callback', brandSlug: 'agent-tool', phoneE164: PHONE, apiKey: 'test-key', requestBody: { model_id: 'agent-x', phone: 'ignored', name: 'Test' } };
const RES = '11111111-1111-4111-8111-111111111111';

function harness(over: Partial<GatewayDeps> = {}) {
  const transitions: string[] = [];
  const deps: Partial<GatewayDeps> = {
    now: () => new Date('2026-11-24T18:00:00.000Z'), // noon Central
    voiceEnabled: () => true, pathAllowed: () => true,
    reserve: jest.fn(async (_i: ReserveInput) => ({ outcome: 'reserved' as const, reservationId: RES, replay: false })),
    transition: (async (_id: string, name: string) => { transitions.push(name); return true; }) as GatewayDeps['transition'],
    log: () => undefined,
    ...over,
  };
  return { deps, transitions };
}
const okFetch = (body: unknown, status = 200) => jest.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('legacy facade: triggerVoiceCall shapes through the gateway', () => {
  it('accepted: returns the legacy success shape with call_id, reservation accepted (happy path)', async () => {
    const { deps, transitions } = harness();
    const f = okFetch({ status: 'ok', call_id: 'sf-123' });
    const r = await dispatchLegacyViaGateway(input, deps, f);
    expect(r).toEqual({ success: true, data: { status: 'ok', call_id: 'sf-123' } });
    expect(transitions).toEqual(['markDispatching', 'markAccepted']);
  });

  it('dials the gateway-authorized number, not whatever the body carried', async () => {
    const { deps } = harness();
    const f = okFetch({ call_id: 'sf-1' });
    await dispatchLegacyViaGateway(input, deps, f);
    const body = JSON.parse(String((f as unknown as jest.Mock).mock.calls[0][1].body));
    expect(body.phone).toBe(PHONE);
    expect(body.model_id).toBe('agent-x');
  });

  it('HTTP 500: legacy failure shape, reservation released (Synthflow created no call)', async () => {
    const { deps, transitions } = harness();
    const r = await dispatchLegacyViaGateway(input, deps, okFetch({ error: 'bad' }, 500));
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/^Synthflow HTTP 500: /);
    expect(r.status).toBe(500);
    expect(r.failure?.status).toBe(500);
    expect(transitions).toEqual(['markDispatching', 'markRefused']);
  });

  it('network throw: legacy failure shape, reservation AMBIGUOUS (never released, never retried)', async () => {
    const { deps, transitions } = harness();
    const f = jest.fn(async () => { throw new TypeError('socket hang up'); }) as unknown as typeof fetch;
    const r = await dispatchLegacyViaGateway(input, deps, f);
    expect(r).toMatchObject({ success: false, error: 'socket hang up' });
    expect(transitions).toEqual(['markDispatching', 'markAmbiguous']);
    expect((f as unknown as jest.Mock)).toHaveBeenCalledTimes(1);
  });

  it('cap reached: skipped with the legacy reason name callers already handle', async () => {
    const { deps } = harness({ reserve: async () => ({ outcome: 'denied', reason: 'destination_cap', detail: '2 in 24h' }) });
    const f = okFetch({});
    expect(await dispatchLegacyViaGateway(input, deps, f)).toEqual({ success: true, data: { skipped: true, reason: 'number_dialed_recently' } });
    expect(f as unknown as jest.Mock).not.toHaveBeenCalled();
  });

  it('kill switch on: skipped kill_switch_active, no dial', async () => {
    const { deps } = harness({ killSwitch: async () => true });
    const f = okFetch({});
    expect(await dispatchLegacyViaGateway(input, deps, f)).toEqual({ success: true, data: { skipped: true, reason: 'kill_switch_active' } });
    expect(f as unknown as jest.Mock).not.toHaveBeenCalled();
  });

  it('outside Central call hours: skipped outside_call_hours, exactly as voiceDialGuard reported it', async () => {
    const { deps } = harness({ now: () => new Date('2026-11-24T05:00:00.000Z') });
    expect(await dispatchLegacyViaGateway(input, deps, okFetch({}))).toEqual({ success: true, data: { skipped: true, reason: 'outside_call_hours' } });
  });

  it('staff alert numbers dial after hours and reserve against the staff budget', async () => {
    const reserve = jest.fn(async (_i: ReserveInput) => ({ outcome: 'reserved' as const, reservationId: RES, replay: false }));
    const { deps } = harness({ now: () => new Date('2026-11-24T05:00:00.000Z'), exemptionFor: async () => 'staff', consentFor: async () => 'staff_internal', reserve });
    const r = await dispatchLegacyViaGateway(input, deps, okFetch({ call_id: 'sf-9' }));
    expect(r.success).toBe(true);
    expect(reserve.mock.calls[0]?.[0].caps.perDestination24h).toBe(48);
  });

  it('a reservation DB failure maps to the legacy dial_guard_unavailable reason (fail closed)', async () => {
    const { deps } = harness({ reserve: async () => ({ outcome: 'denied', reason: 'reservation_unavailable', detail: 'Error' }) });
    expect(await dispatchLegacyViaGateway(input, deps, okFetch({}))).toEqual({ success: true, data: { skipped: true, reason: 'dial_guard_unavailable' } });
  });

  it('every gateway block reason that has a legacy equivalent is mapped (boundary)', () => {
    for (const k of ['destination_cap', 'outside_call_hours', 'kill_switch_active', 'reservation_unavailable']) expect(LEGACY_REASON[k]).toBeTruthy();
  });

  it('never logs the destination number', async () => {
    const logs: unknown[] = [];
    const { deps } = harness({ log: (e) => logs.push(e), reserve: async () => ({ outcome: 'denied', reason: 'destination_cap' }) });
    await dispatchLegacyViaGateway(input, deps, okFetch({}));
    expect(JSON.stringify(logs)).not.toContain('5555550123');
  });
});
