// /inbox-zero T8 (CC-20260910-3q7x). The planner dropped every commitment
// Ali made (buildWaitingActions: "Ali's own commitments aren't waiting on
// someone else"), and that was the only consumer of commitments_made, so
// his promises vanished. These tests pin the ledger that catches them:
// Ali-owned -> one row (idempotent), non-Ali -> MARK_WAITING and NO row,
// overdue only with a past due_at, undated never overdue, and the sent-mail
// carve-out touching no transport at all while its flag is off.

import { randomUUID } from 'crypto';
import { makeFakeModel } from './testHelpers/fakeModel';

const fakeInboxCase = makeFakeModel();
const fakeInboxCaseItem = makeFakeModel();
const fakeInboxCaseAction = makeFakeModel();
const fakeInboxCaseEvent = makeFakeModel();
const fakeInboxCaseQuestion = makeFakeModel();
const fakeInboxCommitment = makeFakeModel();

jest.mock('../../../models/InboxCase', () => ({ __esModule: true, default: fakeInboxCase }));
jest.mock('../../../models/InboxCaseItem', () => ({
  __esModule: true,
  default: {
    ...fakeInboxCaseItem,
    async update(values: any, { where }: any) {
      const rows = await fakeInboxCaseItem.findAll({ where });
      for (const r of rows) Object.assign(r, values);
      return [rows.length];
    },
  },
}));
jest.mock('../../../models/InboxCaseAction', () => ({ __esModule: true, default: fakeInboxCaseAction }));
jest.mock('../../../models/InboxCaseEvent', () => ({ __esModule: true, default: fakeInboxCaseEvent }));
jest.mock('../../../models/InboxCaseQuestion', () => ({ __esModule: true, default: fakeInboxCaseQuestion }));
jest.mock('../../../models/InboxCommitment', () => ({
  __esModule: true,
  default: {
    ...fakeInboxCommitment,
    // UNIQUE (case_id, statement_hash), as the DDL declares.
    async create(attrs: any) {
      const dup = Array.from(fakeInboxCommitment.rows.values()).some((r: any) => r.case_id === attrs.case_id && r.statement_hash === attrs.statement_hash);
      if (dup) { const e: any = new Error('duplicate key'); e.name = 'SequelizeUniqueConstraintError'; throw e; }
      return fakeInboxCommitment.create(attrs);
    },
  },
}));
jest.mock('../caseTicketService', () => ({
  ensureCaseTicket: jest.fn(async () => {}),
  syncTicketForCase: jest.fn(async () => {}),
  postCaseProgressNote: jest.fn(async () => {}),
}));

const threadsGet = jest.fn();
let gmailAvailable = true;
jest.mock('../../inbox/inboxSyncService', () => ({
  getColaberryGmailClient: () => (gmailAvailable ? { users: { threads: { get: (...a: any[]) => threadsGet(...a) } } } : null),
  getPersonalGmailClient: () => null,
  extractBodyText: () => '',
}));

import {
  commitmentHash,
  extractPromisesFromText,
  fulfillCommitment,
  listOpenCommitments,
  listOverdueCommitments,
  recordCommitmentsFromAssessment,
  scanSentMailForCommitments,
  SENT_MAIL_COMMITMENTS_FLAG,
} from '../commitmentLedgerService';
import { generatePlan } from '../caseActionPlanner';
import { caseAssessmentOutputSchema } from '../../../schemas/inboxCaseSchema';

beforeEach(() => {
  for (const m of [fakeInboxCase, fakeInboxCaseItem, fakeInboxCaseAction, fakeInboxCaseEvent, fakeInboxCaseQuestion, fakeInboxCommitment]) m.rows.clear();
  threadsGet.mockReset();
  gmailAvailable = true;
  delete process.env[SENT_MAIL_COMMITMENTS_FLAG];
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const ev = (item_id = 'i1') => [{ item_id, source_type: 'email', quote: 'q' }];

async function seedCase(commitments: any[]) {
  return fakeInboxCase.create({
    title: 'SOW', mode: 'TOPIC', state: 'READY_TO_PLAN', correlation_id: randomUUID(), reopen_count: 0,
    teaching_brief: { recommended_decision: 'Send the SOW', rationale: 'r' },
    assessment: { recommended_next_actions: ['Send the SOW'], commitments_made: commitments, missing_information: [], response_needed: 'YES', response_needed_confidence: 90, response_needed_reason: 'x' },
  });
}

describe('recordCommitmentsFromAssessment', () => {
  it('an Ali-owned commitment creates exactly one ledger row instead of being dropped; a non-Ali one creates none', async () => {
    const c: any = await seedCase([
      { statement: 'I will send the signed SOW by Friday', owner: 'Ali', due_at: '2026-09-12T17:00:00Z', evidence: ev('i-sent') },
      { statement: 'Priya will send the PO', owner: 'Priya', evidence: ev() },
    ]);
    const r = await recordCommitmentsFromAssessment(c, c.assessment);
    expect(r).toEqual({ created: 1, skippedExisting: 0, skippedNotAli: 1 });
    const rows = Array.from(fakeInboxCommitment.rows.values()) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ case_id: c.id, status: 'OPEN', source: 'assessment', source_item_id: 'i-sent' });
    expect(rows[0].due_at.toISOString()).toBe('2026-09-12T17:00:00.000Z');
    expect(rows[0].statement_hash).toBe(commitmentHash('I will send the signed SOW by Friday'));
    const events = await fakeInboxCaseEvent.findAll({ where: { case_id: c.id, event_type: 'commitment_recorded' } });
    expect(events).toHaveLength(1);
  });

  it('recognises Ali by name, by first name, and by address — but not "Alicia"', async () => {
    const c: any = await seedCase([
      { statement: 'A', owner: 'Ali Muwwakkil', evidence: [] },
      { statement: 'B', owner: 'ali@colaberry.com', evidence: [] },
      { statement: 'C', owner: 'Alicia Grant', evidence: [] },
    ]);
    const r = await recordCommitmentsFromAssessment(c, c.assessment);
    expect(r).toMatchObject({ created: 2, skippedNotAli: 1 });
  });

  it('is idempotent on re-plan: the same promise is one row, even with different whitespace/case', async () => {
    const c: any = await seedCase([{ statement: 'I will call Kes', owner: 'Ali', evidence: [] }]);
    await recordCommitmentsFromAssessment(c, c.assessment);
    const again = await recordCommitmentsFromAssessment(c, { ...c.assessment, commitments_made: [{ statement: '  i WILL   call kes ', owner: 'Ali', evidence: [] }] });
    expect(again).toMatchObject({ created: 0, skippedExisting: 1 });
    expect(fakeInboxCommitment.rows.size).toBe(1);
  });

  it('a legacy assessment with no due_at records the commitment undated', async () => {
    const c: any = await seedCase([{ statement: 'I will follow up', owner: 'Ali', evidence: [] }]);
    await recordCommitmentsFromAssessment(c, c.assessment);
    expect((Array.from(fakeInboxCommitment.rows.values())[0] as any).due_at).toBeNull();
  });

  it('passes the statement through the same secret-label redaction the planner uses before persisting', async () => {
    // promptSafety.redactSecretLikePatterns matches `<label>: <value>` for password/api_key/secret/token/bearer.
    const c: any = await seedCase([{ statement: 'I will send it over, api_key: sk-live-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456 as agreed', owner: 'Ali', evidence: [] }]);
    await recordCommitmentsFromAssessment(c, c.assessment);
    const stored = (Array.from(fakeInboxCommitment.rows.values())[0] as any).statement;
    expect(stored).not.toContain('ABCDEFGHIJKLMNOPQRSTUVWXYZ123456');
    expect(stored).toContain('[REDACTED]');
  });
});

describe('generatePlan integration', () => {
  it('records the Ali-owned commitment AND still proposes MARK_WAITING for the non-Ali one, with no ledger row for it', async () => {
    const c: any = await seedCase([
      { statement: 'I will send the draft', owner: 'Ali', evidence: [] },
      { statement: 'Priya will send the PO', owner: 'Priya', evidence: [] },
    ]);
    await generatePlan(c.id, 'ali');
    const ledger = Array.from(fakeInboxCommitment.rows.values()) as any[];
    expect(ledger).toHaveLength(1);
    expect(ledger[0].statement).toBe('I will send the draft');
    const waiting = (await fakeInboxCaseAction.findAll({ where: { case_id: c.id, action_type: 'MARK_WAITING' } })) as any[];
    expect(waiting).toHaveLength(1);
    expect(waiting[0].payload.owner).toBe('Priya');
  });
});

describe('reads', () => {
  it('overdue only when due_at is past; undated is listed as open but never overdue; fulfilled drops out', async () => {
    const c: any = await seedCase([]);
    const asOf = new Date('2026-09-15T12:00:00Z');
    const mk = (statement: string, due: string | null) =>
      fakeInboxCommitment.create({ case_id: c.id, statement, statement_hash: commitmentHash(statement), owed_to: null, due_at: due ? new Date(due) : null, status: 'OPEN', source: 'assessment', source_item_id: null, fulfilled_at: null, correlation_id: c.correlation_id });
    const late: any = await mk('late', '2026-09-10T00:00:00Z');
    await mk('soon', '2026-09-20T00:00:00Z');
    const undated: any = await mk('undated', null);
    const done: any = await mk('done', '2026-09-01T00:00:00Z');
    await fulfillCommitment(done.id, 'ali');

    const open = await listOpenCommitments();
    expect(open.map((r: any) => r.statement)).toEqual(['late', 'soon', 'undated']); // soonest first, undated last
    const overdue = await listOverdueCommitments(asOf);
    expect(overdue.map((r: any) => r.id)).toEqual([late.id]);
    expect(overdue.map((r: any) => r.id)).not.toContain(undated.id);
    expect(done.status).toBe('FULFILLED');
    expect(done.fulfilled_at).toBeInstanceOf(Date);
  });
});

describe('sent-mail carve-out', () => {
  it('extractPromisesFromText finds first-person future commitments and nothing else', () => {
    const text = "Thanks Priya. I'll send the signed SOW by Friday. We will not be able to attend. Kes said he will call. I will also loop in Ram.";
    expect(extractPromisesFromText(text)).toEqual(["I'll send the signed SOW by Friday.", 'I will also loop in Ram.']);
  });

  it('with the flag OFF, no Gmail call is made at all', async () => {
    const c: any = await seedCase([]);
    const item: any = await fakeInboxCaseItem.create({ case_id: c.id, source_type: 'email', provider: 'gmail_colaberry', inclusion_status: 'INCLUDED', snapshot: { thread_id: 'T1' } });
    const r = await scanSentMailForCommitments(c, [item]);
    expect(r).toEqual({ enabled: false, threadsScanned: 0, messagesScanned: 0, created: 0 });
    expect(threadsGet).not.toHaveBeenCalled();
  });

  it('with the flag ON, reads only SENT messages on the case threads and records promises as source=sent_mail', async () => {
    process.env[SENT_MAIL_COMMITMENTS_FLAG] = 'true';
    const c: any = await seedCase([]);
    const item: any = await fakeInboxCaseItem.create({ case_id: c.id, source_type: 'email', provider: 'gmail_colaberry', inclusion_status: 'INCLUDED', snapshot: { thread_id: 'T1' } });
    threadsGet.mockResolvedValue({
      data: {
        messages: [
          { labelIds: ['INBOX'], snippet: "I will pay you tomorrow", payload: { headers: [{ name: 'To', value: 'ali@colaberry.com' }] } }, // inbound: ignored
          { labelIds: ['SENT'], snippet: "Sure - I'll send the invoice by Monday.", payload: { headers: [{ name: 'To', value: 'priya@example.com' }] } },
        ],
      },
    });
    const r = await scanSentMailForCommitments(c, [item]);
    expect(r).toEqual({ enabled: true, threadsScanned: 1, messagesScanned: 1, created: 1 });
    expect(threadsGet).toHaveBeenCalledWith(expect.objectContaining({ userId: 'me', id: 'T1' }));
    const row = Array.from(fakeInboxCommitment.rows.values())[0] as any;
    expect(row).toMatchObject({ source: 'sent_mail', owed_to: 'priya@example.com', due_at: null });
    expect(row.statement).toBe("I'll send the invoice by Monday.");
  });

  it('with the flag ON and no Gmail client, it scans nothing and creates nothing (no crash)', async () => {
    process.env[SENT_MAIL_COMMITMENTS_FLAG] = 'true';
    gmailAvailable = false;
    const c: any = await seedCase([]);
    const item: any = await fakeInboxCaseItem.create({ case_id: c.id, source_type: 'email', provider: 'gmail_colaberry', inclusion_status: 'INCLUDED', snapshot: { thread_id: 'T1' } });
    expect(await scanSentMailForCommitments(c, [item])).toMatchObject({ enabled: true, threadsScanned: 0, created: 0 });
  });
});

describe('contract', () => {
  it('due_at on commitments_made survives the Zod output schema', () => {
    const r = caseAssessmentOutputSchema.safeParse({
      objective: 'x', current_state: 'x', summary: 'x', confidence: 80,
      commitments_made: [{ statement: 'I will', owner: 'Ali', due_at: '2026-09-12T00:00:00Z', evidence: [] }],
      teaching_brief: { what_is_happening: 'x', why_it_matters: 'x', what_ali_is_deciding: 'x', confirmed_vs_inferred: 'x', risk_of_acting: 'x', risk_of_delaying: 'x', recommended_decision: 'x', rationale: 'x' },
    });
    expect(r.success).toBe(true);
    expect((r.success ? r.data : ({} as any)).commitments_made[0].due_at).toBe('2026-09-12T00:00:00Z');
  });
});
