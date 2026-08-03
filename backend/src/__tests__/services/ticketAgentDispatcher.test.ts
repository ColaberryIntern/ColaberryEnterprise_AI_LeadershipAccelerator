import { Ticket, AgentRun } from '../../models';
import { updateTicketStatus, assignTicket, addAgentOutput, addTicketComment } from '../../services/ticketService';
import { emitEvent } from '../../services/workLedger/workLedgerService';
import { selectAgent } from '../../services/workGraph/capabilityRouter';
import { dispatchTicketToAgent } from '../../services/ticketAgentDispatcher';

// ProofDesk Work Graph (Milestone 3, T009): dispatchTicketToAgent() now looks up
// the agent via capabilityRouter.selectAgent() instead of a local AGENT_MAPPINGS
// array (moved to capabilityRegistry.ts + capabilityRouter.ts, both already
// independently tested in T005/T006). This suite mocks selectAgent() itself at
// that seam, the same "mock at the service boundary" convention this file already
// used for ticketService/workLedgerService — dispatchTicketToAgent's OWN behavior
// (AgentRun bookkeeping, status transitions, ledger events, error handling) is
// what this suite verifies; the router's internal scoring is T006's job.

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
jest.mock('../../services/workLedger/workLedgerService', () => ({ emitEvent: jest.fn() }));
jest.mock('../../services/workGraph/capabilityRouter', () => ({ selectAgent: jest.fn() }));

const ticketFindByPk = Ticket.findByPk as unknown as jest.Mock;
const agentRunCreate = AgentRun.create as unknown as jest.Mock;
const mockSelectAgent = selectAgent as unknown as jest.Mock;
const mockEmit = emitEvent as unknown as jest.Mock;
const mockAddTicketComment = addTicketComment as unknown as jest.Mock;
const mockAddAgentOutput = addAgentOutput as unknown as jest.Mock;

function makeAgentRun(id: string) {
  return { id, update: jest.fn().mockResolvedValue(undefined) };
}

/** Builds a selectAgent() resolution matching capabilityRouter.ts's real return
 * shape, so this suite exercises dispatchTicketToAgent's real consumption of it
 * (selection?.mapping ?? null, then mapping.agent_name / mapping.execute). */
function makeSelection(agentName: string, execute: jest.Mock) {
  return {
    mapping: { match: () => true, agent_name: agentName, execute },
    agentName,
    score: 0.9,
    breakdown: {},
  };
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
    const mockExecute = jest.fn().mockResolvedValue(agentResult);
    mockSelectAgent.mockResolvedValue(makeSelection('PlatformFixAgent', mockExecute));

    const result = await dispatchTicketToAgent('tk1');

    expect(result).toBe(agentResult); // return value unchanged from today's behavior
    expect(mockSelectAgent).toHaveBeenCalledWith(expect.objectContaining({ id: 'tk1' }));
    expect(mockExecute).toHaveBeenCalledTimes(1);
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
  it('returns null (unchanged), records an unmapped/skipped AgentRun + ledger event, when the router finds nothing eligible', async () => {
    ticketFindByPk.mockResolvedValue({ id: 'tk2', type: 'strategic', status: 'todo', metadata: {} });
    const run = makeAgentRun('run2');
    agentRunCreate.mockResolvedValue(run);
    mockSelectAgent.mockResolvedValue(null); // router's own "no eligible agent" result

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
    const mockExecute = jest.fn().mockRejectedValue(new Error('boom'));
    mockSelectAgent.mockResolvedValue(makeSelection('PlatformFixAgent', mockExecute));

    const result = await dispatchTicketToAgent('tk3');

    expect(result).toMatchObject({ agent_name: 'PlatformFixAgent', errors: ['boom'] });
    expect(mockAddAgentOutput).toHaveBeenCalledWith('tk3', 'PlatformFixAgent', expect.objectContaining({ errors: ['boom'] }));
    expect(mockAddTicketComment).toHaveBeenCalledWith('tk3', 'Agent error: boom', 'agent', 'PlatformFixAgent');
    expect(run.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', result: 'failure' }));
    expect(mockEmit.mock.calls[0][0]).toMatchObject({ result: 'failure', reasonCode: 'agent_threw' });
  });
});

describe('dispatchTicketToAgent — ticket not found', () => {
  it('still throws the same error and never touches the router, AgentRun, or the ledger', async () => {
    ticketFindByPk.mockResolvedValue(null);

    await expect(dispatchTicketToAgent('missing')).rejects.toThrow('Ticket missing not found');
    expect(mockSelectAgent).not.toHaveBeenCalled();
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
    const mockExecute = jest.fn().mockResolvedValue(agentResult);
    mockSelectAgent.mockResolvedValue(makeSelection('PlatformFixAgent', mockExecute));

    await expect(dispatchTicketToAgent('tk4')).resolves.toBe(agentResult);
  });
});

// ProofDesk Work Graph (Milestone 3, T008) — retry/handoff lineage. Only
// createAgentRunSafe()'s AgentRun.create() call and dispatchTicketToAgent()'s new
// optional second parameter changed; the mapping-lookup mechanism itself (now the
// Capability Router, T009) is exercised the same way as the tests above.
describe('dispatchTicketToAgent — retry lineage (T008)', () => {
  it('sets retry_of_run_id on the new AgentRun when a retryOfRunId is passed', async () => {
    ticketFindByPk.mockResolvedValue({ id: 'tk5', type: 'bug', status: 'todo', metadata: {} });
    const run = makeAgentRun('run5-retry');
    agentRunCreate.mockResolvedValue(run);
    const agentResult = { agent_name: 'PlatformFixAgent', campaigns_processed: 0, actions_taken: [], errors: [], duration_ms: 5 };
    const mockExecute = jest.fn().mockResolvedValue(agentResult);
    mockSelectAgent.mockResolvedValue(makeSelection('PlatformFixAgent', mockExecute));

    await dispatchTicketToAgent('tk5', { retryOfRunId: 'run5-original-failed' });

    expect(agentRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({ ticket_id: 'tk5', retry_of_run_id: 'run5-original-failed' })
    );
  });

  it('a normal (non-retry) dispatch still sets retry_of_run_id to null — no regression to the existing path', async () => {
    ticketFindByPk.mockResolvedValue({ id: 'tk6', type: 'bug', status: 'todo', metadata: {} });
    const run = makeAgentRun('run6');
    agentRunCreate.mockResolvedValue(run);
    const agentResult = { agent_name: 'PlatformFixAgent', campaigns_processed: 0, actions_taken: [], errors: [], duration_ms: 5 };
    const mockExecute = jest.fn().mockResolvedValue(agentResult);
    mockSelectAgent.mockResolvedValue(makeSelection('PlatformFixAgent', mockExecute));

    // Called exactly as every pre-existing call site in this repo calls it today —
    // no second argument at all.
    const result = await dispatchTicketToAgent('tk6');

    expect(result).toBe(agentResult);
    expect(agentRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({ ticket_id: 'tk6', retry_of_run_id: null })
    );
  });
});
