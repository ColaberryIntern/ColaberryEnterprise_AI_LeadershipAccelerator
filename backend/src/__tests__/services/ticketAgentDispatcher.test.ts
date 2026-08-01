import { Ticket, AgentRun } from '../../models';
import { updateTicketStatus, assignTicket, addAgentOutput, addTicketComment } from '../../services/ticketService';
import { runPlatformFixAgent } from '../../services/agents/platformFixAgent';
import { emitEvent } from '../../services/workLedger/workLedgerService';
import { dispatchTicketToAgent } from '../../services/ticketAgentDispatcher';

jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../models', () => ({
  Ticket: { findByPk: jest.fn() },
  AgentRun: { create: jest.fn() },
}));
jest.mock('../../services/ticketService', () => ({
  updateTicketStatus: jest.fn(),
  assignTicket: jest.fn(),
  addAgentOutput: jest.fn(),
  addTicketComment: jest.fn(),
}));
jest.mock('../../services/reporting/coryDecisionEngine', () => ({ trackExecutionOutcome: jest.fn() }));
jest.mock('../../services/agents/curriculumArchitectAgent', () => ({ runCurriculumArchitectAgent: jest.fn() }));
jest.mock('../../services/agents/artifactGenerationAgent', () => ({ runArtifactGenerationAgent: jest.fn() }));
jest.mock('../../services/agents/curriculumQAAgent', () => ({ runCurriculumQAAgent: jest.fn() }));
jest.mock('../../services/agents/platformFixAgent', () => ({ runPlatformFixAgent: jest.fn() }));
jest.mock('../../services/workLedger/workLedgerService', () => ({ emitEvent: jest.fn() }));

const ticketFindByPk = Ticket.findByPk as unknown as jest.Mock;
const agentRunCreate = AgentRun.create as unknown as jest.Mock;
const mockRunPlatformFix = runPlatformFixAgent as unknown as jest.Mock;
const mockEmit = emitEvent as unknown as jest.Mock;
const mockAddTicketComment = addTicketComment as unknown as jest.Mock;
const mockAddAgentOutput = addAgentOutput as unknown as jest.Mock;

function makeAgentRun(id: string) {
  return { id, update: jest.fn().mockResolvedValue(undefined) };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEmit.mockResolvedValue({ event_id: 'evt-mock' });
  (updateTicketStatus as jest.Mock).mockResolvedValue(undefined);
  (assignTicket as jest.Mock).mockResolvedValue(undefined);
  mockAddAgentOutput.mockResolvedValue(undefined);
  mockAddTicketComment.mockResolvedValue(undefined);
});

describe('dispatchTicketToAgent — matched mapping, agent succeeds', () => {
  it('returns the unchanged AgentExecutionResult and records a successful AgentRun + ledger event', async () => {
    ticketFindByPk.mockResolvedValue({ id: 'tk1', type: 'bug', status: 'todo', metadata: {}, title: 'T', description: 'D' });
    const run = makeAgentRun('run1');
    agentRunCreate.mockResolvedValue(run);
    const agentResult = { agent_name: 'PlatformFixAgent', campaigns_processed: 0, actions_taken: [], errors: [], duration_ms: 5 };
    mockRunPlatformFix.mockResolvedValue(agentResult);

    const result = await dispatchTicketToAgent('tk1');

    expect(result).toBe(agentResult); // return value unchanged from today's behavior
    expect(agentRunCreate).toHaveBeenCalledWith(expect.objectContaining({ ticket_id: 'tk1', agent_name: 'PlatformFixAgent', status: 'running' }));
    expect(run.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', result: 'success' }));
    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit.mock.calls[0][0]).toMatchObject({
      ticketId: 'tk1',
      runId: 'run1',
      idempotencyKey: 'ticket-dispatch:run1',
      result: 'success',
    });
  });
});

describe('dispatchTicketToAgent — no matching mapping', () => {
  it('returns null (unchanged), records an unmapped/skipped AgentRun + ledger event', async () => {
    ticketFindByPk.mockResolvedValue({ id: 'tk2', type: 'strategic', status: 'todo', metadata: {} });
    const run = makeAgentRun('run2');
    agentRunCreate.mockResolvedValue(run);

    const result = await dispatchTicketToAgent('tk2');

    expect(result).toBeNull();
    expect(mockAddTicketComment).toHaveBeenCalledTimes(1);
    expect(agentRunCreate).toHaveBeenCalledWith(expect.objectContaining({ agent_name: 'unmapped' }));
    expect(run.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped', result: 'skipped' }));
    expect(mockEmit.mock.calls[0][0]).toMatchObject({
      ticketId: 'tk2',
      result: 'skipped',
      reasonCode: 'no_agent_mapping',
    });
  });
});

describe('dispatchTicketToAgent — agent throws', () => {
  it('returns the same synthesized error result as today, records a failed AgentRun + ledger event', async () => {
    ticketFindByPk.mockResolvedValue({ id: 'tk3', type: 'bug', status: 'todo', metadata: {} });
    const run = makeAgentRun('run3');
    agentRunCreate.mockResolvedValue(run);
    mockRunPlatformFix.mockRejectedValue(new Error('boom'));

    const result = await dispatchTicketToAgent('tk3');

    expect(result).toMatchObject({ agent_name: 'PlatformFixAgent', errors: ['boom'] });
    expect(mockAddAgentOutput).toHaveBeenCalledWith('tk3', 'PlatformFixAgent', expect.objectContaining({ errors: ['boom'] }));
    expect(mockAddTicketComment).toHaveBeenCalledWith('tk3', 'Agent error: boom', 'agent', 'PlatformFixAgent');
    expect(run.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', result: 'failure' }));
    expect(mockEmit.mock.calls[0][0]).toMatchObject({ result: 'failure', reasonCode: 'agent_threw' });
  });
});

describe('dispatchTicketToAgent — ticket not found', () => {
  it('still throws the same error and never touches AgentRun/ledger', async () => {
    ticketFindByPk.mockResolvedValue(null);

    await expect(dispatchTicketToAgent('missing')).rejects.toThrow('Ticket missing not found');
    expect(agentRunCreate).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

describe('ledger-write failure isolation (regression: must never break dispatch)', () => {
  it('still returns the agent result normally when AgentRun.create and emitEvent both reject', async () => {
    ticketFindByPk.mockResolvedValue({ id: 'tk4', type: 'bug', status: 'todo', metadata: {} });
    agentRunCreate.mockRejectedValue(new Error('agent_runs insert failed'));
    mockEmit.mockRejectedValue(new Error('ledger DB unavailable'));
    const agentResult = { agent_name: 'PlatformFixAgent', campaigns_processed: 0, actions_taken: [], errors: [], duration_ms: 5 };
    mockRunPlatformFix.mockResolvedValue(agentResult);

    await expect(dispatchTicketToAgent('tk4')).resolves.toBe(agentResult);
  });
});
