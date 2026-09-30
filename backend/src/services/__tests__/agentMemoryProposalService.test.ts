/**
 * agentMemoryProposalService — AI Workforce Management, Checkpoint E. Pins
 * that a proposal is always created 'pending' (never auto-approved), that
 * approve/reject decisions are idempotent, and — the whole point of this
 * model — that getApprovedMemoryTexts() only ever returns content from
 * rows whose status is genuinely 'approved'.
 */
const mockAiAgentFindByPk = jest.fn();
jest.mock('../../models/AiAgent', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockAiAgentFindByPk(...a) },
}));

const mockCreate = jest.fn();
const mockFindAll = jest.fn();
const mockFindByPk = jest.fn();
jest.mock('../../models/AgentMemoryProposal', () => ({
  __esModule: true,
  default: {
    create: (...a: any[]) => mockCreate(...a),
    findAll: (...a: any[]) => mockFindAll(...a),
    findByPk: (...a: any[]) => mockFindByPk(...a),
  },
}));

import {
  proposeMemory,
  listMemoryProposals,
  approveMemoryProposal,
  rejectMemoryProposal,
  getApprovedMemoryTexts,
  AgentNotFoundError,
  MemoryProposalNotFoundError,
} from '../agentMemoryProposalService';

const AGENT = { id: 'agent-1' };

beforeEach(() => {
  jest.clearAllMocks();
  mockAiAgentFindByPk.mockResolvedValue(AGENT);
});

describe('proposeMemory', () => {
  it('happy path: always creates status=pending, never auto-approved', async () => {
    mockCreate.mockResolvedValue({
      id: 'mem-1', agent_id: 'agent-1', content: 'Prefers async updates.', evidence: null,
      proposed_by_email: 'manager@colaberry.com', status: 'pending', reviewed_by_email: null,
      reviewed_at: null, review_notes: null, created_at: new Date(),
    });

    await proposeMemory('agent-1', 'manager@colaberry.com', 'Prefers async updates.');

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
  });

  it('evidence is optional and passes through when given', async () => {
    mockCreate.mockResolvedValue({
      id: 'mem-2', agent_id: 'agent-1', content: 'X', evidence: 'Observed 3x in tickets.',
      proposed_by_email: 'manager@colaberry.com', status: 'pending', reviewed_by_email: null,
      reviewed_at: null, review_notes: null, created_at: new Date(),
    });

    await proposeMemory('agent-1', 'manager@colaberry.com', 'X', 'Observed 3x in tickets.');

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ evidence: 'Observed 3x in tickets.' }));
  });

  it('BREAK: a nonexistent agent throws AgentNotFoundError and never writes', async () => {
    mockAiAgentFindByPk.mockResolvedValue(null);

    await expect(proposeMemory('does-not-exist', 'manager@colaberry.com', 'X')).rejects.toBeInstanceOf(AgentNotFoundError);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('listMemoryProposals', () => {
  it('boundary: a real agent with zero proposals returns an empty array, not an error', async () => {
    mockFindAll.mockResolvedValue([]);

    const result = await listMemoryProposals('agent-1');

    expect(result).toEqual([]);
  });

  it('boundary: a nonexistent agent returns null', async () => {
    mockAiAgentFindByPk.mockResolvedValue(null);

    const result = await listMemoryProposals('does-not-exist');

    expect(result).toBeNull();
    expect(mockFindAll).not.toHaveBeenCalled();
  });
});

function fakeRow(overrides: any = {}) {
  return {
    id: 'mem-1', agent_id: 'agent-1', content: 'X', evidence: null, proposed_by_email: 'manager@colaberry.com',
    status: 'pending', reviewed_by_email: null, reviewed_at: null, review_notes: null, created_at: new Date(),
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('approveMemoryProposal / rejectMemoryProposal', () => {
  it('happy path: approves a pending proposal and stamps the reviewer', async () => {
    const row = fakeRow();
    mockFindByPk.mockResolvedValue(row);

    await approveMemoryProposal('mem-1', 'ali@colaberry.com', 'Confirmed with the student directly.');

    expect(row.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', reviewed_by_email: 'ali@colaberry.com', review_notes: 'Confirmed with the student directly.' })
    );
  });

  it('happy path: rejects a pending proposal', async () => {
    const row = fakeRow();
    mockFindByPk.mockResolvedValue(row);

    await rejectMemoryProposal('mem-1', 'ali@colaberry.com');

    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected' }));
  });

  it('idempotency: approving an already-decided proposal is a no-op, not a second decision event', async () => {
    const row = fakeRow({ status: 'approved', reviewed_by_email: 'ali@colaberry.com', reviewed_at: new Date('2026-08-01') });
    mockFindByPk.mockResolvedValue(row);

    await approveMemoryProposal('mem-1', 'kes@colaberry.com');

    expect(row.update).not.toHaveBeenCalled();
  });

  it('idempotency: rejecting an already-approved proposal does not flip it', async () => {
    const row = fakeRow({ status: 'approved' });
    mockFindByPk.mockResolvedValue(row);

    const result = await rejectMemoryProposal('mem-1', 'kes@colaberry.com');

    expect(row.update).not.toHaveBeenCalled();
    expect(result.status).toBe('approved');
  });

  it('BREAK: a nonexistent proposal throws MemoryProposalNotFoundError', async () => {
    mockFindByPk.mockResolvedValue(null);

    await expect(approveMemoryProposal('does-not-exist', 'ali@colaberry.com')).rejects.toBeInstanceOf(MemoryProposalNotFoundError);
  });
});

describe('getApprovedMemoryTexts — the actual runtime read path', () => {
  it('happy path: returns content only, real approved rows', async () => {
    mockFindAll.mockResolvedValue([{ content: 'Fact A' }, { content: 'Fact B' }]);

    const texts = await getApprovedMemoryTexts('agent-1');

    expect(texts).toEqual(['Fact A', 'Fact B']);
    expect(mockFindAll).toHaveBeenCalledWith(expect.objectContaining({ where: { agent_id: 'agent-1', status: 'approved' } }));
  });

  it('boundary: zero approved rows returns a real empty array', async () => {
    mockFindAll.mockResolvedValue([]);

    const texts = await getApprovedMemoryTexts('agent-1');

    expect(texts).toEqual([]);
  });

  it('fail-safe: a query failure returns an empty array rather than throwing — a memory-fetch failure must never block a reply', async () => {
    mockFindAll.mockRejectedValue(new Error('DB unavailable'));

    const texts = await getApprovedMemoryTexts('agent-1');

    expect(texts).toEqual([]);
  });
});
