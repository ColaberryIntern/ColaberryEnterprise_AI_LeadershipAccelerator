jest.mock('../sendState', () => ({ sendStateStore: {} }));
jest.mock('../channelAlerts', () => ({ raiseChannelAlert: jest.fn() }));
jest.mock('../whatsappConnection', () => ({ requireConnection: jest.fn() }));

import { createWhatsAppConnector } from '../whatsappConnector';
import { readWhatsAppConfig } from '../../channelConfig';
import { ConnectorHoldError, ConnectorPermanentError, type ConnectorDelivery } from '../../connectors/types';
import {
  BadRequestError, ForbiddenError, NotConnectedError, QuotaExceededError, RateLimitedError, UnavailableError, type WhatsAppProvider,
} from '../provider';
import type { SendStateStore, WhatsAppSendState } from '../sendState';

/** CH10.4 the WhatsApp connector with a fake provider and state: holds, dedup, one message, the breaker, each error. */
const ON = readWhatsAppConfig({ COMMS_HUB_WHATSAPP_ENABLED: 'true', WHAPI_TOKEN: 't', NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const OFF = readWhatsAppConfig({} as NodeJS.ProcessEnv);
const NOW = new Date('2026-12-01T18:00:00Z'); // noon CST: inside the window
const GROUP = '120363000000000001@g.us';
const BODY = 'Demo Tuesday is on Tuesday, December 1 at 6:00 PM CST.';
const delivery = (o: Partial<ConnectorDelivery> = {}): ConnectorDelivery => ({
  deliveryId: 'dl1', messageId: 'm1', since: new Date(NOW.getTime() - 60_000), destination: { target_type: 'whatsapp_group', target_id: 'g1' },
  draft: { title: null, body: BODY }, ...o,
});

function setup(o: { state?: Partial<WhatsAppSendState>; config?: typeof ON; provider?: Partial<Record<keyof WhatsAppProvider, jest.Mock>>; connect?: jest.Mock; recorded?: string[]; now?: Date } = {}) {
  const calls: string[] = [];
  const provider = {
    health: jest.fn(), listGroups: jest.fn(), getGroup: jest.fn(),
    listSentSince: jest.fn(async () => { calls.push('list'); return []; }),
    sendText: jest.fn(async () => { calls.push('sendText'); return { id: 'wa-1' }; }),
    sendImage: jest.fn(async () => { calls.push('sendImage'); return { id: 'wa-2' }; }),
    ...o.provider,
  } as unknown as WhatsAppProvider & Record<string, jest.Mock>;
  const state: SendStateStore & Record<string, jest.Mock> = {
    read: jest.fn(async () => ({ next_send_at: null, day: null, count: 0, breaker_until: null, breaker_reason: null, ...o.state })),
    reserve: jest.fn(async () => { calls.push('reserve'); }),
    openBreaker: jest.fn(async (now: Date) => new Date(now.getTime() + 48 * 3600_000)),
    clearBreaker: jest.fn(), claimAlert: jest.fn(),
    markForbidden: jest.fn(async () => undefined),
    providerGroupId: jest.fn(async () => GROUP),
    recordedElsewhere: jest.fn(async () => new Set(o.recorded ?? [])),
  } as never;
  const alert = jest.fn(async () => undefined);
  const connect = o.connect ?? jest.fn(async () => ({ provider, number: '15550001234' }));
  const c = createWhatsAppConnector({ config: () => o.config ?? ON, connect, state, alert, now: () => o.now ?? NOW, random: () => 0.5 });
  return { c, provider, state, alert, calls, connect };
}
const outcome = async (p: Promise<unknown>) => p.then((r) => ({ ok: r }), (e) => e);

describe('holds and refusals before anything is sent', () => {
  it('WhatsApp off is a permanent refusal; nothing is read or sent', async () => {
    const s = setup({ config: OFF });
    const e = await outcome(s.c.send(delivery()));
    expect(e).toBeInstanceOf(ConnectorPermanentError);
    expect(e.reason).toBe('whatsapp_off');
    expect(s.state.read).not.toHaveBeenCalled();
  });
  it.each([
    ['the breaker is open', { breaker_until: new Date(NOW.getTime() + 3600_000) }, 'whatsapp_paused_by_whatsapp'],
    ['the pacing gap has not passed', { next_send_at: new Date(NOW.getTime() + 30_000) }, 'whatsapp_pacing'],
    ['the daily cap is reached', { day: '2026-12-01', count: 40 }, 'whatsapp_daily_cap'],
  ])('%s: a hold, no send', async (_n, state, reason) => {
    const s = setup({ state });
    const e = await outcome(s.c.send(delivery()));
    expect([e instanceof ConnectorHoldError, e.reason]).toEqual([true, reason]);
    expect(s.calls).toEqual([]);
  });
  it('outside 8 AM to 8 PM Central: a hold until the window opens', async () => {
    const s = setup({ now: new Date('2026-12-02T03:00:00Z') }); // 9 PM CST
    const e = await outcome(s.c.send(delivery()));
    expect([e.reason, e.until]).toEqual(['whatsapp_window', new Date('2026-12-02T14:00:00Z')]);
  });
  it('the phone is not linked: a 10-minute hold; a 429 on the health check opens the breaker', async () => {
    const a = setup({ connect: jest.fn(async () => { throw new NotConnectedError('Scan the QR code.', null); }) });
    const e = await outcome(a.c.send(delivery()));
    expect([e.reason, e.until]).toEqual(['whatsapp_disconnected', new Date(NOW.getTime() + 10 * 60_000)]);
    const b = setup({ connect: jest.fn(async () => { throw new RateLimitedError(); }) });
    expect((await outcome(b.c.send(delivery()))).reason).toBe('whatsapp_paused_by_whatsapp');
    expect(b.state.openBreaker).toHaveBeenCalledTimes(1);
  });
  it('a group no longer in the hub is a permanent refusal', async () => {
    const s = setup();
    s.state.providerGroupId.mockResolvedValue(null);
    expect((await outcome(s.c.send(delivery()))).reason).toBe('whatsapp_group_gone');
  });
});

describe('W5 never twice', () => {
  it('a send that really went out before (a timeout after sending) is found and NOT sent again', async () => {
    const s = setup({ provider: { listSentSince: jest.fn(async () => [{ id: 'wa-earlier', text: `${BODY}  `, timestamp: 0 }]) } });
    expect(await s.c.send(delivery())).toEqual({ provider_message_id: 'wa-earlier', reached: 1, already_done: true });
    expect(s.provider.sendText).not.toHaveBeenCalled();
    expect(s.state.reserve).not.toHaveBeenCalled();
    expect(s.provider.listSentSince).toHaveBeenCalledWith(GROUP, Math.floor((NOW.getTime() - 60_000) / 1000) - 120);
  });
  it('a matching message another delivery recorded is not taken as ours: this one is sent', async () => {
    const s = setup({ provider: { listSentSince: jest.fn(async () => [{ id: 'wa-other', text: BODY, timestamp: 0 }]) }, recorded: ['wa-other'] });
    expect((await s.c.send(delivery())).provider_message_id).toBe('wa-1');
  });
  it('two unrecorded matches: a permanent failure and an alert, never a resend', async () => {
    const s = setup({ provider: { listSentSince: jest.fn(async () => [{ id: 'x', text: BODY, timestamp: 0 }, { id: 'y', text: BODY, timestamp: 0 }]) } });
    const e = await outcome(s.c.send(delivery()));
    expect(e.reason).toBe('whatsapp_ambiguous');
    expect(s.alert).toHaveBeenCalledWith(expect.objectContaining({ key: 'ambiguous:dl1' }));
    expect(s.provider.sendText).not.toHaveBeenCalled();
  });
  it('the check itself failing: a 5-minute hold and no send', async () => {
    const s = setup({ provider: { listSentSince: jest.fn(async () => { throw new UnavailableError(); }) } });
    const e = await outcome(s.c.send(delivery()));
    expect([e.reason, e.until]).toEqual(['whatsapp_check_failed', new Date(NOW.getTime() + 5 * 60_000)]);
    expect(s.provider.sendText).not.toHaveBeenCalled();
  });
});

describe('the send', () => {
  it('reserves the pacing slot BEFORE sending, then sends one text message', async () => {
    const s = setup();
    expect(await s.c.send(delivery())).toEqual({ provider_message_id: 'wa-1', reached: 1, already_done: false });
    expect(s.calls).toEqual(['list', 'reserve', 'sendText']);
    expect(s.state.reserve).toHaveBeenCalledWith(NOW, new Date(NOW.getTime() + 40_000 + 20_000));
    expect(s.provider.sendText).toHaveBeenCalledWith(GROUP, BODY);
  });
  it('with the banner: ONE image message with the text as its caption', async () => {
    const s = setup();
    await s.c.send(delivery({ media_urls: ['https://enterprise.colaberry.ai/api/comms-hub/thumbnails/e1/3x1.png?v=t7'] }));
    expect(s.provider.sendImage).toHaveBeenCalledWith(GROUP, 'https://enterprise.colaberry.ai/api/comms-hub/thumbnails/e1/3x1.png?v=t7', BODY);
    expect(s.provider.sendText).not.toHaveBeenCalled();
  });
});

describe('W7 provider errors on the send', () => {
  const failing = (err: Error) => setup({ provider: { sendText: jest.fn(async () => { throw err; }) } });
  it('429: opens the 48-hour breaker, alerts once for that opening, and holds until it closes', async () => {
    const s = failing(new RateLimitedError());
    const e = await outcome(s.c.send(delivery()));
    const until = new Date(NOW.getTime() + 48 * 3600_000);
    expect([e instanceof ConnectorHoldError, e.reason, e.until]).toEqual([true, 'whatsapp_paused_by_whatsapp', until]);
    expect(s.alert).toHaveBeenCalledWith(expect.objectContaining({ key: `breaker:${until.toISOString()}` }));
  });
  it('403: the group is marked can\'t-send and switched off; a permanent failure', async () => {
    const s = failing(new ForbiddenError());
    expect((await outcome(s.c.send(delivery()))).reason).toBe('whatsapp_forbidden');
    expect(s.state.markForbidden).toHaveBeenCalledWith('g1');
  });
  it('402: a permanent failure and an alert', async () => {
    const s = failing(new QuotaExceededError());
    expect((await outcome(s.c.send(delivery()))).reason).toBe('whatsapp_quota');
    expect(s.alert).toHaveBeenCalledWith(expect.objectContaining({ key: 'quota:2026-12-01' }));
  });
  it('401 holds; 400 is permanent; 5xx or a timeout is thrown as is (the worker retries, and the retry checks first)', async () => {
    expect((await outcome(failing(new NotConnectedError()).c.send(delivery()))).reason).toBe('whatsapp_disconnected');
    expect((await outcome(failing(new BadRequestError()).c.send(delivery()))).reason).toBe('whatsapp_rejected');
    const e = await outcome(failing(new UnavailableError()).c.send(delivery()));
    expect(e).toBeInstanceOf(UnavailableError);
  });
});
