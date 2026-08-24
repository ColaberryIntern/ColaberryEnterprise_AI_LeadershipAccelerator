/**
 * orgChartService — the real 3-tier hierarchy (Human Employees -> AI
 * Leadership -> AI Staff) behind WorkforceOSPage's org-chart section. Every
 * external dependency is mocked so this suite never touches a real DB;
 * `resolveReportsToChainWithTrail` is mocked directly (its own recursion is
 * already covered by ticketCreatorReportsToResolver.test.ts) so this suite
 * tests ONLY orgChartService's own grouping/rollup/batching logic.
 */
import { Op } from 'sequelize';

jest.mock('../../../models/Organization', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/OrgMember', () => ({ findAll: jest.fn() }));
jest.mock('../../../models/AdminUser', () => ({ findAll: jest.fn() }));
jest.mock('../../../models/Enrollment', () => ({ findAll: jest.fn() }));
jest.mock('../../../models/AiAgent', () => ({ findAll: jest.fn() }));
jest.mock('../../../models', () => ({ Ticket: { findAll: jest.fn() } }));
jest.mock('../../ticketCreatorReportsToResolver', () => ({ resolveReportsToChainWithTrail: jest.fn() }));
jest.mock('../../agentBlueprint/legacyCreatorAliases', () => ({ buildCreatorIdMatchList: jest.fn() }));
// Real liveAgentsService.ts transitively imports CommunityMember/communityService
// (real Sequelize models), which this unit suite never needs — mocked as a
// literal to isolate orgChartService's own logic, same convention
// ticketRoutes.createdAfter.test.ts uses for whole-service mocks.
jest.mock('../liveAgentsService', () => ({
  OPEN_TICKET_STATUS_FILTER: { [Op.notIn]: ['done', 'cancelled'] },
  countOpenTicketsForAgent: jest.fn(),
}));

import Organization from '../../../models/Organization';
import OrgMember from '../../../models/OrgMember';
import AdminUser from '../../../models/AdminUser';
import Enrollment from '../../../models/Enrollment';
import AiAgent from '../../../models/AiAgent';
import { Ticket } from '../../../models';
import { resolveReportsToChainWithTrail } from '../../ticketCreatorReportsToResolver';
import { buildCreatorIdMatchList } from '../../agentBlueprint/legacyCreatorAliases';
import { countOpenTicketsForAgent } from '../liveAgentsService';
import { getOrgChart, ColaberryOrgNotFoundError, NAMED_DEPARTMENTS, OTHER_DEPARTMENT } from '../orgChartService';
import { workforceOrgChartResponseSchema } from '../../../schemas/workforceOrgChartSchema';

const mockOrgFindOne = Organization.findOne as unknown as jest.Mock;
const mockMemberFindAll = OrgMember.findAll as unknown as jest.Mock;
const mockAdminFindAll = AdminUser.findAll as unknown as jest.Mock;
const mockEnrollmentFindAll = Enrollment.findAll as unknown as jest.Mock;
const mockAgentFindAll = AiAgent.findAll as unknown as jest.Mock;
const mockTicketFindAll = Ticket.findAll as unknown as jest.Mock;
const mockResolveChain = resolveReportsToChainWithTrail as unknown as jest.Mock;
const mockMatchList = buildCreatorIdMatchList as unknown as jest.Mock;
const mockCountOpenTickets = countOpenTicketsForAgent as unknown as jest.Mock;

const COLABERRY_ORG = { id: 'org-colaberry', name: 'Colaberry' };

const ALI = { id: 'ali-id', org_id: 'org-colaberry', email: 'ali@colaberry.com', team: null, role: 'manager', enrollment_id: 'enr-ali' };
const KES = { id: 'kes-id', org_id: 'org-colaberry', email: 'kesetebirhan@gmail.com', team: 'Staff', role: 'member', enrollment_id: null };
const REESE_MEMBER = { id: 'reese-member-id', org_id: 'org-colaberry', email: 'reese@colaberry.com', team: 'Staff', role: 'member', enrollment_id: null };

const CORYBRAIN = { id: 'corybrain-id', agent_name: 'CoryBrain', reports_to_type: 'human', reports_to_id: 'ali-id', enabled: true };
const STAFF_AGENT = { id: 'staff-1-id', agent_name: 'AdmissionsConversionArchitect', reports_to_type: 'agent', reports_to_id: 'corybrain-id', enabled: true };
const ORPHAN_AGENT = { id: 'orphan-id', agent_name: 'OrphanedAgent', reports_to_type: 'agent', reports_to_id: 'nonexistent-id' };

function baseMocks() {
  mockOrgFindOne.mockResolvedValue(COLABERRY_ORG);
  mockMemberFindAll.mockResolvedValue([ALI, KES]);
  mockAdminFindAll.mockResolvedValue([]); // no AI-operated identities, no agent display-name identities by default
  mockEnrollmentFindAll.mockResolvedValue([{ id: 'enr-ali', full_name: 'Ali Muwwakkil' }]);
  mockAgentFindAll.mockResolvedValue([CORYBRAIN, STAFF_AGENT]);
  mockMatchList.mockImplementation((adminId: string) => [adminId]);
  mockTicketFindAll.mockResolvedValue([]);
  // Ticket Count Sync fix (2026-08-21) — fetchOpenTicketCountsByAgent() now calls
  // the shared countOpenTicketsForAgent() per agent instead of its own batched
  // Ticket.findAll + JS attribution. Defaulted to 0 so pre-existing tests that
  // don't care about ticket counts are unaffected; tests that DO care override
  // this per-call via mockImplementation (see "ticket counts" describe below).
  mockCountOpenTickets.mockResolvedValue(0);
  mockResolveChain.mockImplementation(async (agent: any) => {
    if (agent.id === CORYBRAIN.id) return { resolvedHumanId: 'ali-id', trail: ['CoryBrain (agent) -> [human]'] };
    if (agent.id === STAFF_AGENT.id) return { resolvedHumanId: 'ali-id', trail: ['AdmissionsConversionArchitect (agent)', 'CoryBrain (agent) -> [human]'] };
    return { resolvedHumanId: null, trail: [`${agent.agent_name} (agent) -> [dangling]`] };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  baseMocks();
});

describe('getOrgChart — happy path', () => {
  it('builds the 3-tier tree: 2 humans (1 with a task, 1 without), 1 leadership, 1 staff', async () => {
    mockTicketFindAll.mockImplementation(async (query: any) => {
      // Only the throttled-task query (assigned_to_type='org_member') returns a row, for Ali only.
      if (query?.where?.assigned_to_type === 'org_member') {
        return [{ id: 't-ali', ticket_number: 5, title: 'Cross-Departmental Initiative', status: 'backlog', priority: 'medium', type: 'strategic', created_at: new Date('2026-08-19'), assigned_to_id: 'ali-id' }];
      }
      return [];
    });

    const result = await getOrgChart();

    expect(result.organization).toEqual({ id: 'org-colaberry', name: 'Colaberry' });
    expect(result.humans).toHaveLength(2);

    const ali = result.humans.find((h) => h.id === 'ali-id')!;
    expect(ali.name).toBe('Ali Muwwakkil');
    expect(ali.leadership_agent_ids).toEqual(['corybrain-id']);
    expect(ali.staff_count).toBe(1);
    expect(ali.task).not.toBeNull();
    expect(ali.task!.title).toBe('Cross-Departmental Initiative');

    const kes = result.humans.find((h) => h.id === 'kes-id')!;
    expect(kes.name).toBe('kesetebirhan@gmail.com'); // no enrollment -> falls back to email
    expect(kes.leadership_agent_ids).toEqual([]);
    expect(kes.staff_count).toBe(0);
    expect(kes.task).toBeNull(); // honest empty state, never fabricated

    expect(result.leadership).toHaveLength(1);
    expect(result.leadership[0]).toMatchObject({ id: 'corybrain-id', agent_name: 'CoryBrain', reports_to_human_id: 'ali-id', staff_ids: ['staff-1-id'], enabled: true });

    expect(result.staff).toHaveLength(1);
    expect(result.staff[0]).toMatchObject({ id: 'staff-1-id', agent_name: 'AdmissionsConversionArchitect', reports_to_agent_id: 'corybrain-id', enabled: true });

    expect(result.unresolved).toEqual([]);
  });

  // AI Workforce Reset (2026-08-24) — Ali, live: a deactivated agent must be
  // visually distinguishable on the chart, not rendered identically to an
  // active one. Proves the real AiAgent.enabled column passes through
  // end-to-end for both the Leadership and Staff tiers.
  it('a deactivated (enabled:false) agent still appears on the chart, correctly flagged, not silently hidden or shown as active', async () => {
    mockOrgFindOne.mockResolvedValue({ id: 'org-colaberry', name: 'Colaberry' });
    mockMemberFindAll.mockResolvedValue([{ id: 'ali-id', email: 'ali@colaberry.com', enrollment_id: null, team: null, role: 'manager', org_id: 'org-colaberry' }]);
    mockAdminFindAll.mockResolvedValue([]);
    mockEnrollmentFindAll.mockResolvedValue([]);
    mockTicketFindAll.mockResolvedValue([]);
    const disabledLeadership = { id: 'disabled-leadership-id', agent_name: 'ExecutiveStrategyArchitect', reports_to_type: 'human', reports_to_id: 'ali-id', enabled: false };
    const disabledStaff = { id: 'disabled-staff-id', agent_name: 'AlumniNetworkArchitect', reports_to_type: 'agent', reports_to_id: 'disabled-leadership-id', enabled: false };
    mockAgentFindAll.mockResolvedValue([disabledLeadership, disabledStaff]);
    mockResolveChain
      .mockResolvedValueOnce({ resolvedHumanId: 'ali-id', trail: ['ExecutiveStrategyArchitect (agent) -> [human]'] })
      .mockResolvedValueOnce({ resolvedHumanId: 'ali-id', trail: ['AlumniNetworkArchitect (agent)', 'ExecutiveStrategyArchitect (agent) -> [human]'] });
    mockCountOpenTickets.mockResolvedValue(0);

    const result = await getOrgChart();

    expect(result.leadership[0]).toMatchObject({ id: 'disabled-leadership-id', enabled: false });
    expect(result.staff[0]).toMatchObject({ id: 'disabled-staff-id', enabled: false });
  });
});

// Ticket Count Sync fix (2026-08-21, session CC-20260818-x4nk continued) — the
// real production bug: fetchOpenTicketCountsByAgent() used to batch every
// hierarchy agent's tickets into ONE query, then guess which agent a row
// belonged to via `row.assigned_to_id || row.created_by_id`, preferring
// assigned_to_id whenever non-null. Once the reports_to/reassignment build
// started setting assigned_to_id to a HUMAN id on most agent-created tickets,
// that guess silently dropped the row (assigned_to_id matched no agent) instead
// of falling back to check created_by_id — the org chart summed to ~92 against
// a real total of 476 open tickets. These tests prove the FIXED function is a
// thin per-agent pass-through to the shared, canonical countOpenTicketsForAgent
// (mocked here), with no attribution-guessing step left to regress.
describe('getOrgChart — open ticket counts (the count-sync bug fix)', () => {
  // baseMocks() defaults mockAdminFindAll to [] (no identities at all), which
  // means fetchOpenTicketCountsByAgent's own `if (!identity) continue` guard
  // would skip every agent regardless of what countOpenTicketsForAgent is
  // mocked to return. These tests need real linked identities present so the
  // per-agent count path is actually exercised — this mock supplies them for
  // both hierarchy agents in the fixture (mirrors the real AdminUser.findAll
  // shape fetchAgentIdentities() reads: id + agent_id).
  function withLinkedIdentities() {
    mockAdminFindAll.mockImplementation(async (query: any) => {
      if (query?.where?.agent_id) {
        return [
          { agent_id: CORYBRAIN.id, id: 'admin-corybrain', display_name: 'Cory Brain' },
          { agent_id: STAFF_AGENT.id, id: 'admin-staff-1', display_name: 'Admissions Conversion Architect' },
        ];
      }
      return []; // excludeAiOperatedMembers' is_ai_operated query — no AI-operated humans in this fixture
    });
  }

  it('the exact bug shape: a ticket created by an agent but reassigned to a HUMAN (assigned_to_id != any agent identity) still counts toward that agent, because attribution is no longer guessed from the returned row at all — it is computed per-agent up front', async () => {
    withLinkedIdentities();
    // Real bug shape: countOpenTicketsForAgent's own query already matches
    // EITHER assigned_to_id OR created_by_id for THIS agent's match list — the
    // old bug was orgChartService's own JS re-guessing which field matched
    // across a batched multi-agent result set. Mocking per-agent proves that
    // guessing step is gone: staff-1-id gets its real count regardless of what
    // any OTHER agent's tickets look like.
    mockCountOpenTickets.mockImplementation(async (_identityId: string, agent: any) => {
      if (agent.id === STAFF_AGENT.id) return 1; // this agent's 1 open ticket, created by it, reassigned to a human
      return 0;
    });

    const result = await getOrgChart();

    const staffEntry = result.staff.find((s) => s.id === 'staff-1-id')!;
    expect(staffEntry.open_ticket_count).toBe(1); // NOT 0 — the old bug would have dropped this
    const leadershipEntry = result.leadership.find((l) => l.id === 'corybrain-id')!;
    expect(leadershipEntry.open_ticket_count).toBe(0); // unaffected agents stay honestly at 0
  });

  it('calls countOpenTicketsForAgent once per hierarchy agent with a linked identity, never a batched cross-agent query', async () => {
    withLinkedIdentities();
    mockCountOpenTickets.mockResolvedValue(2);

    await getOrgChart();

    // 2 hierarchy agents in baseMocks() (CoryBrain, AdmissionsConversionArchitect),
    // both have a linked identity via withLinkedIdentities() above — assert the
    // shared function was called once per agent, not once total.
    expect(mockCountOpenTickets).toHaveBeenCalledTimes(2);
    expect(mockTicketFindAll).not.toHaveBeenCalledWith(expect.objectContaining({
      attributes: ['assigned_to_id', 'created_by_id'],
    })); // the old batched query shape must be gone entirely
  });

  it('an agent with no linked AdminUser identity gets 0, and the shared function is never called for it (nothing to count against)', async () => {
    mockAdminFindAll.mockResolvedValue([]); // no identities at all -> identityByAgentId is empty
    mockCountOpenTickets.mockResolvedValue(99); // would be wrong if ever called for this agent

    const result = await getOrgChart();

    expect(result.staff.find((s) => s.id === 'staff-1-id')?.open_ticket_count).toBe(0);
    expect(mockCountOpenTickets).not.toHaveBeenCalled();
  });
});

describe('getOrgChart — failure path', () => {
  it('throws ColaberryOrgNotFoundError (a specific error class, not a generic Error) when the Colaberry org row is missing', async () => {
    mockOrgFindOne.mockResolvedValue(null);

    await expect(getOrgChart()).rejects.toBeInstanceOf(ColaberryOrgNotFoundError);
    await expect(getOrgChart()).rejects.toMatchObject({ error_class: 'ColaberryOrgNotFoundError' });
    expect(mockMemberFindAll).not.toHaveBeenCalled();
  });
});

describe('getOrgChart — boundary cases', () => {
  it('excludes an org_member whose email is an AI-operated AdminUser identity (e.g. reese@colaberry.com) from humans', async () => {
    mockMemberFindAll.mockResolvedValue([ALI, KES, REESE_MEMBER]);
    mockAdminFindAll.mockImplementation(async (query: any) => {
      if (query?.where?.is_ai_operated) return [{ email: 'reese@colaberry.com' }];
      return [];
    });

    const result = await getOrgChart();

    expect(result.humans.map((h) => h.email)).not.toContain('reese@colaberry.com');
    expect(result.humans).toHaveLength(2);
  });

  it('excludes ali+10@colaberry.com from humans (Org Chart v3 — "the red Ali should be removed"), row untouched, sibling rows unaffected', async () => {
    const RED_ALI = { id: 'red-ali-id', org_id: 'org-colaberry', email: 'ali+10@colaberry.com', team: null, role: 'member', enrollment_id: null };
    mockMemberFindAll.mockResolvedValue([ALI, KES, RED_ALI]);

    const result = await getOrgChart();

    expect(result.humans.map((h) => h.email)).not.toContain('ali+10@colaberry.com');
    expect(result.humans).toHaveLength(2);
    expect(result.humans.map((h) => h.email)).toEqual(expect.arrayContaining(['ali@colaberry.com', 'kesetebirhan@gmail.com']));
  });

  it('an agent whose chain fails to resolve (dangling reports_to_id) lands in `unresolved`, not silently dropped', async () => {
    mockAgentFindAll.mockResolvedValue([CORYBRAIN, ORPHAN_AGENT]);

    const result = await getOrgChart();

    expect(result.unresolved).toEqual([{ id: 'orphan-id', agent_name: 'OrphanedAgent', reason: 'OrphanedAgent (agent) -> [dangling]' }]);
    expect(result.leadership.find((l) => l.id === 'orphan-id')).toBeUndefined();
    expect(result.staff.find((s) => s.id === 'orphan-id')).toBeUndefined();
  });

  it('a human with zero leadership/staff and zero tickets still renders with honest empty defaults', async () => {
    mockAgentFindAll.mockResolvedValue([]); // no hierarchy agents at all

    const result = await getOrgChart();

    const kes = result.humans.find((h) => h.id === 'kes-id')!;
    expect(kes.leadership_agent_ids).toEqual([]);
    expect(kes.staff_count).toBe(0);
    expect(kes.task).toBeNull();
    expect(result.leadership).toEqual([]);
    expect(result.staff).toEqual([]);
  });
});

describe('getOrgChart — idempotency', () => {
  it('calling twice against the same mocked data returns deep-equal results (no shared-state mutation across calls)', async () => {
    const first = await getOrgChart();
    const second = await getOrgChart();

    // generated_at is a fresh Date() per call by design (this IS a live
    // snapshot endpoint) — compare everything else structurally.
    const { generated_at: firstGeneratedAt, ...firstRest } = first;
    const { generated_at: secondGeneratedAt, ...secondRest } = second;
    expect(secondRest).toEqual(firstRest);
    expect(firstGeneratedAt).toBeInstanceOf(Date);
    expect(secondGeneratedAt).toBeInstanceOf(Date);
  });
});

// Department grouping + reports-to summary (Ali, live, 2026-08-19, session
// CC-20260818-x4nk continued: "divide them up into dept" + "Each AI staff
// should have a tag on them to show who they report to on their cards before
// even clicking").
describe('getOrgChart — department grouping', () => {
  it('a human whose team is a named department gets that exact department', async () => {
    mockMemberFindAll.mockResolvedValue([{ ...ALI, team: 'Exec' }, KES]);

    const result = await getOrgChart();

    const ali = result.humans.find((h) => h.id === 'ali-id')!;
    expect(ali.department).toBe('Exec');
  });

  it('a human with a null team, or a team outside the 6 named departments, buckets into "Other" — never dropped', async () => {
    mockMemberFindAll.mockResolvedValue([ALI, { ...KES, team: 'Staff' }]);

    const result = await getOrgChart();

    const ali = result.humans.find((h) => h.id === 'ali-id')!; // team: null
    const kes = result.humans.find((h) => h.id === 'kes-id')!; // team: 'Staff', not a named department
    expect(ali.department).toBe(OTHER_DEPARTMENT);
    expect(kes.department).toBe(OTHER_DEPARTMENT);
    expect(result.humans).toHaveLength(2); // both still present
  });

  it('NAMED_DEPARTMENTS is exactly Ali\'s 6 departments in the order he gave them', () => {
    expect(NAMED_DEPARTMENTS).toEqual(['Exec', 'Sales', 'Operations', 'Recruiting', 'Customer Support', 'Marketing']);
  });
});

describe('getOrgChart — reports_to_summary', () => {
  it('a resolved leadership entry carries "Reports to: <human name>"', async () => {
    const result = await getOrgChart();

    const leadershipEntry = result.leadership.find((l) => l.id === 'corybrain-id')!;
    expect(leadershipEntry.reports_to_summary).toBe('Reports to: Ali Muwwakkil');
  });

  it('a resolved staff entry carries "Reports to: <leadership agent display name>"', async () => {
    mockAdminFindAll.mockImplementation(async (query: any) => {
      if (query?.where?.agent_id) return [{ agent_id: 'corybrain-id', display_name: 'Cory Brain — Strategic Initiatives' }];
      return [];
    });

    const result = await getOrgChart();

    const staffEntry = result.staff.find((s) => s.id === 'staff-1-id')!;
    expect(staffEntry.reports_to_summary).toBe('Reports to: Cory Brain — Strategic Initiatives');
  });

  it('an unresolved agent never carries a reports_to_summary (nothing to summarize)', async () => {
    mockAgentFindAll.mockResolvedValue([CORYBRAIN, ORPHAN_AGENT]);

    const result = await getOrgChart();

    expect(result.unresolved).toEqual([{ id: 'orphan-id', agent_name: 'OrphanedAgent', reason: 'OrphanedAgent (agent) -> [dangling]' }]);
    expect((result.unresolved[0] as any).reports_to_summary).toBeUndefined();
  });
});

// Org Chart v3 (2026-08-19) — Ali, live: "Human, AI Leadership, AI Staff
// should all have the same colors." Integration-level proof that
// orgChartColorAssignment.ts's pure-function output (fully unit-tested on
// its own in orgChartColorAssignment.test.ts) actually reaches the real API
// response getOrgChart() returns, not just the isolated function.
describe('getOrgChart — hierarchy colors', () => {
  it("Ali (has CoryBrain -> AdmissionsConversionArchitect under him) gets a real hierarchy_color, propagated to both agents; Kes (zero agents) gets null", async () => {
    const result = await getOrgChart();

    const ali = result.humans.find((h) => h.id === 'ali-id')!;
    const kes = result.humans.find((h) => h.id === 'kes-id')!;
    const corybrain = result.leadership.find((l) => l.id === 'corybrain-id')!;
    const staffAgent = result.staff.find((s) => s.id === 'staff-1-id')!;

    expect(ali.hierarchy_color).not.toBeNull();
    expect(corybrain.hierarchy_color).toBe(ali.hierarchy_color);
    expect(staffAgent.hierarchy_color).toBe(ali.hierarchy_color);
    expect(kes.hierarchy_color).toBeNull();
  });
});

describe('getOrgChart — Taiwo rollup with reassigned AI Staff (fixture-based, deploy-order-independent)', () => {
  const TAIWO = { id: 'taiwo-id', org_id: 'org-colaberry', email: 'taiwooludimimu@gmail.com', team: 'Operations', role: 'member', enrollment_id: 'enr-taiwo' };
  const FINANCE_ARCHITECT = { id: 'finance-architect-id', agent_name: 'FinanceIntelligenceArchitect', reports_to_type: 'human', reports_to_id: 'taiwo-id' };
  const STUDENT_SUCCESS_ARCHITECT = { id: 'student-success-architect-id', agent_name: 'StudentSuccessArchitect', reports_to_type: 'human', reports_to_id: 'taiwo-id' };

  it("Taiwo's leadership_agent_ids includes every agent whose reports_to_type='human'/reports_to_id resolves to her — proves the rollup logic works for the post-T2 shape without depending on T2's actual deploy having happened", async () => {
    mockMemberFindAll.mockResolvedValue([ALI, KES, TAIWO]);
    mockEnrollmentFindAll.mockResolvedValue([{ id: 'enr-ali', full_name: 'Ali Muwwakkil' }, { id: 'enr-taiwo', full_name: 'Taiwo Oludimimu' }]);
    mockAgentFindAll.mockResolvedValue([CORYBRAIN, FINANCE_ARCHITECT, STUDENT_SUCCESS_ARCHITECT]);
    mockResolveChain.mockImplementation(async (agent: any) => {
      if (agent.id === CORYBRAIN.id) return { resolvedHumanId: 'ali-id', trail: ['CoryBrain (agent) -> [human]'] };
      if (agent.reports_to_type === 'human') return { resolvedHumanId: agent.reports_to_id, trail: [`${agent.agent_name} (agent) -> [human]`] };
      return { resolvedHumanId: null, trail: [`${agent.agent_name} (agent) -> [dangling]`] };
    });

    const result = await getOrgChart();

    const taiwo = result.humans.find((h) => h.id === 'taiwo-id')!;
    expect(taiwo.leadership_agent_ids.sort()).toEqual(['finance-architect-id', 'student-success-architect-id'].sort());
    expect(taiwo.department).toBe('Operations');

    const financeEntry = result.leadership.find((l) => l.id === 'finance-architect-id')!;
    expect(financeEntry.reports_to_summary).toBe('Reports to: Taiwo Oludimimu');
  });
});

describe('workforceOrgChartResponseSchema — boundary', () => {
  // Org Chart v3 (2026-08-19) — hierarchy_color is present-but-nullable
  // (z.string().nullable(), not .optional()), so these fixtures must
  // include it explicitly or safeParse legitimately fails — a real
  // regression a T002-verifier's full-file jest run caught (this describe
  // block isn't in T007's own diff hunks, so it's easy to miss scoping to
  // just the new lines).
  const VALID_HUMAN = { id: 'h1', name: 'Ali', email: 'ali@colaberry.com', team: 'Exec', department: 'Exec', role: 'manager', leadership_agent_ids: [], staff_count: 0, task: null, hierarchy_color: null };
  const VALID_LEADERSHIP = { id: 'l1', agent_name: 'CoryBrain', display_name: 'Cory Brain', reports_to_human_id: 'h1', reports_to_summary: 'Reports to: Ali', staff_ids: [], open_ticket_count: 0, hierarchy_color: null, enabled: true };
  const VALID_RESPONSE = {
    organization: { id: 'org1', name: 'Colaberry' },
    humans: [VALID_HUMAN],
    leadership: [VALID_LEADERSHIP],
    staff: [],
    unresolved: [],
    generated_at: '2026-08-19T00:00:00.000Z',
  };

  it('a fully-populated response (including department + reports_to_summary) passes', () => {
    expect(workforceOrgChartResponseSchema.safeParse(VALID_RESPONSE).success).toBe(true);
  });

  it('a human missing `department` fails safeParse', () => {
    const { department, ...humanWithoutDepartment } = VALID_HUMAN;
    const result = workforceOrgChartResponseSchema.safeParse({ ...VALID_RESPONSE, humans: [humanWithoutDepartment] });
    expect(result.success).toBe(false);
  });

  it('a leadership entry missing `reports_to_summary` fails safeParse', () => {
    const { reports_to_summary, ...leadershipWithoutSummary } = VALID_LEADERSHIP;
    const result = workforceOrgChartResponseSchema.safeParse({ ...VALID_RESPONSE, leadership: [leadershipWithoutSummary] });
    expect(result.success).toBe(false);
  });
});
