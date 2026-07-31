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
const fakeInboxCaseAction = makeFakeModel();
const fakeInboxCaseEvent = makeFakeModel();

jest.mock('../../../models/InboxCase', () => ({ __esModule: true, default: fakeInboxCase }));
jest.mock('../../../models/InboxCaseAction', () => ({ __esModule: true, default: fakeInboxCaseAction }));
jest.mock('../../../models/InboxCaseEvent', () => ({ __esModule: true, default: fakeInboxCaseEvent }));

import { approveAction, rejectAction, approveLowRiskActions, ActionNotFoundError } from '../caseApprovalService';
import { InvalidActionTransitionError } from '../actionStateMachine';

beforeEach(() => {
  fakeInboxCase.rows.clear();
  fakeInboxCaseAction.rows.clear();
  fakeInboxCaseEvent.rows.clear();
});

async function seedCase() {
  return fakeInboxCase.create({ title: 'Test case', mode: 'TOPIC', state: 'AWAITING_APPROVAL', correlation_id: randomUUID(), reopen_count: 0 });
}

async function seedAction(caseId: string, overrides: Partial<any> = {}) {
  return fakeInboxCaseAction.create({
    case_id: caseId,
    action_type: 'MARK_WAITING',
    target_source: 'case',
    preview: 'preview text',
    payload: { owner: 'someone@example.com' },
    risk_level: 'LOW',
    requires_individual_approval: false,
    status: 'PROPOSED',
    depends_on_action_ids: [],
    idempotency_key: randomUUID(),
    attempt_count: 0,
    acting_admin: 'system',
    correlation_id: randomUUID(),
    ...overrides,
  });
}

describe('approveAction', () => {
  it('moves a PROPOSED action to APPROVED and stamps approver/time', async () => {
    const c = await seedCase();
    const a = await seedAction(c.id);
    const result = await approveAction(c.id, a.id, 'ali@colaberry.com');
    expect(result.status).toBe('APPROVED');
    expect(result.approved_by).toBe('ali@colaberry.com');
    expect(result.approved_at).toBeInstanceOf(Date);
  });

  it('merges an edited payload into the action on approval', async () => {
    const c = await seedCase();
    const a = await seedAction(c.id, { payload: { body: 'original draft' } });
    const result = await approveAction(c.id, a.id, 'ali@colaberry.com', { body: 'edited draft' });
    expect(result.payload.body).toBe('edited draft');
  });

  it('rejects approving an action that is already APPROVED', async () => {
    const c = await seedCase();
    const a = await seedAction(c.id, { status: 'APPROVED' });
    await expect(approveAction(c.id, a.id, 'ali@colaberry.com')).rejects.toThrow(InvalidActionTransitionError);
  });

  it('throws ActionNotFoundError for a nonexistent action', async () => {
    const c = await seedCase();
    await expect(approveAction(c.id, randomUUID(), 'ali@colaberry.com')).rejects.toThrow(ActionNotFoundError);
  });
});

describe('rejectAction', () => {
  it('moves a PROPOSED action to REJECTED', async () => {
    const c = await seedCase();
    const a = await seedAction(c.id);
    const result = await rejectAction(c.id, a.id, 'ali@colaberry.com', 'Not needed');
    expect(result.status).toBe('REJECTED');
  });

  it('rejects rejecting an action that is already REJECTED', async () => {
    const c = await seedCase();
    const a = await seedAction(c.id, { status: 'REJECTED' });
    await expect(rejectAction(c.id, a.id, 'ali@colaberry.com', 'again')).rejects.toThrow(InvalidActionTransitionError);
  });
});

describe('approveLowRiskActions', () => {
  it('bulk-approves only LOW-risk, non-individual-approval actions', async () => {
    const c = await seedCase();
    const low = await seedAction(c.id, { risk_level: 'LOW', requires_individual_approval: false });
    const highRisk = await seedAction(c.id, { risk_level: 'HIGH', requires_individual_approval: false });
    const individual = await seedAction(c.id, { risk_level: 'LOW', requires_individual_approval: true, action_type: 'EMAIL_SEND' });

    const result = await approveLowRiskActions(c.id, 'ali@colaberry.com');

    expect(result.approved).toBe(1);
    expect(result.skippedHighRiskOrIndividual).toBe(2);
    expect(low.status).toBe('APPROVED');
    expect(highRisk.status).toBe('PROPOSED');
    expect(individual.status).toBe('PROPOSED');
  });

  it('never touches actions that already left PROPOSED (e.g. already approved/rejected)', async () => {
    const c = await seedCase();
    const alreadyApproved = await seedAction(c.id, { status: 'APPROVED', approved_by: 'someone-else@colaberry.com' });

    const result = await approveLowRiskActions(c.id, 'ali@colaberry.com');

    expect(result.approved).toBe(0);
    expect(alreadyApproved.approved_by).toBe('someone-else@colaberry.com'); // untouched
  });
});
