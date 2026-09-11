// /inbox-zero T4 (CC-20260910-3q7x). The response-needed contract lives in
// three places — the TypeScript type, the Zod output schema, and the model's
// SYSTEM_PROMPT wire shape — and the plan auditor showed that missing any one
// of them fails silently: caseAssessmentOutputSchema is a plain z.object that
// STRIPS unknown keys at safeParse, so a field declared only in the type would
// typecheck, pass every test that never round-trips through Zod, and vanish
// before it reached the database. The first block here is the test that
// catches exactly that. The last block pins the approval gate: an uncertain
// or low-confidence verdict must force individual approval on every proposed
// action, even a LOW-risk internal one.

import { randomUUID } from 'crypto';
import { makeFakeModel } from './testHelpers/fakeModel';
import { caseAssessmentOutputSchema } from '../../../schemas/inboxCaseSchema';
import {
  CaseAssessment,
  RESPONSE_NEEDED_REVIEW_THRESHOLD,
  readResponseNeeded,
  responseNeedsHumanReview,
} from '../../../types/inboxCase';

const fakeInboxCase = makeFakeModel();
const fakeInboxCaseItem = makeFakeModel();
const fakeInboxCaseAction = makeFakeModel();
const fakeInboxCaseEvent = makeFakeModel();
const fakeInboxCaseQuestion = makeFakeModel();

jest.mock('../../../models/InboxCase', () => ({ __esModule: true, default: fakeInboxCase }));
jest.mock('../../../models/InboxCaseItem', () => ({ __esModule: true, default: fakeInboxCaseItem }));
jest.mock('../../../models/InboxCaseAction', () => ({ __esModule: true, default: fakeInboxCaseAction }));
jest.mock('../../../models/InboxCaseEvent', () => ({ __esModule: true, default: fakeInboxCaseEvent }));
jest.mock('../../../models/InboxCaseQuestion', () => ({ __esModule: true, default: fakeInboxCaseQuestion }));
jest.mock('../caseTicketService', () => ({
  ensureCaseTicket: jest.fn(async () => {}),
  syncTicketForCase: jest.fn(async () => {}),
  postCaseProgressNote: jest.fn(async () => {}),
}));

import { createActionIfNew } from '../caseActionPlanner';

// The smallest payload the output schema accepts, so each test can add only
// the response-needed fields it is about.
function minimalOutput(extra: Record<string, unknown> = {}) {
  return {
    objective: 'Answer Priya about the SOW',
    current_state: 'Waiting on Ali',
    summary: 'Priya asked for the signed SOW.',
    confidence: 80,
    teaching_brief: {
      what_is_happening: 'x',
      why_it_matters: 'x',
      what_ali_is_deciding: 'x',
      confirmed_vs_inferred: 'x',
      risk_of_acting: 'x',
      risk_of_delaying: 'x',
      recommended_decision: 'x',
      rationale: 'x',
    },
    ...extra,
  };
}

beforeEach(() => {
  for (const m of [fakeInboxCase, fakeInboxCaseItem, fakeInboxCaseAction, fakeInboxCaseEvent, fakeInboxCaseQuestion]) m.rows.clear();
});

describe('Zod round-trip — the field must SURVIVE safeParse, not just typecheck', () => {
  it.each([
    ['YES', 92, 'Direct question in the last message, unanswered.', 'EMAIL'],
    ['NO', 88, 'Already answered in Basecamp #4412 yesterday.', 'NONE'],
    ['UNCERTAIN', 55, 'Refund is mentioned; money always goes to a human.', 'EMAIL'],
  ] as const)('%s survives with its confidence, reason and channel intact', (verdict, confidence, reason, channel) => {
    const r = caseAssessmentOutputSchema.safeParse(
      minimalOutput({
        response_needed: verdict,
        response_needed_confidence: confidence,
        response_needed_reason: reason,
        response_channel: channel,
        response_channel_reason: 'because',
      }),
    );
    expect(r.success).toBe(true);
    const d = r.success ? r.data : ({} as any);
    expect(d.response_needed).toBe(verdict);
    expect(d.response_needed_confidence).toBe(confidence);
    expect(d.response_needed_reason).toBe(reason);
    expect(d.response_channel).toBe(channel);
    expect(d.response_channel_reason).toBe('because');
  });

  it('a legacy payload with none of the fields still parses', () => {
    const r = caseAssessmentOutputSchema.safeParse(minimalOutput());
    expect(r.success).toBe(true);
    const d = r.success ? r.data : ({} as any);
    expect(d.response_needed).toBeUndefined();
  });

  it('rejects a verdict or channel outside the contract', () => {
    expect(caseAssessmentOutputSchema.safeParse(minimalOutput({ response_needed: 'MAYBE' })).success).toBe(false);
    expect(caseAssessmentOutputSchema.safeParse(minimalOutput({ response_channel: 'SLACK' })).success).toBe(false);
    expect(caseAssessmentOutputSchema.safeParse(minimalOutput({ response_needed_confidence: 140 })).success).toBe(false);
  });
});

describe('readResponseNeeded — the one sanctioned reader', () => {
  const base = { objective: '', current_state: '', summary: '', timeline: [], confirmed_facts: [], assumptions: [], contradictions: [], root_cause_assessment: null, impact: '', people_involved: [], current_owner: null, commitments_made: [], deadlines: [], blockers: [], missing_information: [], decisions_required: [], recommended_next_actions: [], confidence: 80 } as CaseAssessment;

  it('a legacy assessment reads as UNCERTAIN at confidence 0, flagged legacy, never as NO', () => {
    const r = readResponseNeeded(base);
    expect(r).toMatchObject({ verdict: 'UNCERTAIN', confidence: 0, channel: null, legacy: true });
    expect(r.reason).toMatch(/predates/);
    expect(readResponseNeeded(null).verdict).toBe('UNCERTAIN');
  });

  it('a recorded verdict reads back verbatim', () => {
    const r = readResponseNeeded({ ...base, response_needed: 'NO', response_needed_confidence: 91, response_needed_reason: 'answered', response_channel: 'NONE', response_channel_reason: 'nothing to send' });
    expect(r).toEqual({ verdict: 'NO', confidence: 91, reason: 'answered', channel: 'NONE', channelReason: 'nothing to send', legacy: false });
  });

  it('responseNeedsHumanReview: legacy, UNCERTAIN, or below threshold => true; confident YES/NO => false', () => {
    expect(responseNeedsHumanReview(base)).toBe(true);
    expect(responseNeedsHumanReview({ ...base, response_needed: 'UNCERTAIN', response_needed_confidence: 99 })).toBe(true);
    expect(responseNeedsHumanReview({ ...base, response_needed: 'YES', response_needed_confidence: RESPONSE_NEEDED_REVIEW_THRESHOLD - 1 })).toBe(true);
    expect(responseNeedsHumanReview({ ...base, response_needed: 'YES', response_needed_confidence: RESPONSE_NEEDED_REVIEW_THRESHOLD })).toBe(false);
    expect(responseNeedsHumanReview({ ...base, response_needed: 'NO', response_needed_confidence: 95 })).toBe(false);
  });
});

describe('approval gate at createActionIfNew', () => {
  const lowRiskInternal = {
    action_type: 'NO_ACTION' as const,
    item_id: null,
    target_source: 'case',
    target_id: null,
    preview: 'Nothing to do',
    payload: {},
    risk_level: 'LOW' as const,
    idempotencyParts: ['x'],
  };

  async function seedCase(assessment: Partial<CaseAssessment> | null) {
    return fakeInboxCase.create({ title: 't', mode: 'TOPIC', state: 'READY_TO_PLAN', correlation_id: randomUUID(), reopen_count: 0, assessment });
  }

  it('a confident YES lets a LOW-risk internal action stay bundle-able', async () => {
    const c: any = await seedCase({ response_needed: 'YES', response_needed_confidence: 90, response_needed_reason: 'clear ask' });
    const id = await createActionIfNew(c, c.correlation_id, 'test', lowRiskInternal, `k-${randomUUID()}`, []);
    const row: any = await fakeInboxCaseAction.findByPk(id!);
    expect(row.requires_individual_approval).toBe(false);
  });

  it('a low-confidence verdict forces individual approval on the same action', async () => {
    const c: any = await seedCase({ response_needed: 'YES', response_needed_confidence: 40, response_needed_reason: 'thin evidence' });
    const id = await createActionIfNew(c, c.correlation_id, 'test', lowRiskInternal, `k-${randomUUID()}`, []);
    const row: any = await fakeInboxCaseAction.findByPk(id!);
    expect(row.requires_individual_approval).toBe(true);
  });

  it('UNCERTAIN forces individual approval regardless of confidence', async () => {
    const c: any = await seedCase({ response_needed: 'UNCERTAIN', response_needed_confidence: 99, response_needed_reason: 'refund involved' });
    const id = await createActionIfNew(c, c.correlation_id, 'test', lowRiskInternal, `k-${randomUUID()}`, []);
    expect(((await fakeInboxCaseAction.findByPk(id!)) as any).requires_individual_approval).toBe(true);
  });

  it('a legacy assessment (no verdict at all) forces individual approval — never silently bundled', async () => {
    const c: any = await seedCase(null);
    const id = await createActionIfNew(c, c.correlation_id, 'test', lowRiskInternal, `k-${randomUUID()}`, []);
    expect(((await fakeInboxCaseAction.findByPk(id!)) as any).requires_individual_approval).toBe(true);
  });

  it('ALWAYS_INDIVIDUAL_APPROVAL types stay individual even with a confident verdict (not weakened)', async () => {
    const c: any = await seedCase({ response_needed: 'YES', response_needed_confidence: 99, response_needed_reason: 'clear' });
    const send = { ...lowRiskInternal, action_type: 'EMAIL_SEND' as const, risk_level: 'LOW' as const };
    const id = await createActionIfNew(c, c.correlation_id, 'test', send, `k-${randomUUID()}`, []);
    expect(((await fakeInboxCaseAction.findByPk(id!)) as any).requires_individual_approval).toBe(true);
  });
});
