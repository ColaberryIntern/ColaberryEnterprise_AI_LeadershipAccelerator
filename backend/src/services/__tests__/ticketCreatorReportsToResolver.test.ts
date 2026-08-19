/**
 * Agent Ticket Standard resolver — the split proven necessary by plan-audit
 * cycle 1 (session CC-20260818-x4nk): 'agent'/'cory' creators pass an agent_name
 * string directly, but 'ai_staff' creators pass an AdminUser id and must be
 * resolved via AdminUser.agent_id first. Reese's real production id
 * (82c2dfd2-369e-4545-8d2f-22d1ae3451ff, confirmed against
 * resolveActorDisplayName.test.ts's own REESE_ADMIN_ID fixture and live
 * production data) is used as the ai_staff fixture throughout.
 */
jest.mock('../../models/AdminUser', () => ({ findByPk: jest.fn() }));
jest.mock('../../models/AiAgent', () => ({ findOne: jest.fn(), findByPk: jest.fn() }));

import AdminUser from '../../models/AdminUser';
import AiAgent from '../../models/AiAgent';
import { resolveCreatorAiAgent, enforceReportsToGate } from '../ticketCreatorReportsToResolver';
import { TicketCreatorNotReportableError } from '../errors/ticketCreatorErrors';

const mockAdminFindByPk = AdminUser.findByPk as unknown as jest.Mock;
const mockAgentFindOne = AiAgent.findOne as unknown as jest.Mock;
const mockAgentFindByPk = AiAgent.findByPk as unknown as jest.Mock;

const REESE_ADMIN_ID = '82c2dfd2-369e-4545-8d2f-22d1ae3451ff';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveCreatorAiAgent', () => {
  it("'agent': resolves directly by agent_name, never touches AdminUser", async () => {
    const agentRow = { id: 'a1', agent_name: 'AlumniNetworkArchitect', reports_to_org_member_id: 'jackie-id' };
    mockAgentFindOne.mockResolvedValue(agentRow);

    const result = await resolveCreatorAiAgent('agent', 'AlumniNetworkArchitect');

    expect(result).toBe(agentRow);
    expect(mockAgentFindOne).toHaveBeenCalledWith({ where: { agent_name: 'AlumniNetworkArchitect' } });
    expect(mockAdminFindByPk).not.toHaveBeenCalled();
  });

  it("'cory': resolves directly by agent_name (same path as 'agent')", async () => {
    const agentRow = { id: 'a2', agent_name: 'CoryBrain', reports_to_org_member_id: 'ali-id' };
    mockAgentFindOne.mockResolvedValue(agentRow);

    const result = await resolveCreatorAiAgent('cory', 'CoryBrain');

    expect(result).toBe(agentRow);
    expect(mockAgentFindOne).toHaveBeenCalledWith({ where: { agent_name: 'CoryBrain' } });
  });

  it("'ai_staff': resolves via AdminUser.agent_id -> AiAgent — Reese's real shape (the plan-audit cycle 1 regression case)", async () => {
    mockAdminFindByPk.mockResolvedValue({ agent_id: 'reese-aiagent-id' });
    const agentRow = { id: 'reese-aiagent-id', agent_name: 'Reese', reports_to_org_member_id: 'taiwo-id' };
    mockAgentFindByPk.mockResolvedValue(agentRow);

    const result = await resolveCreatorAiAgent('ai_staff', REESE_ADMIN_ID);

    expect(result).toBe(agentRow);
    expect(mockAdminFindByPk).toHaveBeenCalledWith(REESE_ADMIN_ID, { attributes: ['agent_id'] });
    expect(mockAgentFindByPk).toHaveBeenCalledWith('reese-aiagent-id');
    // Never tried the agent_name path for an ai_staff creator.
    expect(mockAgentFindOne).not.toHaveBeenCalled();
  });

  it("'ai_staff': no matching AdminUser row -> null, never throws", async () => {
    mockAdminFindByPk.mockResolvedValue(null);

    const result = await resolveCreatorAiAgent('ai_staff', 'nonexistent-admin-id');

    expect(result).toBeNull();
    expect(mockAgentFindByPk).not.toHaveBeenCalled();
  });

  it("'ai_staff': AdminUser exists but has no linked agent_id -> null", async () => {
    mockAdminFindByPk.mockResolvedValue({ agent_id: null });

    const result = await resolveCreatorAiAgent('ai_staff', 'some-admin-id');

    expect(result).toBeNull();
    expect(mockAgentFindByPk).not.toHaveBeenCalled();
  });

  it("'agent': an unregistered agent_name resolves to null", async () => {
    mockAgentFindOne.mockResolvedValue(null);

    const result = await resolveCreatorAiAgent('agent', 'CoryAgenticEngine');

    expect(result).toBeNull();
  });

  it("'human': always resolves to null without querying anything — createTicket() bypasses this resolver for human creators, but the resolver itself is a safe no-op if ever called with 'human'", async () => {
    const result = await resolveCreatorAiAgent('human', 'any-id');

    expect(result).toBeNull();
    expect(mockAgentFindOne).not.toHaveBeenCalled();
    expect(mockAdminFindByPk).not.toHaveBeenCalled();
  });
});

// Agent Ticket Standard's actual gate (extracted out of ticketService.createTicket()
// for CLAUDE.md's file-size ceiling — see ticketService.ts's own header comment).
describe('enforceReportsToGate', () => {
  it("'human': bypasses entirely, returns null, queries nothing", async () => {
    const result = await enforceReportsToGate('human', 'any-admin-uuid-or-string');

    expect(result).toBeNull();
    expect(mockAgentFindOne).not.toHaveBeenCalled();
    expect(mockAdminFindByPk).not.toHaveBeenCalled();
  });

  it('happy path: a registered agent with reports_to_org_member_id set returns that id', async () => {
    mockAgentFindOne.mockResolvedValue({ reports_to_org_member_id: 'jackie-id' });

    const result = await enforceReportsToGate('agent', 'AlumniNetworkArchitect');

    expect(result).toBe('jackie-id');
  });

  it("happy path (ai_staff): Reese's real shape (AdminUser id -> agent_id -> AiAgent) resolves successfully — the regression case for plan-audit cycle 1's finding", async () => {
    mockAdminFindByPk.mockResolvedValue({ agent_id: 'reese-aiagent-id' });
    mockAgentFindByPk.mockResolvedValue({ reports_to_org_member_id: 'taiwo-id' });

    const result = await enforceReportsToGate('ai_staff', REESE_ADMIN_ID);

    expect(result).toBe('taiwo-id');
  });

  it('failure path: an unregistered creator throws TicketCreatorNotReportableError BEFORE any caller could write, reason unregistered', async () => {
    mockAgentFindOne.mockResolvedValue(null);

    await expect(enforceReportsToGate('agent', 'CoryAgenticEngine')).rejects.toMatchObject({
      error_class: 'TicketCreatorNotReportableError',
      context: { createdByType: 'agent', createdById: 'CoryAgenticEngine', reason: 'unregistered' },
    });
    await expect(enforceReportsToGate('agent', 'CoryAgenticEngine')).rejects.toBeInstanceOf(
      TicketCreatorNotReportableError,
    );
  });

  it('failure path: a registered agent with a null reports_to_org_member_id throws, reason no_reports_to', async () => {
    mockAgentFindOne.mockResolvedValue({ reports_to_org_member_id: null });

    await expect(enforceReportsToGate('agent', 'SomeFutureAgent')).rejects.toMatchObject({
      error_class: 'TicketCreatorNotReportableError',
      context: { reason: 'no_reports_to' },
    });
  });
});
