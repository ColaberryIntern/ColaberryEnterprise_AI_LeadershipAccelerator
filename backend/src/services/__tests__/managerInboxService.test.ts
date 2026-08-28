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
jest.mock('../../models/ProposedAgentAction', () => ({
  __esModule: true,
  default: { findAll: (...a: any[]) => mockProposalFindAll(...a) },
}));

import { getManagerInboxItems } from '../managerInboxService';

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
});
