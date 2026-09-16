// /inbox-zero T9a + T9d (CC-20260910-3q7x). The operator read model, run
// against the fixture set — this is the Phase 3 gate's dry-run demonstration.
// Pins: the six categories, DEGRADED beating ZERO, the recommended item and
// its WHY, delta returning only rows after the cursor with P0/P1-only
// interrupts, every focus mode, the zoom-out numbering, and that a refresh
// during an active draft leaves the draft untouched.

import { makeFakeModel } from './testHelpers/fakeModel';
import { CURSOR, NOW, seedFixture } from './fixtures/inboxZeroFixture';

const fakeInboxCase = makeFakeModel();
const fakeInboxCaseItem = makeFakeModel();
const fakeInboxCaseAction = makeFakeModel();
const fakeInboxCommitment = makeFakeModel();
const fakeInboxVip = makeFakeModel();
const fakeInboxCaseEvent = makeFakeModel();

jest.mock('../../../models/InboxCase', () => ({ __esModule: true, default: fakeInboxCase }));
jest.mock('../../../models/InboxCaseItem', () => ({ __esModule: true, default: fakeInboxCaseItem }));
jest.mock('../../../models/InboxCaseAction', () => ({ __esModule: true, default: fakeInboxCaseAction }));
jest.mock('../../../models/InboxCommitment', () => ({ __esModule: true, default: fakeInboxCommitment }));
jest.mock('../../../models/InboxVip', () => ({ __esModule: true, default: fakeInboxVip }));
jest.mock('../../../models/InboxCaseEvent', () => ({ __esModule: true, default: fakeInboxCaseEvent }));
// T16: `next` now asks the provider about its candidate through inboxLivenessService,
// which pulls in the closure/approval path. The gmail clients below are `{}`, so
// every check is "unverifiable" here — the fixture cases are shown as unverified,
// never hidden. Liveness itself is pinned in inboxLivenessService.test.ts.
const fakeOpsBcTodo = makeFakeModel();
const fakeInboxCaseQuestion = makeFakeModel();
jest.mock('../../../models/OpsBcTodo', () => ({ __esModule: true, default: fakeOpsBcTodo }));
jest.mock('../../../models/InboxCaseQuestion', () => ({ __esModule: true, default: fakeInboxCaseQuestion }));
jest.mock('../caseTicketService', () => ({
  ensureCaseTicket: jest.fn(async () => {}),
  syncTicketForCase: jest.fn(async () => {}),
  postCaseProgressNote: jest.fn(async () => {}),
}));

const backoff: Record<string, { consecutiveFailures: number; nextAttemptAt: string | null }> = {};
jest.mock('../../inbox/inboxSyncBackoff', () => ({
  getBackoffStatus: (p: string) => backoff[p] ?? { consecutiveFailures: 0, nextAttemptAt: null },
}));
let personalConfigured = true;
jest.mock('../../inbox/inboxSyncService', () => ({
  getColaberryGmailClient: () => ({}),
  getPersonalGmailClient: () => (personalConfigured ? {} : null),
}));
jest.mock('../../inbox/graphMailService', () => ({ isConfigured: () => true }));
let bcToken = 'tok';
jest.mock('../../ops/basecampToken', () => ({ getBcToken: () => { if (!bcToken) throw new Error('none'); return bcToken; } }));
let bcProbeError: Error | null = null;
jest.mock('../../ops/basecampClient', () => ({ bcGet: async () => { if (bcProbeError) throw bcProbeError; return { id: 1 }; } }));
let noiseCount: number | null = 7;
const noiseCountCalls: any[] = [];
jest.mock('../../../models/InboxClassification', () => ({
  __esModule: true,
  default: { count: async (q: any) => { noiseCountCalls.push(q); if (noiseCount === null) throw Object.assign(new Error('db down'), { name: 'SequelizeConnectionError' }); return noiseCount; } },
}));

import { categorise, getDelta, getFullHealth, getHealth, getNext, getOverview, scoreCase } from '../inboxZeroService';
import { getQueue } from '../inboxZeroQueueService';

let byKey: Record<string, any> = {};

beforeEach(async () => {
  for (const m of [fakeInboxCase, fakeInboxCaseItem, fakeInboxCaseAction, fakeInboxCommitment, fakeInboxVip, fakeInboxCaseEvent]) m.rows.clear();
  for (const k of Object.keys(backoff)) delete backoff[k];
  personalConfigured = true;
  bcToken = 'tok';
  bcProbeError = null;
  noiseCount = 7;
  noiseCountCalls.length = 0;
  byKey = await seedFixture({ cases: fakeInboxCase, items: fakeInboxCaseItem, actions: fakeInboxCaseAction, commitments: fakeInboxCommitment });
});

describe('health', () => {
  it('reports every provider, and a provider with consecutive failures makes the console degraded', () => {
    expect(getHealth()).toMatchObject({ degraded: false, basecamp: 'unprobed' }); // sync health never claims Basecamp is fine without asking
    backoff.gmail_personal = { consecutiveFailures: 3, nextAttemptAt: '2026-09-11T15:20:00.000Z' };
    const h = getHealth();
    expect(h.degraded).toBe(true);
    expect(h.degraded_reasons[0]).toMatch(/gmail_personal: 3 consecutive/);
    expect(h.providers.find((p) => p.provider === 'gmail_personal')!.state).toBe('degraded');
  });
  it('an unconfigured provider is not_configured, never degraded; missing Basecamp token is not_configured', () => {
    personalConfigured = false;
    bcToken = '';
    const h = getHealth();
    expect(h.providers.find((p) => p.provider === 'gmail_personal')!.state).toBe('not_configured');
    expect(h.degraded).toBe(false);
    expect(h.basecamp).toBe('not_configured');
  });
});

describe('categorise + score', () => {
  it('puts each fixture case in the category the brief defines', () => {
    expect(categorise(byKey.refund_p0, NOW)).toBe('due_now'); // P0
    expect(categorise(byKey.overdue_followup, NOW)).toBe('due_now'); // P2 but SLA passed
    expect(categorise(byKey.bc_ready, NOW)).toBe('needs_decision');
    expect(categorise(byKey.failed_verify, NOW)).toBe('needs_decision');
    expect(categorise(byKey.waiting_fresh, NOW)).toBe('waiting');
    expect(categorise(byKey.waiting_stale, NOW)).toBe('waiting');
    expect(categorise(byKey.review_legacy, NOW)).toBe('unassessed'); // ASSESSING is work, not review
    expect(categorise(byKey.snoozed, NOW)).toBe('snoozed');
  });
  it('an unassessed case with a P0/P1 override or a blown SLA is due now', async () => {
    await byKey.review_legacy.update({ priority_band: 'P1' });
    expect(categorise(byKey.review_legacy, NOW)).toBe('due_now');
  });
  it('the why is human-readable and names every signal that contributed', () => {
    const r = scoreCase(byKey.refund_p0, NOW);
    expect(r.score).toBeGreaterThan(1300);
    expect(r.why).toContain('P0 (money)');
    expect(r.why).toContain('waiting for your approval');
    expect(r.why).toContain('response needed (92%)');
    const legacy = scoreCase(byKey.review_legacy, NOW);
    expect(legacy.why).toContain('not yet assessed — run assess');
  });
});

describe('overview', () => {
  it('counts the six categories, excludes snoozed from actionable, and counts new-since-cursor', async () => {
    const o = await getOverview(CURSOR, NOW);
    expect(o.counts).toEqual({ due_now: 2, needs_decision: 2, unassessed: 1, waiting: 2, review: 0, snoozed: 1, new_since_cursor: 2, noise_24h: 7 });
    expect(o.status).toBe('ACTIVE');
    expect(o.health.basecamp).toBe('healthy'); // the live probe ran
    expect(o.recommended!.title).toBe('Refund request from a placed student');
    expect(o.recommended!.why).toContain('P0');
    expect(o.bottom_line).toMatch(/^2 due now, 2 need a decision, 1 not yet assessed, 2 waiting on others\. First: "Refund request/);
  });
  it('REGRESSION: a backlog of nothing but unassessed cases is NOT zero — it is the whole job', async () => {
    for (const k of ['refund_p0', 'overdue_followup', 'bc_ready', 'failed_verify', 'waiting_fresh', 'waiting_stale', 'snoozed']) await byKey[k].update({ state: 'RESOLVED' });
    // Only review_legacy (ASSESSING) remains open, every source healthy.
    const o = await getOverview(null, NOW);
    expect(o.status).not.toBe('ZERO');
    expect(o.status).toBe('ACTIVE');
    expect(o.counts.unassessed).toBe(1);
    expect(o.recommended).not.toBeNull();
    expect(o.recommended!.why).toContain('not yet assessed — run assess');
    expect(o.bottom_line).not.toMatch(/zero/i);
    const n = await getNext(null, NOW);
    expect(n).not.toBeNull();
    expect(n!.case.title).toBe('Newsletter reply thread');
    expect(n!.summary.response.legacy).toBe(true); // the skill runs assess + plan on this
  });
  it('never reports ZERO while a provider is degraded, even with nothing actionable', async () => {
    for (const k of ['refund_p0', 'overdue_followup', 'bc_ready', 'failed_verify', 'review_legacy']) await byKey[k].update({ state: 'RESOLVED' });
    backoff.hotmail = { consecutiveFailures: 1, nextAttemptAt: null };
    const o = await getOverview(null, NOW);
    expect(o.counts.due_now + o.counts.needs_decision + o.counts.unassessed).toBe(0);
    expect(o.status).toBe('DEGRADED');
    expect(o.bottom_line).toMatch(/degraded/);
    expect(o.bottom_line).not.toMatch(/zero/i);
  });
  it('a Basecamp that cannot answer its probe degrades the view too, and blocks ZERO', async () => {
    for (const k of ['refund_p0', 'overdue_followup', 'bc_ready', 'failed_verify', 'review_legacy']) await byKey[k].update({ state: 'RESOLVED' });
    bcProbeError = Object.assign(new Error('BC GET /my/profile.json -> 503'), { error_class: 'UpstreamUnavailable' });
    const o = await getOverview(null, NOW);
    expect(o.status).toBe('DEGRADED');
    expect(o.health.basecamp).toBe('degraded');
    expect(o.health.degraded_reasons.join(' ')).toMatch(/basecamp: UpstreamUnavailable/);
  });
  it('a failed gate-1 noise read shows null, never a guessed number, and logs a classified error', async () => {
    noiseCount = null;
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await getOverview(null, NOW)).counts.noise_24h).toBeNull();
    const line = spy.mock.calls.map((c) => String(c[0])).find((l) => l.includes('noise_count_read_failed'));
    expect(line).toBeTruthy();
    expect(JSON.parse(line!).error_class).toBe('SequelizeConnectionError');
    spy.mockRestore();
  });
  it('the noise read filters on the real model timestamp (classified_at), never a column it does not have', async () => {
    await getOverview(null, NOW);
    expect(noiseCountCalls).toHaveLength(1);
    const where = noiseCountCalls[0].where;
    expect(where.state).toBe('AUTOMATION');
    expect(where.classified_at).toBeDefined();
    expect(where.created_at).toBeUndefined();
  });
  it('reports actionable ZERO only when nothing needs Ali AND every source is healthy', async () => {
    for (const k of ['refund_p0', 'overdue_followup', 'bc_ready', 'failed_verify', 'review_legacy']) await byKey[k].update({ state: 'RESOLVED' });
    const o = await getOverview(null, NOW);
    expect(o.status).toBe('ZERO');
    expect(o.recommended).toBeNull();
    expect(o.bottom_line).toBe('Actionable zero. Nothing needs you right now; 2 item(s) are waiting on someone else.');
  });
});

describe('delta since cursor', () => {
  it('returns only cases updated after the cursor, in order, and interrupts only for P0/P1 due-now', async () => {
    const dlt = await getDelta(CURSOR, NOW);
    expect(dlt.cases.map((c) => c.title)).toEqual(['Cohort kickoff deck review', 'Refund request from a placed student', 'Newsletter reply thread']);
    expect(dlt.interrupts.map((c) => c.title)).toEqual(['Refund request from a placed student']);
    expect(dlt.next_cursor).toBe('2026-09-11T14:45:00.000Z');
  });
  it('T16: a case the sweep closed is counted as `closed`, never as new — but the cursor still moves past it', async () => {
    const closedNow: any = Array.from(fakeInboxCase.rows.values()).find((c: any) => c.state === 'RESOLVED');
    await closedNow.update({ updated_at: new Date('2026-09-11T14:50:00.000Z') });
    const dlt = await getDelta(CURSOR, NOW);
    expect(dlt.cases.map((c) => c.title)).not.toContain(closedNow.title);
    expect(dlt.closed).toBe(1);
    expect(dlt.count).toBe(3);
    expect(dlt.next_cursor).toBe('2026-09-11T14:50:00.000Z');
  });
  it('T16: an open case whose evidence has all left the inbox is hidden from the delta and counted as hidden_gone', async () => {
    const target: any = Array.from(fakeInboxCase.rows.values()).find((c: any) => c.title === 'Refund request from a placed student');
    const its = (Array.from(fakeInboxCaseItem.rows.values()) as any[]).filter((i) => i.case_id === target.id);
    expect(its.length).toBeGreaterThan(0); // a case with no evidence cannot be judged gone — pick one that has some
    for (const i of its) await i.update({ source_live: false, source_gone_reason: 'archived' });
    const dlt = await getDelta(CURSOR, NOW);
    expect(dlt.cases.map((c) => c.title)).toEqual(['Cohort kickoff deck review', 'Newsletter reply thread']);
    expect(dlt.interrupts).toEqual([]); // the hidden case was the only P0 due-now; a gone case can never interrupt
    expect(dlt.hidden_gone).toBe(1);
  });
  it('a refresh during an active draft does not touch the draft', async () => {
    const before = JSON.stringify(Array.from(fakeInboxCaseAction.rows.values()).map((r: any) => r.toJSON()));
    await getDelta(CURSOR, NOW);
    await getOverview(CURSOR, NOW);
    const after = JSON.stringify(Array.from(fakeInboxCaseAction.rows.values()).map((r: any) => r.toJSON()));
    expect(after).toBe(before);
  });
});

describe('next + focus', () => {
  it('default: the highest-scoring actionable case, with items, actions, commitments and destination', async () => {
    const f = (await getNext(null, NOW))!;
    expect(f.case.title).toBe('Refund request from a placed student');
    expect(f.destination).toBe('EMAIL');
    expect(f.owner).toBe('ALI');
    expect(f.items).toHaveLength(1);
    expect(f.items[0].from).toBe('student-a@example.com');
    expect(f.actions.map((a) => a.action_type)).toEqual(['EMAIL_SEND']);
    expect(f.actions[0].requires_individual_approval).toBe(true);
    expect(f.commitments[0].statement).toMatch(/confirm the refund date/);
  });
  it('focus urgent: due-now only; focus basecamp: BASECAMP/BOTH destination; focus waiting: stalest wait first', async () => {
    expect((await getNext('urgent', NOW))!.case.title).toBe('Refund request from a placed student');
    expect((await getNext('basecamp', NOW))!.case.title).toBe('Cohort kickoff deck review');
    const w = (await getNext('waiting', NOW))!;
    expect(w.case.title).toBe('Waiting on the bank for the wire');
    expect(w.owner).toBe('SENDER');
  });
  it('focus vip: only cases whose sender is on the VIP list', async () => {
    await fakeInboxVip.create({ email_address: 'vendor@example.com', name: 'Vendor', relationship: 'vendor', priority: 'high', added_by: 'ali' });
    const f = (await getNext('vip', NOW))!;
    expect(f.case.title).toBe('Vendor W9 still missing');
  });
  it('a snoozed case is never next, even at P1', async () => {
    for (const k of ['refund_p0', 'overdue_followup', 'bc_ready', 'failed_verify', 'review_legacy']) await byKey[k].update({ state: 'RESOLVED' });
    expect(await getNext(null, NOW)).toBeNull();
  });
  it('getFullHealth reports the live Basecamp probe; getHealth leaves it unprobed', async () => {
    expect(getHealth().basecamp).toBe('unprobed');
    expect((await getFullHealth()).basecamp).toBe('healthy');
  });
});

describe('zoom-out queue', () => {
  it('urgency view groups by category, numbers every case 1..N across the view, excludes snoozed', async () => {
    const q = await getQueue('urgency', NOW);
    expect(q.total).toBe(7);
    expect(q.groups.map((g) => [g.label, g.count])).toEqual([
      ['Due now', 2], ['Needs a decision', 2], ['Not yet assessed', 1], ['Waiting on someone else', 2],
    ]);
    const ns = q.groups.flatMap((g) => g.cases.map((c) => c.n));
    expect(ns).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(q.groups[0].cases[0].title).toBe('Refund request from a placed student');
  });
  it('destination, mailbox, owner and due views group as expected', async () => {
    const dest = await getQueue('destination', NOW);
    expect(Object.fromEntries(dest.groups.map((g) => [g.key, g.count]))).toEqual({ EMAIL: 2, BASECAMP: 1, NONE: 1, UNKNOWN: 3 });
    const mailbox = await getQueue('mailbox', NOW);
    // T20: every visible case has an email item, so every case lands in a real
    // mailbox group; "basecamp" is no longer a mailbox and "none" cannot happen.
    expect(Object.fromEntries(mailbox.groups.map((g) => [g.key, g.count]))).toEqual({ gmail_colaberry: 5, hotmail: 2 });
    const owner = await getQueue('owner', NOW);
    expect(Object.fromEntries(owner.groups.map((g) => [g.key, g.count]))).toEqual({ Ali: 5, 'waiting on sender': 2 });
    const due = await getQueue('due', NOW);
    expect(Object.fromEntries(due.groups.map((g) => [g.key, g.count]))).toEqual({ overdue: 2, 'due this week': 1, none: 4 });
  });
});
