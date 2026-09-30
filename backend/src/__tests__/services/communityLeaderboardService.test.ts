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
jest.mock('../../models/StudentPointsEvent', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../models/CommunityLeaderboardEntry', () => ({ upsert: jest.fn() }));
// communityService pulls subscriptionService, which pulls models/index and runs the
// real association wiring against these mocked models. Cut that chain here.
jest.mock('../../services/subscriptionService', () => ({ activeCompEnrollmentIds: jest.fn(async () => new Set()) }));
// The rung column: all-time totals + StudentLevel, resolved for every row.
const totalsMock = jest.fn();
const rungsMock = jest.fn();
jest.mock('../../services/pointsService', () => ({ getTotalsForEnrollments: (...a: unknown[]) => totalsMock(...a) }));
jest.mock('../../services/progression/progressionService', () => ({ getRungNamesForEnrollments: (...a: unknown[]) => rungsMock(...a) }));

import { rankMembers, getLeaderboard } from '../../services/communityLeaderboardService';
import Enrollment from '../../models/Enrollment';
import CommunityMember from '../../models/CommunityMember';
import StudentPointsEvent from '../../models/StudentPointsEvent';
import CommunityLeaderboardEntry from '../../models/CommunityLeaderboardEntry';

const findByPkEnrollment = Enrollment.findByPk as jest.Mock;
const findAllMembers = CommunityMember.findAll as jest.Mock;
const findAllPoints = (StudentPointsEvent as any).findAll as jest.Mock;
const upsertLeaderboardEntry = CommunityLeaderboardEntry.upsert as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  totalsMock.mockResolvedValue(new Map());
  rungsMock.mockResolvedValue(new Map());
});

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
  it('carries every member\'s rung, from ALL-TIME points, not the window (Ali, 2026-09-16: "can everyone have a color and rank")', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findAllMembers.mockResolvedValue([
      { id: 'm1', display_name: 'Farhat', enrollment_id: 'e1' },
      { id: 'm2', display_name: 'Ruth', enrollment_id: 'e2' },
    ]);
    findAllPoints.mockResolvedValue([{ enrollment_id: 'e1', points: 10 }]);   // the 7d window
    totalsMock.mockResolvedValue(new Map([['e1', 10336], ['e2', 954]]));
    rungsMock.mockResolvedValue(new Map([['e1', 'AI Builder III'], ['e2', 'AI Enabled II']]));

    const result = await getLeaderboard(enrollmentId, '7d');

    expect(result.map((r) => [r.display_name, r.rung_name])).toEqual([['Farhat', 'AI Builder III'], ['Ruth', 'AI Enabled II']]);
    expect(rungsMock).toHaveBeenCalledWith(['e1', 'e2'], new Map([['e1', 10336], ['e2', 954]]));
  });

  it('a rung lookup failure leaves rung_name null and the board intact', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findAllMembers.mockResolvedValue([{ id: 'm1', display_name: 'Ada', enrollment_id: 'e1' }]);
    findAllPoints.mockResolvedValue([{ enrollment_id: 'e1', points: 5 }]);
    rungsMock.mockRejectedValue(new Error('db down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await getLeaderboard(enrollmentId, 'all_time');
    expect(result[0]).toMatchObject({ member_id: 'm1', points: 5, rank: 1, rung_name: null });
    warn.mockRestore();
  });

  it('happy path: ranks by the canonical StudentPointsEvent total (keyed by enrollment)', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findAllMembers.mockResolvedValue([
      { id: 'm1', display_name: 'Ada', enrollment_id: 'e1' },
      { id: 'm2', display_name: 'Bea', enrollment_id: 'e2' },
    ]);
    findAllPoints.mockResolvedValue([
      { enrollment_id: 'e1', points: 100 },
      { enrollment_id: 'e2', points: 200 },
    ]);

    const result = await getLeaderboard(enrollmentId, 'all_time');

    expect(result[0]).toMatchObject({ member_id: 'm2', points: 200, rank: 1 });
  });

  it('happy path: 7d sums only canonical events within the window', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findAllMembers.mockResolvedValue([{ id: 'm1', display_name: 'Ada', enrollment_id: 'e1' }]);
    findAllPoints.mockResolvedValue([
      { enrollment_id: 'e1', points: 1 },
      { enrollment_id: 'e1', points: 1 },
      { enrollment_id: 'e1', points: -1 },
    ]);

    const result = await getLeaderboard(enrollmentId, '7d');

    expect(result[0]).toMatchObject({ member_id: 'm1', points: 1 });
  });

  it('boundary path: a member with no events in the window ranks at 0 points, not omitted', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findAllMembers.mockResolvedValue([{ id: 'm1', display_name: 'Ada', enrollment_id: 'e1' }]);
    findAllPoints.mockResolvedValue([]);

    const result = await getLeaderboard(enrollmentId, '30d');

    expect(result).toEqual([{ member_id: 'm1', display_name: 'Ada', points: 0, rank: 1, rung_name: null }]);
  });

  it('boundary path: an empty cohort returns an empty leaderboard without querying events', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findAllMembers.mockResolvedValue([]);

    const result = await getLeaderboard(enrollmentId, '7d');

    expect(result).toEqual([]);
    expect(findAllPoints).not.toHaveBeenCalled();
  });

  it('idempotency: recomputing snapshots each ranked member via upsert (safe to rerun for the same period)', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findAllMembers.mockResolvedValue([{ id: 'm1', display_name: 'Ada', enrollment_id: 'e1' }]);
    findAllPoints.mockResolvedValue([{ enrollment_id: 'e1', points: 50 }]);

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
