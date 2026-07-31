import { randomUUID } from 'crypto';

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
      return Array.from(rows.values()).find((r) => Object.entries(where || {}).every(([k, v]) => r[k] === v)) || null;
    },
    async findAll({ where }: any = {}) {
      const all = Array.from(rows.values());
      if (!where) return all;
      return all.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
    },
  };
}

const fakeInboxCase = makeFakeModel();
const fakeInboxCaseItem = makeFakeModel();
const fakeInboxCaseAction = makeFakeModel();
const fakeInboxCaseEvent = makeFakeModel();

jest.mock('../../../models/InboxCase', () => ({ __esModule: true, default: fakeInboxCase }));
jest.mock('../../../models/InboxCaseItem', () => ({ __esModule: true, default: fakeInboxCaseItem }));
jest.mock('../../../models/InboxCaseAction', () => ({ __esModule: true, default: fakeInboxCaseAction }));
jest.mock('../../../models/InboxCaseEvent', () => ({ __esModule: true, default: fakeInboxCaseEvent }));

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
});

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
