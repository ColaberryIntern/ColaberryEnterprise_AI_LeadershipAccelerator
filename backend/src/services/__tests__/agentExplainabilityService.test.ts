/**
 * agentExplainabilityService — AI Workforce Management, Checkpoint F. Pins
 * that every field returned is copied verbatim from a real row (never
 * synthesized), that authorization events are matched under either the
 * agent's real UUID or its agent_name, that metadata is never returned
 * wholesale (only the curated authorization allowlist), and the honest
 * empty state for an agent with no recorded history.
 */
const mockAiAgentFindByPk = jest.fn();
jest.mock('../../models/AiAgent', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockAiAgentFindByPk(...a) },
}));

const mockEventFindAll = jest.fn();
jest.mock('../../models/AiEvent', () => ({
  __esModule: true,
  default: { findAll: (...a: any[]) => mockEventFindAll(...a) },
}));

const mockProposedActionFindAll = jest.fn();
jest.mock('../../models/ProposedAgentAction', () => ({
  __esModule: true,
  default: { findAll: (...a: any[]) => mockProposedActionFindAll(...a) },
}));

import { Op } from 'sequelize';
import { getAgentExplainability } from '../agentExplainabilityService';

const AGENT = { id: 'agent-uuid-1', agent_name: 'CoryBrain' };

beforeEach(() => {
  jest.clearAllMocks();
  mockAiAgentFindByPk.mockResolvedValue(AGENT);
  mockEventFindAll.mockResolvedValue([]);
  mockProposedActionFindAll.mockResolvedValue([]);
});

describe('getAgentExplainability', () => {
  it('boundary: a nonexistent agent returns null', async () => {
    mockAiAgentFindByPk.mockResolvedValue(null);

    const result = await getAgentExplainability('does-not-exist');

    expect(result).toBeNull();
    expect(mockEventFindAll).not.toHaveBeenCalled();
  });

  it('boundary: a real agent with zero events and zero proposals returns real empty arrays, not an error', async () => {
    const result = await getAgentExplainability('agent-uuid-1');

    expect(result!.events).toEqual([]);
    expect(result!.proposedActions).toEqual([]);
  });

  it('queries ai_events matched under EITHER the real agent UUID or the agent_name — historical authorization events use either', async () => {
    await getAgentExplainability('agent-uuid-1');

    const call = mockEventFindAll.mock.calls[0][0];
    expect(call.where.agent_id).toEqual({ [Op.in]: ['agent-uuid-1', 'CoryBrain'] });
  });

  it('happy path: a generic (non-authorization) event exposes only known-safe fields, never raw metadata', async () => {
    mockEventFindAll.mockResolvedValue([
      {
        event_type: 'llm.call', outcome: 'success', model: 'gpt-4o-mini', cost_usd: 0.0042, duration_ms: 850,
        created_at: new Date('2026-09-01'), metadata: { some_internal_field: 'should not leak' },
      },
    ]);

    const result = await getAgentExplainability('agent-uuid-1');

    expect(result!.events[0]).toEqual({
      eventType: 'llm.call', outcome: 'success', model: 'gpt-4o-mini', costUsd: 0.0042, durationMs: 850,
      createdAt: new Date('2026-09-01'), authorization: null,
    });
  });

  it('happy path: an agent.authorization event exposes the real verdict/reason/mode/enforced, and nothing else from metadata', async () => {
    mockEventFindAll.mockResolvedValue([
      {
        event_type: 'agent.authorization', outcome: 'blocked', model: null, cost_usd: null, duration_ms: null,
        created_at: new Date('2026-09-01'),
        metadata: { verdict: 'block', reason: 'Financial write outside allowed tables.', mode: 'shadow', enforced: false, some_other_field: 'x' },
      },
    ]);

    const result = await getAgentExplainability('agent-uuid-1');

    expect(result!.events[0].authorization).toEqual({
      verdict: 'block', reason: 'Financial write outside allowed tables.', mode: 'shadow', enforced: false,
    });
    expect((result!.events[0] as any).some_other_field).toBeUndefined();
  });

  it('happy path: proposed actions expose reason/status/confidence, never before_state or proposed_changes', async () => {
    mockProposedActionFindAll.mockResolvedValue([
      {
        action_type: 'update_lead_score', reason: 'Lead engaged with 3 emails in 48 hours.', status: 'pending', confidence: 0.82,
        created_at: new Date('2026-09-01'), reviewed_at: null,
        before_state: { score: 10 }, proposed_changes: { score: 40 },
      },
    ]);

    const result = await getAgentExplainability('agent-uuid-1');

    expect(result!.proposedActions[0]).toEqual({
      actionType: 'update_lead_score', reason: 'Lead engaged with 3 emails in 48 hours.', status: 'pending', confidence: 0.82,
      createdAt: new Date('2026-09-01'), reviewedAt: null,
    });
    expect((result!.proposedActions[0] as any).before_state).toBeUndefined();
    expect((result!.proposedActions[0] as any).proposed_changes).toBeUndefined();
  });
});
