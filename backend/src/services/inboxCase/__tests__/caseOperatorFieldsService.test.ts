// /inbox-zero T2b (CC-20260910-3q7x). T2 added snooze/priority columns; the
// plan audit found three readers and no writer. This is the writer's test:
// the Zod contract at the route boundary, the service's rules (snooze needs a
// reason, RESOLVED refuses, clearing a snooze clears its reason, every write
// leaves an event carrying the previous values), and the controller's status
// codes. Direct-invocation style, same as inboxCaseController.listCases.test.ts.

import { randomUUID } from 'crypto';
import { makeFakeModel } from './testHelpers/fakeModel';

const fakeInboxCase = makeFakeModel();
const fakeInboxCaseEvent = makeFakeModel();
const fakeInboxCaseItem = makeFakeModel();

jest.mock('../../../models/InboxCase', () => ({ __esModule: true, default: fakeInboxCase }));
jest.mock('../../../models/InboxCaseEvent', () => ({ __esModule: true, default: fakeInboxCaseEvent }));
jest.mock('../../../models/InboxCaseItem', () => ({ __esModule: true, default: fakeInboxCaseItem }));
jest.mock('../caseTicketService', () => ({
  ensureCaseTicket: jest.fn(async () => {}),
  syncTicketForCase: jest.fn(async () => {}),
  postCaseProgressNote: jest.fn(async () => {}),
}));

import { updateCaseOperatorFieldsSchema } from '../../../schemas/inboxCaseSchema';
import { updateCaseOperatorFields } from '../caseOperatorFieldsService';
import { handleUpdateCaseOperatorFields } from '../../../controllers/inboxCaseController';

beforeEach(() => {
  fakeInboxCase.rows.clear();
  fakeInboxCaseEvent.rows.clear();
  fakeInboxCaseItem.rows.clear();
});

async function seedCase(overrides: Partial<any> = {}) {
  return fakeInboxCase.create({
    title: 'Vendor W9',
    mode: 'TOPIC',
    state: 'ASSESSING',
    correlation_id: randomUUID(),
    reopen_count: 0,
    snoozed_until: null,
    snooze_reason: null,
    priority_band: null,
    priority_reason: null,
    ...overrides,
  });
}

const FUTURE = '2026-09-18T09:00:00.000Z';

describe('updateCaseOperatorFieldsSchema', () => {
  it('accepts a dated snooze with a reason', () => {
    expect(updateCaseOperatorFieldsSchema.safeParse({ snoozed_until: FUTURE, snooze_reason: 'Waiting for the Monday standup' }).success).toBe(true);
  });
  it('rejects a snooze without a reason', () => {
    const r = updateCaseOperatorFieldsSchema.safeParse({ snoozed_until: FUTURE });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.success ? [] : r.error.issues)).toMatch(/A snooze requires a reason/);
  });
  it('rejects an empty body and an invalid priority band', () => {
    expect(updateCaseOperatorFieldsSchema.safeParse({}).success).toBe(false);
    expect(updateCaseOperatorFieldsSchema.safeParse({ priority_band: 'P9' }).success).toBe(false);
  });
  it('accepts clearing the snooze with null, and a bare priority change', () => {
    expect(updateCaseOperatorFieldsSchema.safeParse({ snoozed_until: null }).success).toBe(true);
    expect(updateCaseOperatorFieldsSchema.safeParse({ priority_band: 'P0', priority_reason: 'Customer escalation' }).success).toBe(true);
  });
  it('rejects a non-ISO snoozed_until', () => {
    expect(updateCaseOperatorFieldsSchema.safeParse({ snoozed_until: 'next tuesday', snooze_reason: 'x' }).success).toBe(false);
  });
});

describe('updateCaseOperatorFields', () => {
  it('sets the fields and logs one event carrying the previous values', async () => {
    const c: any = await seedCase({ priority_band: 'P2', priority_reason: 'default' });
    const r = await updateCaseOperatorFields(c.id, { snoozed_until: FUTURE, snooze_reason: 'Standup Monday', priority_band: 'P0', priority_reason: 'Escalated' }, 'ali@colaberry.com');

    expect(r.before).toEqual({ snoozed_until: null, snooze_reason: null, priority_band: 'P2', priority_reason: 'default' });
    expect(r.after.snoozed_until!.toISOString()).toBe(FUTURE);
    expect(r.after).toMatchObject({ snooze_reason: 'Standup Monday', priority_band: 'P0', priority_reason: 'Escalated' });
    expect(c.snoozed_until.toISOString()).toBe(FUTURE);

    const events = await fakeInboxCaseEvent.findAll({ where: { case_id: c.id, event_type: 'case_operator_fields_updated' } });
    expect(events).toHaveLength(1);
    expect(events[0].actor_id).toBe('ali@colaberry.com');
    expect(events[0].details.before.priority_band).toBe('P2');
  });

  it('refuses to snooze a RESOLVED case', async () => {
    const c: any = await seedCase({ state: 'RESOLVED' });
    await expect(updateCaseOperatorFields(c.id, { snoozed_until: FUTURE, snooze_reason: 'x' }, 'a')).rejects.toMatchObject({ name: 'CaseResolvedError' });
    expect(c.snoozed_until).toBeNull();
  });

  it('refuses a snooze without a reason even when called directly (not only at the route)', async () => {
    const c: any = await seedCase();
    await expect(updateCaseOperatorFields(c.id, { snoozed_until: FUTURE, snooze_reason: '   ' }, 'a')).rejects.toMatchObject({ name: 'SnoozeRequiresReasonError' });
  });

  it('re-snoozing keeps the existing reason when none is supplied', async () => {
    const c: any = await seedCase({ snoozed_until: new Date('2026-09-12T00:00:00Z'), snooze_reason: 'Original reason' });
    const r = await updateCaseOperatorFields(c.id, { snoozed_until: FUTURE }, 'a');
    expect(r.after.snooze_reason).toBe('Original reason');
  });

  it('clearing the snooze also clears its reason', async () => {
    const c: any = await seedCase({ snoozed_until: new Date(FUTURE), snooze_reason: 'Standup Monday' });
    const r = await updateCaseOperatorFields(c.id, { snoozed_until: null }, 'a');
    expect(r.after).toMatchObject({ snoozed_until: null, snooze_reason: null });
  });

  it('a priority-only change leaves the snooze untouched', async () => {
    const c: any = await seedCase({ snoozed_until: new Date(FUTURE), snooze_reason: 'Standup Monday' });
    const r = await updateCaseOperatorFields(c.id, { priority_band: 'P1' }, 'a');
    expect(r.after.snoozed_until!.toISOString()).toBe(FUTURE);
    expect(r.after.priority_band).toBe('P1');
  });

  it('throws the repository not-found for an unknown case', async () => {
    await expect(updateCaseOperatorFields(randomUUID(), { priority_band: 'P1' }, 'a')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('handleUpdateCaseOperatorFields status codes', () => {
  function mockRes() {
    const res: any = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
  }

  it('200 on a valid snooze, echoing before/after', async () => {
    const c: any = await seedCase();
    const res = mockRes();
    await handleUpdateCaseOperatorFields({ params: { caseId: c.id }, body: { snoozed_until: FUTURE, snooze_reason: 'r' }, admin: { email: 'ali@colaberry.com' } } as any, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].after.snooze_reason).toBe('r');
  });

  it('400 on a snooze without a reason', async () => {
    const c: any = await seedCase();
    const res = mockRes();
    await handleUpdateCaseOperatorFields({ params: { caseId: c.id }, body: { snoozed_until: FUTURE } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('400 on an invalid priority band', async () => {
    const c: any = await seedCase();
    const res = mockRes();
    await handleUpdateCaseOperatorFields({ params: { caseId: c.id }, body: { priority_band: 'P7' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('409 on a RESOLVED case', async () => {
    const c: any = await seedCase({ state: 'RESOLVED' });
    const res = mockRes();
    await handleUpdateCaseOperatorFields({ params: { caseId: c.id }, body: { priority_band: 'P1' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error).toBe('CaseResolvedError');
  });

  it('404 on an unknown case', async () => {
    const res = mockRes();
    await handleUpdateCaseOperatorFields({ params: { caseId: randomUUID() }, body: { priority_band: 'P1' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
