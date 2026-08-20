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
jest.mock('../liveAgentsService', () => ({ OPEN_TICKET_STATUS_FILTER: { [Op.notIn]: ['done', 'cancelled'] } }));

import Organization from '../../../models/Organization';
import OrgMember from '../../../models/OrgMember';
import AdminUser from '../../../models/AdminUser';
import Enrollment from '../../../models/Enrollment';
import AiAgent from '../../../models/AiAgent';
import { Ticket } from '../../../models';
import { resolveReportsToChainWithTrail } from '../../ticketCreatorReportsToResolver';
import { buildCreatorIdMatchList } from '../../agentBlueprint/legacyCreatorAliases';
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

const COLABERRY_ORG = { id: 'org-colaberry', name: 'Colaberry' };

const ALI = { id: 'ali-id', org_id: 'org-colaberry', email: 'ali@colaberry.com', team: null, role: 'manager', enrollment_id: 'enr-ali' };
const KES = { id: 'kes-id', org_id: 'org-colaberry', email: 'kesetebirhan@gmail.com', team: 'Staff', role: 'member', enrollment_id: null };
const REESE_MEMBER = { id: 'reese-member-id', org_id: 'org-colaberry', email: 'reese@colaberry.com', team: 'Staff', role: 'member', enrollment_id: null };

const CORYBRAIN = { id: 'corybrain-id', agent_name: 'CoryBrain', reports_to_type: 'human', reports_to_id: 'ali-id' };
const STAFF_AGENT = { id: 'staff-1-id', agent_name: 'AdmissionsConversionArchitect', reports_to_type: 'agent', reports_to_id: 'corybrain-id' };
const ORPHAN_AGENT = { id: 'orphan-id', agent_name: 'OrphanedAgent', reports_to_type: 'agent', reports_to_id: 'nonexistent-id' };

function baseMocks() {
  mockOrgFindOne.mockResolvedValue(COLABERRY_ORG);
  mockMemberFindAll.mockResolvedValue([ALI, KES]);
  mockAdminFindAll.mockResolvedValue([]); // no AI-operated identities, no agent display-name identities by default
  mockEnrollmentFindAll.mockResolvedValue([{ id: 'enr-ali', full_name: 'Ali Muwwakkil' }]);
  mockAgentFindAll.mockResolvedValue([CORYBRAIN, STAFF_AGENT]);
  mockMatchList.mockImplementation((adminId: string) => [adminId]);
  mockTicketFindAll.mockResolvedValue([]);
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
    expect(result.leadership[0]).toMatchObject({ id: 'corybrain-id', agent_name: 'CoryBrain', reports_to_human_id: 'ali-id', staff_ids: ['staff-1-id'] });

    expect(result.staff).toHaveLength(1);
    expect(result.staff[0]).toMatchObject({ id: 'staff-1-id', agent_name: 'AdmissionsConversionArchitect', reports_to_agent_id: 'corybrain-id' });

    expect(result.unresolved).toEqual([]);
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
  const VALID_HUMAN = { id: 'h1', name: 'Ali', email: 'ali@colaberry.com', team: 'Exec', department: 'Exec', role: 'manager', leadership_agent_ids: [], staff_count: 0, task: null };
  const VALID_LEADERSHIP = { id: 'l1', agent_name: 'CoryBrain', display_name: 'Cory Brain', reports_to_human_id: 'h1', reports_to_summary: 'Reports to: Ali', staff_ids: [], open_ticket_count: 0 };
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
