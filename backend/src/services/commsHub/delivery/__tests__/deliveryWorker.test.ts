/**
 * CH7.2 sending worker, the build prompt's worker tests: unapproved, paused, cancelled, disallowed and
 * quiet-hours deliveries do not send; a double-claimed delivery sends once; a restart mid-send does not
 * duplicate; a retry reuses the idempotency key; a message scheduled across the daylight-saving change
 * sends at the right wall-clock time. Plus bounded retries, permanent refusals, timeouts and results.
 */
jest.mock('../../connectors', () => {
  const types = jest.requireActual('../../connectors/types');
  return { ...types, connectorFor: jest.fn() };
});

import { ConnectorPermanentError, type Connector, type ConnectorDelivery } from '../../connectors/types';
import { atCentral } from '../../messages/promotionPlan';
import { deliverOne, preSendCheck, runDeliveryTick, type WorkerDeps } from '../deliveryWorker';
import { MAX_ATTEMPTS, RETRY_DELAYS_MS, SENDING_LEASE_MS, nextAttemptAt } from '../retryPolicy';
import { resultOf } from '../resultOf';
import { FakeRepo } from './fakeRepo';

const T0 = new Date('2026-11-20T16:00:00Z'); // 10:00 AM CST
const at = (ms: number): Date => new Date(T0.getTime() + ms);

/** A channel that remembers what it really did, keyed like the real connectors' retry lookup. */
function channel(): Connector & { calls: ConnectorDelivery[]; effects: Map<string, string>; failNext: Array<Error | 'hang'> } {
  const calls: ConnectorDelivery[] = [];
  const effects = new Map<string, string>();
  const failNext: Array<Error | 'hang'> = [];
  return {
    channel: 'community_post', calls, effects, failNext,
    async send(d) {
      calls.push(d);
      // Like communityPostConnector: work this delivery already did since its first claim is returned, not repeated.
      const k = `${d.deliveryId}@${d.since.toISOString()}`;
      const f = failNext.shift();
      if (f === 'hang') return new Promise(() => undefined);
      if (f) throw f;
      if (effects.has(k)) return { provider_message_id: effects.get(k)!, reached: 1, already_done: true };
      const id = `post-${effects.size + 1}`;
      effects.set(k, id);
      return { provider_message_id: id, reached: 1, already_done: false };
    },
  };
}

function setup(o: { destinations?: number; sendAt?: Date | null } = {}) {
  const repo = new FakeRepo();
  repo.messages.set('m1', { id: 'm1', status: 'scheduled', send_at: o.sendAt ?? null, approvalMatches: true });
  for (let i = 1; i <= (o.destinations ?? 1); i += 1) {
    repo.destinations.push({ id: `d${i}`, message_id: 'm1', channel: 'community_post', target_type: 'cohort_feed', target_id: `cohort-${i}`, allowed: true });
  }
  repo.drafts.set('m1:community_post', { title: null, body: 'Demo Tuesday is Tuesday, December 1 at 6:00 PM CST.' });
  const ch = channel();
  const logs: Array<{ event: string; ctx: Record<string, unknown> }> = [];
  const deps: WorkerDeps = { repo, connector: () => ch, log: (_l, event, ctx) => { logs.push({ event, ctx }); } };
  return { repo, ch, deps, logs };
}

describe('retry policy (one file of constants)', () => {
  it('4 tries in total, at +1, +5 and +15 minutes, then none', () => {
    expect(MAX_ATTEMPTS).toBe(4);
    expect(RETRY_DELAYS_MS).toEqual([60_000, 300_000, 900_000]);
    expect(nextAttemptAt(1, T0)).toEqual(at(60_000));
    expect(nextAttemptAt(2, T0)).toEqual(at(300_000));
    expect(nextAttemptAt(3, T0)).toEqual(at(900_000));
    expect(nextAttemptAt(4, T0)).toBeNull();
    expect(nextAttemptAt(0, T0)).toBeNull();
  });
  it('results: all sent, some, none; nothing while one is still pending or sending', () => {
    expect(resultOf(['sent', 'sent'])).toBe('sent');
    expect(resultOf(['sent', 'failed'])).toBe('partially_failed');
    expect(resultOf(['sent', 'skipped'])).toBe('partially_failed');
    expect(resultOf(['failed', 'cancelled'])).toBe('failed');
    expect(resultOf([])).toBe('failed');
    expect(resultOf(['sent', 'pending'])).toBeNull();
    expect(resultOf(['sending'])).toBeNull();
  });
});

describe('happy path', () => {
  it('a due, approved message is started, each destination sent once on its own key, and the message is sent', async () => {
    const { repo, ch, deps } = setup({ destinations: 2 });
    const r = await runDeliveryTick(deps, T0);
    expect(r).toEqual(expect.objectContaining({ started: 1, attempted: 2, sent: 2, finished: { m1: 'sent' } }));
    expect(ch.calls.map((c) => c.destination.target_id)).toEqual(['cohort-1', 'cohort-2']);
    expect(ch.calls[0]).toEqual(expect.objectContaining({ deliveryId: 'dl-d1', messageId: 'm1', since: T0, draft: { title: null, body: 'Demo Tuesday is Tuesday, December 1 at 6:00 PM CST.' } }));
    expect(ch.calls[0].media_urls).toEqual(['https://enterprise.example/api/comms-hub/thumbnails/e1/3x1.png?v=t1']);
    expect(repo.deliveries.map((d) => [d.status, d.idempotency_key, d.provider_message_id])).toEqual([
      ['sent', 'comms_hub:m1:d1', 'post-1'], ['sent', 'comms_hub:m1:d2', 'post-2'],
    ]);
    // Running again changes nothing (idempotent).
    const again = await runDeliveryTick(deps, at(60_000));
    expect(again.attempted).toBe(0);
    expect(ch.calls).toHaveLength(2);
  });
});

describe('the build prompt worker tests: these do not send', () => {
  it('unapproved: a message whose approval no longer matches is not started and goes back for approval', async () => {
    const { repo, ch, deps, logs } = setup();
    repo.messages.get('m1')!.approvalMatches = false;
    const r = await runDeliveryTick(deps, T0);
    expect(r.started).toBe(0);
    expect(ch.calls).toHaveLength(0);
    expect(repo.messages.get('m1')).toEqual(expect.objectContaining({ status: 'needs_approval', voided: true }));
    expect(logs.some((l) => l.event === 'comms_hub_send_approval_changed')).toBe(true);
  });

  it('unapproved mid-send: the approval stops matching after the start, so the send fails without sending', async () => {
    const { repo, ch, deps } = setup();
    repo.beforeDecide = () => { repo.messages.get('m1')!.approvalMatches = false; };
    const r = await runDeliveryTick(deps, T0);
    expect(ch.calls).toHaveLength(0);
    expect(repo.deliveries[0]).toEqual(expect.objectContaining({ status: 'failed', error: expect.stringContaining('approval_changed') }));
    expect(r.finished).toEqual({ m1: 'failed' });
  });

  it('paused: nothing is started, claimed or sent; paused between claim and send holds it without spending a try', async () => {
    const { repo, ch, deps } = setup();
    repo.settingsRow.paused = true;
    expect((await runDeliveryTick(deps, T0)).paused).toBe(true);
    expect(repo.messages.get('m1')!.status).toBe('scheduled');
    expect(ch.calls).toHaveLength(0);

    repo.settingsRow.paused = false;
    repo.beforeDecide = () => { repo.settingsRow.paused = true; };
    await runDeliveryTick(deps, T0);
    expect(ch.calls).toHaveLength(0);
    expect(repo.deliveries[0]).toEqual(expect.objectContaining({ status: 'pending', attempt_count: 0, error: 'held: paused' }));
    repo.beforeDecide = null; repo.settingsRow.paused = false;
    await runDeliveryTick(deps, at(60_000));
    expect(ch.calls).toHaveLength(1);
    expect(repo.messages.get('m1')!.status).toBe('sent');
  });

  it('cancelled: a delivery whose message is no longer sending is cancelled, not sent', async () => {
    const { repo, ch, deps } = setup();
    repo.beforeDecide = () => { repo.messages.get('m1')!.status = 'cancelled'; };
    await runDeliveryTick(deps, T0);
    expect(ch.calls).toHaveLength(0);
    expect(repo.deliveries[0]).toEqual(expect.objectContaining({ status: 'cancelled', error: 'message is cancelled' }));
  });

  it('disallowed destination: skipped and said why; the others still send, and the result is partially_failed', async () => {
    const { repo, ch, deps } = setup({ destinations: 2 });
    repo.destinations[1].allowed = false;
    const r = await runDeliveryTick(deps, T0);
    expect(ch.calls.map((c) => c.destination.target_id)).toEqual(['cohort-1']);
    expect(repo.deliveries[1]).toEqual(expect.objectContaining({ status: 'skipped', error: 'destination_not_allowed' }));
    expect(r.finished).toEqual({ m1: 'partially_failed' });
  });

  it('quiet hours: nothing new starts inside the window; one already sending is held until it ends', async () => {
    const { repo, ch, deps } = setup();
    // 10:00 AM CST is inside 09:00-11:00.
    repo.settingsRow.quietHours = { start: '09:00', end: '11:00' };
    await runDeliveryTick(deps, T0);
    expect(repo.messages.get('m1')!.status).toBe('scheduled');
    expect(ch.calls).toHaveLength(0);

    repo.settingsRow.quietHours = null;
    repo.beforeDecide = () => { repo.settingsRow.quietHours = { start: '09:00', end: '11:00' }; };
    await runDeliveryTick(deps, T0);
    const end = atCentral('2026-11-20', '11:00');
    expect(repo.deliveries[0]).toEqual(expect.objectContaining({ status: 'pending', next_attempt_at: end, attempt_count: 0, error: 'held: quiet_hours' }));
    repo.beforeDecide = null;
    await runDeliveryTick(deps, new Date(end.getTime() - 60_000));
    expect(ch.calls).toHaveLength(0);
    repo.settingsRow.quietHours = { start: '09:00', end: '11:00' };
    await runDeliveryTick(deps, end);
    expect(ch.calls).toHaveLength(1);
  });
});

describe('the build prompt worker tests: no duplicates', () => {
  it('double claim: two ticks at the same moment send each delivery once', async () => {
    const { repo, ch, deps } = setup({ destinations: 2 });
    const [a, b] = await Promise.all([runDeliveryTick(deps, T0), runDeliveryTick(deps, T0)]);
    expect(a.sent + b.sent).toBe(2);
    expect(ch.calls).toHaveLength(2);
    expect(new Set(ch.calls.map((c) => c.deliveryId)).size).toBe(2);
    expect(repo.deliveries.every((d) => d.status === 'sent' && d.attempt_count === 1)).toBe(true);
  });

  it('a stale claim cannot send: once reclaimed after the lease, the old claim is refused at the lock', async () => {
    const { repo, ch, deps } = setup();
    await repo.startMessage('m1', T0);
    const [first] = await repo.claimDue(T0, 10);
    const [second] = await repo.claimDue(at(SENDING_LEASE_MS + 1000), 10); // the first worker "died"
    expect(second.attempt).toBe(2);
    expect(await deliverOne(deps, first, at(SENDING_LEASE_MS + 2000))).toBeNull();
    expect(ch.calls).toHaveLength(0);
    expect((await deliverOne(deps, second, at(SENDING_LEASE_MS + 2000)))?.kind).toBe('sent');
    expect(ch.calls).toHaveLength(1);
  });

  it('restart mid-send: the channel did the work but the process died before recording it; after the lease the retry finds that work, posts nothing new', async () => {
    const { repo, ch, deps } = setup();
    await repo.startMessage('m1', T0);
    const [claim] = await repo.claimDue(T0, 10);
    // The send happens, then the process dies: nothing is recorded, the row stays `sending`.
    await ch.send({ deliveryId: claim.id, messageId: 'm1', since: claim.first_claimed_at, destination: { target_type: 'cohort_feed', target_id: 'cohort-1' }, draft: { title: null, body: 'x' } });
    expect(repo.deliveries[0].status).toBe('sending');
    expect(ch.effects.size).toBe(1);
    // Inside the lease nothing reclaims it.
    expect((await runDeliveryTick(deps, at(60_000))).attempted).toBe(0);
    // After the lease it is reclaimed with the SAME first-claim time, and the channel returns the earlier post.
    const r = await runDeliveryTick(deps, at(SENDING_LEASE_MS + 60_000));
    expect(r.sent).toBe(1);
    expect(ch.calls[1].since).toEqual(T0);
    expect(ch.effects.size).toBe(1);
    expect(repo.deliveries[0]).toEqual(expect.objectContaining({ status: 'sent', provider_message_id: 'post-1', attempt_count: 2 }));
  });

  it('a retry reuses the idempotency key and the row: the same delivery, the same key, the same first claim', async () => {
    const { repo, ch, deps } = setup();
    ch.failNext.push(new Error('connection reset'));
    await runDeliveryTick(deps, T0);
    expect(repo.deliveries[0]).toEqual(expect.objectContaining({ status: 'pending', attempt_count: 1, next_attempt_at: at(60_000), error: 'Error: connection reset' }));
    expect(repo.messages.get('m1')!.status).toBe('sending');
    await runDeliveryTick(deps, at(59_000));
    expect(ch.calls).toHaveLength(1); // not yet
    await runDeliveryTick(deps, at(60_000));
    expect(ch.calls).toHaveLength(2);
    expect(ch.calls[1].deliveryId).toBe(ch.calls[0].deliveryId);
    expect(ch.calls[1].since).toEqual(ch.calls[0].since);
    expect(repo.deliveries).toHaveLength(1);
    expect(repo.deliveries[0]).toEqual(expect.objectContaining({ status: 'sent', idempotency_key: 'comms_hub:m1:d1', attempt_count: 2 }));
  });
});

describe('bounded retries and failure classes', () => {
  it('4 failures end in failed at +1, +5, +15 minutes; the message is failed', async () => {
    const { repo, ch, deps } = setup();
    ch.failNext.push(new Error('a'), new Error('b'), new Error('c'), new Error('d'));
    const times = [0, 60_000, 360_000, 1_260_000];
    let last;
    for (const t of times) last = await runDeliveryTick(deps, at(t)); // eslint-disable-line no-await-in-loop
    expect(ch.calls).toHaveLength(4);
    expect(repo.deliveries[0]).toEqual(expect.objectContaining({ status: 'failed', attempt_count: 4, error: 'Error: d' }));
    expect(last!.finished).toEqual({ m1: 'failed' });
    await runDeliveryTick(deps, at(10_000_000));
    expect(ch.calls).toHaveLength(4);
  });

  it('a permanent refusal fails at once, without retries', async () => {
    const { repo, ch, deps } = setup();
    ch.failNext.push(new ConnectorPermanentError('That cohort no longer exists.', 'cohort_missing'));
    const r = await runDeliveryTick(deps, T0);
    expect(repo.deliveries[0]).toEqual(expect.objectContaining({ status: 'failed', attempt_count: 1, error: expect.stringContaining('That cohort no longer exists.') }));
    expect(r.finished).toEqual({ m1: 'failed' });
  });

  it('a send that hangs past the timeout counts as a failed attempt and is retried', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      const { repo, ch, deps } = setup();
      ch.failNext.push('hang');
      const tick = runDeliveryTick(deps, T0);
      await jest.advanceTimersByTimeAsync(60_001);
      await tick;
      expect(repo.deliveries[0]).toEqual(expect.objectContaining({ status: 'pending', attempt_count: 1, error: expect.stringContaining('TimeoutError') }));
    } finally {
      jest.useRealTimers();
    }
  });

  it('a message with no draft for the channel fails with the reason', () => {
    expect(preSendCheck({ settings: { paused: false, quietHours: null }, messageStatus: 'sending', approvalMatches: true, destinationAllowed: true, draft: null, media_urls: [] }, T0))
      .toEqual({ kind: 'failed', error: expect.stringContaining('no_draft') });
  });

  it('the checks run in the build prompt order: pause, status, approval, destination, quiet hours', () => {
    const all = { settings: { paused: true, quietHours: { start: '00:00', end: '23:59' } }, messageStatus: 'cancelled' as const, approvalMatches: false, destinationAllowed: false, draft: null, media_urls: [] };
    expect(preSendCheck(all, T0)).toEqual(expect.objectContaining({ kind: 'hold', reason: 'paused' }));
    expect(preSendCheck({ ...all, settings: { ...all.settings, paused: false } }, T0)).toEqual(expect.objectContaining({ kind: 'skip', status: 'cancelled' }));
    expect(preSendCheck({ ...all, settings: { ...all.settings, paused: false }, messageStatus: 'sending' }, T0)).toEqual(expect.objectContaining({ kind: 'failed', error: expect.stringContaining('approval_changed') }));
    expect(preSendCheck({ ...all, settings: { ...all.settings, paused: false }, messageStatus: 'sending', approvalMatches: true }, T0)).toEqual(expect.objectContaining({ kind: 'skip', status: 'skipped' }));
    expect(preSendCheck({ ...all, settings: { ...all.settings, paused: false }, messageStatus: 'sending', approvalMatches: true, destinationAllowed: true }, T0)).toEqual(expect.objectContaining({ kind: 'hold', reason: 'quiet_hours' }));
  });
});

describe('the build prompt worker tests: Central time across daylight saving', () => {
  it('a message for 6:00 PM on Sunday November 1 2026 (the day clocks fall back) goes at 6:00 PM CST, not an hour off', async () => {
    const sendAt = atCentral('2026-11-01', '18:00');
    expect(sendAt.toISOString()).toBe('2026-11-02T00:00:00.000Z'); // 18:00 CST = UTC-6
    const { repo, ch, deps } = setup({ sendAt });
    await runDeliveryTick(deps, new Date(sendAt.getTime() - 60_000));
    expect(repo.messages.get('m1')!.status).toBe('scheduled');
    // The instant an hour early (what a CDT offset would have given) does not send either.
    await runDeliveryTick(deps, new Date(sendAt.getTime() - 3_600_000));
    expect(ch.calls).toHaveLength(0);
    await runDeliveryTick(deps, sendAt);
    expect(ch.calls).toHaveLength(1);
  });

  it('and for 6:00 PM on Sunday March 14 2027 (clocks spring forward) it goes at 6:00 PM CDT', async () => {
    const sendAt = atCentral('2027-03-14', '18:00');
    expect(sendAt.toISOString()).toBe('2027-03-14T23:00:00.000Z'); // 18:00 CDT = UTC-5
    const { ch, deps } = setup({ sendAt });
    await runDeliveryTick(deps, new Date(sendAt.getTime() - 1000));
    expect(ch.calls).toHaveLength(0);
    await runDeliveryTick(deps, sendAt);
    expect(ch.calls).toHaveLength(1);
  });
});

describe('no message is left sending forever', () => {
  it('the process died after the last send but before the result: the next tick writes it', async () => {
    const { repo, deps } = setup();
    await repo.startMessage('m1', T0);
    repo.deliveries[0].status = 'sent';
    expect(repo.messages.get('m1')!.status).toBe('sending');
    const r = await runDeliveryTick(deps, at(60_000));
    expect(r.finished).toEqual({ m1: 'sent' });
  });
  it('a message started with no destinations ends failed in the same tick (nothing was sent)', async () => {
    const { repo, deps } = setup({ destinations: 0 });
    const r = await runDeliveryTick(deps, T0);
    expect(r.finished).toEqual({ m1: 'failed' });
    expect(repo.messages.get('m1')!.status).toBe('failed');
  });
});

describe('a step failing does not stop the tick', () => {
  it('a start that throws is logged with its class; the claims and sends still run', async () => {
    const { repo, ch, deps, logs } = setup();
    await repo.startMessage('m1', T0);
    repo.messages.set('m2', { id: 'm2', status: 'scheduled', send_at: null, approvalMatches: true });
    repo.startMessage = async () => { throw Object.assign(new Error('deadlock'), { name: 'DatabaseError' }); };
    await runDeliveryTick(deps, T0);
    expect(logs.find((l) => l.event === 'comms_hub_send_start_failed')!.ctx).toEqual(expect.objectContaining({ error_class: 'DatabaseError', message_id: 'm2' }));
    expect(ch.calls).toHaveLength(1);
  });
});
