/**
 * CH7.3 the two cascades (build prompt: "Cancelling an event cancels its pending deliveries in the
 * same transaction and offers a cancellation draft. Editing an event's date, time or links voids
 * approvals on its pending messages."). Models and approvals are mocked; the worker's side (nothing
 * sends afterwards) is in the delivery tests and deliveryRepo.integration.test.ts.
 */
type Row = Record<string, unknown>;
let messages: Row[] = [];
const queries: Array<{ sql: string; replacements: Row; transaction: unknown }> = [];
const mockCancel = jest.fn(async () => undefined);
const mockVoid = jest.fn(async (..._a: unknown[]) => true);
const mockLog = jest.fn(async () => undefined);
const tx = { id: 'tx', LOCK: { UPDATE: 'UPDATE' } };
const findAllOpts: Row[] = [];

jest.mock('../../../../config/database', () => ({
  sequelize: { query: jest.fn(async (sql: string, o: { replacements: Row; transaction: unknown }) => { queries.push({ sql, replacements: o.replacements, transaction: o.transaction }); return [{ id: 'dl1' }, { id: 'dl2' }]; }) },
}));
jest.mock('../../../../models/CommsHubMessage', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(async (o: { where: { status: Record<symbol, string[]> } }) => {
      findAllOpts.push(o as unknown as Row);
      const { where } = o;
      const allowed = Object.getOwnPropertySymbols(where.status).map((s) => where.status[s])[0];
      return messages.filter((m) => allowed.includes(m.status as string));
    }),
  },
}));
jest.mock('../approvals', () => ({ cancelMessage: (...a: unknown[]) => mockCancel(...(a as [])), voidForEvent: (...a: unknown[]) => mockVoid(...(a as [])) }));
jest.mock('../../activityLog', () => ({ logActivity: (...a: unknown[]) => mockLog(...(a as [])) }));

import { cascadeEventCancel, cascadeEventEdit, SCHEDULE_FIELDS } from '../eventCascade';

const JACKIE = { id: 'jackie-1', label: 'Jackie' };
const NOW = new Date('2026-11-20T16:00:00Z');
const START = new Date('2026-12-02T00:00:00Z');
const event = (o: Row = {}) => ({ id: 'e1', starts_at: START, ends_at: new Date('2026-12-02T01:00:00Z'), repeat_rule: null, ...o }) as never;

beforeEach(() => { jest.clearAllMocks(); queries.length = 0; findAllOpts.length = 0; });

describe('cancel cascade', () => {
  beforeEach(() => {
    messages = [
      { id: 'm-draft', status: 'draft' }, { id: 'm-wait', status: 'needs_approval' }, { id: 'm-ok', status: 'approved' },
      { id: 'm-sched', status: 'scheduled' }, { id: 'm-part', status: 'partially_failed' }, { id: 'm-send', status: 'sending' },
      { id: 'm-sent', status: 'sent' }, { id: 'm-gone', status: 'cancelled' },
    ];
  });

  it('every message about it that has not gone out is cancelled, in the event transaction; sent and cancelled ones are left as history', async () => {
    const r = await cascadeEventCancel('e1', JACKIE, NOW, tx as never);
    expect(mockCancel.mock.calls.map((c) => (c as unknown[])[0])).toEqual(['m-draft', 'm-wait', 'm-ok', 'm-sched', 'm-part']);
    expect(mockCancel.mock.calls.every((c) => (c as unknown[])[1] === JACKIE && (c as unknown[])[3] === tx)).toBe(true);
    expect(r).toEqual({ messages_cancelled: 5, deliveries_cancelled: 2, sending_voided: 1 });
    expect(mockLog).toHaveBeenCalledWith(JACKIE, 'event.messages_cancelled', 'event', 'e1', r, tx);
  });

  it('a message that is sending: its pending (and claimed, not yet locked) deliveries are cancelled, an in-flight one is skipped, and its approval is voided', async () => {
    await cascadeEventCancel('e1', JACKIE, NOW, tx as never);
    expect(queries).toHaveLength(1);
    const q = queries[0];
    expect(q.sql).toMatch(/SET status = 'cancelled'/);
    expect(q.sql).toMatch(/status IN \('pending', 'sending'\) FOR UPDATE SKIP LOCKED/);
    expect(q.replacements).toEqual({ messageId: 'm-send', reason: 'event_cancelled', now: NOW });
    expect(q.transaction).toBe(tx);
    expect(mockVoid).toHaveBeenCalledWith('m-send', 'event_cancelled', JACKIE, NOW, tx);
  });

  it('an event with no messages changes nothing and logs nothing', async () => {
    messages = [];
    expect(await cascadeEventCancel('e1', JACKIE, NOW, tx as never)).toEqual({ messages_cancelled: 0, deliveries_cancelled: 0, sending_voided: 0 });
    expect(mockLog).not.toHaveBeenCalled();
  });
});

describe('edit cascade', () => {
  it('only a date, time or link change touches messages', async () => {
    messages = [{ id: 'm-ok', status: 'approved', plan_kind: null }];
    expect(SCHEDULE_FIELDS).toEqual(['starts_at', 'ends_at', 'repeat_rule', 'join_url', 'registration_url']);
    expect(await cascadeEventEdit(event(), ['title', 'description', 'hosts'], JACKIE, NOW, tx as never)).toEqual({ voided: 0, plan_cancelled: 0 });
    expect(mockVoid).not.toHaveBeenCalled();
    for (const f of SCHEDULE_FIELDS) {
      mockVoid.mockClear();
      // eslint-disable-next-line no-await-in-loop
      await cascadeEventEdit(event(), [f], JACKIE, NOW, tx as never);
      expect(mockVoid).toHaveBeenCalledWith('m-ok', 'event_changed', JACKIE, NOW, tx);
    }
  });

  it('a moved event: approvals voided; a plan message for a date that no longer exists is cancelled (the worker drafts the new one)', async () => {
    const moved = new Date('2026-12-03T00:00:00Z');
    messages = [
      { id: 'm-free', status: 'scheduled', plan_kind: null, occurrence_starts_at: null },
      { id: 'm-plan-old', status: 'scheduled', plan_kind: 'reminder', occurrence_starts_at: START },
      { id: 'm-plan-new', status: 'needs_approval', plan_kind: 'announcement', occurrence_starts_at: moved },
      { id: 'm-plan-sending', status: 'sending', plan_kind: 'starting_soon', occurrence_starts_at: START },
      { id: 'm-sent', status: 'sent', plan_kind: null },
    ];
    mockVoid.mockImplementation(async (id: unknown) => id !== 'm-plan-new'); // needs_approval has no approval to void
    const r = await cascadeEventEdit(event({ starts_at: moved, ends_at: new Date('2026-12-03T01:00:00Z') }), ['starts_at', 'ends_at'], JACKIE, NOW, tx as never);
    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockCancel).toHaveBeenCalledWith('m-plan-old', JACKIE, NOW, tx);
    // A sending one cannot be cancelled: its approval is voided so nothing more of it goes out.
    expect(mockVoid.mock.calls.map((c) => (c as unknown[])[0])).toEqual(['m-free', 'm-plan-new', 'm-plan-sending']);
    expect(r).toEqual({ voided: 2, plan_cancelled: 1 });
    expect(mockLog).toHaveBeenCalledWith(JACKIE, 'event.messages_voided', 'event', 'e1', { changed: ['starts_at', 'ends_at'], voided: 2, plan_cancelled: 1 }, tx);
    mockVoid.mockReset(); mockVoid.mockImplementation(async () => true);
  });

  it('a weekly series keeps the plan messages of dates still in the series', async () => {
    const weekly = { freq: 'weekly', until: '2026-12-31' };
    const second = new Date('2026-12-09T00:00:00Z');
    messages = [{ id: 'm-week2', status: 'approved', plan_kind: 'reminder', occurrence_starts_at: second }];
    await cascadeEventEdit(event({ repeat_rule: weekly, join_url: 'https://zoom.us/j/2' }), ['join_url'], JACKIE, NOW, tx as never);
    expect(mockCancel).not.toHaveBeenCalled();
    expect(mockVoid).toHaveBeenCalledWith('m-week2', 'event_changed', JACKIE, NOW, tx);
  });
});

describe('the branch is taken on the locked row (no race with the worker)', () => {
  it('both cascades read the messages FOR UPDATE, in id order, inside the event transaction', async () => {
    messages = [{ id: 'm1', status: 'scheduled', plan_kind: null }];
    await cascadeEventCancel('e1', JACKIE, NOW, tx as never);
    await cascadeEventEdit(event(), ['starts_at'], JACKIE, NOW, tx as never);
    expect(findAllOpts).toHaveLength(2);
    for (const o of findAllOpts) expect(o).toEqual(expect.objectContaining({ lock: 'UPDATE', order: [['id', 'ASC']], transaction: tx }));
  });
});
