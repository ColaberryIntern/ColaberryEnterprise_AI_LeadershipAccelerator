// /inbox-zero T16 (CC-20260910-3q7x). Ali, first live session: "This process
// should only be looking in my current inboxes. If I delete something from
// my inbox, then it should not show up on this report." The engine built a
// case from what was in the inbox at discovery and never asked again; the
// first item the live console recommended had been archived for weeks.
//
// These tests pin the liveness contract against the real service logic:
// each provider answer maps to exactly one verdict (extraction, not count),
// "could not check" never becomes "gone", a gone item is dispositioned and
// its case settles through the REAL closure guard (PROPOSED actions
// withdrawn first), the sweep rotates stalest-first and is bounded, a second
// pass writes nothing, a provider in backoff is skipped, and the console
// hides all-gone cases while still showing — and counting — unchecked ones.

import { randomUUID } from 'crypto';
import { makeFakeModel } from './testHelpers/fakeModel';

const fakeInboxCase = makeFakeModel();
const fakeInboxCaseItem = makeFakeModel();
const fakeInboxCaseAction = makeFakeModel();
const fakeInboxCaseEvent = makeFakeModel();
const fakeInboxCaseQuestion = makeFakeModel();
const fakeOpsBcTodo = makeFakeModel();
const fakeInboxCommitment = makeFakeModel();
const fakeInboxVip = makeFakeModel();

jest.mock('../../../models/InboxCase', () => ({ __esModule: true, default: fakeInboxCase }));
jest.mock('../../../models/InboxCaseItem', () => ({ __esModule: true, default: fakeInboxCaseItem }));
jest.mock('../../../models/InboxCaseAction', () => ({ __esModule: true, default: fakeInboxCaseAction }));
jest.mock('../../../models/InboxCaseEvent', () => ({
  __esModule: true,
  default: { ...fakeInboxCaseEvent, create: (attrs: any) => fakeInboxCaseEvent.create({ created_at: new Date(), ...attrs }) },
}));
jest.mock('../../../models/InboxCaseQuestion', () => ({ __esModule: true, default: fakeInboxCaseQuestion }));
jest.mock('../../../models/OpsBcTodo', () => ({ __esModule: true, default: fakeOpsBcTodo }));
jest.mock('../../../models/InboxCommitment', () => ({ __esModule: true, default: fakeInboxCommitment }));
jest.mock('../../../models/InboxVip', () => ({ __esModule: true, default: fakeInboxVip }));
jest.mock('../../../models/InboxClassification', () => ({ __esModule: true, default: { count: async () => 0 } }));
jest.mock('../caseTicketService', () => ({
  ensureCaseTicket: jest.fn(async () => {}),
  syncTicketForCase: jest.fn(async () => {}),
  postCaseProgressNote: jest.fn(async () => {}),
}));

// Provider fakes. Each test sets what the provider will say.
const gmailGet = jest.fn();
jest.mock('../../inbox/inboxSyncService', () => ({
  getColaberryGmailClient: () => ({ users: { messages: { get: (...a: any[]) => gmailGet(...a) } } }),
  getPersonalGmailClient: () => ({ users: { messages: { get: (...a: any[]) => gmailGet(...a) } } }),
}));
const hotmailInInbox = jest.fn();
jest.mock('../../inbox/graphMailService', () => ({
  isConfigured: () => true,
  isMessageInInbox: (...a: any[]) => hotmailInInbox(...a),
}));
const backoffSkip = jest.fn(() => false);
jest.mock('../../inbox/inboxSyncBackoff', () => ({
  shouldSkip: (...a: any[]) => backoffSkip(...a),
  getBackoffStatus: () => ({ consecutiveFailures: 0, nextAttemptAt: null }),
}));
jest.mock('../../ops/basecampToken', () => ({ getBcToken: () => 'x' }));
jest.mock('../../ops/basecampClient', () => ({ bcGet: async () => ({ id: 1 }) }));

import {
  checkItemLiveness,
  reconcileLiveness,
  settleCaseIfNoLiveItems,
  verifyCaseLivenessNow,
  DEFAULT_RECONCILE_LIMIT,
} from '../inboxLivenessService';
import { getNext, getOverview } from '../inboxZeroService';
import { loadVisibleCases } from '../inboxZeroVisibility';
import { getQueue } from '../inboxZeroQueueService';

const NOW = new Date('2026-09-11T20:30:00.000Z');
const CORR = 'test-corr';

function g404(): any { const e: any = new Error('Requested entity was not found.'); e.code = 404; return e; }

async function seedCase(over: Partial<any> = {}) {
  return fakeInboxCase.create({
    id: randomUUID(), title: 'Case', mode: 'TOPIC', state: 'AWAITING_APPROVAL', objective: null, summary: null,
    recommendation: null, confidence: 80, reopen_count: 0, assessment: null, priority_band: null, priority_reason: null,
    sla_due_at: null, snoozed_until: null, snooze_reason: null, waiting_since: null, correlation_id: 'c',
    opened_at: new Date('2026-08-01T00:00:00Z'), created_at: new Date('2026-08-01T00:00:00Z'), updated_at: new Date('2026-08-02T00:00:00Z'),
    closed_at: null, ...over,
  });
}

async function seedItem(caseId: string, over: Partial<any> = {}) {
  return fakeInboxCaseItem.create({
    id: randomUUID(), case_id: caseId, source_type: 'email', source_id: `m-${randomUUID().slice(0, 8)}`, provider: 'gmail_colaberry',
    source_url: null, title: 'Mail', occurred_at: new Date('2026-07-10T00:00:00Z'), match_score: 1, match_reasons: [],
    inclusion_status: 'INCLUDED', disposition: null, disposition_reason: null, snapshot: { from_address: 'a@b.c' }, source_hash: randomUUID(),
    source_live: null, source_checked_at: null, source_gone_reason: null, created_at: NOW, updated_at: NOW, ...over,
  });
}

beforeEach(() => {
  for (const m of [fakeInboxCase, fakeInboxCaseItem, fakeInboxCaseAction, fakeInboxCaseEvent, fakeInboxCaseQuestion, fakeOpsBcTodo, fakeInboxCommitment, fakeInboxVip]) m.rows.clear();
  gmailGet.mockReset();
  hotmailInInbox.mockReset();
  backoffSkip.mockReset().mockReturnValue(false);
});

describe('checkItemLiveness — one provider answer, one verdict', () => {
  it('Gmail: INBOX label present → live', async () => {
    gmailGet.mockResolvedValue({ data: { labelIds: ['INBOX', 'IMPORTANT'] } });
    const item = await seedItem('c1');
    expect(await checkItemLiveness(item)).toEqual({ kind: 'live' });
    expect(gmailGet).toHaveBeenCalledWith(expect.objectContaining({ id: item.source_id, format: 'minimal' }));
  });

  it("Gmail: no INBOX label (Ali's archived July-10 message: Label_119 + IMPORTANT) → gone/archived", async () => {
    gmailGet.mockResolvedValue({ data: { labelIds: ['Label_119', 'IMPORTANT'] } });
    const r = await checkItemLiveness(await seedItem('c1'));
    expect(r.kind).toBe('gone');
    expect((r as any).reason).toBe('archived');
  });

  it('Gmail: TRASH → trashed; SPAM → spam; 404 → missing (TRASH wins over a stale INBOX label)', async () => {
    gmailGet.mockResolvedValueOnce({ data: { labelIds: ['INBOX', 'TRASH'] } });
    expect((await checkItemLiveness(await seedItem('c1')) as any).reason).toBe('trashed');
    gmailGet.mockResolvedValueOnce({ data: { labelIds: ['SPAM'] } });
    expect((await checkItemLiveness(await seedItem('c1')) as any).reason).toBe('spam');
    gmailGet.mockRejectedValueOnce(g404());
    expect((await checkItemLiveness(await seedItem('c1')) as any).reason).toBe('missing');
  });

  it('Gmail: a non-404 error is unverifiable with an error class, never gone', async () => {
    const e: any = new Error('rate limit'); e.code = 429;
    gmailGet.mockRejectedValue(e);
    const r = await checkItemLiveness(await seedItem('c1'));
    expect(r.kind).toBe('unverifiable');
    expect((r as any).error_class).toBeTruthy();
  });

  it('Hotmail: inbox-scoped GET true → live, false → gone/not_in_inbox, throw → unverifiable', async () => {
    hotmailInInbox.mockResolvedValueOnce(true);
    expect((await checkItemLiveness(await seedItem('c1', { provider: 'hotmail' }))).kind).toBe('live');
    hotmailInInbox.mockResolvedValueOnce(false);
    expect((await checkItemLiveness(await seedItem('c1', { provider: 'hotmail' })) as any).reason).toBe('not_in_inbox');
    hotmailInInbox.mockRejectedValueOnce(Object.assign(new Error('graph 503'), { error_class: 'UpstreamUnavailable' }));
    const r = await checkItemLiveness(await seedItem('c1', { provider: 'hotmail' }));
    expect(r.kind).toBe('unverifiable');
    expect((r as any).error_class).toBe('UpstreamUnavailable');
  });

  it('Basecamp to-do: reads the mirror — completed → gone/completed, trashed → gone/trashed, active → live, no row → unverifiable', async () => {
    await fakeOpsBcTodo.create({ id: 't1', bc_id: 't1', status: 'completed' });
    await fakeOpsBcTodo.create({ id: 't2', bc_id: 't2', status: 'trashed' });
    await fakeOpsBcTodo.create({ id: 't3', bc_id: 't3', status: 'active' });
    const mk = (id: string) => seedItem('c1', { source_type: 'basecamp_todo', provider: 'basecamp', source_id: id });
    expect((await checkItemLiveness(await mk('t1')) as any).reason).toBe('completed');
    expect((await checkItemLiveness(await mk('t2')) as any).reason).toBe('trashed');
    expect((await checkItemLiveness(await mk('t3'))).kind).toBe('live');
    expect((await checkItemLiveness(await mk('t9'))).kind).toBe('unverifiable');
  });

  it('sent_email, basecamp_comment, attachment are not checkable (stay null, never gone)', async () => {
    for (const source_type of ['sent_email', 'basecamp_comment', 'basecamp_message', 'attachment']) {
      expect((await checkItemLiveness(await seedItem('c1', { source_type }))).kind).toBe('not_checkable');
    }
    expect(gmailGet).not.toHaveBeenCalled();
  });
});

describe('reconcileLiveness — the bounded sweep', () => {
  it("dispositions the archived case, withdraws its PROPOSED actions, closes it through the real guard, and logs the reason", async () => {
    const c = await seedCase();
    const item = await seedItem(c.id, { source_id: '19f4cebb4badda55' });
    const send = await fakeInboxCaseAction.create({ id: randomUUID(), case_id: c.id, action_type: 'EMAIL_SEND', status: 'PROPOSED', payload: {}, verification_status: null });
    const label = await fakeInboxCaseAction.create({ id: randomUUID(), case_id: c.id, action_type: 'EMAIL_LABEL', status: 'PROPOSED', payload: {}, verification_status: null });
    gmailGet.mockResolvedValue({ data: { labelIds: ['Label_119', 'IMPORTANT'] } });

    const r = await reconcileLiveness({ correlationId: CORR, now: NOW });

    expect(r).toMatchObject({ checked: 1, live: 0, gone: 1, unverifiable: 0, cases_closed: [c.id], close_blocked: [] });
    expect(item.source_live).toBe(false);
    expect(item.source_gone_reason).toBe('archived');
    expect(item.source_checked_at).toEqual(NOW);
    expect(item.disposition).toBe('NO_ACTION');
    expect(item.disposition_reason).toMatch(/no longer in your inbox \(archived\)/);
    expect(send.status).toBe('REJECTED');
    expect(label.status).toBe('REJECTED');
    expect(c.state).toBe('RESOLVED');

    const events = Array.from(fakeInboxCaseEvent.rows.values()).map((e: any) => e.event_type);
    expect(events).toEqual(expect.arrayContaining(['item_removed_at_source', 'action_rejected', 'case_resolved']));
    const removed: any = Array.from(fakeInboxCaseEvent.rows.values()).find((e: any) => e.event_type === 'item_removed_at_source');
    expect(removed.details).toMatchObject({ provider: 'gmail_colaberry', source_id: '19f4cebb4badda55', reason: 'archived' });
    expect(removed.actor_id).toBe('inbox_liveness');
    const rejected: any = Array.from(fakeInboxCaseEvent.rows.values()).find((e: any) => e.event_type === 'action_rejected');
    expect(rejected.details.reason).toMatch(/^source_gone/);
  });

  it('a live item is stamped live and left open; nothing else changes', async () => {
    const c = await seedCase();
    const item = await seedItem(c.id);
    gmailGet.mockResolvedValue({ data: { labelIds: ['INBOX'] } });
    const r = await reconcileLiveness({ correlationId: CORR, now: NOW });
    expect(r).toMatchObject({ checked: 1, live: 1, gone: 0, cases_closed: [] });
    expect(item.source_live).toBe(true);
    expect(item.disposition).toBeNull();
    expect(c.state).toBe('AWAITING_APPROVAL');
    expect(fakeInboxCaseEvent.rows.size).toBe(0);
  });

  it('unverifiable stamps source_checked_at only — source_live stays null, nothing dispositioned', async () => {
    const c = await seedCase();
    const item = await seedItem(c.id);
    gmailGet.mockRejectedValue(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
    const r = await reconcileLiveness({ correlationId: CORR, now: NOW });
    expect(r).toMatchObject({ checked: 1, unverifiable: 1, gone: 0 });
    expect(item.source_live).toBeNull();
    expect(item.source_checked_at).toEqual(NOW);
    expect(item.disposition).toBeNull();
  });

  it('a mixed case (one gone, one live) stays open; only the gone item is dispositioned', async () => {
    const c = await seedCase();
    const goneItem = await seedItem(c.id, { source_id: 'gone' });
    const liveItem = await seedItem(c.id, { source_id: 'live' });
    gmailGet.mockImplementation(async ({ id }: any) => ({ data: { labelIds: id === 'gone' ? ['Label_1'] : ['INBOX'] } }));
    const r = await reconcileLiveness({ correlationId: CORR, now: NOW });
    expect(r).toMatchObject({ gone: 1, live: 1, cases_closed: [] });
    expect(goneItem.disposition).toBe('NO_ACTION');
    expect(liveItem.disposition).toBeNull();
    expect(c.state).toBe('AWAITING_APPROVAL');
  });

  it('rotates stalest-first (never-checked before old), is bounded by limit, and skips rows checked recently', async () => {
    const c = await seedCase();
    const fresh = await seedItem(c.id, { source_id: 'fresh', source_checked_at: new Date(NOW.getTime() - 5 * 60_000), source_live: true });
    const old = await seedItem(c.id, { source_id: 'old', source_checked_at: new Date(NOW.getTime() - 3 * 3600_000), source_live: true });
    const never = await seedItem(c.id, { source_id: 'never' });
    gmailGet.mockResolvedValue({ data: { labelIds: ['INBOX'] } });

    const r = await reconcileLiveness({ correlationId: CORR, now: NOW, limit: 1 });
    expect(r.checked).toBe(1);
    expect(gmailGet).toHaveBeenCalledTimes(1);
    expect(gmailGet.mock.calls[0][0].id).toBe('never');
    expect(never.source_checked_at).toEqual(NOW);

    const r2 = await reconcileLiveness({ correlationId: CORR, now: NOW, limit: 5 });
    // 'never' and 'fresh' were checked within staleMinutes; only 'old' is due.
    expect(r2.checked).toBe(1);
    expect(gmailGet.mock.calls[1][0].id).toBe('old');
    expect(old.source_checked_at).toEqual(NOW);
    expect(fresh.source_checked_at).not.toEqual(NOW);
  });

  it('is idempotent: a second pass over already-settled rows writes nothing and calls no provider', async () => {
    const c = await seedCase();
    await seedItem(c.id);
    gmailGet.mockResolvedValue({ data: { labelIds: ['Label_1'] } });
    await reconcileLiveness({ correlationId: CORR, now: NOW });
    const eventsAfterFirst = fakeInboxCaseEvent.rows.size;
    gmailGet.mockClear();
    const r2 = await reconcileLiveness({ correlationId: CORR, now: NOW });
    expect(r2).toMatchObject({ checked: 0, gone: 0, cases_closed: [] });
    expect(gmailGet).not.toHaveBeenCalled();
    expect(fakeInboxCaseEvent.rows.size).toBe(eventsAfterFirst);
  });

  it('a provider in backoff is skipped, not guessed', async () => {
    const c = await seedCase();
    const item = await seedItem(c.id, { provider: 'gmail_personal' });
    backoffSkip.mockImplementation((p: string) => p === 'gmail_personal');
    const r = await reconcileLiveness({ correlationId: CORR, now: NOW });
    expect(r).toMatchObject({ checked: 0, skipped_backoff: 1 });
    expect(gmailGet).not.toHaveBeenCalled();
    expect(item.source_checked_at).toBeNull();
  });

  it('a throwing checker on one item never aborts the pass', async () => {
    const c = await seedCase();
    await seedItem(c.id, { source_id: 'boom' });
    const ok = await seedItem(c.id, { source_id: 'ok' });
    gmailGet.mockImplementation(async ({ id }: any) => { if (id === 'boom') throw new TypeError('unexpected'); return { data: { labelIds: ['INBOX'] } }; });
    const r = await reconcileLiveness({ correlationId: CORR, now: NOW });
    expect(r.checked).toBe(2);
    expect(r.unverifiable).toBe(1);
    expect(ok.source_live).toBe(true);
  });

  it('close blocked (an OPEN question) is reported, not forced; the case is still hidden by the console filter', async () => {
    const c = await seedCase();
    await seedItem(c.id);
    await fakeInboxCaseQuestion.create({ id: randomUUID(), case_id: c.id, status: 'OPEN', question: 'q' });
    gmailGet.mockResolvedValue({ data: { labelIds: ['Label_1'] } });
    const r = await reconcileLiveness({ correlationId: CORR, now: NOW });
    expect(r.close_blocked).toEqual([c.id]);
    expect(c.state).toBe('AWAITING_APPROVAL');
    expect(Array.from(fakeInboxCaseEvent.rows.values()).some((e: any) => e.event_type === 'case_liveness_close_blocked')).toBe(true);
    const visible = await loadVisibleCases();
    expect(visible.cases.map((x) => x.id)).not.toContain(c.id);
    expect(visible.liveness.gone_hidden_cases).toBe(1);
  });

  it('default limit is 150 and the sweep never exceeds it', async () => {
    const c = await seedCase();
    for (let i = 0; i < 160; i++) await seedItem(c.id, { source_id: `m${i}` });
    gmailGet.mockResolvedValue({ data: { labelIds: ['INBOX'] } });
    const r = await reconcileLiveness({ correlationId: CORR, now: NOW });
    expect(DEFAULT_RECONCILE_LIMIT).toBe(150);
    expect(r.checked).toBe(150);
  });
});

describe('settleCaseIfNoLiveItems', () => {
  it('leaves a case with open evidence alone', async () => {
    const c = await seedCase();
    await seedItem(c.id);
    expect(await settleCaseIfNoLiveItems(c.id, CORR)).toBe('still_open');
    expect(c.state).toBe('AWAITING_APPROVAL');
  });
});

describe('the console honours liveness', () => {
  it('overview/queue hide an all-gone case, show an unchecked one, and count what is unverified', async () => {
    const goneCase = await seedCase({ title: 'gone' });
    await seedItem(goneCase.id, { source_live: false, source_gone_reason: 'archived', disposition: 'NO_ACTION' });
    const unknownCase = await seedCase({ title: 'unknown' });
    await seedItem(unknownCase.id);
    await seedItem(unknownCase.id, { source_type: 'sent_email' }); // not checkable → never counted as unchecked
    const liveCase = await seedCase({ title: 'live' });
    await seedItem(liveCase.id, { source_live: true, source_checked_at: NOW });

    const ov = await getOverview(null, NOW);
    expect(ov.counts.needs_decision).toBe(2);
    expect(ov.liveness).toEqual({ unchecked_items: 1, gone_hidden_cases: 1, last_checked_at: NOW.toISOString() });
    expect(ov.bottom_line).toMatch(/1 item\(s\) have not yet been checked against your inbox/);

    const q = await getQueue('urgency', NOW);
    const titles = q.groups.flatMap((g) => g.cases.map((s) => s.title));
    expect(titles).toEqual(expect.arrayContaining(['unknown', 'live']));
    expect(titles).not.toContain('gone');
  });

  it('next asks the provider about the top candidate first; an all-gone candidate is settled and the next live one is returned', async () => {
    const top = await seedCase({ title: 'archived-top', opened_at: new Date('2026-07-01T00:00:00Z') });
    await seedItem(top.id, { source_id: 'top' });
    await fakeInboxCaseAction.create({ id: randomUUID(), case_id: top.id, action_type: 'EMAIL_SEND', status: 'PROPOSED', payload: {}, verification_status: null });
    const second = await seedCase({ title: 'still-there', opened_at: new Date('2026-08-01T00:00:00Z') });
    await seedItem(second.id, { source_id: 'second' });
    gmailGet.mockImplementation(async ({ id }: any) => ({ data: { labelIds: id === 'top' ? ['Label_119', 'IMPORTANT'] : ['INBOX'] } }));

    const focus = await getNext(null, NOW, CORR);
    expect(focus?.case.title).toBe('still-there');
    expect(focus?.liveness).toMatchObject({ verified_at: NOW.toISOString(), live: 1, gone: [], unverified: [], unchecked: 0 });
    expect(top.state).toBe('RESOLVED');
    expect(gmailGet).toHaveBeenCalledTimes(2);
  });

  it('next returns null when every candidate has left the inbox', async () => {
    const only = await seedCase();
    await seedItem(only.id);
    gmailGet.mockResolvedValue({ data: { labelIds: [] } });
    expect(await getNext(null, NOW, CORR)).toBeNull();
    expect(only.state).toBe('RESOLVED');
  });

  it('next presents an unverifiable candidate honestly rather than skipping or hiding it', async () => {
    const c = await seedCase();
    const item = await seedItem(c.id);
    gmailGet.mockRejectedValue(Object.assign(new Error('503'), { code: 503 }));
    const focus = await getNext(null, NOW, CORR);
    expect(focus?.case.id).toBe(c.id);
    expect(focus?.liveness.unverified).toEqual([{ item_id: item.id, error_class: expect.any(String) }]);
    expect(item.source_live).toBeNull();
  });

  it('verifyCaseLivenessNow: all_gone requires every open item gone — one unverified item keeps the case', async () => {
    const c = await seedCase();
    await seedItem(c.id, { source_id: 'g' });
    await seedItem(c.id, { source_id: 'u' });
    gmailGet.mockImplementation(async ({ id }: any) => { if (id === 'u') throw Object.assign(new Error('x'), { code: 500 }); return { data: { labelIds: [] } }; });
    const r = await verifyCaseLivenessNow(c.id, CORR, NOW);
    expect(r.all_gone).toBe(false);
    expect(r.gone).toHaveLength(1);
    expect(r.unverified).toHaveLength(1);
    expect(c.state).toBe('AWAITING_APPROVAL');
  });
});
