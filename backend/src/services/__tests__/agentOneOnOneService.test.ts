/**
 * agentOneOnOneService — AI Workforce Management, Checkpoint D. Pins the
 * agent-existence guard, the honest empty-history state, and the
 * idempotency guard on completing an already-completed 1:1 (a real outcome
 * record must never be silently clobbered by a second call).
 */
const mockAiAgentFindByPk = jest.fn();
jest.mock('../../models/AiAgent', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockAiAgentFindByPk(...a) },
}));

const mockOneOnOneCreate = jest.fn();
const mockOneOnOneFindAll = jest.fn();
const mockOneOnOneFindByPk = jest.fn();
jest.mock('../../models/AgentOneOnOne', () => ({
  __esModule: true,
  default: {
    create: (...a: any[]) => mockOneOnOneCreate(...a),
    findAll: (...a: any[]) => mockOneOnOneFindAll(...a),
    findByPk: (...a: any[]) => mockOneOnOneFindByPk(...a),
  },
}));

import {
  createOneOnOne,
  listOneOnOnes,
  completeOneOnOne,
  AgentNotFoundError,
  OneOnOneNotFoundError,
  OneOnOneAlreadyCompletedError,
} from '../agentOneOnOneService';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createOneOnOne', () => {
  it('happy path: creates a scheduled 1:1 with the given agenda', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockOneOnOneCreate.mockResolvedValue({
      id: '1:1-1', agenda: 'Discuss Q3 performance', outcome_notes: null, status: 'scheduled',
      created_by_email: 'manager@colaberry.com', held_at: null, created_at: new Date(),
    });

    const result = await createOneOnOne('agent-1', 'org-member-1', 'manager@colaberry.com', 'Discuss Q3 performance');

    expect(mockOneOnOneCreate).toHaveBeenCalledWith(expect.objectContaining({
      agent_id: 'agent-1', org_member_id: 'org-member-1', created_by_email: 'manager@colaberry.com',
      agenda: 'Discuss Q3 performance', status: 'scheduled',
    }));
    expect(result.status).toBe('scheduled');
  });

  it('BREAK: a nonexistent agent throws AgentNotFoundError and never writes', async () => {
    mockAiAgentFindByPk.mockResolvedValue(null);

    await expect(createOneOnOne('does-not-exist', null, 'manager@colaberry.com', 'agenda')).rejects.toBeInstanceOf(AgentNotFoundError);
    expect(mockOneOnOneCreate).not.toHaveBeenCalled();
  });
});

describe('listOneOnOnes', () => {
  it('boundary: a real agent with zero 1:1s returns an empty array, not an error', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockOneOnOneFindAll.mockResolvedValue([]);

    const result = await listOneOnOnes('agent-1');

    expect(result).toEqual([]);
  });

  it('boundary: a nonexistent agent returns null', async () => {
    mockAiAgentFindByPk.mockResolvedValue(null);

    const result = await listOneOnOnes('does-not-exist');

    expect(result).toBeNull();
    expect(mockOneOnOneFindAll).not.toHaveBeenCalled();
  });
});

describe('completeOneOnOne', () => {
  it('happy path: marks a scheduled 1:1 completed with real outcome notes and a held_at timestamp', async () => {
    const row: any = { id: '1:1-1', status: 'scheduled', update: jest.fn().mockResolvedValue(undefined) };
    mockOneOnOneFindByPk.mockResolvedValue(row);

    await completeOneOnOne('1:1-1', 'Agreed to reduce reply latency by 20%.');

    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'completed', outcome_notes: 'Agreed to reduce reply latency by 20%.',
    }));
    expect(row.update.mock.calls[0][0].held_at).toBeInstanceOf(Date);
  });

  it('BREAK (idempotency guard): completing an already-completed 1:1 throws rather than silently overwriting the real outcome record', async () => {
    const row: any = { id: '1:1-1', status: 'completed', update: jest.fn() };
    mockOneOnOneFindByPk.mockResolvedValue(row);

    await expect(completeOneOnOne('1:1-1', 'new notes')).rejects.toBeInstanceOf(OneOnOneAlreadyCompletedError);
    expect(row.update).not.toHaveBeenCalled();
  });

  it('BREAK: a nonexistent 1:1 throws OneOnOneNotFoundError', async () => {
    mockOneOnOneFindByPk.mockResolvedValue(null);

    await expect(completeOneOnOne('does-not-exist', 'notes')).rejects.toBeInstanceOf(OneOnOneNotFoundError);
  });
});
