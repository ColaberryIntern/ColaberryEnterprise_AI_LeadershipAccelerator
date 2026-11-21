/**
 * CH7.2 a message's side of sending, against mocked models: start (approval re-checked, one row per
 * destination on a stable key, not-sent rows reset, sent rows untouched), finish (the result, and a
 * mid-send edit voided afterwards), and Jackie's retry of only the failed destinations.
 */
type Row = Record<string, unknown> & { update: jest.Mock };
const rowOf = (o: Record<string, unknown>): Row => { const r: Row = { ...o, update: jest.fn(async (v: Record<string, unknown>) => { Object.assign(r, v); return r; }) }; return r; };
let message: Row | null;
let deliveries: Row[] = [];
let destinations: Array<Record<string, unknown>> = [];
let approval: { content_hash: string } | null;
let eventStatus: string | null = 'scheduled';
const mockCancelMsg = jest.fn(async () => { if (message) message.status = 'cancelled'; });
const mockReconcile = jest.fn(async () => true);
const mockLog = jest.fn(async () => undefined);
const tx = { LOCK: { UPDATE: 'UPDATE' } };

jest.mock('../../../../config/database', () => ({ sequelize: { transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)) } }));
jest.mock('../../../../models/CommsHubMessage', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => (message && message.id === where.id && message.status === where.status ? message : null)),
    findByPk: jest.fn(async () => message),
  },
}));
jest.mock('../../../../models/CommsHubEvent', () => ({ __esModule: true, default: { findByPk: jest.fn(async () => (eventStatus ? { id: 'e1', status: eventStatus } : null)) } }));
jest.mock('../../../../models/CommsHubApproval', () => ({ __esModule: true, default: { findOne: jest.fn(async () => approval) } }));
jest.mock('../../../../models/CommsHubDestination', () => ({ __esModule: true, default: { findAll: jest.fn(async () => destinations) } }));
jest.mock('../../../../models/CommsHubDelivery', () => ({
  __esModule: true,
  default: {
    findOrCreate: jest.fn(async ({ where, defaults }: { where: Record<string, unknown>; defaults: Record<string, unknown> }) => {
      const found = deliveries.find((d) => d.message_id === where.message_id && d.destination_id === where.destination_id);
      if (found) return [found, false];
      const r = rowOf(defaults); deliveries.push(r); return [r, true];
    }),
    findAll: jest.fn(async () => deliveries),
    update: jest.fn(async (v: Record<string, unknown>, { where }: { where: { status: Record<symbol, string[]> } }) => {
      const sts = Object.getOwnPropertySymbols(where.status).map((s) => where.status[s])[0];
      const hit = deliveries.filter((d) => sts.includes(d.status as string));
      hit.forEach((d) => Object.assign(d, v));
      return [hit.length];
    }),
  },
}));
jest.mock('../../activityLog', () => ({ logActivity: (...a: unknown[]) => mockLog(...(a as [])), WORKER_ACTOR: { id: null, label: 'Scheduled sender' } }));
jest.mock('../../messages/approvals', () => {
  class MessageRuleError extends Error { constructor(m: string, public status: number, public reason: string) { super(m); } }
  return {
    MessageRuleError, loadContent: jest.fn(async () => ({ drafts: [], destinations: [], send_at: null })),
    reconcileApproval: (...a: unknown[]) => mockReconcile(...(a as [])),
    cancelMessage: (...a: unknown[]) => mockCancelMsg(...(a as [])),
    // Same rule as approvals.stoppedByCancelledEvent (tested there through submit and approve).
    stoppedByCancelledEvent: (m: { kind: string }, e: { status: string } | null) => !!e && e.status === 'cancelled' && m.kind !== 'cancellation',
  };
});
jest.mock('../../messages/messageStatus', () => ({
  approvalHash: jest.fn(() => 'H-now'),
  transition: jest.requireActual('../../messages/messageStatus').transition,
}));

import { deliveryKey, finishMessage, retryFailedDeliveries, startMessage } from '../messageLifecycle';

const NOW = new Date('2026-11-20T16:00:00Z');
const JACKIE = { id: 'jackie-1', label: 'Jackie' };

beforeEach(() => {
  jest.clearAllMocks();
  message = rowOf({ id: 'm1', status: 'scheduled', send_at: null, event_id: 'e1', kind: 'reminder' });
  eventStatus = 'scheduled';
  deliveries = [];
  destinations = [{ id: 'd1', channel: 'community_post' }, { id: 'd2', channel: 'in_app' }];
  approval = { content_hash: 'H-now' };
});

it('the idempotency key is one per destination per message and never changes', () => {
  expect(deliveryKey('m1', 'd1')).toBe('comms_hub:m1:d1');
  expect(deliveryKey('m1', 'd1')).toBe(deliveryKey('m1', 'd1'));
});

describe('startMessage', () => {
  it('makes one pending row per destination on its key and moves the message to sending', async () => {
    expect(await startMessage('m1', NOW)).toBe('started');
    expect(deliveries.map((d) => [d.destination_id, d.channel, d.idempotency_key, d.status])).toEqual([
      ['d1', 'community_post', 'comms_hub:m1:d1', 'pending'], ['d2', 'in_app', 'comms_hub:m1:d2', 'pending'],
    ]);
    expect(message!.status).toBe('sending');
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({ label: 'Scheduled sender' }), 'message.sending', 'message', 'm1', { destinations: 2 }, tx);
  });

  it('after a re-approval, not-sent rows go back to pending on the SAME row and key; a sent row is never touched', async () => {
    deliveries = [
      rowOf({ message_id: 'm1', destination_id: 'd1', idempotency_key: 'comms_hub:m1:d1', status: 'sent', attempt_count: 1 }),
      rowOf({ message_id: 'm1', destination_id: 'd2', idempotency_key: 'comms_hub:m1:d2', status: 'failed', attempt_count: 4, error: 'x' }),
    ];
    await startMessage('m1', NOW);
    expect(deliveries).toHaveLength(2);
    expect(deliveries[0].update).not.toHaveBeenCalled();
    expect(deliveries[1]).toEqual(expect.objectContaining({ status: 'pending', attempt_count: 0, error: null, idempotency_key: 'comms_hub:m1:d2' }));
  });

  it('not due yet, or not scheduled (or another worker holds it): nothing happens', async () => {
    message!.send_at = new Date(NOW.getTime() + 60_000);
    expect(await startMessage('m1', NOW)).toBe('not_due');
    message = rowOf({ id: 'm1', status: 'cancelled', send_at: null });
    expect(await startMessage('m1', NOW)).toBe('not_due');
    expect(deliveries).toHaveLength(0);
  });

  it('an approval that no longer matches (or none) is voided, and nothing is created', async () => {
    approval = { content_hash: 'H-old' };
    expect(await startMessage('m1', NOW)).toBe('approval_changed');
    expect(mockReconcile).toHaveBeenCalledWith('m1', 'draft_changed', expect.objectContaining({ id: null }), NOW, tx);
    approval = null;
    expect(await startMessage('m1', NOW)).toBe('approval_changed');
    expect(deliveries).toHaveLength(0);
    expect(message!.status).toBe('scheduled');
  });
});

describe('finishMessage', () => {
  beforeEach(() => { message!.status = 'sending'; });
  it('all sent: sent, and the approval is not re-checked', async () => {
    deliveries = [rowOf({ status: 'sent' }), rowOf({ status: 'sent' })];
    expect(await finishMessage('m1', NOW)).toBe('sent');
    expect(message!.status).toBe('sent');
    expect(mockReconcile).not.toHaveBeenCalled();
  });
  it('mixed: partially_failed, the errors logged, and a mid-send edit voided now (CH6.2 carry-forward)', async () => {
    deliveries = [rowOf({ status: 'sent' }), rowOf({ status: 'failed', error: 'Error: down' })];
    expect(await finishMessage('m1', NOW)).toBe('partially_failed');
    expect(mockLog).toHaveBeenCalledWith(expect.anything(), 'message.partially_failed', 'message', 'm1', { sent: 1, not_sent: 1, errors: ['Error: down'] }, tx);
    expect(mockReconcile).toHaveBeenCalledWith('m1', 'draft_changed', expect.anything(), NOW, tx);
  });
  it('still in flight, or not sending: nothing', async () => {
    deliveries = [rowOf({ status: 'sent' }), rowOf({ status: 'pending' })];
    expect(await finishMessage('m1', NOW)).toBeNull();
    message!.status = 'sent';
    expect(await finishMessage('m1', NOW)).toBeNull();
  });
});

describe('retryFailedDeliveries', () => {
  beforeEach(() => {
    message!.status = 'partially_failed';
    deliveries = [rowOf({ status: 'sent' }), rowOf({ status: 'failed', attempt_count: 4, error: 'x' }), rowOf({ status: 'skipped', error: 'destination_not_allowed' })];
  });
  it('only the destinations that did not get it go back to pending (fresh tries, same rows); the message is sending', async () => {
    await retryFailedDeliveries('m1', JACKIE, NOW);
    expect(deliveries.map((d) => d.status)).toEqual(['sent', 'pending', 'pending']);
    expect(deliveries[1]).toEqual(expect.objectContaining({ attempt_count: 0, error: null }));
    expect(message!.status).toBe('sending');
    expect(mockLog).toHaveBeenCalledWith(JACKIE, 'message.retry', 'message', 'm1', { deliveries: 2 }, tx);
  });
  it('refused: not a failed message; nothing left to retry', async () => {
    message!.status = 'sent';
    await expect(retryFailedDeliveries('m1', JACKIE, NOW)).rejects.toMatchObject({ status: 409, reason: 'not_retryable' });
    message!.status = 'failed';
    deliveries = [rowOf({ status: 'sent' })];
    await expect(retryFailedDeliveries('m1', JACKIE, NOW)).rejects.toMatchObject({ reason: 'nothing_to_retry' });
  });
  it('changed after approval: the approval is voided (and that is kept), then the retry is refused', async () => {
    approval = { content_hash: 'H-old' };
    await expect(retryFailedDeliveries('m1', JACKIE, NOW)).rejects.toMatchObject({ status: 409, reason: 'approval_changed' });
    expect(mockReconcile).toHaveBeenCalledWith('m1', 'draft_changed', JACKIE, NOW, tx);
    // The refusal is thrown after the transaction returned, so the void it made is committed.
    const { sequelize } = jest.requireMock('../../../../config/database');
    await expect(sequelize.transaction.mock.results[0].value).resolves.toBe('approval_changed');
    expect(deliveries[1].status).toBe('failed');
  });
});

describe('CH7.3 a cancelled event stops its messages at the worker too', () => {
  it('start: a scheduled reminder for a cancelled event is cancelled, never started', async () => {
    eventStatus = 'cancelled';
    expect(await startMessage('m1', NOW)).toBe('event_cancelled');
    expect(mockCancelMsg).toHaveBeenCalledWith('m1', expect.objectContaining({ id: null }), NOW, tx);
    expect(deliveries).toHaveLength(0);
  });
  it('start: the cancellation message itself still goes out', async () => {
    eventStatus = 'cancelled';
    message!.kind = 'cancellation';
    expect(await startMessage('m1', NOW)).toBe('started');
  });
  it('finish: a message that was sending when its event was cancelled ends cancelled, not back in the approval queue', async () => {
    eventStatus = 'cancelled';
    message!.status = 'sending';
    deliveries = [rowOf({ status: 'sent' }), rowOf({ status: 'cancelled', error: 'event_cancelled' })];
    expect(await finishMessage('m1', NOW)).toBe('cancelled');
    expect(mockCancelMsg).toHaveBeenCalledWith('m1', expect.anything(), NOW, tx);
    expect(mockReconcile).not.toHaveBeenCalled();
  });
  it('finish: everything had gone out before the cancel: it stays sent', async () => {
    eventStatus = 'cancelled';
    message!.status = 'sending';
    deliveries = [rowOf({ status: 'sent' })];
    expect(await finishMessage('m1', NOW)).toBe('sent');
    expect(mockCancelMsg).not.toHaveBeenCalled();
  });
  it('a message with no event (a subject) is unaffected', async () => {
    message!.event_id = null; eventStatus = null;
    expect(await startMessage('m1', NOW)).toBe('started');
  });
});
