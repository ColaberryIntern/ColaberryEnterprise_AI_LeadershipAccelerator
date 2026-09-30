/**
 * Idempotency test for seedDaraIdentity() — per CLAUDE.md's mandatory
 * idempotency-validation test type, mirroring reeseIdentitySeed.test.ts's
 * exact shape, adapted for Dara's real differences: a direct human report
 * (reportsToOrgMemberId, not reportsToAgentName through another agent) and
 * no pilot-cohort gate (pilotCohortGate: false — no proactive/autonomous
 * outreach in this release).
 */
jest.mock('../../../models/AdminUser', () => ({ findOrCreate: jest.fn() }));
jest.mock('../../../models/Enrollment', () => ({ findOrCreate: jest.fn() }));
jest.mock('../../../models/CommunityMember', () => ({ findOrCreate: jest.fn() }));
jest.mock('../../../models/AiAgent', () => ({ findOne: jest.fn(), findByPk: jest.fn() }));
jest.mock('../../../models/Cohort', () => ({ findOne: jest.fn() }));

import AdminUser from '../../../models/AdminUser';
import Enrollment from '../../../models/Enrollment';
import CommunityMember from '../../../models/CommunityMember';
import AiAgent from '../../../models/AiAgent';
import Cohort from '../../../models/Cohort';
import { seedDaraIdentity, DARA_EMAIL, DARA_AGENT_NAME, DARA_REPORTS_TO_ORG_MEMBER_ID } from '../daraIdentitySeed';

const mockAiAgentFindOne = AiAgent.findOne as unknown as jest.Mock;
const mockAiAgentFindByPk = AiAgent.findByPk as unknown as jest.Mock;
const mockEnrollmentFindOrCreate = Enrollment.findOrCreate as unknown as jest.Mock;
const mockCommunityMemberFindOrCreate = CommunityMember.findOrCreate as unknown as jest.Mock;
const mockAdminUserFindOrCreate = AdminUser.findOrCreate as unknown as jest.Mock;
const mockCohortFindOne = Cohort.findOne as unknown as jest.Mock;

function makeFakeAgent(overrides: Record<string, any> = {}) {
  return {
    id: 'agent-dara-1',
    config: {},
    reports_to_type: 'human',
    reports_to_id: DARA_REPORTS_TO_ORG_MEMBER_ID,
    reports_to_org_member_id: DARA_REPORTS_TO_ORG_MEMBER_ID,
    tools_granted: ['flag_curriculum_content_gaps', 'flag_certification_readiness', 'scan_curriculum_integrity', 'monitor_curriculum_video_health'],
    record_kind: null,
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
let fakeAgent = makeFakeAgent();
const fakeEnrollment = { id: 'enrollment-dara-1' };
const fakeCommunityMember = { id: 'cm-dara-1' };
const fakeAdminUser = { id: 'admin-dara-1', agent_id: 'agent-dara-1', update: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  fakeAgent = makeFakeAgent();
  mockAiAgentFindOne.mockResolvedValue(fakeAgent);
  mockAiAgentFindByPk.mockImplementation(() => Promise.resolve(fakeAgent));
  mockEnrollmentFindOrCreate.mockResolvedValue([fakeEnrollment, true]);
  mockCommunityMemberFindOrCreate.mockResolvedValue([fakeCommunityMember, true]);
  mockAdminUserFindOrCreate.mockResolvedValue([fakeAdminUser, true]);
  mockCohortFindOne.mockResolvedValue(null);
});

describe('seedDaraIdentity', () => {
  it('happy path: creates all 3 rows, cross-linked to the AiAgent registry row', async () => {
    const ids = await seedDaraIdentity();

    expect(mockAiAgentFindOne).toHaveBeenCalledWith({ where: { agent_name: DARA_AGENT_NAME } });
    expect(mockEnrollmentFindOrCreate).toHaveBeenCalledWith(expect.objectContaining({ where: { email: DARA_EMAIL } }));
    expect(mockCommunityMemberFindOrCreate).toHaveBeenCalledWith(expect.objectContaining({ where: { enrollment_id: fakeEnrollment.id } }));
    expect(mockAdminUserFindOrCreate).toHaveBeenCalledWith(expect.objectContaining({ where: { email: DARA_EMAIL } }));
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

  it('idempotency: running twice calls findOrCreate exactly the same way both times, never a raw create/insert directly', async () => {
    await seedDaraIdentity();
    mockEnrollmentFindOrCreate.mockResolvedValue([fakeEnrollment, false]);
    mockCommunityMemberFindOrCreate.mockResolvedValue([fakeCommunityMember, false]);
    mockAdminUserFindOrCreate.mockResolvedValue([fakeAdminUser, false]);
    await seedDaraIdentity();

    expect(mockEnrollmentFindOrCreate).toHaveBeenCalledTimes(2);
    expect(mockCommunityMemberFindOrCreate).toHaveBeenCalledTimes(2);
    expect(mockAdminUserFindOrCreate).toHaveBeenCalledTimes(2);
    for (const call of mockEnrollmentFindOrCreate.mock.calls) {
      expect(call[0].where).toEqual({ email: DARA_EMAIL });
    }
  });

  it('failure path: throws a clear error if the Dara AiAgent registry row does not exist yet, rather than silently creating an orphaned identity', async () => {
    mockAiAgentFindOne.mockResolvedValue(null);
    await expect(seedDaraIdentity()).rejects.toThrow(/AiAgent registry row existed/);
    expect(mockEnrollmentFindOrCreate).not.toHaveBeenCalled();
  });

  it('no pilot-cohort gate requested: Cohort.findOne is never called (unlike Reese, Dara has no proactive/autonomous behavior to gate)', async () => {
    await seedDaraIdentity();
    expect(mockCohortFindOne).not.toHaveBeenCalled();
  });
});

describe("seedDaraIdentity — record_kind: 'employee' (consolidation-schema fields)", () => {
  it("happy path: stamps record_kind: 'employee' on first run, when it's currently null", async () => {
    fakeAgent = makeFakeAgent({ record_kind: null });
    mockAiAgentFindOne.mockResolvedValue(fakeAgent);
    mockAiAgentFindByPk.mockResolvedValue(fakeAgent);

    await seedDaraIdentity();

    expect(mockAiAgentFindByPk).toHaveBeenCalledWith('agent-dara-1');
    expect(fakeAgent.update).toHaveBeenCalledWith(expect.objectContaining({ record_kind: 'employee' }));
  });

  it('idempotency: never overwrites an already-set record_kind, even a real run\'s own prior stamp', async () => {
    fakeAgent = makeFakeAgent({ record_kind: 'employee' });
    mockAiAgentFindOne.mockResolvedValue(fakeAgent);
    mockAiAgentFindByPk.mockResolvedValue(fakeAgent);

    await seedDaraIdentity();

    expect(fakeAgent.update).not.toHaveBeenCalledWith(expect.objectContaining({ record_kind: expect.anything() }));
  });

  it("boundary: findByPk returns null (real row not found by id, an inconsistent-boot edge case) — no crash, no update attempted", async () => {
    mockAiAgentFindByPk.mockResolvedValue(null);

    await expect(seedDaraIdentity()).resolves.toBeDefined();
  });
});

describe('seedDaraIdentity — direct human report (AI Leadership case, not AI Staff-through-agent)', () => {
  it("populates reports_to_type='human'/reports_to_id on first run, using Swati's real org_members.id directly — no AiAgent lookup for a parent agent, unlike Reese's AI-Staff-through-agent case", async () => {
    fakeAgent = makeFakeAgent({ reports_to_type: null, reports_to_id: null, reports_to_org_member_id: null });
    mockAiAgentFindOne.mockResolvedValue(fakeAgent);

    await seedDaraIdentity();

    // Only ONE AiAgent.findOne call — Dara's own row. Reese's equivalent test
    // needs a second call to resolve reportsToAgentName's target; Dara's
    // reportsToOrgMemberId path needs no such resolution.
    expect(mockAiAgentFindOne).toHaveBeenCalledTimes(1);
    expect(fakeAgent.update).toHaveBeenCalledWith(
      expect.objectContaining({ reports_to_type: 'human', reports_to_id: DARA_REPORTS_TO_ORG_MEMBER_ID }),
    );
  });

  it('never overwrites an already-set reports_to_type/reports_to_id', async () => {
    // record_kind also pre-satisfied here — this test is specifically about
    // reports_to, not record_kind (which has its own dedicated describe
    // block above); a fully-already-seeded fixture keeps update() from
    // firing for a reason unrelated to what this test actually proves.
    fakeAgent = makeFakeAgent({ reports_to_type: 'human', reports_to_id: 'already-set-target-id', record_kind: 'employee' });
    mockAiAgentFindOne.mockResolvedValue(fakeAgent);
    mockAiAgentFindByPk.mockResolvedValue(fakeAgent);

    await seedDaraIdentity();

    expect(fakeAgent.update).not.toHaveBeenCalled();
    expect((fakeAgent as any).reports_to_type).toBe('human');
    expect((fakeAgent as any).reports_to_id).toBe('already-set-target-id');
  });
});
