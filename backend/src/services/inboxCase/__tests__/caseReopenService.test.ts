// /inbox-zero T7 (CC-20260910-3q7x). Before this, a reply on a thread whose
// case Ali had resolved spawned a SECOND case with none of the first one's
// history; the only reopen trigger was source deletion. These tests pin:
// the reply reopens the owning case through caseRepository.reopenCase (so
// the end state is ASSESSING with reopen_count incremented, not a rest in
// REOPENED), attaches as an INCLUDED item, is removed from the candidates
// that would become a new case, is idempotent on re-run, and leaves cases
// in non-reopenable states alone. Plus the compensating revert script's
// planning step, and the MARK_DELEGATED planner builder.

import { randomUUID } from 'crypto';
import { makeFakeModel } from './testHelpers/fakeModel';

const fakeInboxCase = makeFakeModel();
const fakeInboxCaseItem = makeFakeModel();
const fakeInboxCaseAction = makeFakeModel();
const fakeInboxCaseEvent = makeFakeModel();
const fakeInboxCaseQuestion = makeFakeModel();

jest.mock('../../../models/InboxCase', () => ({ __esModule: true, default: fakeInboxCase }));
jest.mock('../../../models/InboxCaseItem', () => ({
  __esModule: true,
  default: {
    ...fakeInboxCaseItem,
    // The real table has UNIQUE (case_id, source_hash); simulate it.
    async create(attrs: any) {
      const dup = Array.from(fakeInboxCaseItem.rows.values()).some((r: any) => r.case_id === attrs.case_id && r.source_hash === attrs.source_hash);
      if (dup) { const e: any = new Error('duplicate key'); e.name = 'SequelizeUniqueConstraintError'; throw e; }
      return fakeInboxCaseItem.create(attrs);
    },
    // Static Model.update(values, { where }) — the planner's no-actions
    // auto-NO_ACTION path uses it.
    async update(values: any, { where }: any) {
      const rows = await fakeInboxCaseItem.findAll({ where });
      for (const r of rows) Object.assign(r, values);
      return [rows.length];
    },
  },
}));
jest.mock('../../../models/InboxCaseAction', () => ({ __esModule: true, default: fakeInboxCaseAction }));
// The real table defaults created_at; the revert script filters on it.
jest.mock('../../../models/InboxCaseEvent', () => ({
  __esModule: true,
  default: { ...fakeInboxCaseEvent, create: (attrs: any) => fakeInboxCaseEvent.create({ created_at: new Date(), ...attrs }) },
}));
jest.mock('../../../models/InboxCaseQuestion', () => ({ __esModule: true, default: fakeInboxCaseQuestion }));
// /inbox-zero T8: generatePlan records Ali's own commitments on the ledger.
const fakeInboxCommitment = makeFakeModel();
jest.mock('../../../models/InboxCommitment', () => ({ __esModule: true, default: fakeInboxCommitment }));
jest.mock('../caseTicketService', () => ({
  ensureCaseTicket: jest.fn(async () => {}),
  syncTicketForCase: jest.fn(async () => {}),
  postCaseProgressNote: jest.fn(async () => {}),
}));

import { reopenCasesOnNewReplies } from '../caseReopenService';
import { applyRevert, planRevert } from '../../../scripts/revertInboxZeroReopens';
import { createActionIfNew, generatePlan } from '../caseActionPlanner';

beforeEach(() => {
  for (const m of [fakeInboxCase, fakeInboxCaseItem, fakeInboxCaseAction, fakeInboxCaseEvent, fakeInboxCaseQuestion, fakeInboxCommitment]) m.rows.clear();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

async function seedCase(state: string, overrides: Partial<any> = {}) {
  return fakeInboxCase.create({
    title: 'SOW with Priya', mode: 'TOPIC', state, correlation_id: randomUUID(), reopen_count: 0,
    closed_at: state === 'RESOLVED' ? new Date('2026-09-01T00:00:00Z') : null,
    waiting_since: state === 'WAITING' ? new Date('2026-09-02T00:00:00Z') : null,
    sla_due_at: state === 'WAITING' ? new Date('2026-09-05T00:00:00Z') : null,
    teaching_brief: { recommended_decision: 'Hand the SOW draft to Kes', rationale: 'r' },
    ...overrides,
  });
}

async function seedOwnedThread(caseId: string, threadId: string, provider = 'gmail_colaberry') {
  return fakeInboxCaseItem.create({
    case_id: caseId, source_type: 'email', source_id: `orig-${threadId}`, provider, source_url: 'https://mail/x', title: 'Original',
    occurred_at: new Date('2026-08-30T00:00:00Z'), inclusion_status: 'INCLUDED', disposition: 'RESOLVED', snapshot: { thread_id: threadId }, source_hash: `h-orig-${threadId}`,
  });
}

function reply(threadId: string, id = randomUUID(), provider: any = 'gmail_colaberry'): any {
  return {
    source_type: 'email', source_id: `msg-${id}`, provider, source_url: null, title: 'Re: SOW', occurred_at: new Date(),
    participants: ['priya@example.com'], subject_normalized: 'sow', thread_id: threadId, message_id: `<${id}@x>`, in_reply_to: [],
    basecamp_refs: [], attachment_names: [], body_excerpt: 'Any update?', snapshot: { from_address: 'priya@example.com' },
    score: 1, reasons: [], sourceHash: `h-${id}`, inclusionStatus: 'INCLUDED',
  };
}

describe('reopenCasesOnNewReplies', () => {
  it('a reply on a RESOLVED case reopens it to ASSESSING with reopen_count+1, attaches the reply, and does not pass it through', async () => {
    const c: any = await seedCase('RESOLVED');
    await seedOwnedThread(c.id, 'T1');
    const r = reply('T1');

    const out = await reopenCasesOnNewReplies([r], randomUUID());

    expect(out.reopenedCaseIds).toEqual([c.id]);
    expect(out.attached).toBe(1);
    expect(out.passthrough).toEqual([]); // would otherwise have become a NEW case
    expect(c.state).toBe('ASSESSING'); // reopenCase goes REOPENED -> ASSESSING in one call
    expect(c.reopen_count).toBe(1);
    expect(c.closed_at).toBeNull();
    const attachedItem: any = await fakeInboxCaseItem.findOne({ where: { case_id: c.id, source_hash: r.sourceHash } });
    expect(attachedItem).toMatchObject({ inclusion_status: 'INCLUDED', disposition: null });
    expect(attachedItem.snapshot.thread_id).toBe('T1');
    const ev: any = (await fakeInboxCaseEvent.findAll({ where: { case_id: c.id, event_type: 'case_reopened' } }))[0];
    expect(ev.details).toMatchObject({ reopened_by: 'inbox_zero_reopen', thread_id: 'T1', previous_closed_at: '2026-09-01T00:00:00.000Z' });
    expect(ev.previous_state).toBe('RESOLVED');
  });

  it('a reply on a WAITING case reopens it too, and clears the waiting-ledger columns', async () => {
    const c: any = await seedCase('WAITING');
    await seedOwnedThread(c.id, 'T2');
    await reopenCasesOnNewReplies([reply('T2')], randomUUID());
    expect(c.state).toBe('ASSESSING');
    expect(c.waiting_since).toBeNull();
    expect(c.sla_due_at).toBeNull();
    const ev: any = (await fakeInboxCaseEvent.findAll({ where: { case_id: c.id, event_type: 'case_reopened' } }))[0];
    expect(ev.details.previous_waiting_since).toBe('2026-09-02T00:00:00.000Z');
  });

  it('a reply on a case in ASSESSING is passed through untouched (today\'s behaviour, on purpose)', async () => {
    const c: any = await seedCase('ASSESSING');
    await seedOwnedThread(c.id, 'T3');
    const r = reply('T3');
    const out = await reopenCasesOnNewReplies([r], randomUUID());
    expect(out.reopenedCaseIds).toEqual([]);
    expect(out.passthrough).toEqual([r]);
    expect(c.reopen_count).toBe(0);
  });

  it('two replies on the same thread in one run reopen once and attach both', async () => {
    const c: any = await seedCase('RESOLVED');
    await seedOwnedThread(c.id, 'T4');
    const out = await reopenCasesOnNewReplies([reply('T4', 'a'), reply('T4', 'b')], randomUUID());
    expect(out.reopenedCaseIds).toEqual([c.id]);
    expect(out.attached).toBe(2);
    expect(out.passthrough).toEqual([]);
    expect(c.reopen_count).toBe(1);
  });

  it('a thread split across two cases (pre-T7 data) reopens the OLDEST reopenable one, and every reply on it lands there', async () => {
    const older: any = await seedCase('RESOLVED', { opened_at: new Date('2026-08-01T00:00:00Z') });
    const newer: any = await seedCase('RESOLVED', { opened_at: new Date('2026-08-20T00:00:00Z') });
    const stuck: any = await seedCase('ASSESSING', { opened_at: new Date('2026-07-01T00:00:00Z') }); // oldest, but not reopenable
    await seedOwnedThread(older.id, 'T12');
    await seedOwnedThread(newer.id, 'T12');
    await seedOwnedThread(stuck.id, 'T12');

    const out = await reopenCasesOnNewReplies([reply('T12', 'a'), reply('T12', 'b')], randomUUID());

    expect(out.reopenedCaseIds).toEqual([older.id]);
    expect(out.attached).toBe(2);
    expect(newer.state).toBe('RESOLVED'); // NOT also reopened by the second reply
    expect(stuck.state).toBe('ASSESSING');
    expect(await fakeInboxCaseItem.findAll({ where: { case_id: older.id, source_hash: 'h-a' } })).toHaveLength(1);
    expect(await fakeInboxCaseItem.findAll({ where: { case_id: older.id, source_hash: 'h-b' } })).toHaveLength(1);
  });

  it('is idempotent: re-running with the same reply reopens nothing and attaches nothing', async () => {
    const c: any = await seedCase('RESOLVED');
    await seedOwnedThread(c.id, 'T5');
    const r = reply('T5', 'same');
    await reopenCasesOnNewReplies([r], randomUUID());
    // Second run: the case is now ASSESSING (not reopenable) and the item already exists.
    const out = await reopenCasesOnNewReplies([r], randomUUID());
    expect(out.reopenedCaseIds).toEqual([]);
    expect(out.attached).toBe(0);
    expect(c.reopen_count).toBe(1);
  });

  it('matches on provider AND thread — the same thread id on another mailbox is a different thread', async () => {
    const c: any = await seedCase('RESOLVED');
    await seedOwnedThread(c.id, 'T6', 'gmail_colaberry');
    const r = reply('T6', 'x', 'gmail_personal');
    const out = await reopenCasesOnNewReplies([r], randomUUID());
    expect(out.passthrough).toEqual([r]);
    expect(c.state).toBe('RESOLVED');
  });

  it('candidates without a thread id, and non-email candidates, pass straight through with no lookup', async () => {
    const r1 = { ...reply('T7'), thread_id: null };
    const r2 = { ...reply('T8'), source_type: 'basecamp_todo' };
    const out = await reopenCasesOnNewReplies([r1, r2], randomUUID());
    expect(out.passthrough).toHaveLength(2);
    expect(out.reopenedCaseIds).toEqual([]);
  });
});

describe('revertInboxZeroReopens.planRevert', () => {
  it('plans a revert only for reopens this service performed after the given time, with the prior closed_at', async () => {
    const c: any = await seedCase('RESOLVED');
    await seedOwnedThread(c.id, 'T9');
    await reopenCasesOnNewReplies([reply('T9')], randomUUID());
    // A manual reopen by Ali must NOT be in the plan.
    const manual: any = await seedCase('RESOLVED');
    await fakeInboxCaseEvent.create({ case_id: manual.id, event_type: 'case_reopened', actor_type: 'admin', actor_id: 'ali', previous_state: 'RESOLVED', details: { reason: 'by hand' }, correlation_id: manual.correlation_id, created_at: new Date() });

    const plan = await planRevert(new Date(Date.now() - 60_000));
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ case_id: c.id, previous_state: 'RESOLVED', previous_closed_at: '2026-09-01T00:00:00.000Z' });
    expect(plan[0].reply_item_ids).toHaveLength(1);
  });
});

describe('revertInboxZeroReopens.applyRevert', () => {
  it('restores state and closed_at, decrements reopen_count, dispositions the reply NO_ACTION, logs an event', async () => {
    const c: any = await seedCase('RESOLVED');
    await seedOwnedThread(c.id, 'T10');
    await reopenCasesOnNewReplies([reply('T10', 'r10')], randomUUID());
    expect(c.state).toBe('ASSESSING');

    const plan = await planRevert(new Date(Date.now() - 60_000));
    const n = await applyRevert(plan);

    expect(n).toBe(1);
    expect(c.state).toBe('RESOLVED');
    expect(c.closed_at.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(c.reopen_count).toBe(0);
    const replyItem: any = await fakeInboxCaseItem.findOne({ where: { case_id: c.id, source_hash: 'h-r10' } });
    expect(replyItem.disposition).toBe('NO_ACTION');
    const ev = await fakeInboxCaseEvent.findAll({ where: { case_id: c.id, event_type: 'case_reopen_reverted' } });
    expect(ev).toHaveLength(1);
  });

  it('leaves a case alone if Ali has already moved it past ASSESSING', async () => {
    const c: any = await seedCase('RESOLVED');
    await seedOwnedThread(c.id, 'T11');
    await reopenCasesOnNewReplies([reply('T11', 'r11')], randomUUID());
    await c.update({ state: 'READY_TO_PLAN' }); // Ali acted on it
    const plan = await planRevert(new Date(Date.now() - 60_000));
    expect(await applyRevert(plan)).toBe(0);
    expect(c.state).toBe('READY_TO_PLAN');
  });
});

describe('MARK_DELEGATED builder', () => {
  async function seedPlannable(assessment: Partial<any>) {
    const c: any = await seedCase('READY_TO_PLAN', {
      assessment: { recommended_next_actions: ['Hand the SOW draft to Kes'], commitments_made: [], missing_information: [], response_needed: 'YES', response_needed_confidence: 90, response_needed_reason: 'x', ...assessment },
    });
    const item: any = await fakeInboxCaseItem.create({
      case_id: c.id, source_type: 'email', source_id: 'e1', provider: 'gmail_colaberry', source_url: 'https://mail/e1', title: 'SOW?',
      occurred_at: new Date(), inclusion_status: 'INCLUDED', disposition: null, snapshot: { from_address: 'priya@example.com' }, source_hash: 'h-e1', match_score: 1,
    });
    return { c, item };
  }

  it('an INTERNAL_TASK verdict with a non-Ali current_owner proposes exactly one MARK_DELEGATED, idempotent on re-plan', async () => {
    const { c, item } = await seedPlannable({ current_owner: 'Kes', response_channel: 'INTERNAL_TASK' });
    await generatePlan(c.id, 'ali');
    const delegated = (await fakeInboxCaseAction.findAll({ where: { case_id: c.id, action_type: 'MARK_DELEGATED' } })) as any[];
    expect(delegated).toHaveLength(1);
    expect(delegated[0]).toMatchObject({ item_id: item.id, status: 'PROPOSED', risk_level: 'LOW' });
    expect(delegated[0].payload).toMatchObject({ owner: 'Kes', source_url: 'https://mail/e1' });
    expect(delegated[0].preview).toMatch(/^Delegate to Kes: /);

    await c.update({ state: 'READY_TO_PLAN' });
    await generatePlan(c.id, 'ali');
    expect(await fakeInboxCaseAction.findAll({ where: { case_id: c.id, action_type: 'MARK_DELEGATED' } })).toHaveLength(1);
  });

  it('does NOT delegate when the owner is Ali, or when the channel is not INTERNAL_TASK', async () => {
    const a = await seedPlannable({ current_owner: 'Ali Muwwakkil', response_channel: 'INTERNAL_TASK' });
    await generatePlan(a.c.id, 'ali');
    expect(await fakeInboxCaseAction.findAll({ where: { case_id: a.c.id, action_type: 'MARK_DELEGATED' } })).toHaveLength(0);

    const b = await seedPlannable({ current_owner: 'Kes', response_channel: 'EMAIL' });
    await generatePlan(b.c.id, 'ali');
    expect(await fakeInboxCaseAction.findAll({ where: { case_id: b.c.id, action_type: 'MARK_DELEGATED' } })).toHaveLength(0);
  });

  it('createActionIfNew still accepts a MARK_DELEGATED proposal directly (quick-resolve/override path)', async () => {
    const { c, item } = await seedPlannable({});
    const id = await createActionIfNew(c, c.correlation_id, 'ali', {
      action_type: 'MARK_DELEGATED', item_id: item.id, target_source: 'case', target_id: null, preview: 'Delegate to Kes: x', payload: { owner: 'Kes' }, risk_level: 'LOW', idempotencyParts: ['k'],
    }, `k-${randomUUID()}`, []);
    expect(id).toBeTruthy();
  });
});
