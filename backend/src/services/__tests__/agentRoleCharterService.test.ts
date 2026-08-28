/**
 * agentRoleCharterService — AI Workforce Management, Checkpoint B. Pins the
 * honest-empty-state contract (a real agent with no charter yet returns
 * `{ agentId, charter: null }`, never a fabricated default) and the
 * agent-existence guard on writes (an agent that doesn't exist can't be
 * given a charter, regardless of what the caller sends).
 */
const mockAiAgentFindByPk = jest.fn();
jest.mock('../../models/AiAgent', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockAiAgentFindByPk(...a) },
}));

const mockCharterFindOne = jest.fn();
const mockCharterUpsert = jest.fn();
jest.mock('../../models/AgentRoleCharter', () => ({
  __esModule: true,
  default: {
    findOne: (...a: any[]) => mockCharterFindOne(...a),
    upsert: (...a: any[]) => mockCharterUpsert(...a),
  },
}));

import { getRoleCharter, upsertRoleCharter, AgentNotFoundError } from '../agentRoleCharterService';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getRoleCharter', () => {
  it('happy path: returns the real charter for an agent that has one', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockCharterFindOne.mockResolvedValue({
      role_title: 'Student Retention Specialist',
      mission: 'Recover students showing dropout risk.',
      responsibilities: ['Monitor engagement signals'],
      kpis: ['Retention recovered'],
      updated_by_email: 'ali@colaberry.com',
      updated_at: new Date('2026-08-28T00:00:00Z'),
    });

    const result = await getRoleCharter('agent-1');

    expect(result).toEqual({
      agentId: 'agent-1',
      charter: {
        roleTitle: 'Student Retention Specialist',
        mission: 'Recover students showing dropout risk.',
        responsibilities: ['Monitor engagement signals'],
        kpis: ['Retention recovered'],
        updatedByEmail: 'ali@colaberry.com',
        updatedAt: new Date('2026-08-28T00:00:00Z'),
      },
    });
  });

  it('boundary: a real agent with no charter yet returns charter: null, not a fabricated default', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockCharterFindOne.mockResolvedValue(null);

    const result = await getRoleCharter('agent-1');

    expect(result).toEqual({ agentId: 'agent-1', charter: null });
  });

  it('boundary: an agent that does not exist returns null (the controller turns this into 404)', async () => {
    mockAiAgentFindByPk.mockResolvedValue(null);

    const result = await getRoleCharter('does-not-exist');

    expect(result).toBeNull();
    expect(mockCharterFindOne).not.toHaveBeenCalled();
  });
});

describe('upsertRoleCharter', () => {
  const input = {
    roleTitle: 'Student Retention Specialist',
    mission: 'Recover students showing dropout risk.',
    responsibilities: ['Monitor engagement signals'],
    kpis: ['Retention recovered'],
  };

  it('happy path: creates/updates the one row for this agent and returns it', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockCharterUpsert.mockResolvedValue([
      {
        role_title: input.roleTitle,
        mission: input.mission,
        responsibilities: input.responsibilities,
        kpis: input.kpis,
        updated_by_email: 'manager@colaberry.com',
        updated_at: new Date('2026-08-28T00:00:00Z'),
      },
      true,
    ]);

    const result = await upsertRoleCharter('agent-1', input, 'manager@colaberry.com');

    expect(mockCharterUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id: 'agent-1',
        role_title: input.roleTitle,
        updated_by_email: 'manager@colaberry.com',
      }),
    );
    expect(result.charter?.updatedByEmail).toBe('manager@colaberry.com');
  });

  it('BREAK: an agent that does not exist throws AgentNotFoundError (404) and never writes', async () => {
    mockAiAgentFindByPk.mockResolvedValue(null);

    await expect(upsertRoleCharter('does-not-exist', input, 'manager@colaberry.com')).rejects.toBeInstanceOf(
      AgentNotFoundError,
    );
    expect(mockCharterUpsert).not.toHaveBeenCalled();
  });
});
