import { randomUUID } from 'crypto';
import { Op } from 'sequelize';

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

jest.mock('../caseTicketService', () => ({
  ensureCaseTicket: jest.fn(async () => {}),
  syncTicketForCase: jest.fn(async () => {}),
  postCaseProgressNote: jest.fn(async () => {}),
}));

const mockCreate = jest.fn();
jest.mock('../../openaiInstrumented', () => ({
  getInstrumentedOpenAI: () => ({ chat: { completions: { create: mockCreate } } }),
}));

import { overrideProposedActions } from '../caseActionOverrideService';

function mockModelResponse(content: string) {
  mockCreate.mockResolvedValueOnce({ choices: [{ message: { content } }] });
}

beforeEach(() => {
  fakeInboxCase.rows.clear();
  fakeInboxCaseItem.rows.clear();
  fakeInboxCaseAction.rows.clear();
  fakeInboxCaseEvent.rows.clear();
  mockCreate.mockReset();
});

async function seedCase(overrides: Partial<any> = {}) {
  return fakeInboxCase.create({
    title: 'Test case', mode: 'TOPIC', normalized_query: 'test', state: 'AWAITING_APPROVAL',
    correlation_id: randomUUID(), reopen_count: 0, ...overrides,
  });
}

async function seedItem(caseId: string, overrides: Partial<any> = {}) {
  return fakeInboxCaseItem.create({
    case_id: caseId, source_type: 'email', source_id: 'msg-1', provider: 'gmail_colaberry', title: 'Some email',
    occurred_at: new Date(), match_score: 0.9, match_reasons: [], inclusion_status: 'INCLUDED', disposition: null,
    snapshot: {}, source_hash: randomUUID(), ...overrides,
  });
}

async function seedAction(caseId: string, itemId: string, overrides: Partial<any> = {}) {
  return fakeInboxCaseAction.create({
    case_id: caseId, item_id: itemId, action_type: 'EMAIL_SEND', target_source: 'gmail_colaberry', target_id: 'msg-1',
    preview: 'Reply to the email', payload: {}, risk_level: 'MEDIUM', requires_individual_approval: true,
    status: 'PROPOSED', depends_on_action_ids: [], idempotency_key: randomUUID(), attempt_count: 0,
    acting_admin: 'system', correlation_id: randomUUID(), ...overrides,
  });
}

describe('overrideProposedActions — happy path', () => {
  it('rejects the named action and proposes a new one, forced to HIGH risk regardless of action_type', async () => {
    const c = await seedCase();
    const item = await seedItem(c.id);
    const emailAction = await seedAction(c.id, item.id);

    mockModelResponse(JSON.stringify({
      actions_to_reject: [emailAction.id],
      new_action: { item_id: item.id, action_type: 'BASECAMP_COMMENT', preview: 'Update the bc ticket instead', payload: { comment: 'done' } },
    }));

    const result = await overrideProposedActions(c.id, "Just update the bc ticket, don't send an email reply", 'ali@colaberry.com');

    expect(result.rejected).toEqual([emailAction.id]);
    expect(emailAction.status).toBe('REJECTED');
    expect(result.proposed).not.toBeNull();

    const newAction = fakeInboxCaseAction.rows.get(result.proposed!);
    expect(newAction.action_type).toBe('BASECAMP_COMMENT');
    expect(newAction.status).toBe('PROPOSED'); // never auto-approved
    // The core safety guarantee this task exists for: EVEN THOUGH
    // BASECAMP_COMMENT would normally be MEDIUM risk / bulk-approvable
    // when produced by the normal planner, an override-created action is
    // always HIGH risk and always requires individual approval.
    expect(newAction.risk_level).toBe('HIGH');
    expect(newAction.requires_individual_approval).toBe(true);
  });
});

describe('overrideProposedActions — hallucination guards', () => {
  it('silently skips a reject id that was never actually a proposed action on this case', async () => {
    const c = await seedCase();
    const item = await seedItem(c.id);
    await seedAction(c.id, item.id);

    mockModelResponse(JSON.stringify({ actions_to_reject: [randomUUID()], new_action: null }));

    const result = await overrideProposedActions(c.id, 'cancel everything', 'ali@colaberry.com');
    expect(result.rejected).toEqual([]);
  });

  it('does not create a new action when new_action.item_id does not match any real item on this case', async () => {
    const c = await seedCase();
    const item = await seedItem(c.id);
    await seedAction(c.id, item.id);

    mockModelResponse(JSON.stringify({
      actions_to_reject: [],
      new_action: { item_id: randomUUID(), action_type: 'NO_ACTION', preview: 'fabricated', payload: {} },
    }));

    const result = await overrideProposedActions(c.id, 'do something', 'ali@colaberry.com');
    expect(result.proposed).toBeNull();
    expect(fakeInboxCaseAction.rows.size).toBe(1); // only the original seeded action
  });
});

describe('overrideProposedActions — safe fallback', () => {
  it('applies nothing (no partial state) when the model call fails, and reports it as a real failure, not a false success', async () => {
    const c = await seedCase();
    const item = await seedItem(c.id);
    const action = await seedAction(c.id, item.id);
    mockCreate.mockRejectedValueOnce(new Error('OpenAI unavailable'));

    const result = await overrideProposedActions(c.id, 'do something', 'ali@colaberry.com');

    expect(result.rejected).toEqual([]);
    expect(result.proposed).toBeNull();
    expect(result.failed).toBe(true);
    expect(result.failureReason).toContain('OpenAI unavailable');
    expect(action.status).toBe('PROPOSED'); // untouched

    const events = Array.from(fakeInboxCaseEvent.rows.values());
    expect(events.some((e) => e.event_type === 'action_override_failed' && e.case_id === c.id)).toBe(true);
  });

  it('reports failed:true when the model returns an action_type outside the allowed enum (reproduces the exact live production failure — case 187a78ce)', async () => {
    const c = await seedCase();
    const item = await seedItem(c.id);
    await seedAction(c.id, item.id);

    mockModelResponse(JSON.stringify({
      actions_to_reject: [],
      new_action: { item_id: item.id, action_type: 'REACH_OUT_TO_PERSON', preview: 'not a real action type', payload: {} },
    }));

    const result = await overrideProposedActions(c.id, 'reach out about this', 'ali@colaberry.com');

    expect(result.failed).toBe(true);
    expect(result.failureReason).toContain('schema validation');
    expect(result.proposed).toBeNull();
  });

  it('does NOT mark failed:true for a genuine AI no-op (the AI validly found nothing to change)', async () => {
    const c = await seedCase();
    const item = await seedItem(c.id);
    await seedAction(c.id, item.id);

    mockModelResponse(JSON.stringify({ actions_to_reject: [], new_action: null }));

    const result = await overrideProposedActions(c.id, 'just noting this for the record', 'ali@colaberry.com');

    expect(result.failed).toBeUndefined();
    expect(result.rejected).toEqual([]);
    expect(result.proposed).toBeNull();
  });

  it('is a no-op when there are no PROPOSED actions to override', async () => {
    const c = await seedCase();
    const result = await overrideProposedActions(c.id, 'do something', 'ali@colaberry.com');
    expect(result).toEqual({ rejected: [], proposed: null });
    expect(result.failed).toBeUndefined();
    expect(mockCreate).not.toHaveBeenCalled(); // never even calls the model with nothing to override
  });
});

describe('overrideProposedActions — idempotency', () => {
  it('does not create a duplicate action when the identical instruction is applied twice', async () => {
    const c = await seedCase();
    const item = await seedItem(c.id);
    await seedAction(c.id, item.id);

    mockModelResponse(JSON.stringify({
      actions_to_reject: [],
      new_action: { item_id: item.id, action_type: 'BASECAMP_COMMENT', preview: 'Update the bc ticket', payload: {} },
    }));
    const first = await overrideProposedActions(c.id, 'update the ticket', 'ali@colaberry.com');

    mockModelResponse(JSON.stringify({
      actions_to_reject: [],
      new_action: { item_id: item.id, action_type: 'BASECAMP_COMMENT', preview: 'Update the bc ticket', payload: {} },
    }));
    const second = await overrideProposedActions(c.id, 'update the ticket', 'ali@colaberry.com');

    expect(first.proposed).not.toBeNull();
    expect(second.proposed).toBeNull(); // same instruction on same item -> same idempotency key -> dedup'd
  });
});
