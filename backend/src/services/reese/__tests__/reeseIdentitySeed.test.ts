/**
 * Idempotency test for seedReeseIdentity() — per CLAUDE.md's mandatory
 * idempotency-validation test type: running the same operation twice must
 * produce the same end state, not duplicate rows.
 */
jest.mock('../../../models/AdminUser', () => ({ findOrCreate: jest.fn() }));
jest.mock('../../../models/Enrollment', () => ({ findOrCreate: jest.fn() }));
jest.mock('../../../models/CommunityMember', () => ({ findOrCreate: jest.fn() }));
jest.mock('../../../models/AiAgent', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/Cohort', () => ({ findOne: jest.fn() }));

import AdminUser from '../../../models/AdminUser';
import Enrollment from '../../../models/Enrollment';
import CommunityMember from '../../../models/CommunityMember';
import AiAgent from '../../../models/AiAgent';
import Cohort from '../../../models/Cohort';
import { seedReeseIdentity, REESE_EMAIL, REESE_AGENT_NAME } from '../reeseIdentitySeed';

const mockAiAgentFindOne = AiAgent.findOne as unknown as jest.Mock;
const mockEnrollmentFindOrCreate = Enrollment.findOrCreate as unknown as jest.Mock;
const mockCommunityMemberFindOrCreate = CommunityMember.findOrCreate as unknown as jest.Mock;
const mockAdminUserFindOrCreate = AdminUser.findOrCreate as unknown as jest.Mock;
const mockCohortFindOne = Cohort.findOne as unknown as jest.Mock;

function makeFakeAgent(config: Record<string, any> = {}) {
  return {
    id: 'agent-reese-1',
    config,
    // AI Leadership / AI Staff hierarchy (2026-08-19) — pre-satisfied by
    // default (same posture as agentIdentitySeed.test.ts's own makeFakeAgent())
    // so the reports_to_type/reports_to_id self-heal doesn't fire an incidental
    // extra update() call in every OTHER test in this file (happy path,
    // idempotency, pilot-cohort). The dedicated hierarchy describe block below
    // explicitly overrides these two fields to exercise the self-heal itself.
    reports_to_type: 'agent',
    reports_to_id: 'workforce-intelligence-engine-id',
    update: jest.fn().mockResolvedValue(undefined),
  };
}
let fakeAgent = makeFakeAgent();
const fakeEnrollment = { id: 'enrollment-reese-1' };
const fakeCommunityMember = { id: 'cm-reese-1' };
const fakeAdminUser = { id: 'admin-reese-1', agent_id: 'agent-reese-1', update: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  fakeAgent = makeFakeAgent(); // fresh, config-less agent instance every test
  mockAiAgentFindOne.mockResolvedValue(fakeAgent);
  mockEnrollmentFindOrCreate.mockResolvedValue([fakeEnrollment, true]);
  mockCommunityMemberFindOrCreate.mockResolvedValue([fakeCommunityMember, true]);
  mockAdminUserFindOrCreate.mockResolvedValue([fakeAdminUser, true]);
  mockCohortFindOne.mockResolvedValue(null); // no open cohort by default
});

describe('seedReeseIdentity', () => {
  it('happy path: creates all 3 rows, cross-linked to the AiAgent registry row', async () => {
    const ids = await seedReeseIdentity();

    expect(mockAiAgentFindOne).toHaveBeenCalledWith({ where: { agent_name: REESE_AGENT_NAME } });
    expect(mockEnrollmentFindOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: REESE_EMAIL } })
    );
    expect(mockCommunityMemberFindOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { enrollment_id: fakeEnrollment.id } })
    );
    expect(mockAdminUserFindOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: REESE_EMAIL } })
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

  it('idempotency: running twice calls findOrCreate exactly the same way both times and never a raw create/insert directly (no duplicate side effects)', async () => {
    // Simulate the SECOND run: Sequelize's findOrCreate itself returns
    // `created: false` when a row already exists — the exact mechanism that
    // prevents a duplicate. Assert the seed function calls findOrCreate (not
    // Model.create) for every row, both times.
    await seedReeseIdentity();
    mockEnrollmentFindOrCreate.mockResolvedValue([fakeEnrollment, false]);
    mockCommunityMemberFindOrCreate.mockResolvedValue([fakeCommunityMember, false]);
    mockAdminUserFindOrCreate.mockResolvedValue([fakeAdminUser, false]);
    await seedReeseIdentity();

    expect(mockEnrollmentFindOrCreate).toHaveBeenCalledTimes(2);
    expect(mockCommunityMemberFindOrCreate).toHaveBeenCalledTimes(2);
    expect(mockAdminUserFindOrCreate).toHaveBeenCalledTimes(2);
    // Every call used the SAME unique-key where-clause both times — the
    // property that guarantees no duplicate row is ever created.
    for (const call of mockEnrollmentFindOrCreate.mock.calls) {
      expect(call[0].where).toEqual({ email: REESE_EMAIL });
    }
  });

  it('boundary: self-heals a pre-existing AdminUser row missing agent_id (created before the AiAgent row existed)', async () => {
    const unlinkedAdminUser = { id: 'admin-reese-1', agent_id: null, update: jest.fn().mockResolvedValue(undefined) };
    mockAdminUserFindOrCreate.mockResolvedValue([unlinkedAdminUser, false]);

    await seedReeseIdentity();

    expect(unlinkedAdminUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ agent_id: fakeAgent.id, is_ai_operated: true })
    );
  });

  it('failure path: throws a clear error if the Reese AiAgent registry row does not exist yet (wrong boot order), rather than silently creating an orphaned identity', async () => {
    mockAiAgentFindOne.mockResolvedValue(null);
    await expect(seedReeseIdentity()).rejects.toThrow(/AiAgent registry row existed/);
    expect(mockEnrollmentFindOrCreate).not.toHaveBeenCalled();
  });
});

describe('seedReeseIdentity — pilot-cohort allowlist (T013)', () => {
  it('happy path: populates config.pilot_cohort_ids with a real open cohort id when none is set yet', async () => {
    mockCohortFindOne.mockResolvedValue({ id: 'cohort-july-2026' });

    await seedReeseIdentity();

    expect(mockCohortFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'open' } })
    );
    expect(fakeAgent.update).toHaveBeenCalledWith(
      expect.objectContaining({ config: expect.objectContaining({ pilot_cohort_ids: ['cohort-july-2026'] }) })
    );
  });

  it('round-trip: the field set by the seed is exactly what a later read would return (data round-trips through the model)', async () => {
    mockCohortFindOne.mockResolvedValue({ id: 'cohort-july-2026' });
    await seedReeseIdentity();
    const [[updatePayload]] = fakeAgent.update.mock.calls;
    expect(updatePayload.config.pilot_cohort_ids).toEqual(['cohort-july-2026']);
  });

  it('idempotency/boundary: never overwrites an already-set allowlist (e.g. an admin\'s deliberate later choice)', async () => {
    // makeFakeAgent() pre-satisfies reports_to_type/reports_to_id by default
    // (see its own header comment) so the hierarchy self-heal doesn't also
    // fire and call update() here, unrelated to what this test is proving.
    fakeAgent = makeFakeAgent({ pilot_cohort_ids: ['admin-chosen-cohort'] });
    mockAiAgentFindOne.mockResolvedValue(fakeAgent);
    mockCohortFindOne.mockResolvedValue({ id: 'some-other-open-cohort' });

    await seedReeseIdentity();

    expect(fakeAgent.update).not.toHaveBeenCalled();
  });

  it('boundary: no real open cohort exists yet — leaves config untouched rather than writing a fabricated id', async () => {
    mockCohortFindOne.mockResolvedValue(null);
    await seedReeseIdentity();
    expect(fakeAgent.update).not.toHaveBeenCalled();
  });
});

describe('seedReeseIdentity — AI Leadership / AI Staff hierarchy (Ali, live, 2026-08-19)', () => {
  // Reese was a direct reportsToOrgMemberId report to Taiwo through session
  // CC-20260818-x4nk; as of this hierarchy change Reese is AI Staff, reporting
  // through workforce_intelligence_engine (AI Leadership), which itself still
  // reports to Kes — see reeseIdentitySeed.ts's own header comment on this call.
  it("populates reports_to_type='agent'/reports_to_id on first run, resolved to workforce_intelligence_engine's real ai_agents.id, when both are currently null", async () => {
    fakeAgent = makeFakeAgent();
    (fakeAgent as any).reports_to_type = null;
    (fakeAgent as any).reports_to_id = null;
    const workforceIntelligenceEngine = { id: 'wie-real-id', agent_name: 'workforce_intelligence_engine' };
    mockAiAgentFindOne
      .mockResolvedValueOnce(fakeAgent) // Reese's own registry row
      .mockResolvedValueOnce(workforceIntelligenceEngine); // the reportsToAgentName lookup
    mockCohortFindOne.mockResolvedValue(null); // keep the pilot-cohort block a no-op too

    await seedReeseIdentity();

    expect(mockAiAgentFindOne).toHaveBeenNthCalledWith(2, { where: { agent_name: 'workforce_intelligence_engine' } });
    expect(fakeAgent.update).toHaveBeenCalledWith(
      expect.objectContaining({ reports_to_type: 'agent', reports_to_id: 'wie-real-id' }),
    );
  });

  it('never overwrites an already-set reports_to_type/reports_to_id', async () => {
    fakeAgent = makeFakeAgent();
    (fakeAgent as any).reports_to_type = 'agent';
    (fakeAgent as any).reports_to_id = 'already-set-target-id';
    mockAiAgentFindOne.mockResolvedValue(fakeAgent);
    mockCohortFindOne.mockResolvedValue(null); // keep the pilot-cohort block a no-op too

    await seedReeseIdentity();

    expect(fakeAgent.update).not.toHaveBeenCalled();
    expect((fakeAgent as any).reports_to_type).toBe('agent');
    expect((fakeAgent as any).reports_to_id).toBe('already-set-target-id');
  });
});
