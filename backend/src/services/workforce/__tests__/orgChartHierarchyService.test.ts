/**
 * orgChartHierarchyService — team-update (T003/T004) + downward hierarchy
 * walk (T006). Every external dependency mocked, same convention as
 * orgChartService.test.ts (mock each model module directly by path).
 *
 * orgChartHierarchyService.ts imports NAMED_DEPARTMENTS from
 * orgChartService.ts, which itself imports Organization/OrgMember/
 * AdminUser/Enrollment/AiAgent PLUS `{ Ticket }` from the `../../models`
 * barrel — so this file must mock the SAME full set orgChartService.test.ts
 * mocks, or the real models/index.ts loads and calls real Sequelize
 * association methods (e.g. AiAgent.hasMany(...)) on our bare
 * `{ findAll: jest.fn() }` stand-in, crashing the whole suite before any
 * test runs (a real bug this exact gap caused — fixed here).
 */
import { Op } from 'sequelize';

jest.mock('../../../models/Organization', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/OrgMember', () => ({ findAll: jest.fn(), findByPk: jest.fn() }));
jest.mock('../../../models/AdminUser', () => ({ findAll: jest.fn() }));
jest.mock('../../../models/Enrollment', () => ({ findAll: jest.fn() }));
jest.mock('../../../models/AiAgent', () => ({ findAll: jest.fn() }));
jest.mock('../../../models', () => ({ Ticket: { findAll: jest.fn() } }));
jest.mock('../../ticketCreatorReportsToResolver', () => ({ resolveReportsToChainWithTrail: jest.fn() }));
jest.mock('../../agentBlueprint/legacyCreatorAliases', () => ({ buildCreatorIdMatchList: jest.fn() }));
jest.mock('../liveAgentsService', () => ({
  OPEN_TICKET_STATUS_FILTER: { [Op.notIn]: ['done', 'cancelled'] },
  countOpenTicketsForAgent: jest.fn().mockResolvedValue(0),
}));
jest.mock('../orgChartColorAssignment', () => ({ assignHierarchyColors: () => ({ humanColors: new Map(), leadershipColors: new Map(), staffColors: new Map() }) }));

import OrgMember from '../../../models/OrgMember';
import AiAgent from '../../../models/AiAgent';
import {
  updateOrgMemberTeam,
  OrgMemberNotFoundError,
  InvalidDepartmentError,
  resolveHumanDownstreamAgents,
  isAgentInHumanDownstream,
  scopeOrgChartToHuman,
  emptyOrgChartResponse,
} from '../orgChartHierarchyService';
import type { OrgChartResponse, OrgChartHuman, OrgChartLeadershipAgent, OrgChartStaffAgent } from '../orgChartService';

const mockMemberFindByPk = OrgMember.findByPk as unknown as jest.Mock;
const mockAgentFindAll = AiAgent.findAll as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('updateOrgMemberTeam', () => {
  it('happy path: a valid named department updates the row and returns it', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    mockMemberFindByPk.mockResolvedValue({ id: 'member-1', team: null, update });

    const result = await updateOrgMemberTeam('member-1', 'Customer Support');

    expect(update).toHaveBeenCalledWith({ team: 'Customer Support' });
    expect(result.id).toBe('member-1');
  });

  it('happy path: null clears the department', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    mockMemberFindByPk.mockResolvedValue({ id: 'member-1', team: 'Marketing', update });

    await updateOrgMemberTeam('member-1', null);

    expect(update).toHaveBeenCalledWith({ team: null });
  });

  it('failure: an unrecognized department string throws InvalidDepartmentError, no DB write attempted', async () => {
    await expect(updateOrgMemberTeam('member-1', 'Not A Real Department')).rejects.toBeInstanceOf(InvalidDepartmentError);
    await expect(updateOrgMemberTeam('member-1', 'Not A Real Department')).rejects.toMatchObject({ status: 400 });
    expect(mockMemberFindByPk).not.toHaveBeenCalled();
  });

  it('failure: an unknown org_members id throws OrgMemberNotFoundError', async () => {
    mockMemberFindByPk.mockResolvedValue(null);

    await expect(updateOrgMemberTeam('missing-id', 'Sales')).rejects.toBeInstanceOf(OrgMemberNotFoundError);
    await expect(updateOrgMemberTeam('missing-id', 'Sales')).rejects.toMatchObject({ status: 404 });
  });
});

describe('resolveHumanDownstreamAgents', () => {
  it('a human with 2 leadership agents and an UNEVEN staff split (2 under one, 1 under the other) returns all 5 correctly attributed, not just correctly counted', async () => {
    const LEAD_A = { id: 'lead-a', reports_to_type: 'human', reports_to_id: 'human-1' };
    const LEAD_B = { id: 'lead-b', reports_to_type: 'human', reports_to_id: 'human-1' };
    const STAFF_A1 = { id: 'staff-a1', reports_to_type: 'agent', reports_to_id: 'lead-a' };
    const STAFF_A2 = { id: 'staff-a2', reports_to_type: 'agent', reports_to_id: 'lead-a' };
    const STAFF_B1 = { id: 'staff-b1', reports_to_type: 'agent', reports_to_id: 'lead-b' };

    mockAgentFindAll.mockImplementation(async ({ where }: any) => {
      if (where.reports_to_type === 'human') return [LEAD_A, LEAD_B];
      if (where.reports_to_type === 'agent') {
        const ids: string[] = where.reports_to_id[Op.in];
        return [STAFF_A1, STAFF_A2, STAFF_B1].filter((s) => ids.includes(s.reports_to_id));
      }
      return [];
    });

    const result = await resolveHumanDownstreamAgents('human-1');

    expect(result.leadership.map((a) => a.id).sort()).toEqual(['lead-a', 'lead-b']);
    // Uneven 2-vs-1 split, all 3 present — proves the Op.in query genuinely
    // threads BOTH leadership ids through (a bug that dropped lead-b's id
    // from the IN-list would silently under-return staff-b1 only, which a
    // 1-vs-1 split couldn't have caught).
    expect(result.staff.map((a) => a.id).sort()).toEqual(['staff-a1', 'staff-a2', 'staff-b1']);
  });

  it('a human with zero AI Leadership agents returns both arrays empty (no further queries)', async () => {
    mockAgentFindAll.mockResolvedValue([]);

    const result = await resolveHumanDownstreamAgents('human-with-none');

    expect(result.leadership).toEqual([]);
    expect(result.staff).toEqual([]);
    expect(mockAgentFindAll).toHaveBeenCalledTimes(1); // stops after the empty leadership level, never queries a 2nd level
  });

  it('stops walking once a level returns empty (a leadership agent with zero staff under it)', async () => {
    const LEAD = { id: 'lead-only', reports_to_type: 'human', reports_to_id: 'human-2' };
    mockAgentFindAll.mockImplementation(async ({ where }: any) => {
      if (where.reports_to_type === 'human') return [LEAD];
      return [];
    });

    const result = await resolveHumanDownstreamAgents('human-2');

    expect(result.leadership).toEqual([LEAD]);
    expect(result.staff).toEqual([]);
    expect(mockAgentFindAll).toHaveBeenCalledTimes(2); // 1 leadership query + 1 empty staff query, then stops
  });
});

describe('isAgentInHumanDownstream', () => {
  it('returns true for a real direct AI Leadership agent', async () => {
    mockAgentFindAll.mockImplementation(async ({ where }: any) => {
      if (where.reports_to_type === 'human') return [{ id: 'lead-x', reports_to_type: 'human', reports_to_id: 'human-3' }];
      return [];
    });

    await expect(isAgentInHumanDownstream('human-3', 'lead-x')).resolves.toBe(true);
  });

  it('returns true for a downstream AI Staff agent reporting through a leadership agent', async () => {
    mockAgentFindAll.mockImplementation(async ({ where }: any) => {
      if (where.reports_to_type === 'human') return [{ id: 'lead-x', reports_to_type: 'human', reports_to_id: 'human-3' }];
      if (where.reports_to_type === 'agent') return [{ id: 'staff-x', reports_to_type: 'agent', reports_to_id: 'lead-x' }];
      return [];
    });

    await expect(isAgentInHumanDownstream('human-3', 'staff-x')).resolves.toBe(true);
  });

  it('CROSS-HIERARCHY: returns false for an agent belonging to a DIFFERENT human entirely — the real authorization boundary', async () => {
    // A real two-human fixture, not an empty-array shortcut: human-3 has its
    // own leadership/staff, human-4 ALSO has its own (different) leadership/
    // staff. The mock genuinely filters by the queried reports_to_id, so a
    // regression that ignored orgMemberId (e.g. always returning every
    // leadership row regardless of who owns it) would make this test fail —
    // an empty-mock shortcut could not have caught that.
    const HUMAN_3_LEAD = { id: 'lead-human3', reports_to_type: 'human', reports_to_id: 'human-3' };
    const HUMAN_4_LEAD = { id: 'lead-human4', reports_to_type: 'human', reports_to_id: 'human-4' };
    const HUMAN_4_STAFF = { id: 'staff-human4', reports_to_type: 'agent', reports_to_id: 'lead-human4' };

    mockAgentFindAll.mockImplementation(async ({ where }: any) => {
      if (where.reports_to_type === 'human') {
        return [HUMAN_3_LEAD, HUMAN_4_LEAD].filter((l) => l.reports_to_id === where.reports_to_id);
      }
      if (where.reports_to_type === 'agent') {
        const ids: string[] = where.reports_to_id[Op.in];
        return [HUMAN_4_STAFF].filter((s) => ids.includes(s.reports_to_id));
      }
      return [];
    });

    // human-4's own leadership AND staff agent ARE genuinely in human-4's
    // downstream (sanity check the fixture itself is real, not a no-op).
    await expect(isAgentInHumanDownstream('human-4', 'lead-human4')).resolves.toBe(true);
    await expect(isAgentInHumanDownstream('human-4', 'staff-human4')).resolves.toBe(true);

    // The actual authorization boundary: human-3 must NEVER be authorized
    // for human-4's leadership agent OR human-4's staff agent, even though
    // both are real, valid, currently-existing hierarchy agents — just not
    // human-3's.
    await expect(isAgentInHumanDownstream('human-3', 'lead-human4')).resolves.toBe(false);
    await expect(isAgentInHumanDownstream('human-3', 'staff-human4')).resolves.toBe(false);
  });
});

// Track B (2026-09-22) — the "My team" scoping filter. Pure, synchronous,
// no mocks needed: every fixture below is a plain object literal.
describe('scopeOrgChartToHuman', () => {
  function human(overrides: Partial<OrgChartHuman> = {}): OrgChartHuman {
    return {
      id: 'human-1', name: 'Taiwo', email: 'taiwo@colaberry.com', team: 'Operations',
      department: 'Operations', role: 'manager', leadership_agent_ids: [], staff_count: 0,
      task: null, hierarchy_color: '#123456', ...overrides,
    };
  }
  function leadershipAgent(overrides: Partial<OrgChartLeadershipAgent> = {}): OrgChartLeadershipAgent {
    return {
      id: 'lead-1', agent_name: 'lead_1', display_name: 'Lead One', reports_to_human_id: 'human-1',
      reports_to_summary: 'Reports to: Taiwo', staff_ids: [], open_ticket_count: 0,
      hierarchy_color: '#123456', enabled: true, ...overrides,
    };
  }
  function staffAgent(overrides: Partial<OrgChartStaffAgent> = {}): OrgChartStaffAgent {
    return {
      id: 'staff-1', agent_name: 'staff_1', display_name: 'Staff One', reports_to_agent_id: 'lead-1',
      reports_to_summary: 'Reports to: Lead One', open_ticket_count: 0, hierarchy_color: '#123456',
      enabled: true, ...overrides,
    };
  }
  function chart(overrides: Partial<OrgChartResponse> = {}): OrgChartResponse {
    return {
      organization: { id: 'org-1', name: 'Colaberry' },
      humans: [human()], leadership: [], staff: [], unresolved: [],
      generated_at: new Date('2026-09-22T00:00:00Z'), ...overrides,
    };
  }

  it('returns exactly this human, their real leadership, and their real staff — not more, not fewer', () => {
    const otherHuman = human({ id: 'human-2', name: 'Kes', email: 'kes@colaberry.com' });
    const myLead = leadershipAgent({ id: 'lead-mine' });
    const otherLead = leadershipAgent({ id: 'lead-other', reports_to_human_id: 'human-2' });
    const myStaff = staffAgent({ id: 'staff-mine', reports_to_agent_id: 'lead-mine' });
    const otherStaff = staffAgent({ id: 'staff-other', reports_to_agent_id: 'lead-other' });
    const c = chart({
      humans: [human(), otherHuman],
      leadership: [myLead, otherLead],
      staff: [myStaff, otherStaff],
    });

    const result = scopeOrgChartToHuman(c, { id: 'human-1' } as OrgMember, {
      leadership: [{ id: 'lead-mine' }] as AiAgent[],
      staff: [{ id: 'staff-mine' }] as AiAgent[],
    });

    expect(result.humans.map((h) => h.id)).toEqual(['human-1']);
    expect(result.leadership.map((l) => l.id)).toEqual(['lead-mine']);
    expect(result.staff.map((s) => s.id)).toEqual(['staff-mine']);
    expect(result.unresolved).toEqual([]);
    expect(result.organization).toEqual(c.organization);
  });

  // The real bug caught in plan-audit before any code was written: an
  // individual-contributor agent (no subordinates of its own) is level-1 in
  // resolveHumanDownstreamAgents()'s structural walk (so it lands in
  // downstream.leadership), but orgChartService.ts buckets it into
  // chart.staff (not chart.leadership) since it has no subordinates. A
  // filter that checked chart.leadership against downstream.leadership and
  // chart.staff against downstream.staff as two SEPARATE sets would drop
  // this agent from BOTH output arrays. The real shape: Taiwo's direct
  // reports FinanceIntelligenceArchitect/StudentSuccessArchitect.
  it('includes an individual-contributor direct report in the scoped staff array, even though it is level-1 (structural "leadership") and has no subordinates of its own', () => {
    const financeArchitect = staffAgent({
      id: 'finance-architect', display_name: 'FinanceIntelligenceArchitect',
      reports_to_agent_id: null, reports_to_summary: 'Reports to: Taiwo',
    });
    const c = chart({ leadership: [], staff: [financeArchitect] });

    const result = scopeOrgChartToHuman(c, { id: 'human-1' } as OrgMember, {
      // Structural walk: this agent is level-1 (reports_to_type='human'), so
      // resolveHumanDownstreamAgents() puts it in `leadership`, not `staff` —
      // exactly the real, current shape.
      leadership: [{ id: 'finance-architect' }] as AiAgent[],
      staff: [] as AiAgent[],
    });

    expect(result.staff.map((s) => s.id)).toEqual(['finance-architect']);
    expect(result.leadership).toEqual([]); // never in chart.leadership — orgChartService.ts put it in chart.staff
  });

  it('a human with zero downstream returns leadership/staff/unresolved empty, but the human row itself still present', () => {
    const c = chart();

    const result = scopeOrgChartToHuman(c, { id: 'human-1' } as OrgMember, { leadership: [], staff: [] });

    expect(result.humans.map((h) => h.id)).toEqual(['human-1']);
    expect(result.leadership).toEqual([]);
    expect(result.staff).toEqual([]);
    expect(result.unresolved).toEqual([]);
  });

  it('a human not present in chart.humans returns an empty humans array too, never a crash', () => {
    const c = chart({ humans: [] });

    const result = scopeOrgChartToHuman(c, { id: 'human-not-in-chart' } as OrgMember, { leadership: [], staff: [] });

    expect(result.humans).toEqual([]);
  });

  it('unresolved is always empty in the scoped view, regardless of the unscoped chart', () => {
    const c = chart({ unresolved: [{ id: 'ghost-1', agent_name: 'ghost', reason: 'dangling chain' }] });

    const result = scopeOrgChartToHuman(c, { id: 'human-1' } as OrgMember, { leadership: [], staff: [] });

    expect(result.unresolved).toEqual([]);
  });
});

describe('emptyOrgChartResponse', () => {
  it('returns the same organization/generated_at with every array empty — an honest empty state, not an error', () => {
    const c: OrgChartResponse = {
      organization: { id: 'org-1', name: 'Colaberry' },
      humans: [{ id: 'human-1' } as OrgChartHuman],
      leadership: [{ id: 'lead-1' } as OrgChartLeadershipAgent],
      staff: [{ id: 'staff-1' } as OrgChartStaffAgent],
      unresolved: [{ id: 'ghost-1', agent_name: 'ghost', reason: 'dangling chain' }],
      generated_at: new Date('2026-09-22T00:00:00Z'),
    };

    const result = emptyOrgChartResponse(c);

    expect(result).toEqual({
      organization: c.organization,
      humans: [], leadership: [], staff: [], unresolved: [],
      generated_at: c.generated_at,
    });
  });
});
