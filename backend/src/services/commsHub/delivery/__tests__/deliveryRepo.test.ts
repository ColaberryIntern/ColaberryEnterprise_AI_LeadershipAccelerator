/**
 * CH7.2 Postgres store, without a database: the send lock key, the banner link, the claim SQL's
 * shape, the stale-claim refusal under the lock, what each outcome writes, and the re-read context
 * (destination allowed, latest draft, banner only when included). The SQL itself runs against a real
 * Postgres in deliveryRepo.integration.test.ts (CI integration tier).
 */
type Row = Record<string, unknown> & { update: jest.Mock };
const rowOf = (o: Record<string, unknown>): Row => { const r: Row = { ...o, update: jest.fn(async (v: Record<string, unknown>) => { Object.assign(r, v); return r; }) }; return r; };
const queries: Array<{ sql: string; replacements?: Record<string, unknown> }> = [];
let delivery: Row | null;
let message: Record<string, unknown> | null;
let destination: Record<string, unknown> | null;
let cohortExists = true;
let draft: Record<string, unknown> | null;
let event: Record<string, unknown> | null;
let settings: Record<string, unknown> | null;
let matches = true;
const tx = { LOCK: { UPDATE: 'UPDATE' } };

jest.mock('../../../../config/env', () => ({ env: { frontendUrl: 'https://enterprise.colaberry.ai/' } }));
jest.mock('../../../../config/database', () => ({
  sequelize: {
    transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
    query: jest.fn(async (sql: string, o: { replacements?: Record<string, unknown> } = {}) => { queries.push({ sql, replacements: o.replacements }); return [[{ id: 'dl1', message_id: 'm1', destination_id: 'd1', channel: 'in_app', idempotency_key: 'k', attempt: '2', first_claimed_at: '2026-11-20T15:00:00.000Z', target_type: 'in_app_audience', target_id: 'all_members' }]]; }),
  },
}));
jest.mock('../../../../models/CommsHubDelivery', () => ({ __esModule: true, default: { findByPk: jest.fn(async () => delivery) } }));
jest.mock('../../../../models/CommsHubMessage', () => ({ __esModule: true, default: { findByPk: jest.fn(async () => message), findAll: jest.fn(async () => []) } }));
jest.mock('../../../../models/CommsHubDestination', () => ({ __esModule: true, default: { findByPk: jest.fn(async () => destination) } }));
jest.mock('../../../../models/Cohort', () => ({ __esModule: true, default: { findByPk: jest.fn(async () => (cohortExists ? { id: 'c1' } : null)) } }));
jest.mock('../../../../models/CommsHubDraft', () => ({ __esModule: true, default: { findOne: jest.fn(async () => draft) } }));
jest.mock('../../../../models/CommsHubEvent', () => ({ __esModule: true, default: { findByPk: jest.fn(async () => event) } }));
jest.mock('../../../../models/CommsHubSettings', () => ({ __esModule: true, default: { findByPk: jest.fn(async () => settings) } }));
jest.mock('../../connectors/inAppConnector', () => ({ ALL_MEMBERS: 'all_members' }));
jest.mock('../messageLifecycle', () => ({ approvalStillMatches: jest.fn(async () => matches), finishMessage: jest.fn(), startMessage: jest.fn() }));

import { bannerUrl, deliveryRepo, sendLockKey } from '../deliveryRepo';
import type { ClaimedDelivery, SendContext, SendOutcome } from '../types';

const NOW = new Date('2026-11-20T16:00:00Z');
const claim = (o: Partial<ClaimedDelivery> = {}): ClaimedDelivery => ({
  id: 'dl1', message_id: 'm1', destination_id: 'd1', channel: 'community_post', idempotency_key: 'comms_hub:m1:d1', attempt: 1,
  first_claimed_at: NOW, target_type: 'cohort_feed', target_id: 'c1', ...o,
});

beforeEach(() => {
  jest.clearAllMocks(); queries.length = 0;
  delivery = rowOf({ id: 'dl1', status: 'sending', attempt_count: 1 });
  message = { id: 'm1', status: 'sending', event_id: 'e1', include: { thumbnail: true } };
  destination = { id: 'd1', message_id: 'm1', channel: 'community_post', target_type: 'cohort_feed', target_id: 'c1' };
  cohortExists = true; matches = true;
  draft = { title: null, body: 'Body' };
  event = { id: 'e1', thumbnail_id: 't7' };
  settings = { sending_paused: false, quiet_hours: { start: '21:00', end: '08:00' } };
});

it('one post per feed at a time; one message\'s in-app sends at a time', () => {
  expect(sendLockKey(claim())).toBe('comms_hub:post:cohort_feed:c1');
  expect(sendLockKey(claim({ channel: 'in_app', target_type: 'in_app_audience', target_id: 'c1' }))).toBe('comms_hub:in_app:m1');
  expect(sendLockKey(claim({ message_id: 'm2' }))).toBe(sendLockKey(claim())); // two messages to one feed share the lock
});

it('the banner is an absolute https link the feed and the connector accept', () => {
  expect(bannerUrl('e1', 't7')).toBe('https://enterprise.colaberry.ai/api/comms-hub/thumbnails/e1/3x1.png?v=t7');
});

it('claim: one UPDATE over FOR UPDATE SKIP LOCKED, first claim kept, the attempt counted, stale sending reclaimable', async () => {
  const rows = await deliveryRepo.claimDue(NOW, 25);
  const q = queries[0];
  expect(q.sql).toMatch(/FOR UPDATE OF d SKIP LOCKED/);
  expect(q.sql).toMatch(/claimed_at = COALESCE\(d\.claimed_at, :now\)/);
  expect(q.sql).toMatch(/attempt_count = d\.attempt_count \+ 1/);
  expect(q.sql).toMatch(/d\.status = 'sending' AND d\.updated_at < :stale/);
  expect(q.sql).toMatch(/m\.status = 'sending'/);
  expect(q.replacements).toEqual({ now: NOW, stale: new Date(NOW.getTime() - 600_000), limit: 25 });
  expect(rows[0]).toEqual(expect.objectContaining({ attempt: 2, first_claimed_at: new Date('2026-11-20T15:00:00.000Z') }));
});

describe('withSendLock', () => {
  it('takes the advisory lock first, re-reads everything, and records a send', async () => {
    let seen: SendContext | null = null;
    const out = await deliveryRepo.withSendLock(claim(), NOW, async (ctx) => { seen = ctx; return { kind: 'sent', provider_message_id: 'post-9', reached: 1 }; });
    expect(queries[0]).toEqual({ sql: 'SELECT pg_advisory_xact_lock(hashtext(:key))', replacements: { key: 'comms_hub:post:cohort_feed:c1' } });
    expect(seen).toEqual({
      settings: { paused: false, quietHours: { start: '21:00', end: '08:00' } }, messageStatus: 'sending', approvalMatches: true,
      destinationAllowed: true, draft: { title: null, body: 'Body' }, media_urls: ['https://enterprise.colaberry.ai/api/comms-hub/thumbnails/e1/3x1.png?v=t7'],
    });
    expect(out?.kind).toBe('sent');
    expect(delivery!.update).toHaveBeenCalledWith({ status: 'sent', provider_message_id: 'post-9', sent_at: NOW, error: null, next_attempt_at: null }, { transaction: tx });
  });

  it('a claim that is no longer this one\'s (sent meanwhile, or reclaimed after the lease) is refused without deciding', async () => {
    const decide = jest.fn();
    delivery!.attempt_count = 2;
    expect(await deliveryRepo.withSendLock(claim({ attempt: 1 }), NOW, decide)).toBeNull();
    delivery = rowOf({ id: 'dl1', status: 'sent', attempt_count: 1 });
    expect(await deliveryRepo.withSendLock(claim(), NOW, decide)).toBeNull();
    delivery = null;
    expect(await deliveryRepo.withSendLock(claim(), NOW, decide)).toBeNull();
    expect(decide).not.toHaveBeenCalled();
  });

  it('what each outcome writes: retry keeps the row for later; failed; a hold gives the try back; a skip says why', async () => {
    const run = async (out: SendOutcome): Promise<unknown> => {
      delivery = rowOf({ id: 'dl1', status: 'sending', attempt_count: 1 });
      await deliveryRepo.withSendLock(claim(), NOW, async () => out);
      return delivery!.update.mock.calls[0][0];
    };
    const later = new Date(NOW.getTime() + 60_000);
    expect(await run({ kind: 'retry', at: later, error: 'Error: x' })).toEqual({ status: 'pending', next_attempt_at: later, error: 'Error: x' });
    expect(await run({ kind: 'failed', error: 'Error: y' })).toEqual({ status: 'failed', next_attempt_at: null, error: 'Error: y' });
    expect(await run({ kind: 'hold', until: later, reason: 'quiet_hours' })).toEqual({ status: 'pending', next_attempt_at: later, attempt_count: 0, error: 'held: quiet_hours' });
    expect(await run({ kind: 'skip', status: 'skipped', reason: 'destination_not_allowed' })).toEqual({ status: 'skipped', next_attempt_at: null, error: 'destination_not_allowed' });
  });

  it('the destination is not allowed when its row is gone, belongs elsewhere, does not match the channel, or its cohort is gone', async () => {
    const allowed = async (): Promise<boolean> => {
      let a = false;
      delivery = rowOf({ id: 'dl1', status: 'sending', attempt_count: 1 });
      await deliveryRepo.withSendLock(claim(), NOW, async (ctx) => { a = ctx.destinationAllowed; return { kind: 'failed', error: 'x' }; });
      return a;
    };
    expect(await allowed()).toBe(true);
    cohortExists = false; expect(await allowed()).toBe(false); cohortExists = true;
    destination = { ...destination!, channel: 'in_app' }; expect(await allowed()).toBe(false);
    destination = { ...destination!, channel: 'community_post', message_id: 'other' }; expect(await allowed()).toBe(false);
    destination = { ...destination!, message_id: 'm1', target_id: 'all_members' }; expect(await allowed()).toBe(false); // everyone is in-app only
    destination = null; expect(await allowed()).toBe(false);
  });

  it('no banner when the thumbnail is not included, the event has none, or it is an in-app send; no settings row means not paused', async () => {
    const media = async (c: ClaimedDelivery): Promise<string[]> => {
      let m: string[] = ['unset'];
      delivery = rowOf({ id: 'dl1', status: 'sending', attempt_count: 1 });
      await deliveryRepo.withSendLock(c, NOW, async (ctx) => { m = ctx.media_urls; return { kind: 'failed', error: 'x' }; });
      return m;
    };
    message = { ...message!, include: { thumbnail: false } }; expect(await media(claim())).toEqual([]);
    message = { ...message!, include: { thumbnail: true } }; event = { id: 'e1', thumbnail_id: null }; expect(await media(claim())).toEqual([]);
    event = { id: 'e1', thumbnail_id: 't7' }; expect(await media(claim({ channel: 'in_app', target_type: 'in_app_audience' }))).toEqual([]);
    settings = null;
    expect(await deliveryRepo.settings()).toEqual({ paused: false, quietHours: null });
  });
});
