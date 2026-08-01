import { randomUUID } from 'crypto';
import { Op } from 'sequelize';

// Mirrors testHelpers/fakeModel.ts's Op-symbol handling (Op.ne/Op.in/Op.notIn)
// — this file keeps its own lightweight copy rather than importing the
// shared helper so the fixture shapes above stay local and easy to read.
function matchesWhere(row: any, where: any): boolean {
  if (!where) return true;
  for (const [key, value] of Object.entries(where)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const symbolKeys = Object.getOwnPropertySymbols(value as object);
      if (symbolKeys.includes(Op.ne)) { if (row[key] === (value as any)[Op.ne]) return false; continue; }
      if (symbolKeys.includes(Op.in)) { if (!(value as any)[Op.in].includes(row[key])) return false; continue; }
      if (symbolKeys.includes(Op.notIn)) { if ((value as any)[Op.notIn].includes(row[key])) return false; continue; }
    }
    if (row[key] !== value) return false;
  }
  return true;
}

function makeFakeModel() {
  const rows = new Map<string, any>();
  return {
    rows,
    async create(attrs: any) {
      const id = attrs.id || randomUUID();
      const row: any = {
        id,
        ...attrs,
        toJSON() {
          const { toJSON, update, ...rest } = row;
          return rest;
        },
        async update(patch: any) {
          Object.assign(row, patch);
          return row;
        },
      };
      rows.set(id, row);
      return row;
    },
    async findByPk(id: string) {
      return rows.get(id) || null;
    },
    async findOne({ where }: any) {
      return Array.from(rows.values()).find((r) => matchesWhere(r, where)) || null;
    },
    async findAll({ where }: any = {}) {
      return Array.from(rows.values()).filter((r) => matchesWhere(r, where));
    },
    async update(patch: any, { where }: any = {}) {
      const matched = Array.from(rows.values()).filter((r) => matchesWhere(r, where));
      for (const r of matched) Object.assign(r, patch);
      return [matched.length];
    },
  };
}

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

// caseRepository (used here for getCaseOrThrow/transitionCase) now syncs the
// Tickets board on every transition. caseTicketService transitively imports
// the full models barrel via ticketService.ts, which would poison every
// other model mock in this file — stub it out entirely.
jest.mock('../caseTicketService', () => ({
  ensureCaseTicket: jest.fn(async () => {}),
  syncTicketForCase: jest.fn(async () => {}),
  postCaseProgressNote: jest.fn(async () => {}),
}));

import { generatePlan } from '../caseActionPlanner';

beforeEach(() => {
  fakeInboxCase.rows.clear();
  fakeInboxCaseItem.rows.clear();
  fakeInboxCaseAction.rows.clear();
  fakeInboxCaseEvent.rows.clear();
  fakeInboxCaseQuestion.rows.clear();
});

async function seedAnsweredQuestion(caseId: string, overrides: Partial<any> = {}) {
  return fakeInboxCaseQuestion.create({
    case_id: caseId,
    question: 'What is the payment schedule for the new AI course?',
    why_required: 'Customer is blocked on enrolling without it.',
    choices: [],
    recommended_answer: null,
    blocks_action_ids: [],
    status: 'ANSWERED',
    answer: '$500/month for 6 months, first payment due at enrollment.',
    answered_by: 'ali@colaberry.com',
    answered_at: new Date(),
    ...overrides,
  });
}

async function seedCase(overrides: Partial<any> = {}) {
  return fakeInboxCase.create({
    title: 'Vendor onboarding checklist for Kes',
    mode: 'PERSON',
    normalized_query: 'kes',
    state: 'READY_TO_PLAN',
    correlation_id: randomUUID(),
    reopen_count: 0,
    recommendation: 'Resend the W9 and confirm receipt.',
    teaching_brief: { recommended_decision: 'Resend the W9 and confirm receipt.', rationale: 'Vendor payment is blocked without it.' },
    assessment: {
      recommended_next_actions: ['Reply asking for the W9 to be resent'],
      commitments_made: [{ statement: 'Vendor will resend the W9', owner: 'vendor@example.com', evidence: [] }],
      missing_information: [],
    },
    ...overrides,
  });
}

async function seedEmailItem(caseId: string, overrides: Partial<any> = {}) {
  return fakeInboxCaseItem.create({
    case_id: caseId,
    source_type: 'email',
    source_id: randomUUID(),
    provider: 'gmail_colaberry',
    title: 'Vendor onboarding checklist for Kes',
    occurred_at: new Date(),
    match_score: 0.9,
    match_reasons: [],
    inclusion_status: 'INCLUDED',
    disposition: null,
    snapshot: {},
    source_hash: randomUUID(),
    ...overrides,
  });
}

async function seedBasecampItem(caseId: string, overrides: Partial<any> = {}) {
  return fakeInboxCaseItem.create({
    case_id: caseId,
    source_type: 'basecamp_todo',
    source_id: randomUUID(),
    provider: 'basecamp',
    title: 'Vendor onboarding checklist',
    occurred_at: new Date(),
    match_score: 0.9,
    match_reasons: [],
    inclusion_status: 'INCLUDED',
    disposition: null,
    snapshot: { project_id: '9' },
    source_hash: randomUUID(),
    ...overrides,
  });
}

describe('generatePlan — proposes the right action shapes', () => {
  it('proposes an EMAIL_SEND reply action targeting the top-scored included email item', async () => {
    const c = await seedCase();
    const item = await seedEmailItem(c.id);
    await generatePlan(c.id, 'ali@colaberry.com');

    const actions = Array.from(fakeInboxCaseAction.rows.values());
    const reply = actions.find((a) => a.action_type === 'EMAIL_SEND');
    expect(reply).toBeDefined();
    expect(reply.item_id).toBe(item.id);
    expect(reply.requires_individual_approval).toBe(true); // EMAIL_SEND is always individual-approval
  });

  it('proposes a MARK_WAITING action for a commitment owned by someone other than Ali', async () => {
    const c = await seedCase();
    await seedEmailItem(c.id);
    await generatePlan(c.id, 'ali@colaberry.com');

    const actions = Array.from(fakeInboxCaseAction.rows.values());
    const waiting = actions.find((a) => a.action_type === 'MARK_WAITING');
    expect(waiting).toBeDefined();
    expect(waiting.payload.owner).toBe('vendor@example.com');
    expect(waiting.requires_individual_approval).toBe(false); // LOW risk, bundleable
  });

  it('does NOT propose a MARK_WAITING action for a commitment Ali owns himself', async () => {
    const c = await seedCase({
      assessment: {
        recommended_next_actions: [],
        commitments_made: [{ statement: 'Ali will follow up', owner: 'Ali Muwwakkil', evidence: [] }],
        missing_information: [],
      },
    });
    await seedEmailItem(c.id);
    await generatePlan(c.id, 'ali@colaberry.com');

    const actions = Array.from(fakeInboxCaseAction.rows.values());
    expect(actions.find((a) => a.action_type === 'MARK_WAITING')).toBeUndefined();
  });

  it('proposes a BASECAMP_COMMENT action for an undispositioned Basecamp item, requiring individual approval', async () => {
    const c = await seedCase();
    await seedEmailItem(c.id);
    const bcItem = await seedBasecampItem(c.id);
    await generatePlan(c.id, 'ali@colaberry.com');

    const actions = Array.from(fakeInboxCaseAction.rows.values());
    const comment = actions.find((a) => a.action_type === 'BASECAMP_COMMENT');
    expect(comment).toBeDefined();
    expect(comment.item_id).toBe(bcItem.id);
    expect(comment.requires_individual_approval).toBe(true);
  });

  it('proposes an archive action per included email item, depending on every non-archive action in the plan', async () => {
    const c = await seedCase();
    await seedEmailItem(c.id);
    await generatePlan(c.id, 'ali@colaberry.com');

    const actions = Array.from(fakeInboxCaseAction.rows.values());
    const archive = actions.find((a) => a.action_type === 'EMAIL_LABEL' || a.action_type === 'EMAIL_ARCHIVE');
    const nonArchive = actions.filter((a) => a.action_type !== 'EMAIL_LABEL' && a.action_type !== 'EMAIL_ARCHIVE');
    expect(archive).toBeDefined();
    expect(archive.requires_individual_approval).toBe(false);
    for (const na of nonArchive) {
      expect(archive.depends_on_action_ids).toContain(na.id);
    }
  });

  it('marks a PROTECTED item\'s archive action as HIGH risk requiring individual approval', async () => {
    const c = await seedCase();
    await seedEmailItem(c.id, { disposition: 'PROTECTED' });
    await generatePlan(c.id, 'ali@colaberry.com');

    const actions = Array.from(fakeInboxCaseAction.rows.values());
    const archive = actions.find((a) => a.action_type === 'EMAIL_LABEL' || a.action_type === 'EMAIL_ARCHIVE');
    expect(archive.risk_level).toBe('HIGH');
    expect(archive.requires_individual_approval).toBe(true);
  });

  it('transitions the case from READY_TO_PLAN to AWAITING_APPROVAL', async () => {
    const c = await seedCase();
    await seedEmailItem(c.id);
    await generatePlan(c.id, 'ali@colaberry.com');
    expect(c.state).toBe('AWAITING_APPROVAL');
  });

  it('rejects planning a case that is not in READY_TO_PLAN (e.g. still NEEDS_ALI)', async () => {
    const c = await seedCase({ state: 'NEEDS_ALI' });
    await seedEmailItem(c.id);
    await expect(generatePlan(c.id, 'ali@colaberry.com')).rejects.toThrow();
  });
});

describe('generatePlan — secret redaction hardening (Phase 7 break/harden finding)', () => {
  it('redacts a labeled secret that leaked into the assessment recommendation before it reaches a proposed action preview', async () => {
    const c = await seedCase({
      teaching_brief: { recommended_decision: 'Use password: hunter2 to access the shared account', rationale: 'Vendor requested it directly.' },
    });
    await seedEmailItem(c.id);
    await generatePlan(c.id, 'ali@colaberry.com');

    const actions = Array.from(fakeInboxCaseAction.rows.values());
    const reply = actions.find((a) => a.action_type === 'EMAIL_SEND');
    expect(reply.preview).not.toContain('hunter2');
    expect(reply.payload.body).not.toContain('hunter2');
  });
});

describe('generatePlan — sent_email reply-target fallback (bug fix: cases with only outbound evidence got zero actions)', () => {
  it('falls back to the highest-scoring INCLUDED sent_email item when no inbound email item is included', async () => {
    const c = await seedCase();
    await seedEmailItem(c.id, {
      source_type: 'sent_email',
      match_score: 0.9,
      snapshot: { from_address: 'ali@colaberry.com', to_addresses: ['customer@example.com'] },
    });

    const result = await generatePlan(c.id, 'ali@colaberry.com');

    expect(result.actionsCreated).toBeGreaterThan(0);
    const actions = Array.from(fakeInboxCaseAction.rows.values());
    const reply = actions.find((a) => a.action_type === 'EMAIL_SEND');
    expect(reply).toBeDefined();
  });

  it('does not use a sent_email item as the reply target when it has no recorded recipient', async () => {
    // Keep seedCase()'s default assessment (non-empty recommended_next_actions +
    // a commitment owned by someone other than Ali) so this exercises the
    // recipient check specifically, not the unrelated "nothing to propose" gate —
    // MARK_WAITING is still expected to fire from that same default assessment.
    const c = await seedCase();
    await seedEmailItem(c.id, {
      source_type: 'sent_email',
      snapshot: { from_address: 'ali@colaberry.com', to_addresses: [] },
    });

    const result = await generatePlan(c.id, 'ali@colaberry.com');

    const actions = Array.from(fakeInboxCaseAction.rows.values());
    expect(actions.find((a) => a.action_type === 'EMAIL_SEND')).toBeUndefined();
    expect(actions.find((a) => a.action_type === 'MARK_WAITING')).toBeDefined();
    expect(result.actionsCreated).toBeGreaterThan(0);
  });
});

describe('generatePlan — answered-question reply content (bug fix: plan ignored answered blocking questions)', () => {
  it('drafts a reply using the answered blocking question even when the assessment had no recommended next actions', async () => {
    const c = await seedCase({
      teaching_brief: null,
      recommendation: null,
      assessment: { recommended_next_actions: [], commitments_made: [], missing_information: ['payment schedule'] },
    });
    await seedEmailItem(c.id);
    await seedAnsweredQuestion(c.id);

    const result = await generatePlan(c.id, 'ali@colaberry.com');

    expect(result.actionsCreated).toBeGreaterThan(0);
    const actions = Array.from(fakeInboxCaseAction.rows.values());
    const reply = actions.find((a) => a.action_type === 'EMAIL_SEND');
    expect(reply).toBeDefined();
    expect(reply.payload.body).toContain('$500/month for 6 months');
  });
});

describe('generatePlan — zero-action dead-end fix (bug: case stranded in AWAITING_APPROVAL with nothing to approve)', () => {
  it('auto-dispositions untouched non-excluded items to NO_ACTION when the plan produces zero actions', async () => {
    const c = await seedCase({ assessment: { recommended_next_actions: [], commitments_made: [], missing_information: [] } });
    const bcItem = await seedBasecampItem(c.id); // BASECAMP_COMMENT is gated on recommended_next_actions — stays actionless here

    const result = await generatePlan(c.id, 'ali@colaberry.com');

    expect(result.actionsCreated).toBe(0);
    const updated = await fakeInboxCaseItem.findByPk(bcItem.id);
    expect(updated.disposition).toBe('NO_ACTION');
    expect(c.state).toBe('AWAITING_APPROVAL');
  });

  it('leaves EXCLUDED items alone — they never needed a disposition in the first place', async () => {
    const c = await seedCase({ assessment: { recommended_next_actions: [], commitments_made: [], missing_information: [] } });
    const excluded = await seedBasecampItem(c.id, { inclusion_status: 'EXCLUDED' });

    await generatePlan(c.id, 'ali@colaberry.com');

    const updated = await fakeInboxCaseItem.findByPk(excluded.id);
    expect(updated.disposition).toBeNull();
  });
});

describe('generatePlan — idempotency', () => {
  it('does not duplicate actions when the plan is regenerated for the same case state', async () => {
    const c = await seedCase();
    await seedEmailItem(c.id);
    const first = await generatePlan(c.id, 'ali@colaberry.com');

    // Second call would normally be blocked by the state machine (already
    // AWAITING_APPROVAL) — reset to READY_TO_PLAN to simulate an explicit re-plan.
    c.state = 'READY_TO_PLAN';
    const second = await generatePlan(c.id, 'ali@colaberry.com');

    expect(second.actionsCreated).toBe(0);
    expect(fakeInboxCaseAction.rows.size).toBe(first.actionsCreated);
  });
});
