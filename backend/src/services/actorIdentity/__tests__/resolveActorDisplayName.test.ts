/**
 * Pins resolveActorDisplayName()'s dispatch across every real actor_type this
 * codebase uses (see resolveActorDisplayName.ts's header comment for the full
 * repository-grounding trail). The 'human'-is-ambiguous fallback chain
 * (AdminUser -> Enrollment) is the single most important case here: it's the exact
 * shape reeseReplyService.ts produces for a student's own DM message, which a naive
 * "actor_type === 'human' means AdminUser" resolver would get wrong.
 */
jest.mock('../../../models/AdminUser', () => ({ findByPk: jest.fn(), findOne: jest.fn() }));
jest.mock('../../../models/AiAgent', () => ({ findByPk: jest.fn(), findOne: jest.fn() }));
jest.mock('../../reese/resolveStudentDisplayName', () => ({
  resolveStudentDisplayName: jest.fn(),
}));
// Query-object builders only — no real DB connection. AiAgent.findOne is
// itself fully mocked above, so the exact where-clause shape these produce
// never reaches a real query; only that resolveViaAiAgentName() calls them
// (proving it attempts a normalized fallback, not a crash) matters here.
jest.mock('../../../config/database', () => ({
  sequelize: {
    fn: jest.fn((name: string, ...args: any[]) => ({ __fn: name, args })),
    col: jest.fn((name: string) => ({ __col: name })),
    where: jest.fn((left: any, right: any) => ({ __where: [left, right] })),
  },
}));

import AdminUser from '../../../models/AdminUser';
import AiAgent from '../../../models/AiAgent';
import { resolveStudentDisplayName } from '../../reese/resolveStudentDisplayName';
import { resolveActorDisplayName } from '../resolveActorDisplayName';

const mockAdminFindByPk = AdminUser.findByPk as unknown as jest.Mock;
const mockAdminFindOne = AdminUser.findOne as unknown as jest.Mock;
const mockAgentFindByPk = AiAgent.findByPk as unknown as jest.Mock;
const mockAgentFindOne = AiAgent.findOne as unknown as jest.Mock;
const mockResolveStudent = resolveStudentDisplayName as unknown as jest.Mock;

const REESE_ADMIN_ID = '82c2dfd2-369e-4545-8d2f-22d1ae3451ff';
const ENROLLMENT_ID = 'd6a4b017-6716-4673-96b5-ab3074b70191';
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveActorDisplayName', () => {
  it('ai_staff: resolves Reese\'s real AdminUser id to her display_name — the exact live defect Ali found', async () => {
    mockAdminFindByPk.mockResolvedValue({ display_name: 'Reese', email: 'reese@colaberry.com' });

    const name = await resolveActorDisplayName('ai_staff', REESE_ADMIN_ID);

    expect(name).toBe('Reese');
    expect(name).not.toMatch(UUID_PATTERN);
    expect(mockAdminFindByPk).toHaveBeenCalledWith(REESE_ADMIN_ID, { attributes: ['display_name', 'email'] });
  });

  it('ai_staff: falls back to email when display_name is empty, never the raw id', async () => {
    mockAdminFindByPk.mockResolvedValue({ display_name: null, email: 'reese@colaberry.com' });

    const name = await resolveActorDisplayName('ai_staff', REESE_ADMIN_ID);

    expect(name).toBe('reese@colaberry.com');
  });

  it('human: an admin-created ticket resolves via AdminUser, never calls resolveStudentDisplayName', async () => {
    mockAdminFindByPk.mockResolvedValue({ display_name: 'Ali Muwwakkil', email: 'ali@colaberry.com' });

    const name = await resolveActorDisplayName('human', REESE_ADMIN_ID);

    expect(name).toBe('Ali Muwwakkil');
    expect(mockResolveStudent).not.toHaveBeenCalled();
  });

  it('human: a student\'s own DM message (reeseReplyService.ts shape — actor_type human, actor_id is an Enrollment id) falls back to the student name', async () => {
    mockAdminFindByPk.mockResolvedValue(null); // misses AdminUser — this id is an Enrollment id, not an AdminUser id
    mockResolveStudent.mockResolvedValue('Jordan Rivera');

    const name = await resolveActorDisplayName('human', ENROLLMENT_ID);

    expect(name).toBe('Jordan Rivera');
    expect(mockAdminFindByPk).toHaveBeenCalledWith(ENROLLMENT_ID, { attributes: ['display_name', 'email'] });
    expect(mockResolveStudent).toHaveBeenCalledWith(ENROLLMENT_ID);
  });

  it('enrollment: resolves via the EXISTING resolveStudentDisplayName (reused, not reimplemented)', async () => {
    mockResolveStudent.mockResolvedValue('Jordan Rivera');

    const name = await resolveActorDisplayName('enrollment', ENROLLMENT_ID);

    expect(name).toBe('Jordan Rivera');
    expect(mockResolveStudent).toHaveBeenCalledWith(ENROLLMENT_ID);
    expect(mockAdminFindByPk).not.toHaveBeenCalled();
  });

  it('student: same dispatch as enrollment (synonym)', async () => {
    mockResolveStudent.mockResolvedValue('Kepha Ohanga');

    const name = await resolveActorDisplayName('student', ENROLLMENT_ID);

    expect(name).toBe('Kepha Ohanga');
  });

  it('agent: a REGISTERED agent_name with no linked AdminUser (the Architect-agent shape, e.g. ActionPlannerAgent) resolves via a real, verified lookup to the canonical agent_name — not an accidental zero-DB-call passthrough', async () => {
    mockAgentFindOne.mockResolvedValueOnce({ id: 'agent-1', agent_name: 'ActionPlannerAgent' });
    mockAdminFindOne.mockResolvedValueOnce(null); // no linked staff identity

    const name = await resolveActorDisplayName('agent', 'ActionPlannerAgent');

    expect(name).toBe('ActionPlannerAgent');
    expect(mockAgentFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { agent_name: 'ActionPlannerAgent' } })
    );
    expect(mockAdminFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { agent_id: 'agent-1' } })
    );
    expect(mockAdminFindByPk).not.toHaveBeenCalled();
    expect(mockResolveStudent).not.toHaveBeenCalled();
  });

  it('agent: a registered agent_name WITH a linked AdminUser (e.g. cory-engine) resolves to the AdminUser\'s real display_name, not the raw creator string', async () => {
    mockAgentFindOne.mockResolvedValueOnce({ id: 'agent-cory-engine', agent_name: 'cory-engine' });
    mockAdminFindOne.mockResolvedValueOnce({ display_name: 'Cory Engine — Autonomous Operations', email: 'cory-engine@colaberry.com' });

    const name = await resolveActorDisplayName('agent', 'cory-engine');

    expect(name).toBe('Cory Engine — Autonomous Operations');
  });

  it('agent: an UNREGISTERED agent_name falls back cleanly to the raw string, never a crash', async () => {
    mockAgentFindOne.mockResolvedValue(null); // both the exact and normalized-fallback lookups miss

    const name = await resolveActorDisplayName('agent', 'SomeUnregisteredFutureAgent');

    expect(name).toBe('SomeUnregisteredFutureAgent');
    expect(mockAgentFindOne).toHaveBeenCalledTimes(2);
    expect(mockAdminFindOne).not.toHaveBeenCalled();
  });

  it('cory: a registered agent_name WITH a linked AdminUser (e.g. bpos_orchestrator) resolves to the AdminUser\'s real display_name, not the raw creator string', async () => {
    mockAgentFindOne.mockResolvedValueOnce({ id: 'agent-bpos', agent_name: 'bpos_orchestrator' });
    mockAdminFindOne.mockResolvedValueOnce({ display_name: 'BPOS Orchestrator — Universal Ticket Layer', email: 'bposorchestrator@colaberry.com' });

    const name = await resolveActorDisplayName('cory', 'bpos_orchestrator');

    expect(name).toBe('BPOS Orchestrator — Universal Ticket Layer');
  });

  it('cory: a REGISTERED agent_name with no linked AdminUser (e.g. CoryStrategicAgent) resolves via a real, verified lookup to the canonical agent_name', async () => {
    mockAgentFindOne.mockResolvedValueOnce({ id: 'agent-csa', agent_name: 'CoryStrategicAgent' });
    mockAdminFindOne.mockResolvedValueOnce(null);

    const name = await resolveActorDisplayName('cory', 'CoryStrategicAgent');

    expect(name).toBe('CoryStrategicAgent');
  });

  it('agent: an UNREGISTERED agent_name (CoryAgenticEngine — confirmed absent from AGENT_REGISTRY) falls back cleanly to the raw string, never a crash', async () => {
    mockAgentFindOne.mockResolvedValue(null); // both the exact and normalized-fallback lookups miss

    const name = await resolveActorDisplayName('cory', 'CoryAgenticEngine');

    expect(name).toBe('CoryAgenticEngine');
    expect(mockAgentFindOne).toHaveBeenCalledTimes(2); // exact match, then normalized fallback
    expect(mockAdminFindOne).not.toHaveBeenCalled();
  });

  it('casing mismatch: cory_strategic_agent (the real ticket-creator string) and CoryStrategicAgent (the real registered agent_name) resolve to the SAME identity — one real identity, not two', async () => {
    // Exact match on the raw creator string misses (it's snake_case; the
    // real row is PascalCase) — the normalized fallback query is what finds it.
    mockAgentFindOne
      .mockResolvedValueOnce(null) // exact match miss
      .mockResolvedValueOnce({ id: 'agent-csa', agent_name: 'CoryStrategicAgent' }); // normalized fallback hit
    mockAdminFindOne.mockResolvedValueOnce(null); // no linked staff identity for this Architect-style agent

    const viaSnakeCase = await resolveActorDisplayName('cory', 'cory_strategic_agent');

    // A direct call with the canonical PascalCase name hits on the exact match.
    mockAgentFindOne.mockResolvedValueOnce({ id: 'agent-csa', agent_name: 'CoryStrategicAgent' });
    mockAdminFindOne.mockResolvedValueOnce(null);
    const viaPascalCase = await resolveActorDisplayName('cory', 'CoryStrategicAgent');

    expect(viaSnakeCase).toBe('CoryStrategicAgent');
    expect(viaPascalCase).toBe('CoryStrategicAgent');
    expect(viaSnakeCase).toBe(viaPascalCase);
  });

  it('boundary: a DB error on the new AiAgent-by-name lookup is swallowed, not thrown — falls back to the raw string', async () => {
    mockAgentFindOne.mockRejectedValue(new Error('connection reset'));

    const name = await resolveActorDisplayName('agent', 'SomeAgentName');

    expect(name).toBe('SomeAgentName');
  });

  it('agent: a UUID-shaped actor_id still resolves via the existing AiAgent.findByPk path (unchanged), never the new by-name lookup', async () => {
    mockAgentFindByPk.mockResolvedValue({ agent_name: 'CurriculumArchitectAgent' });

    const name = await resolveActorDisplayName('agent', REESE_ADMIN_ID);

    expect(name).toBe('CurriculumArchitectAgent');
    expect(mockAgentFindOne).not.toHaveBeenCalled();
  });

  it('boundary: an unresolvable ai_staff id (AdminUser row missing) fails closed to an honest, short, non-UUID label — never a crash', async () => {
    mockAdminFindByPk.mockResolvedValue(null);

    const name = await resolveActorDisplayName('ai_staff', REESE_ADMIN_ID);

    expect(name).toBe('Ai Staff');
    expect(name).not.toMatch(UUID_PATTERN);
  });

  it('boundary: a DB error on the AdminUser lookup is swallowed, not thrown — resolver still returns an honest label', async () => {
    mockAdminFindByPk.mockRejectedValue(new Error('connection reset'));

    await expect(resolveActorDisplayName('ai_staff', REESE_ADMIN_ID)).resolves.toBe('Ai Staff');
  });

  it('boundary: a DB error on the delegated student lookup is swallowed too (human -> enrollment fallback path)', async () => {
    mockAdminFindByPk.mockResolvedValue(null);
    mockResolveStudent.mockRejectedValue(new Error('connection reset'));

    await expect(resolveActorDisplayName('human', ENROLLMENT_ID)).resolves.toBe('Human');
  });

  it('boundary: unknown/unmapped actor_type still fails closed to its own humanized label, never a crash', async () => {
    const name = await resolveActorDisplayName('robot_overlord', REESE_ADMIN_ID);

    expect(name).toBe('Robot Overlord');
    expect(name).not.toMatch(UUID_PATTERN);
  });

  it('boundary: empty actor_id returns a humanized actor_type label without any DB call', async () => {
    const name = await resolveActorDisplayName('ai_staff', '');

    expect(name).toBe('Ai Staff');
    expect(mockAdminFindByPk).not.toHaveBeenCalled();
  });

  it('boundary: falsy actor_type AND empty actor_id fails closed to "System"', async () => {
    const name = await resolveActorDisplayName('', '');

    expect(name).toBe('System');
  });
});
