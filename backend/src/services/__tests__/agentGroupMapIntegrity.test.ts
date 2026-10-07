/**
 * AGENT_GROUP_MAP integrity (2026-10-06) — the CI gate for the defect class
 * that made ContentEngineSuperAgent publish 9,369 consecutive
 * "Content Engine: 0/0 healthy ... 0 anomalies detected" reports between
 * 2026-03-17 and 2026-10-06.
 *
 * Root cause: `ai_agents.agent_group` is a single column and
 * assignAgentGroups() writes only `where agent_group IS NULL`, so the first
 * group in AGENT_GROUP_MAP to list an agent claims it and every later listing
 * of that name is an update matching no row. `content_engine` was defined as a
 * duplicate subset of `campaign_ops`, so it could never have a member. The same
 * silent no-op, in its other disguise, cost `admissions` three members: the map
 * listed source-FILE names ('AdmissionsAppointmentAgent') instead of the
 * REGISTERED agent_names ('AdmissionsAppointmentSchedulingAgent').
 *
 * Production, read-only, on the day of this fix:
 *   SELECT COALESCE(agent_group,'(null)'), count(*) FROM ai_agents GROUP BY 1
 *     (null) 219 | admissions 17 | lead_intelligence 7 | campaign_ops 7
 *     system_resilience 3 | partnership 1 | analytics_engine 1 | finance 1
 *   — no content_engine row at all, and admissions 17 where the map said 20.
 *
 * Every check below is paired with a POSITIVE CONTROL that feeds the detector a
 * deliberately broken map, because a duplicate detector that has never been
 * seen to fire is not a detector.
 */

// Same mocking shape as agentRegistrySeedBposCapabilityTicketAutoResolver.test.ts:
// AiAgent is the only model the seed loop and assignAgentGroups() touch.
jest.mock('../../models/AiAgent', () => ({ findOrCreate: jest.fn(), update: jest.fn() }));
jest.mock('../reese/reeseIdentitySeed', () => ({ seedReeseIdentity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../reese/reeseSystemPrompt', () => ({ REESE_PERSONA_BLOCK: 'MOCKED_PERSONA_BLOCK' }));

import AiAgent from '../../models/AiAgent';
import { AGENT_GROUP_MAP, auditAgentGroups, seedAgentRegistry } from '../agentRegistrySeed';
import { auditAgentGroupMap, formatAgentGroupMapDefects } from '../agentRegistry/agentGroupMapIntegrity';

const mockFindOrCreate = AiAgent.findOrCreate as unknown as jest.Mock;
const mockUpdate = AiAgent.update as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockFindOrCreate.mockImplementation(async ({ defaults }: any) => [
    { ...defaults, update: jest.fn().mockResolvedValue(undefined) },
    true,
  ]);
  mockUpdate.mockResolvedValue([0]);
});

/** Every (agent_name -> group) pair assignAgentGroups() actually tried to write. */
function groupAssignments(): Array<{ agent_name: string; group: string }> {
  return mockUpdate.mock.calls
    .filter((call) => typeof call[0]?.agent_group === 'string' && call[1]?.where?.agent_name)
    .map((call) => ({ agent_name: call[1].where.agent_name as string, group: call[0].agent_group as string }));
}

describe('AGENT_GROUP_MAP — no agent may be claimed by two groups', () => {
  it('the shipped map claims every agent exactly once', () => {
    const { duplicates } = auditAgentGroups();

    // Rendered as strings so a failure names the group that LOSES — the one
    // that silently ends up empty, which is the fact worth reading.
    expect(
      duplicates.map((d) => `${d.agent_name}: wins=${d.effective_group} loses=${d.losing_groups.join('/')}`),
    ).toEqual([]);
  });

  it('POSITIVE CONTROL: the detector fires on a duplicated name and names the losing group', () => {
    const broken = {
      campaign_ops: ['ContentOptimizationAgent', 'ConversationOptimizationAgent'],
      content_engine: ['ContentOptimizationAgent', 'ConversationOptimizationAgent'],
    };
    const seeded = new Set(['ContentOptimizationAgent', 'ConversationOptimizationAgent']);

    const { duplicates } = auditAgentGroupMap(broken, seeded);

    expect(duplicates).toHaveLength(2);
    expect(duplicates[0]).toEqual({
      agent_name: 'ContentOptimizationAgent',
      groups: ['campaign_ops', 'content_engine'],
      effective_group: 'campaign_ops',
      losing_groups: ['content_engine'],
    });
    expect(formatAgentGroupMapDefects({ duplicates, unseeded: [], emptyGroups: [] })[0]).toContain(
      "only 'campaign_ops' can ever win",
    );
  });

  it('POSITIVE CONTROL: the same name listed twice inside ONE group is caught too', () => {
    const { duplicates } = auditAgentGroupMap(
      { finance: ['FinanceIntelligenceArchitect', 'FinanceIntelligenceArchitect'] },
      new Set(['FinanceIntelligenceArchitect']),
    );

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].losing_groups).toEqual(['finance']);
  });
});

describe('AGENT_GROUP_MAP — every listed name must have a registry row', () => {
  it('the shipped map lists only agent_names AGENT_REGISTRY registers', () => {
    const { unseeded } = auditAgentGroups();

    expect(unseeded.map((u) => `${u.group}:${u.agent_name}`)).toEqual([]);
  });

  it('the three admissions entries use the REGISTERED agent_name, not the source-file name', () => {
    // The exact regression. Each key is a .ts filename with no AiAgent row
    // anywhere in production; each value is the row that does exist.
    const phantomToReal: Record<string, string> = {
      AdmissionsAppointmentAgent: 'AdmissionsAppointmentSchedulingAgent',
      AdmissionsCallComplianceAgent: 'AdmissionsCallComplianceMonitor',
      AdmissionsCallbackAgent: 'AdmissionsCallbackManagementAgent',
    };

    for (const [phantom, real] of Object.entries(phantomToReal)) {
      expect(AGENT_GROUP_MAP.admissions).not.toContain(phantom);
      expect(AGENT_GROUP_MAP.admissions).toContain(real);
    }
    // 20 intended members, all of them now reachable — production had 17.
    expect(AGENT_GROUP_MAP.admissions).toHaveLength(20);
  });

  it('POSITIVE CONTROL: the detector fires on a name with no registry row', () => {
    const { unseeded } = auditAgentGroupMap(
      { admissions: ['AdmissionsEmailAgent', 'AdmissionsAppointmentAgent'] },
      new Set(['AdmissionsEmailAgent', 'AdmissionsAppointmentSchedulingAgent']),
    );

    expect(unseeded).toEqual([{ agent_name: 'AdmissionsAppointmentAgent', group: 'admissions' }]);
    expect(formatAgentGroupMapDefects({ duplicates: [], unseeded, emptyGroups: [] })[0]).toContain(
      'has no AGENT_REGISTRY entry',
    );
  });
});

describe('AGENT_GROUP_MAP — structurally empty groups are declared, never accidental', () => {
  it('NO group is empty any more, and the list is asserted exactly so a new one cannot hide', () => {
    // This replaced a tripwire that asserted content_engine was the one declared-empty group.
    // The product owner resolved it on 2026-10-07: the key is deleted and its super agent now
    // reads `marketing`. So the honest invariant became stronger - not "one known empty group"
    // but NONE. If any group becomes unreachable in future this fails and names it, which is the
    // same protection pointed at a cleaner baseline.
    expect(auditAgentGroups().emptyGroups).toEqual([]);
  });

  it('content_engine is GONE as a key — a subset-of-another-group must not come back', () => {
    // The inverse of the assertion that used to live here. content_engine could never hold a
    // member: it was defined as a subset of campaign_ops, and assignAgentGroups only writes where
    // agent_group IS NULL, so the second listing was a silent no-op for seven months. Re-adding
    // the key is re-adding the bug.
    expect(Object.keys(AGENT_GROUP_MAP)).not.toContain('content_engine');
  });

  it('marketing is supervised: exactly one super agent reads it', () => {
    // The decision this change records. ContentEngineSuperAgent was repointed here rather than
    // retired, because retiring it would have left this group - the only populated group in the
    // fleet without a supervisor - watched by nobody.
    expect(AGENT_GROUP_MAP.marketing).toEqual(['DeptCampaignPerformanceAgent']);
  });

  it('POSITIVE CONTROL: a group whose every member is claimed above it is reported empty', () => {
    const { emptyGroups } = auditAgentGroupMap(
      { campaign_ops: ['ContentOptimizationAgent'], content_engine: ['ContentOptimizationAgent'] },
      new Set(['ContentOptimizationAgent']),
    );

    expect(emptyGroups).toEqual(['content_engine']);
  });

  it('POSITIVE CONTROL: a group whose every member lacks a registry row is reported empty', () => {
    const { emptyGroups } = auditAgentGroupMap({ admissions: ['AdmissionsCallbackAgent'] }, new Set<string>());

    expect(emptyGroups).toEqual(['admissions']);
  });
});

describe('assignAgentGroups() — what the boot path actually writes', () => {
  // ONE boot, captured once. Seeding ~240 agents takes several seconds, so a
  // seedAgentRegistry() call inside each `it` pushed individual tests past
  // jest's 5s default and failed on the clock rather than on an assertion.
  let assignments: Array<{ agent_name: string; group: string }>;
  let registered: Set<string>;
  let groupMapErrorLines: string[];

  beforeAll(async () => {
    jest.clearAllMocks();
    mockFindOrCreate.mockImplementation(async ({ defaults }: any) => [
      { ...defaults, update: jest.fn().mockResolvedValue(undefined) },
      true,
    ]);
    mockUpdate.mockResolvedValue([0]);

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await seedAgentRegistry();
      groupMapErrorLines = errorSpy.mock.calls
        .map((call) => String(call[0]))
        .filter((line) => line.includes('AGENT_GROUP_MAP'));
    } finally {
      errorSpy.mockRestore();
    }

    assignments = groupAssignments();
    registered = new Set(mockFindOrCreate.mock.calls.map((call) => call[0]?.where?.agent_name as string));
  }, 120_000);

  it('issues group assignments at all (guards every "absence" assertion below)', () => {
    expect(assignments.length).toBeGreaterThan(30);
  });

  it('never issues a single update for content_engine, so no row can be labelled into an invisible group', () => {
    expect(assignments.filter((a) => a.group === 'content_engine')).toEqual([]);
  });

  it('writes ContentOptimizationAgent and ConversationOptimizationAgent exactly once each, to campaign_ops', () => {
    for (const name of ['ContentOptimizationAgent', 'ConversationOptimizationAgent']) {
      expect(assignments.filter((a) => a.agent_name === name)).toEqual([
        { agent_name: name, group: 'campaign_ops' },
      ]);
    }
  });

  it('writes the three recovered admissions agents, so the group is 20 reachable members, not 17', () => {
    const admissions = assignments.filter((a) => a.group === 'admissions').map((a) => a.agent_name);
    expect(admissions).toHaveLength(20);
    expect(admissions).toEqual(expect.arrayContaining([
      'AdmissionsAppointmentSchedulingAgent',
      'AdmissionsCallComplianceMonitor',
      'AdmissionsCallbackManagementAgent',
    ]));
  });

  it('every group assignment targets a name the seed loop really registered', () => {
    const orphans = assignments.filter((a) => !registered.has(a.agent_name));

    expect(orphans.map((o) => `${o.group}:${o.agent_name}`)).toEqual([]);
  });

  it('logs nothing about AGENT_GROUP_MAP while the map is clean', () => {
    expect(groupMapErrorLines).toEqual([]);
  });

  it('the line it WOULD emit on a breach is classified and names the no-op', () => {
    const wouldLog = formatAgentGroupMapDefects(auditAgentGroupMap({ a: ['X'], b: ['X'] }, new Set(['X'])));

    expect(wouldLog).toHaveLength(1);
    expect(wouldLog[0]).toContain('silent no-op');
  });

  it('idempotent: a second boot issues the identical set of assignments', async () => {
    jest.clearAllMocks();
    mockFindOrCreate.mockImplementation(async ({ defaults }: any) => [
      { ...defaults, update: jest.fn().mockResolvedValue(undefined) },
      false, // second run: every row already exists
    ]);
    mockUpdate.mockResolvedValue([0]); // and is already grouped, so nothing changes

    await seedAgentRegistry();

    expect(groupAssignments()).toEqual(assignments);
  }, 120_000);

  it('surfaces a defect at boot: a duplicate pushed into the LIVE map produces one ContractViolation line', async () => {
    // Without this, "logs nothing while the map is clean" would pass just as
    // happily with the guard deleted — an assertion that cannot fail. The only
    // way to exercise the runtime path is to hand it a broken map, so this
    // mutates the real exported map and restores it in `finally`. Declared
    // last in the file so nothing can observe the mutation even on a throw.
    const original = [...AGENT_GROUP_MAP.marketing];
    AGENT_GROUP_MAP.marketing.push('ContentOptimizationAgent');

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await seedAgentRegistry();

      const lines = errorSpy.mock.calls
        .map((call) => String(call[0]))
        .filter((line) => line.includes('AGENT_GROUP_MAP'));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('ContractViolation');
      expect(lines[0]).toContain("'ContentOptimizationAgent' is listed under 2 groups");
      expect(lines[0]).toContain("only 'campaign_ops' can ever win");
    } finally {
      errorSpy.mockRestore();
      AGENT_GROUP_MAP.marketing.length = 0;
      AGENT_GROUP_MAP.marketing.push(...original);
    }

    expect(AGENT_GROUP_MAP.marketing).toEqual(original);
  }, 120_000);
});
