import { randomUUID } from 'crypto';
import { Op } from 'sequelize';

// Mirrors testHelpers/fakeModel.ts's Op-symbol handling — see
// caseActionPlanner.test.ts for why this file keeps its own local copy.
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

import { quickResolveItem } from '../caseQuickResolveService';

beforeEach(() => {
  fakeInboxCase.rows.clear();
  fakeInboxCaseItem.rows.clear();
  fakeInboxCaseAction.rows.clear();
  fakeInboxCaseEvent.rows.clear();
});

async function seedCase(overrides: Partial<any> = {}) {
  return fakeInboxCase.create({
    title: 'Test case',
    mode: 'TOPIC',
    normalized_query: 'test',
    state: 'AWAITING_APPROVAL',
    correlation_id: randomUUID(),
    reopen_count: 0,
    ...overrides,
  });
}

async function seedItem(caseId: string, overrides: Partial<any> = {}) {
  return fakeInboxCaseItem.create({
    case_id: caseId,
    source_type: 'email',
    source_id: randomUUID(),
    provider: 'gmail_colaberry',
    title: 'Some email',
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

describe('quickResolveItem — Handled', () => {
  it('sets disposition RESOLVED and proposes EMAIL_LABEL for a gmail email item', async () => {
    const c = await seedCase();
    const item = await seedItem(c.id);

    const result = await quickResolveItem(c.id, item.id, 'HANDLED', 'ali@colaberry.com');

    expect(result.dispositionSet).toBe('RESOLVED');
    expect(result.actionProposed).toBe('EMAIL_LABEL');
    expect(item.disposition).toBe('RESOLVED');
    const actions = Array.from(fakeInboxCaseAction.rows.values());
    expect(actions).toHaveLength(1);
    expect(actions[0].status).toBe('PROPOSED'); // never auto-approved
  });

  it('proposes EMAIL_ARCHIVE for a hotmail item instead of EMAIL_LABEL', async () => {
    const c = await seedCase();
    const item = await seedItem(c.id, { provider: 'hotmail' });

    const result = await quickResolveItem(c.id, item.id, 'HANDLED', 'ali@colaberry.com');
    expect(result.actionProposed).toBe('EMAIL_ARCHIVE');
  });

  it('proposes BASECAMP_COMPLETE_TODO for a basecamp_todo item', async () => {
    const c = await seedCase();
    const item = await seedItem(c.id, { source_type: 'basecamp_todo', provider: 'basecamp', snapshot: { project_id: '99' } });

    const result = await quickResolveItem(c.id, item.id, 'HANDLED', 'ali@colaberry.com');

    expect(result.actionProposed).toBe('BASECAMP_COMPLETE_TODO');
    const actions = Array.from(fakeInboxCaseAction.rows.values());
    expect(actions[0].payload.project_id).toBe('99');
  });

  it('sets disposition only, proposes no action, for a basecamp_comment item (no natural close action)', async () => {
    const c = await seedCase();
    const item = await seedItem(c.id, { source_type: 'basecamp_comment', provider: 'basecamp' });

    const result = await quickResolveItem(c.id, item.id, 'HANDLED', 'ali@colaberry.com');

    expect(result.dispositionSet).toBe('RESOLVED');
    expect(result.actionProposed).toBeNull();
    expect(fakeInboxCaseAction.rows.size).toBe(0);
  });
});

describe('quickResolveItem — Ignore', () => {
  it('sets disposition NO_ACTION', async () => {
    const c = await seedCase();
    const item = await seedItem(c.id);

    const result = await quickResolveItem(c.id, item.id, 'IGNORE', 'ali@colaberry.com');

    expect(result.dispositionSet).toBe('NO_ACTION');
    expect(item.disposition).toBe('NO_ACTION');
  });

  it('sets disposition NO_ACTION and proposes BASECAMP_COMPLETE_TODO for a basecamp_todo item', async () => {
    const c = await seedCase();
    const item = await seedItem(c.id, { source_type: 'basecamp_todo', provider: 'basecamp', snapshot: { project_id: '99' } });

    const result = await quickResolveItem(c.id, item.id, 'IGNORE', 'ali@colaberry.com');

    expect(result.dispositionSet).toBe('NO_ACTION');
    expect(result.actionProposed).toBe('BASECAMP_COMPLETE_TODO');
    const actions = Array.from(fakeInboxCaseAction.rows.values());
    expect(actions).toHaveLength(1);
    expect(actions[0].status).toBe('PROPOSED'); // never auto-approved
  });
});

describe('quickResolveItem — idempotency', () => {
  it('does not create a duplicate action when called twice on the same item', async () => {
    const c = await seedCase();
    const item = await seedItem(c.id);

    await quickResolveItem(c.id, item.id, 'HANDLED', 'ali@colaberry.com');
    const second = await quickResolveItem(c.id, item.id, 'HANDLED', 'ali@colaberry.com');

    expect(second.actionProposed).toBeNull(); // already exists, dedup'd
    expect(fakeInboxCaseAction.rows.size).toBe(1);
  });
});

describe('quickResolveItem — not found', () => {
  it('throws a 404-classified error for an item that does not belong to the case', async () => {
    const c = await seedCase();
    await expect(quickResolveItem(c.id, randomUUID(), 'HANDLED', 'ali@colaberry.com')).rejects.toMatchObject({ statusCode: 404 });
  });
});
