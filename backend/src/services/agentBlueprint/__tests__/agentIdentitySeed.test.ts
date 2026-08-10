/**
 * Generic agent-identity-seed tests. Reese's own reeseIdentitySeed.test.ts still
 * covers the Reese-wrapper's exact behavior unchanged; this file proves the
 * EXTRACTED generic core works for an arbitrary agent config, not just Reese's, plus
 * the new previewAgentIdentity() dry-run mode (structurally zero-write).
 */
jest.mock('../../../models/AdminUser', () => ({ findOrCreate: jest.fn(), findOne: jest.fn() }));
jest.mock('../../../models/Enrollment', () => ({ findOrCreate: jest.fn(), findOne: jest.fn() }));
jest.mock('../../../models/CommunityMember', () => ({ findOrCreate: jest.fn(), findOne: jest.fn() }));
jest.mock('../../../models/AiAgent', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/Cohort', () => ({ findOne: jest.fn() }));

import AdminUser from '../../../models/AdminUser';
import Enrollment from '../../../models/Enrollment';
import CommunityMember from '../../../models/CommunityMember';
import AiAgent from '../../../models/AiAgent';
import Cohort from '../../../models/Cohort';
import {
  seedAgentIdentity,
  previewAgentIdentity,
  getAgentEnrollmentId,
  getAgentAdminUserId,
  __resetAgentIdentityCacheForTests,
  type AgentIdentityConfig,
} from '../agentIdentitySeed';

const mockAiAgentFindOne = AiAgent.findOne as unknown as jest.Mock;
const mockEnrollmentFindOrCreate = Enrollment.findOrCreate as unknown as jest.Mock;
const mockEnrollmentFindOne = Enrollment.findOne as unknown as jest.Mock;
const mockCommunityMemberFindOrCreate = CommunityMember.findOrCreate as unknown as jest.Mock;
const mockCommunityMemberFindOne = CommunityMember.findOne as unknown as jest.Mock;
const mockAdminUserFindOrCreate = AdminUser.findOrCreate as unknown as jest.Mock;
const mockAdminUserFindOne = AdminUser.findOne as unknown as jest.Mock;
const mockCohortFindOne = Cohort.findOne as unknown as jest.Mock;

const CONFIG: AgentIdentityConfig = {
  agentName: 'CurriculumQA',
  email: 'curriculumqa@colaberry.com',
  displayName: 'CurriculumQA',
  role: 'ai_staff',
  communityRole: 'staff',
  enrollmentDefaults: {
    company: 'Colaberry',
    payment_status: 'paid',
    payment_method: 'invoice',
    payment_mode: 'live',
    enrollment_type: 'standard',
    portal_enabled: false,
  },
};

function makeFakeAgent(config: Record<string, any> = {}) {
  return { id: 'agent-cqa-1', config, update: jest.fn().mockResolvedValue(undefined) };
}
let fakeAgent = makeFakeAgent();
const fakeEnrollment = { id: 'enrollment-cqa-1' };
const fakeCommunityMember = { id: 'cm-cqa-1' };
const fakeAdminUser = { id: 'admin-cqa-1', agent_id: 'agent-cqa-1', update: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  __resetAgentIdentityCacheForTests(CONFIG.email);
  fakeAgent = makeFakeAgent();
  mockAiAgentFindOne.mockResolvedValue(fakeAgent);
  mockEnrollmentFindOrCreate.mockResolvedValue([fakeEnrollment, true]);
  mockEnrollmentFindOne.mockResolvedValue(null);
  mockCommunityMemberFindOrCreate.mockResolvedValue([fakeCommunityMember, true]);
  mockCommunityMemberFindOne.mockResolvedValue(null);
  mockAdminUserFindOrCreate.mockResolvedValue([fakeAdminUser, true]);
  mockAdminUserFindOne.mockResolvedValue(null);
  mockCohortFindOne.mockResolvedValue(null);
});

describe('seedAgentIdentity', () => {
  it('happy path: creates all 3 rows for an arbitrary agent config, cross-linked to its AiAgent registry row', async () => {
    const ids = await seedAgentIdentity(CONFIG);

    expect(mockAiAgentFindOne).toHaveBeenCalledWith({ where: { agent_name: 'CurriculumQA' } });
    expect(mockEnrollmentFindOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: CONFIG.email } })
    );
    const enrollmentDefaults = mockEnrollmentFindOrCreate.mock.calls[0][0].defaults;
    expect(enrollmentDefaults.company).toBe('Colaberry');
    expect(mockCommunityMemberFindOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { enrollment_id: fakeEnrollment.id } })
    );
    const communityDefaults = mockCommunityMemberFindOrCreate.mock.calls[0][0].defaults;
    expect(communityDefaults.role).toBe('staff');
    expect(mockAdminUserFindOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: CONFIG.email } })
    );
    const adminUserDefaults = mockAdminUserFindOrCreate.mock.calls[0][0].defaults;
    expect(adminUserDefaults.agent_id).toBe(fakeAgent.id);
    expect(adminUserDefaults.is_ai_operated).toBe(true);

    expect(ids).toEqual({
      adminUserId: fakeAdminUser.id,
      enrollmentId: fakeEnrollment.id,
      communityMemberId: fakeCommunityMember.id,
      aiAgentId: fakeAgent.id,
    });
  });

  it('idempotency: running twice calls findOrCreate the same way both times, never a raw create/insert', async () => {
    await seedAgentIdentity(CONFIG);
    mockEnrollmentFindOrCreate.mockResolvedValue([fakeEnrollment, false]);
    mockCommunityMemberFindOrCreate.mockResolvedValue([fakeCommunityMember, false]);
    mockAdminUserFindOrCreate.mockResolvedValue([fakeAdminUser, false]);
    await seedAgentIdentity(CONFIG);

    expect(mockEnrollmentFindOrCreate).toHaveBeenCalledTimes(2);
    expect(mockCommunityMemberFindOrCreate).toHaveBeenCalledTimes(2);
    expect(mockAdminUserFindOrCreate).toHaveBeenCalledTimes(2);
    for (const call of mockEnrollmentFindOrCreate.mock.calls) {
      expect(call[0].where).toEqual({ email: CONFIG.email });
    }
  });

  it('boundary: self-heals a pre-existing AdminUser row missing agent_id', async () => {
    const unlinkedAdminUser = { id: 'admin-cqa-1', agent_id: null, update: jest.fn().mockResolvedValue(undefined) };
    mockAdminUserFindOrCreate.mockResolvedValue([unlinkedAdminUser, false]);

    await seedAgentIdentity(CONFIG);

    expect(unlinkedAdminUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ agent_id: fakeAgent.id, is_ai_operated: true })
    );
  });

  it('failure path: throws a clear error if the agent\'s AiAgent registry row does not exist yet', async () => {
    mockAiAgentFindOne.mockResolvedValue(null);
    await expect(seedAgentIdentity(CONFIG)).rejects.toThrow(/AiAgent registry row existed/);
    expect(mockEnrollmentFindOrCreate).not.toHaveBeenCalled();
  });

  it('pilot-cohort gate is opt-in: omitted entirely when pilotCohortGate is not set', async () => {
    await seedAgentIdentity(CONFIG);
    expect(mockCohortFindOne).not.toHaveBeenCalled();
    expect(fakeAgent.update).not.toHaveBeenCalled();
  });

  it('pilot-cohort gate: populates config.pilot_cohort_ids when opted in and none is set yet', async () => {
    mockCohortFindOne.mockResolvedValue({ id: 'cohort-1' });
    await seedAgentIdentity({ ...CONFIG, pilotCohortGate: true });
    expect(fakeAgent.update).toHaveBeenCalledWith(
      expect.objectContaining({ config: expect.objectContaining({ pilot_cohort_ids: ['cohort-1'] }) })
    );
  });
});

describe('getAgentEnrollmentId / getAgentAdminUserId — per-email cache', () => {
  it('caches per email, not globally: two different agents get independent lookups', async () => {
    mockEnrollmentFindOne.mockResolvedValueOnce({ id: 'enr-a' }).mockResolvedValueOnce({ id: 'enr-b' });

    const a = await getAgentEnrollmentId('agent-a@colaberry.com');
    const b = await getAgentEnrollmentId('agent-b@colaberry.com');

    expect(a).toBe('enr-a');
    expect(b).toBe('enr-b');
    expect(mockEnrollmentFindOne).toHaveBeenCalledTimes(2);

    // Second call for agent-a reuses the cache, no third DB call.
    const aAgain = await getAgentEnrollmentId('agent-a@colaberry.com');
    expect(aAgain).toBe('enr-a');
    expect(mockEnrollmentFindOne).toHaveBeenCalledTimes(2);
  });

  it('__resetAgentIdentityCacheForTests clears only the named email', async () => {
    __resetAgentIdentityCacheForTests('agent-a@colaberry.com'); // isolate from the prior test's cache entry
    mockEnrollmentFindOne.mockResolvedValue({ id: 'enr-a' });
    await getAgentEnrollmentId('agent-a@colaberry.com');
    expect(mockEnrollmentFindOne).toHaveBeenCalledTimes(1);

    __resetAgentIdentityCacheForTests('agent-a@colaberry.com');
    await getAgentEnrollmentId('agent-a@colaberry.com');
    expect(mockEnrollmentFindOne).toHaveBeenCalledTimes(2);
  });
});

describe('previewAgentIdentity — structurally zero-write dry-run', () => {
  it('happy path: reports would-create for every row when nothing exists yet', async () => {
    const preview = await previewAgentIdentity(CONFIG);

    expect(preview.aiAgent.exists).toBe(true); // AiAgent registry row itself pre-exists per boot order
    expect(preview.enrollment).toEqual({ wouldCreate: true, id: null });
    expect(preview.communityMember).toEqual({ wouldCreate: true, id: null });
    expect(preview.adminUser.wouldCreate).toBe(true);
  });

  it('zero real writes: none of the write-capable mocks are ever invoked by preview', async () => {
    await previewAgentIdentity({ ...CONFIG, pilotCohortGate: true });

    expect(mockEnrollmentFindOrCreate).not.toHaveBeenCalled();
    expect(mockCommunityMemberFindOrCreate).not.toHaveBeenCalled();
    expect(mockAdminUserFindOrCreate).not.toHaveBeenCalled();
    expect(fakeAgent.update).not.toHaveBeenCalled();
  });

  it('boundary: an already-existing identity reports wouldCreate:false with the real ids, and no self-heal write happens even when unlinked', async () => {
    mockEnrollmentFindOne.mockResolvedValue(fakeEnrollment);
    mockCommunityMemberFindOne.mockResolvedValue(fakeCommunityMember);
    mockAdminUserFindOne.mockResolvedValue({ id: fakeAdminUser.id, agent_id: null });

    const preview = await previewAgentIdentity(CONFIG);

    expect(preview.enrollment).toEqual({ wouldCreate: false, id: fakeEnrollment.id });
    expect(preview.communityMember).toEqual({ wouldCreate: false, id: fakeCommunityMember.id });
    expect(preview.adminUser).toEqual({ wouldCreate: false, id: fakeAdminUser.id, wouldLinkAgentId: true });
  });

  it('boundary: missing AiAgent registry row does not throw — preview reports exists:false instead', async () => {
    mockAiAgentFindOne.mockResolvedValue(null);
    const preview = await previewAgentIdentity(CONFIG);
    expect(preview.aiAgent).toEqual({ exists: false, id: null });
  });

  it('pilot-cohort gate preview: reports wouldPopulate honestly based on real open-cohort data, never writes', async () => {
    mockCohortFindOne.mockResolvedValue({ id: 'cohort-preview-1' });
    const preview = await previewAgentIdentity({ ...CONFIG, pilotCohortGate: true });

    expect(preview.pilotCohortGate).toEqual({
      requested: true,
      wouldPopulate: true,
      existingCohortIds: [],
    });
    expect(fakeAgent.update).not.toHaveBeenCalled();
  });
});
