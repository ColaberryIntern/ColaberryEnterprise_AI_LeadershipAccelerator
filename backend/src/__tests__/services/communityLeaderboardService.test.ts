/**
 * communityLeaderboardService tests (REQ-C4, BC #9985689739): pure ranking
 * function + the 7d/30d/all-time recompute-and-upsert. No DB I/O — models
 * mocked. communityLeaderboardService.ts imports resolveCohortId from
 * communityService.ts, so that module's own dependencies need mocks too or
 * the real Model.init() runs against these mocked, non-functional models.
 */

jest.mock('../../models/Enrollment', () => ({ findByPk: jest.fn() }));
jest.mock('../../models/CommunityMember', () => ({ findAll: jest.fn() }));
jest.mock('../../models/CommunityPost', () => ({}));
jest.mock('../../models/CommunityComment', () => ({}));
jest.mock('../../models/CommunityLike', () => ({}));
jest.mock('../../models/CommunityPostReport', () => ({}));
jest.mock('../../models/CommunityPointsEvent', () => ({ findAll: jest.fn() }));
jest.mock('../../models/CommunityLeaderboardEntry', () => ({ upsert: jest.fn() }));

import { rankMembers, getLeaderboard } from '../../services/communityLeaderboardService';
import Enrollment from '../../models/Enrollment';
import CommunityMember from '../../models/CommunityMember';
import CommunityPointsEvent from '../../models/CommunityPointsEvent';
import CommunityLeaderboardEntry from '../../models/CommunityLeaderboardEntry';

const findByPkEnrollment = Enrollment.findByPk as jest.Mock;
const findAllMembers = CommunityMember.findAll as jest.Mock;
const findAllPointsEvents = CommunityPointsEvent.findAll as jest.Mock;
const upsertLeaderboardEntry = CommunityLeaderboardEntry.upsert as jest.Mock;

beforeEach(() => jest.clearAllMocks());

const enrollmentId = '11111111-1111-1111-1111-111111111111';
const cohortId = '22222222-2222-2222-2222-222222222222';
const mockEnrollment: any = { id: enrollmentId, full_name: 'Ada Lovelace', cohort_id: cohortId };

describe('rankMembers (pure)', () => {
  it('happy path: ranks by points descending', () => {
    const result = rankMembers([
      { member_id: 'a', display_name: 'Ada', points: 10 },
      { member_id: 'b', display_name: 'Bea', points: 30 },
      { member_id: 'c', display_name: 'Cy', points: 20 },
    ]);

    expect(result.map((r) => r.member_id)).toEqual(['b', 'c', 'a']);
    expect(result.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('boundary path: tied points get the same dense rank, broken deterministically by display_name', () => {
    const result = rankMembers([
      { member_id: 'a', display_name: 'Zed', points: 10 },
      { member_id: 'b', display_name: 'Ann', points: 10 },
    ]);

    expect(result.map((r) => r.member_id)).toEqual(['b', 'a']);
    expect(result.map((r) => r.rank)).toEqual([1, 1]);
  });

  it('boundary path: an empty input returns an empty ranking', () => {
    expect(rankMembers([])).toEqual([]);
  });

  it('determinism: running the same input twice (any order) produces the identical ranking', () => {
    const input = [
      { member_id: 'a', display_name: 'Ada', points: 5 },
      { member_id: 'b', display_name: 'Bea', points: 5 },
      { member_id: 'c', display_name: 'Cy', points: 15 },
    ];

    const first = rankMembers(input);
    const second = rankMembers([...input].reverse());

    expect(second).toEqual(first);
  });
});

describe('getLeaderboard', () => {
  it('happy path: all_time reads CommunityMember.points directly, no event query', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findAllMembers.mockResolvedValue([
      { id: 'm1', display_name: 'Ada', points: 100 },
      { id: 'm2', display_name: 'Bea', points: 200 },
    ]);

    const result = await getLeaderboard(enrollmentId, 'all_time');

    expect(result[0]).toMatchObject({ member_id: 'm2', points: 200, rank: 1 });
    expect(findAllPointsEvents).not.toHaveBeenCalled();
  });

  it('happy path: 7d sums only points_events within the window, not the running total', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findAllMembers.mockResolvedValue([{ id: 'm1', display_name: 'Ada', points: 9999 }]);
    findAllPointsEvents.mockResolvedValue([
      { member_id: 'm1', points: 1 },
      { member_id: 'm1', points: 1 },
      { member_id: 'm1', points: -1 },
    ]);

    const result = await getLeaderboard(enrollmentId, '7d');

    expect(result[0]).toMatchObject({ member_id: 'm1', points: 1 });
  });

  it('boundary path: a member with no events in the window ranks at 0 points, not omitted', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findAllMembers.mockResolvedValue([{ id: 'm1', display_name: 'Ada', points: 500 }]);
    findAllPointsEvents.mockResolvedValue([]);

    const result = await getLeaderboard(enrollmentId, '30d');

    expect(result).toEqual([{ member_id: 'm1', display_name: 'Ada', points: 0, rank: 1 }]);
  });

  it('boundary path: an empty cohort returns an empty leaderboard without querying events', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findAllMembers.mockResolvedValue([]);

    const result = await getLeaderboard(enrollmentId, '7d');

    expect(result).toEqual([]);
    expect(findAllPointsEvents).not.toHaveBeenCalled();
  });

  it('idempotency: recomputing snapshots each ranked member via upsert (safe to rerun for the same period)', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findAllMembers.mockResolvedValue([{ id: 'm1', display_name: 'Ada', points: 50 }]);

    await getLeaderboard(enrollmentId, 'all_time');
    await getLeaderboard(enrollmentId, 'all_time');

    expect(upsertLeaderboardEntry).toHaveBeenCalledTimes(2);
    expect(upsertLeaderboardEntry).toHaveBeenCalledWith(
      expect.objectContaining({ member_id: 'm1', period: 'all_time', points: 50, rank_snapshot: 1 })
    );
  });

  it('failure path: propagates NotFoundError for a missing enrollment', async () => {
    findByPkEnrollment.mockResolvedValue(null);

    await expect(getLeaderboard(enrollmentId, 'all_time')).rejects.toMatchObject({ error_class: 'NotFoundError' });
  });
});
