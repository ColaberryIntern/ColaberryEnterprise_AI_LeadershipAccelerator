/**
 * reeseOutreachHolds: a held autonomous outreach is a send that has not happened yet (auto-approve timeout plus
 * replay), so the cadence and the daily cap must see it. These tests pin the query shape: the action, the live
 * statuses only, the time window, and the student match inside prepared_action.
 */
jest.mock('../../../models/ApprovalRequest', () => ({ findOne: jest.fn(), count: jest.fn() }));

import { Op } from 'sequelize';
import ApprovalRequest from '../../../models/ApprovalRequest';
import { hasLiveHeldOutreachWithin, countLiveHeldOutreachToday } from '../reeseOutreachHolds';

const mockFindOne = ApprovalRequest.findOne as unknown as jest.Mock;
const mockCount = ApprovalRequest.count as unknown as jest.Mock;
const NOW = new Date('2026-11-13T15:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => jest.clearAllMocks());

describe('hasLiveHeldOutreachWithin', () => {
  it('true when a live held/replayed outreach for the student exists in the window', async () => {
    mockFindOne.mockResolvedValue({ id: 'ar-1' });
    await expect(hasLiveHeldOutreachWithin('stu-1', 7, NOW)).resolves.toBe(true);
  });

  it('false when there is none', async () => {
    mockFindOne.mockResolvedValue(null);
    await expect(hasLiveHeldOutreachWithin('stu-1', 7, NOW)).resolves.toBe(false);
  });

  it('asks only for this action, pending or approved, created within the window, for this student', async () => {
    mockFindOne.mockResolvedValue(null);
    await hasLiveHeldOutreachWithin('stu-1', 7, NOW);
    const where = mockFindOne.mock.calls[0][0].where;
    expect(where.action).toBe('reese_autonomous_outreach');
    expect(where.status[Op.in]).toEqual(['pending', 'approved']);
    expect(where.created_at[Op.gte]).toEqual(new Date(NOW.getTime() - 7 * DAY));
    // the student match is a json-path comparison on prepared_action.studentEnrollmentId
    expect(JSON.stringify(where[Op.and])).toContain('stu-1');
    expect(JSON.stringify(where[Op.and])).toContain('studentEnrollmentId');
  });

  it('rejected or expired holds never sent, so they are not in the status list', async () => {
    mockFindOne.mockResolvedValue(null);
    await hasLiveHeldOutreachWithin('stu-1', 7, NOW);
    const statuses = mockFindOne.mock.calls[0][0].where.status[Op.in];
    expect(statuses).not.toContain('rejected');
    expect(statuses).not.toContain('expired');
  });

  it('a lookup failure propagates rather than reading as "no hold" (the sweep must not send on a blind spot)', async () => {
    mockFindOne.mockRejectedValue(new Error('db down'));
    await expect(hasLiveHeldOutreachWithin('stu-1', 7, NOW)).rejects.toThrow('db down');
  });
});

describe('countLiveHeldOutreachToday', () => {
  it('counts live outreach holds created since UTC midnight', async () => {
    mockCount.mockResolvedValue(4);
    await expect(countLiveHeldOutreachToday(NOW)).resolves.toBe(4);
    const where = mockCount.mock.calls[0][0].where;
    expect(where.action).toBe('reese_autonomous_outreach');
    expect(where.status[Op.in]).toEqual(['pending', 'approved']);
    expect(where.created_at[Op.gte]).toEqual(new Date('2026-11-13T00:00:00Z'));
  });

  it('is idempotent: same inputs, same query', async () => {
    mockCount.mockResolvedValue(0);
    await countLiveHeldOutreachToday(NOW);
    await countLiveHeldOutreachToday(NOW);
    expect(mockCount.mock.calls[0][0].where.created_at).toEqual(mockCount.mock.calls[1][0].where.created_at);
  });
});
