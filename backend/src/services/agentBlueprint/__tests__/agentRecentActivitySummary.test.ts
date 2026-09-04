/**
 * getRecentActivitySummary — real recent tickets + real recent ai_events
 * for injection into an agent's manager-conversation prompt (see
 * agentManagerConversationPrompt.ts's own header comment for why this
 * exists: Ali, live, testing Reese — "what have you worked on" could only
 * honestly be answered "I don't know" before this). Pins honest empty
 * states (no AdminUser link, no tickets, no events) and the fail-safe
 * posture (a lookup failure never breaks the conversation turn).
 */
const mockAiAgentFindByPk = jest.fn();
jest.mock('../../../models/AiAgent', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockAiAgentFindByPk(...a) },
}));

const mockAdminUserFindOne = jest.fn();
jest.mock('../../../models/AdminUser', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => mockAdminUserFindOne(...a) },
}));

const mockTicketFindAll = jest.fn();
jest.mock('../../../models', () => ({
  Ticket: { findAll: (...a: any[]) => mockTicketFindAll(...a) },
}));

const mockGetExplainability = jest.fn();
jest.mock('../../agentExplainabilityService', () => ({ getAgentExplainability: (...a: any[]) => mockGetExplainability(...a) }));

import { getRecentActivitySummary } from '../agentRecentActivitySummary';

const AGENT = { id: 'agent-1', agent_name: 'Reese' };

beforeEach(() => {
  jest.clearAllMocks();
  mockAiAgentFindByPk.mockResolvedValue(AGENT);
  mockAdminUserFindOne.mockResolvedValue(null);
  mockTicketFindAll.mockResolvedValue([]);
  mockGetExplainability.mockResolvedValue({ agentId: 'agent-1', agentName: 'Reese', events: [], proposedActions: [] });
});

describe('getRecentActivitySummary', () => {
  it('boundary: a nonexistent agent returns real empty arrays, not an error', async () => {
    mockAiAgentFindByPk.mockResolvedValue(null);

    const result = await getRecentActivitySummary('does-not-exist');

    expect(result).toEqual({ tickets: [], events: [] });
    expect(mockTicketFindAll).not.toHaveBeenCalled();
  });

  it('honesty boundary: no linked AdminUser means real empty tickets, never fabricated', async () => {
    mockAdminUserFindOne.mockResolvedValue(null);

    const result = await getRecentActivitySummary('agent-1');

    expect(result.tickets).toEqual([]);
    expect(mockTicketFindAll).not.toHaveBeenCalled();
  });

  it('happy path: a linked AdminUser with real tickets returns them, most-recently-updated first', async () => {
    mockAdminUserFindOne.mockResolvedValue({ id: 'admin-1' });
    mockTicketFindAll.mockResolvedValue([
      { title: 'Student flagged inactivity risk', status: 'done', updated_at: new Date('2026-09-04') },
    ]);

    const result = await getRecentActivitySummary('agent-1');

    expect(result.tickets).toEqual([{ title: 'Student flagged inactivity risk', status: 'done', updatedAt: new Date('2026-09-04') }]);
    const call = mockTicketFindAll.mock.calls[0][0];
    expect(call.order).toEqual([['updated_at', 'DESC']]);
  });

  it('happy path: real recent ai_events pass through from getAgentExplainability, capped to the recent limit', async () => {
    mockGetExplainability.mockResolvedValue({
      agentId: 'agent-1', agentName: 'Reese', proposedActions: [],
      events: [
        { eventType: 'llm.call', outcome: 'success', model: 'gpt-4o-mini', costUsd: 0.0001, durationMs: 800, createdAt: new Date('2026-09-04'), authorization: null },
        { eventType: 'llm.call', outcome: 'success', model: 'gpt-4o-mini', costUsd: 0.0002, durationMs: 700, createdAt: new Date('2026-09-03'), authorization: null },
        { eventType: 'llm.call', outcome: 'success', model: 'gpt-4o-mini', costUsd: 0.0003, durationMs: 600, createdAt: new Date('2026-09-02'), authorization: null },
        { eventType: 'llm.call', outcome: 'success', model: 'gpt-4o-mini', costUsd: 0.0004, durationMs: 500, createdAt: new Date('2026-09-01'), authorization: null },
      ],
    });

    const result = await getRecentActivitySummary('agent-1');

    expect(result.events).toHaveLength(3);
    expect(result.events[0].costUsd).toBe(0.0001);
  });

  it('fail-safe: a real lookup failure returns honest empty arrays rather than throwing and breaking the conversation turn', async () => {
    mockAiAgentFindByPk.mockRejectedValue(new Error('DB connection lost'));

    const result = await getRecentActivitySummary('agent-1');

    expect(result).toEqual({ tickets: [], events: [] });
  });
});
