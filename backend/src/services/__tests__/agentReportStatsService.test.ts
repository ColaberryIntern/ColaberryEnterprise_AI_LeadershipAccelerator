/**
 * Report redesign (2026-10-02) — the new report-specific data queries. Each
 * reuses a real, already-proven primitive (buildCreatorIdMatchList,
 * OPEN_TICKET_STATUS_FILTER, computeNeedsReply/computeStatusBucket) rather
 * than re-deriving matching logic, so these tests focus on the NEW part:
 * the query shape and the honest-aggregation behavior, not re-testing those
 * primitives' own already-covered logic.
 */
// liveAgentsService.ts (imported only for the plain OPEN_TICKET_STATUS_FILTER
// constant) itself imports the 215-model models/index.ts barrel at module
// scope, which runs the real cross-model association graph immediately —
// e.g. `Cohort.hasMany(Enrollment, ...)` — and crashes the moment ANY of
// those real models is mocked here as a plain object (Enrollment, in this
// file's case). Mocking liveAgentsService.ts wholesale (just the one real
// constant it needs) avoids ever loading that barrel at all, the same
// pattern already established elsewhere this session for this exact gotcha.
jest.mock('../workforce/liveAgentsService', () => ({ OPEN_TICKET_STATUS_FILTER: { [require('sequelize').Op.notIn]: ['done', 'cancelled'] } }));
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../models/AiAgent', () => ({ findByPk: jest.fn() }));
jest.mock('../../models/AdminUser', () => ({ findOne: jest.fn() }));
jest.mock('../../models/Ticket', () => ({ findAll: jest.fn() }));
jest.mock('../../models/TicketActivity', () => ({ findAll: jest.fn() }));
jest.mock('../../models/OrgMember', () => ({ findOne: jest.fn() }));
jest.mock('../../models/Enrollment', () => ({ findByPk: jest.fn() }));
jest.mock('../agentBlueprint/legacyCreatorAliases', () => ({ buildCreatorIdMatchList: jest.fn() }));

import { sequelize } from '../../config/database';
import AiAgent from '../../models/AiAgent';
import AdminUser from '../../models/AdminUser';
import Ticket from '../../models/Ticket';
import TicketActivity from '../../models/TicketActivity';
import OrgMember from '../../models/OrgMember';
import Enrollment from '../../models/Enrollment';
import { buildCreatorIdMatchList } from '../agentBlueprint/legacyCreatorAliases';
import {
  resolveAgentIdentity, getOpenTicketBreakdownByType, getTicketFollowUpCounts,
  getTopAuthorizationReasons, getTokensAndModel, getErrorCount, resolveRecipientDisplayName,
} from '../agentReportStatsService';

const mockQuery = sequelize.query as unknown as jest.Mock;
const mockAiAgentFindByPk = AiAgent.findByPk as unknown as jest.Mock;
const mockAdminUserFindOne = AdminUser.findOne as unknown as jest.Mock;
const mockTicketFindAll = Ticket.findAll as unknown as jest.Mock;
const mockActivityFindAll = TicketActivity.findAll as unknown as jest.Mock;
const mockOrgMemberFindOne = OrgMember.findOne as unknown as jest.Mock;
const mockEnrollmentFindByPk = Enrollment.findByPk as unknown as jest.Mock;
const mockMatchList = buildCreatorIdMatchList as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockMatchList.mockReturnValue(['admin-1']);
});

describe('resolveAgentIdentity', () => {
  it('happy path: resolves both the agent and its AdminUser', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockAdminUserFindOne.mockResolvedValue({ id: 'admin-1' });

    const result = await resolveAgentIdentity('agent-1');

    expect(result).toEqual({ agent: { id: 'agent-1' }, adminUser: { id: 'admin-1' } });
  });

  it('boundary: no such agent -> null, never a crash', async () => {
    mockAiAgentFindByPk.mockResolvedValue(null);
    const result = await resolveAgentIdentity('does-not-exist');
    expect(result).toBeNull();
    expect(mockAdminUserFindOne).not.toHaveBeenCalled();
  });

  it('boundary: agent exists but has no linked AdminUser -> adminUser: null, not thrown', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockAdminUserFindOne.mockResolvedValue(null);
    const result = await resolveAgentIdentity('agent-1');
    expect(result).toEqual({ agent: { id: 'agent-1' }, adminUser: null });
  });
});

describe('getOpenTicketBreakdownByType', () => {
  it('groups open tickets by type, honestly omitting any type with zero open tickets', async () => {
    mockTicketFindAll.mockResolvedValue([{ type: 'student_support' }, { type: 'student_support' }, { type: 'reese_autonomous_outreach' }]);

    const result = await getOpenTicketBreakdownByType('admin-1', {} as any);

    expect(result).toEqual(expect.arrayContaining([
      { type: 'student_support', count: 2 },
      { type: 'reese_autonomous_outreach', count: 1 },
    ]));
  });

  it('boundary: zero open tickets -> empty array, never fabricated', async () => {
    mockTicketFindAll.mockResolvedValue([]);
    const result = await getOpenTicketBreakdownByType('admin-1', {} as any);
    expect(result).toEqual([]);
  });
});

describe('getTicketFollowUpCounts', () => {
  it('counts needs-reply and past-due using the real, unbounded ticketStatusBucket derivation', async () => {
    const now = new Date('2026-10-02T12:00:00Z');
    mockTicketFindAll.mockResolvedValue([
      { id: 't1', status: 'todo', due_date: '2026-09-01' }, // overdue
      { id: 't2', status: 'todo', due_date: null }, // open, check activity
      { id: 't3', status: 'in_review', due_date: null }, // ready_to_verify, not needs_reply/overdue
    ]);
    mockActivityFindAll.mockResolvedValue([
      { ticket_id: 't2', actor_id: 'student-1', created_at: now }, // someone other than the agent spoke last
    ]);

    const result = await getTicketFollowUpCounts('admin-1', {} as any);

    expect(result.pastDue).toBe(1);
    expect(result.needsReply).toBe(1); // t2: latest actor is not in the agent's own match list
  });

  it('boundary: zero open tickets -> zero counts, no TicketActivity query at all', async () => {
    mockTicketFindAll.mockResolvedValue([]);
    const result = await getTicketFollowUpCounts('admin-1', {} as any);
    expect(result).toEqual({ needsReply: 0, pastDue: 0 });
    expect(mockActivityFindAll).not.toHaveBeenCalled();
  });
});

describe('getTopAuthorizationReasons', () => {
  it('returns the top (action, reason) pairs, filtering out any null action/reason', async () => {
    mockQuery.mockResolvedValue([
      { action: 'reese_dm_reply', reason: 'requires_approval:high_risk_tier', n: 20 },
      { action: null, reason: null, n: 1 },
    ]);

    const result = await getTopAuthorizationReasons('agent-1', 'Reese', 30);

    expect(result).toEqual([{ action: 'reese_dm_reply', reason: 'requires_approval:high_risk_tier', count: 20 }]);
  });

  it('boundary: no authorization events yet -> empty array, never fabricated', async () => {
    mockQuery.mockResolvedValue([]);
    const result = await getTopAuthorizationReasons('agent-1', 'Reese', 30);
    expect(result).toEqual([]);
  });
});

describe('getTokensAndModel', () => {
  it('happy path: real token sum and the real most-used model', async () => {
    mockQuery.mockResolvedValueOnce([{ total_tokens: 48210 }]).mockResolvedValueOnce([{ model: 'gpt-4o-mini', n: 100 }]);

    const result = await getTokensAndModel('agent-1', 'Reese', 30);

    expect(result).toEqual({ totalTokens: 48210, topModel: 'gpt-4o-mini' });
  });

  it('boundary: no events in the window -> 0 tokens, null model, never fabricated', async () => {
    mockQuery.mockResolvedValueOnce([{ total_tokens: 0 }]).mockResolvedValueOnce([]);
    const result = await getTokensAndModel('agent-1', 'Reese', 30);
    expect(result).toEqual({ totalTokens: 0, topModel: null });
  });
});

describe('getErrorCount', () => {
  it('returns the real 30-day-scoped failure count', async () => {
    mockQuery.mockResolvedValue([{ n: 3 }]);
    const result = await getErrorCount('agent-1', 'Reese', 30);
    expect(result).toBe(3);
  });
});

describe('resolveRecipientDisplayName', () => {
  it('happy path: real full_name via the OrgMember -> Enrollment chain', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ enrollment_id: 'enr-1' });
    mockEnrollmentFindByPk.mockResolvedValue({ full_name: 'Ali Muwwakkil' });

    const result = await resolveRecipientDisplayName('ali@colaberry.com');

    expect(result).toBe('Ali Muwwakkil');
  });

  it('boundary: no OrgMember row -> falls back to the email, never a crash', async () => {
    mockOrgMemberFindOne.mockResolvedValue(null);
    const result = await resolveRecipientDisplayName('unknown@colaberry.com');
    expect(result).toBe('unknown@colaberry.com');
  });

  it('boundary: OrgMember exists but no enrollment/full_name -> falls back to the email', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ enrollment_id: null });
    const result = await resolveRecipientDisplayName('ali@colaberry.com');
    expect(result).toBe('ali@colaberry.com');
  });
});
