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
  getAgentId,
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
  // Agent Ticket Standard — required as of 2026-08-18; this constant not compiling
  // without it IS the structural-enforcement proof (see
  // ticketCreatorReportsToResolver's sibling task, T004's acceptance criteria).
  reportsToOrgMemberId: 'org-member-fixture-id',
};

// AI Leadership / AI Staff hierarchy (2026-08-19) — CONFIG minus both reports-to
// fields, for the exactly-one-of validation tests below. Built as a real object
// literal (not CONFIG-minus-destructure) so no unused-var lint noise from
// stripping reportsToOrgMemberId off CONFIG.
const CONFIG_WITHOUT_REPORTS_TO: Omit<AgentIdentityConfig, 'reportsToOrgMemberId' | 'reportsToAgentName'> = {
  agentName: CONFIG.agentName,
  email: CONFIG.email,
  displayName: CONFIG.displayName,
  role: CONFIG.role,
  communityRole: CONFIG.communityRole,
  enrollmentDefaults: CONFIG.enrollmentDefaults,
};

function makeFakeAgent(config: Record<string, any> = {}) {
  return {
    id: 'agent-cqa-1',
    config,
    // Agent Ticket Standard's self-heal only writes when this is currently null
    // (see CONFIG's own reportsToOrgMemberId + the dedicated describe block below).
    // Pre-set here to CONFIG's own value so every OTHER test in this file (pilot-
    // cohort, legacy-creator-ids, happy path, idempotency) exercises a fresh agent
    // that already satisfies the new requirement and never triggers an update()
    // call incidental to what that test is actually proving. Tests that need to
    // exercise the reports_to self-heal itself explicitly override this field.
    reports_to_org_member_id: CONFIG.reportsToOrgMemberId,
    // AI Leadership / AI Staff hierarchy (2026-08-19) — same "pre-satisfied by
    // default" fixture posture as reports_to_org_member_id above, so the new
    // self-heal block below doesn't fire an incidental extra update() call in
    // every other test in this file. Tests exercising the hierarchy self-heal
    // itself explicitly override these two fields.
    reports_to_type: 'human',
    reports_to_id: CONFIG.reportsToOrgMemberId,
    // Registration-time hardening (2026-08-19) — pre-satisfied by default, same
    // posture as the reports_to fields above, so the new tools_granted gate
    // doesn't throw incidentally in every other test in this file. Tests
    // exercising the gate itself explicitly override this field.
    tools_granted: ['seed_fixture_tool'],
    update: jest.fn().mockResolvedValue(undefined),
  };
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

  it('legacy-creator-ids is opt-in: omitted entirely when legacyCreatorIds is not set', async () => {
    await seedAgentIdentity(CONFIG);
    expect(fakeAgent.update).not.toHaveBeenCalled();
  });

  it('legacy-creator-ids: first run populates config.legacy_creator_ids on an agent with no prior config', async () => {
    await seedAgentIdentity({ ...CONFIG, legacyCreatorIds: ['CurriculumQA'] });
    expect(fakeAgent.update).toHaveBeenCalledWith(
      expect.objectContaining({ config: expect.objectContaining({ legacy_creator_ids: ['CurriculumQA'] }) })
    );
  });

  it('legacy-creator-ids: idempotent — running twice with the same alias never calls update the second time', async () => {
    fakeAgent = makeFakeAgent({ legacy_creator_ids: ['CurriculumQA'] });
    mockAiAgentFindOne.mockResolvedValue(fakeAgent);

    await seedAgentIdentity({ ...CONFIG, legacyCreatorIds: ['CurriculumQA'] });

    expect(fakeAgent.update).not.toHaveBeenCalled();
  });

  it('legacy-creator-ids: self-heal never removes a manually-added alias already on the row', async () => {
    fakeAgent = makeFakeAgent({ legacy_creator_ids: ['CurriculumQA', 'HandAddedAlias'] });
    mockAiAgentFindOne.mockResolvedValue(fakeAgent);

    await seedAgentIdentity({ ...CONFIG, legacyCreatorIds: ['CurriculumQA'] });

    // The config's own list is a subset of what's already on the row — nothing new to
    // merge, so no write happens and the hand-added alias is never touched.
    expect(fakeAgent.update).not.toHaveBeenCalled();
  });

  it('legacy-creator-ids: merges a new alias onto an existing list without dropping the old one', async () => {
    fakeAgent = makeFakeAgent({ legacy_creator_ids: ['OldAlias'] });
    mockAiAgentFindOne.mockResolvedValue(fakeAgent);

    await seedAgentIdentity({ ...CONFIG, legacyCreatorIds: ['NewAlias'] });

    expect(fakeAgent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ legacy_creator_ids: expect.arrayContaining(['OldAlias', 'NewAlias']) }),
      })
    );
    const call = fakeAgent.update.mock.calls[0][0];
    expect(call.config.legacy_creator_ids).toHaveLength(2);
  });

  // Agent Ticket Standard (2026-08-18) — same self-heal-only-when-null shape as
  // the legacy-creator-ids block above.
  it('reports_to_org_member_id: populates it on an existing row where it is currently null', async () => {
    fakeAgent = makeFakeAgent();
    (fakeAgent as any).reports_to_org_member_id = null;
    mockAiAgentFindOne.mockResolvedValue(fakeAgent);

    await seedAgentIdentity(CONFIG);

    expect(fakeAgent.update).toHaveBeenCalledWith(
      expect.objectContaining({ reports_to_org_member_id: CONFIG.reportsToOrgMemberId }),
    );
  });

  it('reports_to_org_member_id: never overwrites an already-set value, even a different one (self-heal only when null — matches the enabled-flag precedent)', async () => {
    fakeAgent = makeFakeAgent();
    (fakeAgent as any).reports_to_org_member_id = 'already-set-org-member-id';
    mockAiAgentFindOne.mockResolvedValue(fakeAgent);

    await seedAgentIdentity({ ...CONFIG, reportsToOrgMemberId: 'a-different-id' });

    // Nothing else in CONFIG (no legacyCreatorIds/pilotCohortGate) should trigger a
    // write either, so the strongest, clearest assertion is that update() is never
    // called at all — proving the value on the row was left completely untouched.
    expect(fakeAgent.update).not.toHaveBeenCalled();
    expect((fakeAgent as any).reports_to_org_member_id).toBe('already-set-org-member-id');
  });

  // AI Leadership / AI Staff hierarchy (Ali, live, 2026-08-19) — structural
  // enforcement (exactly one of reportsToOrgMemberId/reportsToAgentName) plus
  // the reports_to_type/reports_to_id self-heal that supersedes the flat field
  // above as the resolver's actual source of truth.
  it('throws if both reportsToOrgMemberId and reportsToAgentName are provided', async () => {
    await expect(
      seedAgentIdentity({ ...CONFIG, reportsToOrgMemberId: 'org-1', reportsToAgentName: 'CoryBrain' }),
    ).rejects.toThrow(/exactly one of reportsToOrgMemberId or reportsToAgentName/);
    expect(mockAiAgentFindOne).not.toHaveBeenCalled();
  });

  it('throws if neither reportsToOrgMemberId nor reportsToAgentName is provided', async () => {
    await expect(seedAgentIdentity(CONFIG_WITHOUT_REPORTS_TO)).rejects.toThrow(
      /exactly one of reportsToOrgMemberId or reportsToAgentName/,
    );
    expect(mockAiAgentFindOne).not.toHaveBeenCalled();
  });

  // Registration-time hardening (Ali, live, 2026-08-19 — "harden the agent
  // building process"): the Agent Ticket Standard's display-identity (Step 2)
  // and tools_granted (Step 4) checks are now enforced as real throws at
  // registration time, not just reported after the fact by
  // validateAgentTicketStandard.ts.
  describe('registration-time hardening: display identity + tools_granted', () => {
    it('throws before any AiAgent lookup if displayName is a known generic/collapsed fallback label', async () => {
      await expect(
        seedAgentIdentity({ ...CONFIG, displayName: 'Cory' }),
      ).rejects.toThrow(/generic\/collapsed fallback label/);
      expect(mockAiAgentFindOne).not.toHaveBeenCalled();
    });

    it('throws if displayName is empty/whitespace-only (also a generic-fallback case)', async () => {
      await expect(seedAgentIdentity({ ...CONFIG, displayName: '   ' })).rejects.toThrow(
        /generic\/collapsed fallback label/,
      );
    });

    it('happy path: a real, distinguishing displayName passes straight through to the AiAgent lookup', async () => {
      await seedAgentIdentity(CONFIG);
      expect(mockAiAgentFindOne).toHaveBeenCalledWith({ where: { agent_name: CONFIG.agentName } });
    });

    it('throws if the AiAgent row has no tools_granted declared (undefined)', async () => {
      fakeAgent = makeFakeAgent();
      (fakeAgent as any).tools_granted = undefined;
      mockAiAgentFindOne.mockResolvedValue(fakeAgent);

      await expect(seedAgentIdentity(CONFIG)).rejects.toThrow(/tools_granted is missing or empty/);
      // Fails before any writes — no Enrollment/CommunityMember/AdminUser row touched.
      expect(mockEnrollmentFindOrCreate).not.toHaveBeenCalled();
    });

    it('throws if the AiAgent row has an empty tools_granted array', async () => {
      fakeAgent = makeFakeAgent();
      (fakeAgent as any).tools_granted = [];
      mockAiAgentFindOne.mockResolvedValue(fakeAgent);

      await expect(seedAgentIdentity(CONFIG)).rejects.toThrow(/tools_granted is missing or empty/);
    });

    it('happy path: a non-empty tools_granted array passes', async () => {
      fakeAgent = makeFakeAgent();
      (fakeAgent as any).tools_granted = ['create_tickets', 'query_agent_fleet_stats'];
      mockAiAgentFindOne.mockResolvedValue(fakeAgent);

      await expect(seedAgentIdentity(CONFIG)).resolves.toBeDefined();
    });
  });

  it('reports_to_type/reports_to_id (AI Leadership): populates the human target directly on a row where both are currently null, no extra AiAgent lookup', async () => {
    fakeAgent = makeFakeAgent();
    (fakeAgent as any).reports_to_type = null;
    (fakeAgent as any).reports_to_id = null;
    mockAiAgentFindOne.mockResolvedValue(fakeAgent);

    await seedAgentIdentity(CONFIG);

    expect(fakeAgent.update).toHaveBeenCalledWith(
      expect.objectContaining({ reports_to_type: 'human', reports_to_id: CONFIG.reportsToOrgMemberId }),
    );
    // Only the agent's own registry lookup — the human path needs no target lookup.
    expect(mockAiAgentFindOne).toHaveBeenCalledTimes(1);
  });

  it("reports_to_type/reports_to_id (AI Staff): resolves reportsToAgentName to the target's real ai_agents.id", async () => {
    fakeAgent = makeFakeAgent();
    (fakeAgent as any).reports_to_type = null;
    (fakeAgent as any).reports_to_id = null;
    const targetLeadershipAgent = { id: 'corybrain-real-id', agent_name: 'CoryBrain' };
    mockAiAgentFindOne
      .mockResolvedValueOnce(fakeAgent) // this agent's own registry row
      .mockResolvedValueOnce(targetLeadershipAgent); // the reportsToAgentName lookup

    await seedAgentIdentity({ ...CONFIG_WITHOUT_REPORTS_TO, reportsToAgentName: 'CoryBrain' });

    expect(mockAiAgentFindOne).toHaveBeenNthCalledWith(2, { where: { agent_name: 'CoryBrain' } });
    expect(fakeAgent.update).toHaveBeenCalledWith(
      expect.objectContaining({ reports_to_type: 'agent', reports_to_id: 'corybrain-real-id' }),
    );
  });

  it('reports_to_type/reports_to_id (AI Staff): throws loudly if reportsToAgentName does not resolve to a registered agent, and never writes', async () => {
    fakeAgent = makeFakeAgent();
    (fakeAgent as any).reports_to_type = null;
    (fakeAgent as any).reports_to_id = null;
    mockAiAgentFindOne
      .mockResolvedValueOnce(fakeAgent)
      .mockResolvedValueOnce(null); // reportsToAgentName target not found

    await expect(
      seedAgentIdentity({ ...CONFIG_WITHOUT_REPORTS_TO, reportsToAgentName: 'UnregisteredLeadershipAgent' }),
    ).rejects.toThrow(/does not resolve to a registered AiAgent/);
    expect(fakeAgent.update).not.toHaveBeenCalled();
  });

  it('reports_to_type/reports_to_id: never overwrites already-set values, even when config would resolve to something different (self-heal only when null)', async () => {
    fakeAgent = makeFakeAgent();
    (fakeAgent as any).reports_to_type = 'agent';
    (fakeAgent as any).reports_to_id = 'already-set-target-id';
    mockAiAgentFindOne.mockResolvedValue(fakeAgent);

    await seedAgentIdentity(CONFIG);

    expect(fakeAgent.update).not.toHaveBeenCalled();
    expect((fakeAgent as any).reports_to_type).toBe('agent');
    expect((fakeAgent as any).reports_to_id).toBe('already-set-target-id');
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

// Cost-tracking fix (2026-08-27) — Ali, live: "isn't [cost] part of it?"
// Resolves the real AiAgent.id via AdminUser.agent_id so a caller can tag its
// real LLM calls with a real agent_id (see reeseReplyService.ts /
// reeseOutreachMessageService.ts, the two real callers this exists for).
describe('getAgentId — per-email cache', () => {
  it('resolves the real AiAgent.id via the AdminUser.agent_id FK, and caches it', async () => {
    __resetAgentIdentityCacheForTests('agent-c@colaberry.com');
    mockAdminUserFindOne.mockResolvedValueOnce({ id: 'admin-c', agent_id: 'aiagent-c' });

    const id = await getAgentId('agent-c@colaberry.com');
    expect(id).toBe('aiagent-c');
    expect(mockAdminUserFindOne).toHaveBeenCalledTimes(1);

    // Second call reuses the cache, no second DB call.
    const again = await getAgentId('agent-c@colaberry.com');
    expect(again).toBe('aiagent-c');
    expect(mockAdminUserFindOne).toHaveBeenCalledTimes(1);
  });

  it('honesty boundary: null when no AdminUser is linked yet, never a guessed id', async () => {
    __resetAgentIdentityCacheForTests('agent-d@colaberry.com');
    mockAdminUserFindOne.mockResolvedValueOnce(null);

    const id = await getAgentId('agent-d@colaberry.com');

    expect(id).toBeNull();
  });

  it('__resetAgentIdentityCacheForTests clears this cache too, not just enrollment/admin', async () => {
    __resetAgentIdentityCacheForTests('agent-e@colaberry.com');
    mockAdminUserFindOne.mockResolvedValue({ id: 'admin-e', agent_id: 'aiagent-e' });
    await getAgentId('agent-e@colaberry.com');
    expect(mockAdminUserFindOne).toHaveBeenCalledTimes(1);

    __resetAgentIdentityCacheForTests('agent-e@colaberry.com');
    await getAgentId('agent-e@colaberry.com');
    expect(mockAdminUserFindOne).toHaveBeenCalledTimes(2);
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
