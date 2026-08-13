/**
 * Pins resolveActorDisplayName()'s dispatch across every real actor_type this
 * codebase uses (see resolveActorDisplayName.ts's header comment for the full
 * repository-grounding trail). The 'human'-is-ambiguous fallback chain
 * (AdminUser -> Enrollment) is the single most important case here: it's the exact
 * shape reeseReplyService.ts produces for a student's own DM message, which a naive
 * "actor_type === 'human' means AdminUser" resolver would get wrong.
 */
jest.mock('../../../models/AdminUser', () => ({ findByPk: jest.fn() }));
jest.mock('../../../models/AiAgent', () => ({ findByPk: jest.fn() }));
jest.mock('../../reese/resolveStudentDisplayName', () => ({
  resolveStudentDisplayName: jest.fn(),
}));

import AdminUser from '../../../models/AdminUser';
import AiAgent from '../../../models/AiAgent';
import { resolveStudentDisplayName } from '../../reese/resolveStudentDisplayName';
import { resolveActorDisplayName } from '../resolveActorDisplayName';

const mockAdminFindByPk = AdminUser.findByPk as unknown as jest.Mock;
const mockAgentFindByPk = AiAgent.findByPk as unknown as jest.Mock;
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

  it('agent: an already-readable non-UUID actor_id is returned unchanged with ZERO DB calls', async () => {
    const name = await resolveActorDisplayName('agent', 'ActionPlannerAgent');

    expect(name).toBe('ActionPlannerAgent');
    expect(mockAdminFindByPk).not.toHaveBeenCalled();
    expect(mockAgentFindByPk).not.toHaveBeenCalled();
    expect(mockResolveStudent).not.toHaveBeenCalled();
  });

  it('cory: an already-readable non-UUID actor_id (a real subsystem name) is returned unchanged', async () => {
    const name = await resolveActorDisplayName('cory', 'bpos_orchestrator');

    expect(name).toBe('bpos_orchestrator');
    expect(mockAgentFindByPk).not.toHaveBeenCalled();
  });

  it('agent: a UUID-shaped actor_id resolves via AiAgent.agent_name when present', async () => {
    mockAgentFindByPk.mockResolvedValue({ agent_name: 'CurriculumArchitectAgent' });

    const name = await resolveActorDisplayName('agent', REESE_ADMIN_ID);

    expect(name).toBe('CurriculumArchitectAgent');
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
