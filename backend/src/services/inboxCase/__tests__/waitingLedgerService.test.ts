// /inbox-zero T3 (CC-20260910-3q7x). Pins the producer-with-no-consumer fix:
// the planner's follow_up_date lived only in the MARK_WAITING action payload
// and was read by nothing, so "waiting on someone" could be entered but never
// queried. These tests prove the date is promoted onto the case exactly once
// when the action verifies, and that the two console reads return the right
// cases — including the one that actually matters, the stale ones.

import { randomUUID } from 'crypto';
import { makeFakeModel } from './testHelpers/fakeModel';

const fakeInboxCase = makeFakeModel();
const fakeInboxCaseAction = makeFakeModel();
const fakeInboxCaseEvent = makeFakeModel();
const fakeInboxCaseItem = makeFakeModel();

jest.mock('../../../models/InboxCase', () => ({ __esModule: true, default: fakeInboxCase }));
jest.mock('../../../models/InboxCaseAction', () => ({ __esModule: true, default: fakeInboxCaseAction }));
jest.mock('../../../models/InboxCaseEvent', () => ({ __esModule: true, default: fakeInboxCaseEvent }));
jest.mock('../../../models/InboxCaseItem', () => ({ __esModule: true, default: fakeInboxCaseItem }));
jest.mock('../caseTicketService', () => ({
  ensureCaseTicket: jest.fn(async () => {}),
  syncTicketForCase: jest.fn(async () => {}),
  postCaseProgressNote: jest.fn(async () => {}),
}));

import { followUpDateToDueAt, listStaleWaiting, listWaiting, promoteWaitingFromAction } from '../waitingLedgerService';
import { verifyCase } from '../caseVerificationService';

beforeEach(() => {
  fakeInboxCase.rows.clear();
  fakeInboxCaseAction.rows.clear();
  fakeInboxCaseEvent.rows.clear();
  fakeInboxCaseItem.rows.clear();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

async function seedCase(overrides: Partial<any> = {}) {
  return fakeInboxCase.create({
    title: 'Waiting on Priya for the SOW',
    mode: 'TOPIC',
    state: 'EXECUTING',
    correlation_id: randomUUID(),
    reopen_count: 0,
    waiting_since: null,
    sla_due_at: null,
    ...overrides,
  });
}

async function seedWaitingAction(caseId: string, followUpDate: string | null, overrides: Partial<any> = {}) {
  return fakeInboxCaseAction.create({
    case_id: caseId,
    action_type: 'MARK_WAITING',
    target_source: 'case',
    status: 'SUCCEEDED',
    payload: { owner: 'Priya', statement: 'will send the SOW', ...(followUpDate ? { follow_up_date: followUpDate } : {}) },
    external_receipt: {},
    depends_on_action_ids: [],
    idempotency_key: randomUUID(),
    attempt_count: 1,
    acting_admin: 'system',
    correlation_id: randomUUID(),
    verified_at: null,
    ...overrides,
  });
}

describe('followUpDateToDueAt', () => {
  it('parses the planner YYYY-MM-DD into the start of that day, UTC', () => {
    expect(followUpDateToDueAt('2026-09-15')!.toISOString()).toBe('2026-09-15T00:00:00.000Z');
  });
  it('returns null for anything it cannot parse rather than guessing', () => {
    expect(followUpDateToDueAt(undefined)).toBeNull();
    expect(followUpDateToDueAt('next tuesday')).toBeNull();
    expect(followUpDateToDueAt('2026-13-40')).toBeNull();
  });
});

describe('promoteWaitingFromAction', () => {
  it('writes waiting_since and sla_due_at from the action payload and logs one event', async () => {
    const c: any = await seedCase();
    const a: any = await seedWaitingAction(c.id, '2026-09-15', { verified_at: new Date('2026-09-11T09:00:00Z') });

    const r = await promoteWaitingFromAction(a, c);

    expect(r).toEqual({ promoted: true, reason: 'promoted' });
    expect(c.waiting_since.toISOString()).toBe('2026-09-11T09:00:00.000Z');
    expect(c.sla_due_at.toISOString()).toBe('2026-09-15T00:00:00.000Z');
    const events = await fakeInboxCaseEvent.findAll({ where: { case_id: c.id, event_type: 'case_waiting_promoted' } });
    expect(events).toHaveLength(1);
    expect(events[0].details).toMatchObject({ owner: 'Priya', sla_due_at: '2026-09-15T00:00:00.000Z' });
  });

  it('is idempotent: re-verifying does not move waiting_since', async () => {
    const original = new Date('2026-09-01T09:00:00Z');
    const c: any = await seedCase({ waiting_since: original, sla_due_at: new Date('2026-09-04T00:00:00Z') });
    const a: any = await seedWaitingAction(c.id, '2026-09-20', { verified_at: new Date() });

    const r = await promoteWaitingFromAction(a, c);

    expect(r.reason).toBe('already_waiting');
    expect(c.waiting_since).toBe(original);
    expect(c.sla_due_at.toISOString()).toBe('2026-09-04T00:00:00.000Z');
  });

  it('ignores actions that are not MARK_WAITING', async () => {
    const c: any = await seedCase();
    const a: any = await seedWaitingAction(c.id, '2026-09-15', { action_type: 'NO_ACTION' });
    expect((await promoteWaitingFromAction(a, c)).reason).toBe('not_mark_waiting');
    expect(c.waiting_since).toBeNull();
  });

  it('skips, with a structured warn, when the payload carries no follow_up_date', async () => {
    const c: any = await seedCase();
    const a: any = await seedWaitingAction(c.id, null);
    expect((await promoteWaitingFromAction(a, c)).reason).toBe('no_follow_up_date');
    expect(c.waiting_since).toBeNull();
    const warned = (console.warn as jest.Mock).mock.calls.map((x) => String(x[0]));
    expect(warned.some((l) => l.includes('waiting_promotion_skipped'))).toBe(true);
  });
});

describe('verifyCase integration', () => {
  it('a verified MARK_WAITING promotes the case and lands it in WAITING', async () => {
    const c: any = await seedCase({ state: 'EXECUTING' });
    await seedWaitingAction(c.id, '2026-09-15');

    await verifyCase(c.id, 'test');

    expect(c.state).toBe('WAITING');
    expect(c.sla_due_at.toISOString()).toBe('2026-09-15T00:00:00.000Z');
    expect(c.waiting_since).toBeInstanceOf(Date);
  });

  it('a case with no MARK_WAITING action is untouched', async () => {
    const c: any = await seedCase({ state: 'EXECUTING' });
    await seedWaitingAction(c.id, '2026-09-15', { action_type: 'NO_ACTION' });

    await verifyCase(c.id, 'test');

    expect(c.waiting_since).toBeNull();
    expect(c.sla_due_at).toBeNull();
  });
});

describe('listWaiting / listStaleWaiting', () => {
  it('returns waiting cases; only those past their follow-up date are stale', async () => {
    const asOf = new Date('2026-09-16T12:00:00Z');
    const stale: any = await seedCase({ state: 'WAITING', waiting_since: new Date('2026-09-10T00:00:00Z'), sla_due_at: new Date('2026-09-15T00:00:00Z') });
    const fresh: any = await seedCase({ state: 'WAITING', waiting_since: new Date('2026-09-14T00:00:00Z'), sla_due_at: new Date('2026-09-20T00:00:00Z') });
    await seedCase({ state: 'RESOLVED', waiting_since: new Date('2026-09-01T00:00:00Z'), sla_due_at: new Date('2026-09-02T00:00:00Z') }); // closed: never listed
    await seedCase({ state: 'WAITING', waiting_since: null, sla_due_at: null }); // WAITING but never promoted: not in the ledger

    const waiting = await listWaiting();
    expect(waiting.map((r: any) => r.id).sort()).toEqual([stale.id, fresh.id].sort());

    const overdue = await listStaleWaiting(asOf);
    expect(overdue.map((r: any) => r.id)).toEqual([stale.id]);
  });
});
