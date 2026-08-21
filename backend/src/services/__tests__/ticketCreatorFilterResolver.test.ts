/**
 * ticketCreatorFilterResolver — resolves an org-chart card's agent_name to
 * the full ticket-identifier match list the new `?creator=` board filter
 * queries against. Core claims under test: (1) an agent WITH a linked
 * AdminUser (blueprint-built, e.g. Reese/cory-engine-style processes)
 * resolves to its real AdminUser id + legacy aliases, reusing
 * buildCreatorIdMatchList() rather than re-deriving it; (2) an agent with NO
 * linked AdminUser (the 16 "Architect" pure-AiAgent rows) still resolves
 * usefully; (3) a miss/empty input never throws and never turns into an
 * accidental wildcard.
 *
 * Org Chart v5 (2026-08-21) — also covers listTicketCreatorOptions(), the
 * roster query backing the Tickets page's new Creator <select>.
 */
jest.mock('../../models/AdminUser', () => ({ findOne: jest.fn(), findAll: jest.fn() }));
jest.mock('../../models/AiAgent', () => ({ findOne: jest.fn(), findAll: jest.fn() }));

import AdminUser from '../../models/AdminUser';
import AiAgent from '../../models/AiAgent';
import { resolveCreatorMatchIds, listTicketCreatorOptions } from '../ticketCreatorFilterResolver';

const mockAdminUserFindOne = AdminUser.findOne as unknown as jest.Mock;
const mockAiAgentFindOne = AiAgent.findOne as unknown as jest.Mock;
const mockAdminUserFindAll = AdminUser.findAll as unknown as jest.Mock;
const mockAiAgentFindAll = AiAgent.findAll as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveCreatorMatchIds', () => {
  it('happy path: an agent WITH a linked AdminUser and legacy aliases resolves to agent_name + AiAgent.id + AdminUser.id + every legacy alias', async () => {
    const agent = { id: 'agent-process-1', agent_name: 'cory-engine', config: { legacy_creator_ids: ['cory-engine', 'cory_engine_legacy'] } };
    const admin = { id: 'admin-process-1', agent_id: 'agent-process-1' };
    mockAiAgentFindOne.mockResolvedValue(agent);
    mockAdminUserFindOne.mockResolvedValue(admin);

    const ids = await resolveCreatorMatchIds('cory-engine');

    expect(new Set(ids)).toEqual(new Set(['cory-engine', 'agent-process-1', 'admin-process-1', 'cory_engine_legacy']));
  });

  it('happy path: an agent with NO linked AdminUser (the pure "Architect" AiAgent case) resolves to agent_name + AiAgent.id, never throws on the missing AdminUser', async () => {
    const agent = { id: 'agent-architect-9', agent_name: 'CurriculumArchitectAgent', config: {} };
    mockAiAgentFindOne.mockResolvedValue(agent);
    mockAdminUserFindOne.mockResolvedValue(null);

    const ids = await resolveCreatorMatchIds('CurriculumArchitectAgent');

    expect(new Set(ids)).toEqual(new Set(['CurriculumArchitectAgent', 'agent-architect-9']));
  });

  it('failure/boundary: creator matches no AiAgent row — fails open to the literal value, never throws', async () => {
    mockAiAgentFindOne.mockResolvedValue(null);

    const ids = await resolveCreatorMatchIds('some-unregistered-name');

    expect(ids).toEqual(['some-unregistered-name']);
    expect(mockAdminUserFindOne).not.toHaveBeenCalled();
  });

  it('boundary: empty string returns an empty match list — never a wildcard', async () => {
    expect(await resolveCreatorMatchIds('')).toEqual([]);
    expect(await resolveCreatorMatchIds('   ')).toEqual([]);
    expect(mockAiAgentFindOne).not.toHaveBeenCalled();
  });

  it('boundary: whitespace around a real name is trimmed before lookup', async () => {
    mockAiAgentFindOne.mockResolvedValue(null);
    await resolveCreatorMatchIds('  cory-engine  ');
    expect(mockAiAgentFindOne).toHaveBeenCalledWith({ where: { agent_name: 'cory-engine' } });
  });

  it('no-placeholder guard: a DB error from AiAgent.findOne propagates as a real rejection — this function feeds a WHERE clause, not display text, so it must never silently swallow a lookup failure into a fabricated "no match" result', async () => {
    mockAiAgentFindOne.mockRejectedValue(new Error('connection reset'));
    await expect(resolveCreatorMatchIds('cory-engine')).rejects.toThrow('connection reset');
  });
});

describe('listTicketCreatorOptions', () => {
  it('happy path: agents with linked AdminUsers resolve to their real display_name, sorted alphabetically by display_name', async () => {
    mockAiAgentFindAll.mockResolvedValue([
      { id: 'agent-1', agent_name: 'cory-engine' },
      { id: 'agent-2', agent_name: 'MarketingGrowthStrategyArchitect' },
    ]);
    mockAdminUserFindAll.mockResolvedValue([
      { agent_id: 'agent-1', display_name: 'Cory Engine — Autonomous Operations' },
      { agent_id: 'agent-2', display_name: 'Marketing & Growth Strategy Architect' },
    ]);

    const options = await listTicketCreatorOptions();

    // Alphabetical by display_name: "Cory..." sorts before "Marketing...".
    expect(options).toEqual([
      { agent_name: 'cory-engine', display_name: 'Cory Engine — Autonomous Operations' },
      { agent_name: 'MarketingGrowthStrategyArchitect', display_name: 'Marketing & Growth Strategy Architect' },
    ]);
    expect(mockAiAgentFindAll).toHaveBeenCalledWith({ where: { reports_to_type: { [require('sequelize').Op.ne]: null } } });
  });

  it('boundary: an agent with NO linked AdminUser falls back to its raw agent_name as the display label, never omitted', async () => {
    mockAiAgentFindAll.mockResolvedValue([{ id: 'agent-9', agent_name: 'CurriculumArchitectAgent' }]);
    mockAdminUserFindAll.mockResolvedValue([]);

    const options = await listTicketCreatorOptions();

    expect(options).toEqual([{ agent_name: 'CurriculumArchitectAgent', display_name: 'CurriculumArchitectAgent' }]);
  });

  it('boundary: zero hierarchy agents returns an empty list, never throws, and skips the AdminUser lookup entirely', async () => {
    mockAiAgentFindAll.mockResolvedValue([]);

    const options = await listTicketCreatorOptions();

    expect(options).toEqual([]);
    expect(mockAdminUserFindAll).not.toHaveBeenCalled();
  });

  it('no-placeholder guard: a DB error from AiAgent.findAll propagates as a real rejection, never a fabricated empty list', async () => {
    mockAiAgentFindAll.mockRejectedValue(new Error('connection reset'));
    await expect(listTicketCreatorOptions()).rejects.toThrow('connection reset');
  });
});
