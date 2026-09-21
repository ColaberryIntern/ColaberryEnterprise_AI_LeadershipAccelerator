/**
 * managerInboxService — AI Workforce Management, Checkpoint C. Pins the
 * agent-existence guard, the honest-empty-array state (zero pending
 * proposals is not an error), and that only 'pending' proposals surface
 * here (approved/rejected/expired/applied history is not "needs a decision").
 */
const mockAiAgentFindByPk = jest.fn();
jest.mock('../../models/AiAgent', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockAiAgentFindByPk(...a) },
}));

const mockProposalFindAll = jest.fn();
const mockProposalFindByPk = jest.fn();
jest.mock('../../models/ProposedAgentAction', () => ({
  __esModule: true,
  default: {
    findAll: (...a: any[]) => mockProposalFindAll(...a),
    findByPk: (...a: any[]) => mockProposalFindByPk(...a),
  },
}));

const mockApproveProposedAction = jest.fn();
const mockRejectProposedAction = jest.fn();
jest.mock('../agentApprovalService', () => ({
  approveProposedAction: (...a: any[]) => mockApproveProposedAction(...a),
  rejectProposedAction: (...a: any[]) => mockRejectProposedAction(...a),
}));

import { getManagerInboxItems, approveManagerInboxItem, rejectManagerInboxItem } from '../managerInboxService';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getManagerInboxItems', () => {
  it('happy path: returns real pending proposals for this agent, mapped to the manager-facing view', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockProposalFindAll.mockResolvedValue([
      {
        id: 'p1', action_type: 'content_optimization', reason: 'Open rate below threshold', confidence: 0.82,
        priority_score: 0.9, risk_score: 0.2, impact_score: 0.7, status: 'pending',
        created_at: new Date(), expires_at: null,
      },
    ]);

    const result = await getManagerInboxItems('agent-1');

    expect(mockProposalFindAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { agent_id: 'agent-1', status: 'pending' },
    }));
    expect(result).toHaveLength(1);
    expect(result?.[0].actionType).toBe('content_optimization');
    expect(result?.[0].status).toBe('pending');
  });

  it('boundary: a real agent with zero pending proposals returns an empty array, not an error', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockProposalFindAll.mockResolvedValue([]);

    const result = await getManagerInboxItems('agent-1');

    expect(result).toEqual([]);
  });

  it('boundary: a nonexistent agent returns null (the controller turns this into 404)', async () => {
    mockAiAgentFindByPk.mockResolvedValue(null);

    const result = await getManagerInboxItems('does-not-exist');

    expect(result).toBeNull();
    expect(mockProposalFindAll).not.toHaveBeenCalled();
  });

  it('only fetches status=pending — approved/rejected/expired/applied history is not surfaced as needing a decision', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockProposalFindAll.mockResolvedValue([]);

    await getManagerInboxItems('agent-1');

    const callArgs = mockProposalFindAll.mock.calls[0][0];
    expect(callArgs.where.status).toBe('pending');
  });

  it('exposes targetTable/targetId so the UI can tell a real executor apart from a decorative one', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockProposalFindAll.mockResolvedValue([{
      id: 'p1', action_type: 'update_scheduled_email', reason: 'r', confidence: 0.9,
      priority_score: null, risk_score: null, impact_score: null, status: 'pending',
      created_at: new Date(), expires_at: null, target_table: 'scheduled_emails', target_id: 'email-1',
    }]);

    const result = await getManagerInboxItems('agent-1');

    expect(result?.[0].targetTable).toBe('scheduled_emails');
    expect(result?.[0].targetId).toBe('email-1');
  });
});

describe('approveManagerInboxItem — agent-scoped approval (Checkpoint B)', () => {
  it('security: a proposal id from a DIFFERENT agent reads as not_found — never leaks that it belongs elsewhere', async () => {
    mockProposalFindByPk.mockResolvedValue({ agent_id: 'other-agent', id: 'p1' });

    const result = await approveManagerInboxItem('agent-1', 'p1', 'ali@colaberry.com', null);

    expect(result.outcome).toBe('not_found');
    expect(mockApproveProposedAction).not.toHaveBeenCalled();
  });

  it('boundary: a genuinely nonexistent proposal id reads as not_found the same way', async () => {
    mockProposalFindByPk.mockResolvedValue(null);
    const result = await approveManagerInboxItem('agent-1', 'missing', 'ali@colaberry.com', null);
    expect(result.outcome).toBe('not_found');
  });

  it('happy path: a proposal that genuinely belongs to this agent delegates to the shared approval service', async () => {
    mockProposalFindByPk.mockResolvedValue({ agent_id: 'agent-1', id: 'p1' });
    mockApproveProposedAction.mockResolvedValue({
      outcome: 'approved', applied: true,
      proposal: { id: 'p1', action_type: 'x', reason: 'r', confidence: 0.9, priority_score: null, risk_score: null, impact_score: null, status: 'approved', created_at: new Date(), expires_at: null, target_table: 'scheduled_emails', target_id: 'e1' },
    });

    const result = await approveManagerInboxItem('agent-1', 'p1', 'ali@colaberry.com', 'ok');

    // T509: the caller's identity rides through as the fourth argument (undefined when none was handed in).
    expect(mockApproveProposedAction).toHaveBeenCalledWith('p1', 'ali@colaberry.com', 'ok', undefined);
    expect(result.outcome).toBe('approved');
    expect(result.applied).toBe(true);
  });
});

describe('T509: the growth-journey branch through the inbox', () => {
  const ADMIN = { id: 'au-1', email: 'ali@colaberry.com', role: 'admin' };
  it('forwards the admin identity to the shared service, and surfaces not_authorized unchanged with the item', async () => {
    mockProposalFindByPk.mockResolvedValue({ agent_id: 'agent-1', id: 'p9' });
    mockApproveProposedAction.mockResolvedValue({
      outcome: 'not_authorized',
      proposal: { id: 'p9', action_type: 'growth_journey_execution', reason: 'r', confidence: 1, priority_score: null, risk_score: null, impact_score: null, status: 'pending', created_at: new Date(), expires_at: null, target_table: 'growth_journey_executions', target_id: 'ex-1' },
    });
    const result = await approveManagerInboxItem('agent-1', 'p9', 'ali@colaberry.com', null, ADMIN);
    expect(mockApproveProposedAction).toHaveBeenCalledWith('p9', 'ali@colaberry.com', null, ADMIN);
    expect(result.outcome).toBe('not_authorized');
    expect(result.item?.status).toBe('pending');

    mockRejectProposedAction.mockResolvedValue({ outcome: 'not_authorized', proposal: { id: 'p9', action_type: 'growth_journey_execution', reason: 'r', confidence: 1, priority_score: null, risk_score: null, impact_score: null, status: 'pending', created_at: new Date(), expires_at: null, target_table: 'growth_journey_executions', target_id: 'ex-1' } });
    const rejected = await rejectManagerInboxItem('agent-1', 'p9', 'ali@colaberry.com', null, ADMIN);
    expect(mockRejectProposedAction).toHaveBeenCalledWith('p9', 'ali@colaberry.com', null, ADMIN);
    expect(rejected.outcome).toBe('not_authorized');
  });
});

describe('rejectManagerInboxItem — agent-scoped rejection (Checkpoint B)', () => {
  it('security: a proposal id from a DIFFERENT agent reads as not_found', async () => {
    mockProposalFindByPk.mockResolvedValue({ agent_id: 'other-agent', id: 'p1' });
    const result = await rejectManagerInboxItem('agent-1', 'p1', 'ali@colaberry.com', null);
    expect(result.outcome).toBe('not_found');
    expect(mockRejectProposedAction).not.toHaveBeenCalled();
  });

  it('happy path: delegates to the shared rejection service for a proposal that belongs to this agent', async () => {
    mockProposalFindByPk.mockResolvedValue({ agent_id: 'agent-1', id: 'p1' });
    mockRejectProposedAction.mockResolvedValue({
      outcome: 'rejected',
      proposal: { id: 'p1', action_type: 'x', reason: 'r', confidence: 0.9, priority_score: null, risk_score: null, impact_score: null, status: 'rejected', created_at: new Date(), expires_at: null, target_table: null, target_id: null },
    });

    const result = await rejectManagerInboxItem('agent-1', 'p1', 'ali@colaberry.com', 'no');

    expect(mockRejectProposedAction).toHaveBeenCalledWith('p1', 'ali@colaberry.com', 'no', undefined);
    expect(result.outcome).toBe('rejected');
  });
});
