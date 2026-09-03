/**
 * agentReportRunService — AI Workforce Management, Checkpoint D. Pins the
 * real per-subscriber timezone math (never the server's own clock), the
 * DB-unique-constraint idempotency guard (a race/retry is a real `skipped`,
 * never a duplicate send or a thrown error), and honest content rendering
 * from a single real getAgentDetail() call.
 *
 * Fixture dates are verified real facts (checked with node -e against the
 * actual Intl/ICU build this environment uses), not assumed:
 *   2026-08-31T18:30:00Z -> America/Chicago: Mon 2026-08-31, hour 13
 *   2026-09-02T15:00:00Z -> America/Chicago: Wed 2026-09-02, hour 10 (same week as above)
 *   2026-08-27T10:00:00Z -> America/Chicago: Thu 2026-08-27, hour 05 (prior week; Monday = 2026-08-24)
 */
const mockSubFindAll = jest.fn();
const mockSubCreate = jest.fn(); // unused here but keeps the mock shape consistent
jest.mock('../../models/AgentReportSubscription', () => ({
  __esModule: true,
  default: { findAll: (...a: any[]) => mockSubFindAll(...a), create: (...a: any[]) => mockSubCreate(...a) },
}));

const mockRunCreate = jest.fn();
const mockRunFindAll = jest.fn();
jest.mock('../../models/AgentReportRun', () => ({
  __esModule: true,
  default: { create: (...a: any[]) => mockRunCreate(...a), findAll: (...a: any[]) => mockRunFindAll(...a) },
}));

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

const mockGetAgentDetail = jest.fn();
jest.mock('../reese/agentDetailService', () => ({
  getAgentDetail: (...a: any[]) => mockGetAgentDetail(...a),
}));

const mockSendRawEmail = jest.fn();
jest.mock('../emailService', () => ({
  sendRawEmail: (...a: any[]) => mockSendRawEmail(...a),
}));

import { UniqueConstraintError } from 'sequelize';
import { computeLocalHour, computePeriodKey, renderReportContent, dispatchDueReportRuns, listReportRunsForAgent } from '../agentReportRunService';

const CHICAGO_MONDAY = new Date('2026-08-31T18:30:00Z'); // Chicago: Mon 2026-08-31, hour 13
const CHICAGO_WED_SAME_WEEK = new Date('2026-09-02T15:00:00Z'); // Chicago: Wed 2026-09-02, hour 10
const CHICAGO_THU_PRIOR_WEEK = new Date('2026-08-27T10:00:00Z'); // Chicago: Thu 2026-08-27, hour 05

describe('computeLocalHour — real per-timezone wall clock, never the server clock', () => {
  it('reports the real local hour for a real timezone', () => {
    expect(computeLocalHour(CHICAGO_MONDAY, 'America/Chicago')).toBe(13);
    expect(computeLocalHour(CHICAGO_WED_SAME_WEEK, 'America/Chicago')).toBe(10);
  });
});

describe('computePeriodKey', () => {
  it('daily: uses the real local calendar date', () => {
    expect(computePeriodKey('daily', CHICAGO_MONDAY, 'America/Chicago')).toBe('2026-08-31');
    expect(computePeriodKey('daily', CHICAGO_WED_SAME_WEEK, 'America/Chicago')).toBe('2026-09-02');
  });

  it('weekly: two real dates in the same calendar week produce the same key', () => {
    const mondayKey = computePeriodKey('weekly', CHICAGO_MONDAY, 'America/Chicago');
    const wednesdayKey = computePeriodKey('weekly', CHICAGO_WED_SAME_WEEK, 'America/Chicago');
    expect(mondayKey).toBe('2026-08-31');
    expect(wednesdayKey).toBe('2026-08-31');
  });

  it('weekly: a date in the prior real calendar week produces a different key', () => {
    expect(computePeriodKey('weekly', CHICAGO_THU_PRIOR_WEEK, 'America/Chicago')).toBe('2026-08-24');
  });
});

const AGENT_DETAIL = {
  agent: { agent_name: 'CoryBrain' },
  cost_summary: { cost_usd: 12.5, runs: 40 },
  trust_contract: { run_count: 40, error_count: 2, last_run_at: new Date('2026-08-30T00:00:00Z'), avg_duration_ms: 1200, last_activity_at: new Date('2026-08-30T00:00:00Z') },
  authorization_summary: { window_days: 30, total: 100, allow: 90, approval: 8, block: 2, enforced_count: 0 },
  open_ticket_count: 3,
  ticket_breakdown: [{ type: 'follow_up', count: 3, by_signal: [] }],
};

describe('renderReportContent — honest, section-scoped, single real data source', () => {
  it('happy path: includes only the requested sections', () => {
    mockGetAgentDetail.mockResolvedValueOnce(AGENT_DETAIL);
    return renderReportContent('agent-1', ['cost', 'tickets']).then((rendered) => {
      expect(rendered!.snapshot.cost).toEqual(AGENT_DETAIL.cost_summary);
      expect(rendered!.snapshot.tickets).toEqual({ openTicketCount: 3, breakdown: AGENT_DETAIL.ticket_breakdown });
      expect(rendered!.snapshot.activity).toBeUndefined();
      expect(rendered!.snapshot.trust).toBeUndefined();
      expect(rendered!.html).toContain('Cost');
      expect(rendered!.html).toContain('Tickets');
      expect(rendered!.html).not.toContain('Activity');
    });
  });

  it('boundary: a null cost_summary (no tracked cost yet) renders honestly, not as an error', async () => {
    mockGetAgentDetail.mockResolvedValueOnce({ ...AGENT_DETAIL, cost_summary: null });
    const rendered = await renderReportContent('agent-1', ['cost']);
    expect(rendered!.snapshot.cost).toBeNull();
    expect(rendered!.text).toContain('No tracked cost');
  });

  it('boundary: a nonexistent agent returns null, not a crash', async () => {
    mockGetAgentDetail.mockResolvedValueOnce(null);
    const rendered = await renderReportContent('does-not-exist', ['cost']);
    expect(rendered).toBeNull();
  });
});

function fakeSubscription(overrides: any = {}) {
  return {
    id: 'sub-1',
    agent_id: 'agent-1',
    subscriber_org_member_id: 'org-member-1',
    created_by_email: 'creator@colaberry.com',
    content_scope: ['cost'],
    cadence: 'daily',
    delivery_hour_local: 13,
    timezone: 'America/Chicago',
    ...overrides,
  };
}

describe('dispatchDueReportRuns', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAgentDetail.mockResolvedValue(AGENT_DETAIL);
    mockOrgMemberFindByPk.mockResolvedValue({ email: 'manager@colaberry.com' });
    mockSendRawEmail.mockResolvedValue({ ok: true, messageId: 'msg-1' });
  });

  it('happy path: a subscription whose local hour matches gets dispatched and marked sent', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    mockSubFindAll.mockResolvedValue([fakeSubscription()]);
    mockRunCreate.mockResolvedValue({ update });

    const result = await dispatchDueReportRuns(CHICAGO_MONDAY);

    expect(result).toEqual({ dispatched: 1, skipped: 0, failed: 0 });
    expect(mockSendRawEmail).toHaveBeenCalledWith(expect.objectContaining({ to: ['manager@colaberry.com'] }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ delivery_status: 'sent' }));
  });

  it('skip: a subscription whose local hour does not match is never dispatched', async () => {
    mockSubFindAll.mockResolvedValue([fakeSubscription({ delivery_hour_local: 8 })]);

    const result = await dispatchDueReportRuns(CHICAGO_MONDAY);

    expect(result).toEqual({ dispatched: 0, skipped: 1, failed: 0 });
    expect(mockRunCreate).not.toHaveBeenCalled();
    expect(mockSendRawEmail).not.toHaveBeenCalled();
  });

  it('idempotency: a unique-constraint violation on create (already dispatched this period) is a real skip, never a thrown error or a duplicate send', async () => {
    mockSubFindAll.mockResolvedValue([fakeSubscription()]);
    mockRunCreate.mockRejectedValue(new UniqueConstraintError({ message: 'duplicate' } as any));

    const result = await dispatchDueReportRuns(CHICAGO_MONDAY);

    expect(result).toEqual({ dispatched: 0, skipped: 1, failed: 0 });
    expect(mockSendRawEmail).not.toHaveBeenCalled();
  });

  it('BREAK: a send failure (sendRawEmail ok:false) marks the run failed with the real error, not silently', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    mockSubFindAll.mockResolvedValue([fakeSubscription()]);
    mockRunCreate.mockResolvedValue({ update });
    mockSendRawEmail.mockResolvedValue({ ok: false, error: 'Mandrill rejected' });

    const result = await dispatchDueReportRuns(CHICAGO_MONDAY);

    expect(result).toEqual({ dispatched: 0, skipped: 0, failed: 1 });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ delivery_status: 'failed', error_message: 'Mandrill rejected' }));
  });

  it('BREAK: the agent no longer exists — a real failed run, never a crash or a silent skip', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    mockSubFindAll.mockResolvedValue([fakeSubscription()]);
    mockRunCreate.mockResolvedValue({ update });
    mockGetAgentDetail.mockResolvedValueOnce(null);

    const result = await dispatchDueReportRuns(CHICAGO_MONDAY);

    expect(result).toEqual({ dispatched: 0, skipped: 0, failed: 1 });
    expect(mockSendRawEmail).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ delivery_status: 'failed' }));
  });

  it('recipient resolution: falls back to created_by_email when there is no linked OrgMember (super_admin subscriber)', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    mockSubFindAll.mockResolvedValue([fakeSubscription({ subscriber_org_member_id: null })]);
    mockRunCreate.mockResolvedValue({ update });

    await dispatchDueReportRuns(CHICAGO_MONDAY);

    expect(mockOrgMemberFindByPk).not.toHaveBeenCalled();
    expect(mockSendRawEmail).toHaveBeenCalledWith(expect.objectContaining({ to: ['creator@colaberry.com'] }));
  });
});

function fakeRun(overrides: Partial<{ id: string; subscription_id: string; period_key: string; generated_at: Date; delivered_at: Date | null; delivery_status: string; error_message: string | null }> = {}) {
  return {
    id: 'run-1', subscription_id: 'sub-1', period_key: '2026-09-01',
    generated_at: new Date('2026-09-01T13:00:00Z'), delivered_at: new Date('2026-09-01T13:00:05Z'),
    delivery_status: 'sent', error_message: null,
    ...overrides,
  };
}

describe('listReportRunsForAgent — delivery history (Checkpoint C, Reports slice)', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('boundary: a nonexistent agent returns null', async () => {
    mockAiAgentFindByPk.mockResolvedValue(null);
    const result = await listReportRunsForAgent('does-not-exist');
    expect(result).toBeNull();
    expect(mockSubFindAll).not.toHaveBeenCalled();
  });

  it('boundary: a real agent with zero subscriptions returns real zeros, never a fabricated rate', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockSubFindAll.mockResolvedValue([]);

    const result = await listReportRunsForAgent('agent-1');

    expect(result).toEqual({ windowDays: 30, runs: [], sent: 0, failed: 0, pending: 0, successRatePct: null });
    expect(mockRunFindAll).not.toHaveBeenCalled();
  });

  it('boundary: subscriptions exist but have never run — successRatePct is null, never a fabricated 100%', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockSubFindAll.mockResolvedValue([{ id: 'sub-1' }]);
    mockRunFindAll.mockResolvedValue([]);

    const result = await listReportRunsForAgent('agent-1');

    expect(result?.successRatePct).toBeNull();
    expect(result?.sent).toBe(0);
    expect(result?.failed).toBe(0);
  });

  it('honest math: successRatePct is sent/(sent+failed), pending rows counted separately and never folded into either side', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockSubFindAll.mockResolvedValue([{ id: 'sub-1' }]);
    mockRunFindAll.mockResolvedValue([
      fakeRun({ id: 'r1', delivery_status: 'sent' }),
      fakeRun({ id: 'r2', delivery_status: 'sent' }),
      fakeRun({ id: 'r3', delivery_status: 'failed', error_message: 'Mandrill timeout' }),
      fakeRun({ id: 'r4', delivery_status: 'pending', delivered_at: null }),
    ]);

    const result = await listReportRunsForAgent('agent-1');

    expect(result?.sent).toBe(2);
    expect(result?.failed).toBe(1);
    expect(result?.pending).toBe(1);
    expect(result?.successRatePct).toBeCloseTo(66.7, 1); // 2/3, not 2/4
    expect(result?.runs).toHaveLength(4);
  });

  it('never counts a failed run as a success — a real regression this exact math is designed to prevent', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockSubFindAll.mockResolvedValue([{ id: 'sub-1' }]);
    mockRunFindAll.mockResolvedValue([
      fakeRun({ id: 'r1', delivery_status: 'sent' }),
      fakeRun({ id: 'r2', delivery_status: 'failed' }),
    ]);

    const result = await listReportRunsForAgent('agent-1');

    expect(result?.successRatePct).toBe(50);
  });

  it('queries runs across every subscription this agent has, scoped to the real 30-day window', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockSubFindAll.mockResolvedValue([{ id: 'sub-1' }, { id: 'sub-2' }]);
    mockRunFindAll.mockResolvedValue([]);

    await listReportRunsForAgent('agent-1');

    const callArgs = mockRunFindAll.mock.calls[0][0];
    expect(callArgs.where.subscription_id).toBeDefined();
    expect(callArgs.where.generated_at).toBeDefined();
  });

  it('exposes the real error_message on a failed run — never hidden from the manager', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockSubFindAll.mockResolvedValue([{ id: 'sub-1' }]);
    mockRunFindAll.mockResolvedValue([fakeRun({ delivery_status: 'failed', error_message: 'Mandrill timeout' })]);

    const result = await listReportRunsForAgent('agent-1');

    expect(result?.runs[0].errorMessage).toBe('Mandrill timeout');
  });
});
