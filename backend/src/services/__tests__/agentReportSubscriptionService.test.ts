/**
 * agentReportSubscriptionService — AI Workforce Management, Checkpoint D.
 * Pins the honest timezone resolution (explicit input > creator's real
 * OrgMember.timezone > repo-wide default — never fabricated), the honest
 * empty-subscriptions state, and the idempotent-in-effect enable/disable
 * update.
 */
const mockAiAgentFindByPk = jest.fn();
jest.mock('../../models/AiAgent', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockAiAgentFindByPk(...a) },
}));

const mockOrgMemberFindByPk = jest.fn();
jest.mock('../../models/OrgMember', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockOrgMemberFindByPk(...a) },
}));

const mockSubCreate = jest.fn();
const mockSubFindAll = jest.fn();
const mockSubFindByPk = jest.fn();
jest.mock('../../models/AgentReportSubscription', () => ({
  __esModule: true,
  default: {
    create: (...a: any[]) => mockSubCreate(...a),
    findAll: (...a: any[]) => mockSubFindAll(...a),
    findByPk: (...a: any[]) => mockSubFindByPk(...a),
  },
}));

import {
  createReportSubscription,
  listReportSubscriptions,
  updateReportSubscription,
  AgentNotFoundError,
  ReportSubscriptionNotFoundError,
} from '../agentReportSubscriptionService';

const AGENT = { id: 'agent-1' };

beforeEach(() => {
  jest.clearAllMocks();
  mockAiAgentFindByPk.mockResolvedValue(AGENT);
});

function fakeRow(overrides: any = {}) {
  return {
    id: 'sub-1',
    agent_id: 'agent-1',
    content_scope: ['cost'],
    cadence: 'daily',
    delivery_hour_local: 8,
    timezone: 'America/Chicago',
    channel: 'email',
    enabled: true,
    created_by_email: 'manager@colaberry.com',
    created_at: new Date(),
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('createReportSubscription — honest timezone resolution', () => {
  it('happy path: an explicit timezone in the input wins over everything else', async () => {
    mockSubCreate.mockResolvedValue(fakeRow({ timezone: 'America/New_York' }));

    await createReportSubscription('agent-1', 'org-member-1', 'manager@colaberry.com', ['cost'], 'daily', 8, 'America/New_York');

    expect(mockOrgMemberFindByPk).not.toHaveBeenCalled();
    expect(mockSubCreate).toHaveBeenCalledWith(expect.objectContaining({ timezone: 'America/New_York' }));
  });

  it("happy path: with no explicit timezone, the creator's real OrgMember.timezone is used", async () => {
    mockOrgMemberFindByPk.mockResolvedValue({ id: 'org-member-1', timezone: 'America/Los_Angeles' });
    mockSubCreate.mockResolvedValue(fakeRow({ timezone: 'America/Los_Angeles' }));

    await createReportSubscription('agent-1', 'org-member-1', 'manager@colaberry.com', ['cost'], 'daily', 8);

    expect(mockOrgMemberFindByPk).toHaveBeenCalledWith('org-member-1');
    expect(mockSubCreate).toHaveBeenCalledWith(expect.objectContaining({ timezone: 'America/Los_Angeles' }));
  });

  it('boundary: a super_admin creator (no org_member_id) with no explicit timezone gets the real repo-wide default, not a fabricated value', async () => {
    mockSubCreate.mockResolvedValue(fakeRow());

    await createReportSubscription('agent-1', null, 'ali@colaberry.com', ['cost'], 'daily', 8);

    expect(mockOrgMemberFindByPk).not.toHaveBeenCalled();
    expect(mockSubCreate).toHaveBeenCalledWith(expect.objectContaining({ timezone: 'America/Chicago' }));
  });

  it('happy path: content_scope and channel pass through to the row as given', async () => {
    mockSubCreate.mockResolvedValue(fakeRow({ content_scope: ['cost', 'activity', 'trust', 'tickets'] }));

    await createReportSubscription('agent-1', null, 'manager@colaberry.com', ['cost', 'activity', 'trust', 'tickets'], 'weekly', 9);

    expect(mockSubCreate).toHaveBeenCalledWith(
      expect.objectContaining({ content_scope: ['cost', 'activity', 'trust', 'tickets'], cadence: 'weekly', channel: 'email', enabled: true })
    );
  });

  it('BREAK: a nonexistent agent throws AgentNotFoundError and never writes', async () => {
    mockAiAgentFindByPk.mockResolvedValue(null);

    await expect(createReportSubscription('does-not-exist', null, 'manager@colaberry.com', ['cost'], 'daily', 8)).rejects.toBeInstanceOf(
      AgentNotFoundError
    );
    expect(mockSubCreate).not.toHaveBeenCalled();
  });
});

describe('listReportSubscriptions', () => {
  it('boundary: a real agent with zero subscriptions returns an empty array, not an error', async () => {
    mockSubFindAll.mockResolvedValue([]);

    const result = await listReportSubscriptions('agent-1');

    expect(result).toEqual([]);
  });

  it('boundary: a nonexistent agent returns null', async () => {
    mockAiAgentFindByPk.mockResolvedValue(null);

    const result = await listReportSubscriptions('does-not-exist');

    expect(result).toBeNull();
    expect(mockSubFindAll).not.toHaveBeenCalled();
  });

  it('returns both enabled and disabled subscriptions — a paused subscription stays visible to its owner', async () => {
    mockSubFindAll.mockResolvedValue([fakeRow({ enabled: false })]);

    const result = await listReportSubscriptions('agent-1');

    expect(result).toHaveLength(1);
    expect(result![0].enabled).toBe(false);
  });
});

describe('updateReportSubscription', () => {
  it('happy path: disables an active subscription', async () => {
    const row = fakeRow({ enabled: true });
    mockSubFindByPk.mockResolvedValue(row);

    await updateReportSubscription('sub-1', { enabled: false });

    expect(row.update).toHaveBeenCalledWith({ enabled: false });
  });

  it('idempotency-in-effect: setting enabled to its current value still writes the same state, never errors', async () => {
    const row = fakeRow({ enabled: false });
    mockSubFindByPk.mockResolvedValue(row);

    await updateReportSubscription('sub-1', { enabled: false });

    expect(row.update).toHaveBeenCalledWith({ enabled: false });
  });

  it('an empty update patch does not call update at all', async () => {
    const row = fakeRow();
    mockSubFindByPk.mockResolvedValue(row);

    await updateReportSubscription('sub-1', {});

    expect(row.update).not.toHaveBeenCalled();
  });

  it('BREAK: a nonexistent subscription throws ReportSubscriptionNotFoundError', async () => {
    mockSubFindByPk.mockResolvedValue(null);

    await expect(updateReportSubscription('does-not-exist', { enabled: false })).rejects.toBeInstanceOf(ReportSubscriptionNotFoundError);
  });
});
