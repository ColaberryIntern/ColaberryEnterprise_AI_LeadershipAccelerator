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
jest.mock('../liveAgentsService', () => ({ OPEN_TICKET_STATUS_FILTER: { [Op.notIn]: ['done', 'cancelled'] } }));
jest.mock('../orgChartColorAssignment', () => ({ assignHierarchyColors: () => ({ humanColors: new Map(), leadershipColors: new Map(), staffColors: new Map() }) }));

import OrgMember from '../../../models/OrgMember';
import AiAgent from '../../../models/AiAgent';
import {
  updateOrgMemberTeam,
  OrgMemberNotFoundError,
  InvalidDepartmentError,
  resolveHumanDownstreamAgents,
  isAgentInHumanDownstream,
} from '../orgChartHierarchyService';

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
