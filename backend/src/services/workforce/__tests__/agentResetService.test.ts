import AiAgent from '../../../models/AiAgent';
import AdminUser from '../../../models/AdminUser';
import { Ticket } from '../../../models';
import { updateTicketStatus } from '../../ticketService';
import { buildCreatorIdMatchList } from '../../agentBlueprint/legacyCreatorAliases';
import { resetAgents } from '../agentResetService';

// AI Workforce Reset (2026-08-24) — Ali, live: "we just need to remove all
// of the task they are assigned with at this time... deactivate current."
// Real, reversible mechanism: enabled:false (never a row DELETE) + real
// ticket cancellation via the SAME updateTicketStatus() every other caller
// in this repo uses (so a cancelled ticket still gets a real TicketActivity
// row and, where applicable, a real auto-decision note) — never a raw bulk
// UPDATE.

jest.mock('../../../models/AiAgent', () => ({ findByPk: jest.fn() }));
jest.mock('../../../models/AdminUser', () => ({ findOne: jest.fn() }));
jest.mock('../../../models', () => ({ Ticket: { findAll: jest.fn() } }));
jest.mock('../../ticketService', () => ({ updateTicketStatus: jest.fn() }));
jest.mock('../../agentBlueprint/legacyCreatorAliases', () => ({ buildCreatorIdMatchList: jest.fn() }));

const mockAgentFindByPk = AiAgent.findByPk as unknown as jest.Mock;
const mockAdminFindOne = AdminUser.findOne as unknown as jest.Mock;
const mockTicketFindAll = Ticket.findAll as unknown as jest.Mock;
const mockUpdateTicketStatus = updateTicketStatus as unknown as jest.Mock;
const mockMatchList = buildCreatorIdMatchList as unknown as jest.Mock;

function makeAgent(overrides: Partial<any> = {}) {
  const agent: any = { id: 'agent-1', agent_name: 'ExecutiveStrategyArchitect', enabled: true, ...overrides };
  agent.update = jest.fn(async (fields: any) => Object.assign(agent, fields));
  return agent;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMatchList.mockImplementation((adminUserId: string) => [adminUserId]);
  mockUpdateTicketStatus.mockResolvedValue({});
});

describe('resetAgents', () => {
  it('happy path: deactivates the agent (enabled:false, reversible) and cancels every currently-open ticket via the real updateTicketStatus()', async () => {
    const agent = makeAgent();
    mockAgentFindByPk.mockResolvedValue(agent);
    mockAdminFindOne.mockResolvedValue({ id: 'admin-1', agent_id: 'agent-1' });
    mockTicketFindAll.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);

    const [result] = await resetAgents(['agent-1'], 'ali@colaberry.com');

    expect(agent.update).toHaveBeenCalledWith({ enabled: false });
    expect(mockUpdateTicketStatus).toHaveBeenCalledTimes(2);
    expect(mockUpdateTicketStatus).toHaveBeenCalledWith('t1', 'cancelled', 'human', 'ali@colaberry.com');
    expect(mockUpdateTicketStatus).toHaveBeenCalledWith('t2', 'cancelled', 'human', 'ali@colaberry.com');
    expect(result).toEqual({ agentId: 'agent-1', agentName: 'ExecutiveStrategyArchitect', found: true, deactivated: true, ticketsCancelled: 2, error: null });
  });

  it('boundary: an agent with no linked AdminUser identity deactivates but cancels 0 tickets (no ticket identity to match against — honest, not an error)', async () => {
    const agent = makeAgent();
    mockAgentFindByPk.mockResolvedValue(agent);
    mockAdminFindOne.mockResolvedValue(null);

    const [result] = await resetAgents(['agent-1'], 'ali@colaberry.com');

    expect(agent.update).toHaveBeenCalledWith({ enabled: false });
    expect(mockTicketFindAll).not.toHaveBeenCalled();
    expect(mockUpdateTicketStatus).not.toHaveBeenCalled();
    expect(result.ticketsCancelled).toBe(0);
    expect(result.deactivated).toBe(true);
  });

  it('boundary: a non-existent agent id reports found:false and deactivated:false, never throws', async () => {
    mockAgentFindByPk.mockResolvedValue(null);

    const [result] = await resetAgents(['does-not-exist'], 'ali@colaberry.com');

    expect(result).toEqual({ agentId: 'does-not-exist', agentName: 'does-not-exist', found: false, deactivated: false, ticketsCancelled: 0, error: 'Agent not found' });
  });

  it('failure isolation (per ticket): one ticket that fails to cancel does not stop the others in the same batch', async () => {
    const agent = makeAgent();
    mockAgentFindByPk.mockResolvedValue(agent);
    mockAdminFindOne.mockResolvedValue({ id: 'admin-1', agent_id: 'agent-1' });
    mockTicketFindAll.mockResolvedValue([{ id: 't1' }, { id: 't2' }, { id: 't3' }]);
    mockUpdateTicketStatus
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Invalid transition: done -> cancelled'))
      .mockResolvedValueOnce({});

    const [result] = await resetAgents(['agent-1'], 'ali@colaberry.com');

    expect(mockUpdateTicketStatus).toHaveBeenCalledTimes(3);
    expect(result.ticketsCancelled).toBe(2); // t1 and t3 succeeded, t2's failure was isolated
    expect(result.error).toBeNull(); // the agent-level result is still a success
  });

  it('failure isolation (per agent): one agent id that throws while resolving does not stop the rest of the batch, and each agent gets its own real result', async () => {
    const goodAgent = makeAgent({ id: 'agent-2', agent_name: 'AlumniNetworkArchitect' });
    mockAgentFindByPk
      .mockRejectedValueOnce(new Error('DB unavailable'))
      .mockResolvedValueOnce(goodAgent);
    mockAdminFindOne.mockResolvedValue(null); // goodAgent: no identity, 0 tickets cancelled

    const results = await resetAgents(['agent-1', 'agent-2'], 'ali@colaberry.com');

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ agentId: 'agent-1', deactivated: false, error: 'DB unavailable' });
    expect(results[1]).toMatchObject({ agentId: 'agent-2', agentName: 'AlumniNetworkArchitect', deactivated: true });
  });

  it('reuses the SAME creator-id match list buildCreatorIdMatchList() produces (the canonical, already-correct "which tickets belong to this agent" resolution), never a re-derived match rule', async () => {
    const agent = makeAgent();
    mockAgentFindByPk.mockResolvedValue(agent);
    mockAdminFindOne.mockResolvedValue({ id: 'admin-1', agent_id: 'agent-1' });
    mockTicketFindAll.mockResolvedValue([]);

    await resetAgents(['agent-1'], 'ali@colaberry.com');

    expect(mockMatchList).toHaveBeenCalledWith('admin-1', agent);
  });
});
