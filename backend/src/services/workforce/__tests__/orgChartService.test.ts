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
import { getOrgChart, ColaberryOrgNotFoundError } from '../orgChartService';

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
