/**
 * Moderation tests (REQ-C9, BC #10077100017): participant-facing reportPost
 * (communityService.ts) + staff-facing listReportedPosts/removePost
 * (communityModerationService.ts). No DB I/O — models mocked.
 */

jest.mock('../../config/database', () => ({
  sequelize: { authenticate: jest.fn(), close: jest.fn(), query: jest.fn(), define: jest.fn() },
  connectDatabase: jest.fn(),
}));

jest.mock('../../models/Enrollment', () => ({ findByPk: jest.fn() }));
jest.mock('../../models/CommunityMember', () => ({ findOrCreate: jest.fn(), findAll: jest.fn() }));
jest.mock('../../models/CommunityPost', () => ({ findByPk: jest.fn() }));
jest.mock('../../models/CommunityPostReport', () => ({ findOrCreate: jest.fn(), findAll: jest.fn() }));
// communityService.ts also imports these two — unused by reportPost itself,
// but the module graph needs a mock or Sequelize's real Model.init() runs
// against the mocked (non-functional) sequelize connection and throws.
jest.mock('../../models/CommunityComment', () => ({}));
jest.mock('../../models/CommunityLike', () => ({}));
jest.mock('../../models/CommunityPointsEvent', () => ({ create: jest.fn() }));
jest.mock('../../models/CommunityNotification', () => ({}));
// communityService now imports ContributionEvent (directory badges); mock it so
// its real model.init() doesn't run against the mocked sequelize.
jest.mock('../../models/ContributionEvent', () => ({ __esModule: true, default: { findAll: jest.fn() }, CATEGORY_META: {} }));
// communityService also imports this (posts/comments award Community XP); mock it
// so its real XpEvent model.init() doesn't run against the mocked sequelize.
jest.mock('../../services/progression/communityXpService', () => ({ awardCommunityXp: jest.fn() }));
// communityService also imports pointsService (canonical points/level); mock it
// so its real StudentPointsEvent model.init() doesn't run against mocked sequelize.
jest.mock('../../services/pointsService', () => ({
  award: jest.fn(),
  getPointsSummary: jest.fn(async () => ({ total: 0, events: [] })),
  getTotalsForEnrollments: jest.fn(async () => new Map()),
  levelForPoints: jest.fn(() => ({ level: 1, name: 'Apprentice' })),
}));

import { reportPost } from '../../services/communityService';
import { listReportedPosts, removePost } from '../../services/communityModerationService';
import Enrollment from '../../models/Enrollment';
import CommunityMember from '../../models/CommunityMember';
import CommunityPost from '../../models/CommunityPost';
import CommunityPostReport from '../../models/CommunityPostReport';

const findByPkEnrollment = Enrollment.findByPk as jest.Mock;
const findOrCreateMember = CommunityMember.findOrCreate as jest.Mock;
const findByPkPost = CommunityPost.findByPk as jest.Mock;
const findOrCreateReport = CommunityPostReport.findOrCreate as jest.Mock;
const findAllReports = CommunityPostReport.findAll as jest.Mock;

beforeEach(() => jest.clearAllMocks());

const enrollmentId = '11111111-1111-1111-1111-111111111111';
const cohortId = '22222222-2222-2222-2222-222222222222';
const memberId = '33333333-3333-3333-3333-333333333333';
const postId = '55555555-5555-5555-5555-555555555555';

const mockEnrollment: any = { id: enrollmentId, full_name: 'Ada Lovelace', cohort_id: cohortId };
const mockMember: any = { id: memberId, enrollment_id: enrollmentId, display_name: 'Ada Lovelace' };
const mockPost: any = { id: postId, cohort_id: cohortId, status: 'visible' };

describe('reportPost', () => {
  it('happy path: creates a report for a visible, same-cohort post', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue(mockPost);
    findOrCreateReport.mockResolvedValue([{ id: 'report-1' }, true]);

    const result = await reportPost(enrollmentId, postId, 'Spam');

    expect(result.report_id).toBe('report-1');
    expect(findOrCreateReport).toHaveBeenCalledWith({
      where: { post_id: postId, reporter_member_id: memberId },
      defaults: { post_id: postId, reporter_member_id: memberId, reason: 'Spam' },
    });
  });

  it('idempotency: reporting the same post twice returns the existing report, not a duplicate', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue(mockPost);
    findOrCreateReport.mockResolvedValue([{ id: 'report-1' }, false]);

    const first = await reportPost(enrollmentId, postId);
    const second = await reportPost(enrollmentId, postId);

    expect(first.report_id).toBe('report-1');
    expect(second.report_id).toBe('report-1');
    expect(findOrCreateReport).toHaveBeenCalledTimes(2);
  });

  it('failure path (REQ-C9): reporting a post from a different cohort is ForbiddenError (403)', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue({ ...mockPost, cohort_id: 'different-cohort' });

    await expect(reportPost(enrollmentId, postId)).rejects.toMatchObject({ error_class: 'ForbiddenError' });
    expect(findOrCreateReport).not.toHaveBeenCalled();
  });

  it('boundary path: reporting an already-removed post is NotFoundError', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue({ ...mockPost, status: 'removed' });

    await expect(reportPost(enrollmentId, postId)).rejects.toMatchObject({ error_class: 'NotFoundError' });
    expect(findOrCreateReport).not.toHaveBeenCalled();
  });

  it('failure path (REQ-C4): a viewer below the post\'s required level cannot report content they can\'t see', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([{ ...mockMember, level: 1 }, false]);
    findByPkPost.mockResolvedValue({ ...mockPost, min_level: 3 });

    await expect(reportPost(enrollmentId, postId)).rejects.toMatchObject({ error_class: 'ForbiddenError' });
    expect(findOrCreateReport).not.toHaveBeenCalled();
  });
});

describe('listReportedPosts', () => {
  it('happy path: aggregates multiple reports on the same post, most-reported first', async () => {
    const postA = { id: 'post-a', body: 'spammy post', cohort_id: cohortId, status: 'visible', created_at: new Date(), member: { id: 'm1', display_name: 'Author A' } };
    const postB = { id: 'post-b', body: 'also reported', cohort_id: cohortId, status: 'visible', created_at: new Date(), member: { id: 'm2', display_name: 'Author B' } };
    findAllReports.mockResolvedValue([
      { post: postA, reason: 'spam', created_at: new Date() },
      { post: postB, reason: 'off-topic', created_at: new Date() },
      { post: postA, reason: 'rude', created_at: new Date() },
    ]);

    const result = await listReportedPosts();

    expect(result).toHaveLength(2);
    expect(result[0].post_id).toBe('post-a');
    expect(result[0].report_count).toBe(2);
    expect(result[0].reasons).toEqual(['spam', 'rude']);
    expect(result[1].post_id).toBe('post-b');
    expect(result[1].report_count).toBe(1);
  });

  it('boundary path: returns an empty array when nothing has been reported', async () => {
    findAllReports.mockResolvedValue([]);

    expect(await listReportedPosts()).toEqual([]);
  });

  it('only queries reports on still-visible posts (already-removed posts drop off this view)', async () => {
    findAllReports.mockResolvedValue([]);

    await listReportedPosts();

    const callArgs = findAllReports.mock.calls[0][0];
    expect(callArgs.include[0].where).toEqual({ status: 'visible' });
  });
});

describe('removePost', () => {
  it('happy path: sets status to removed with an audit trail (removed_at/removed_by)', async () => {
    const update = jest.fn().mockImplementation(function (this: any, patch: any) {
      Object.assign(this, patch);
      return Promise.resolve();
    });
    const post: any = { id: postId, status: 'visible', update };
    findByPkPost.mockResolvedValue(post);

    const result = await removePost('admin-1', postId);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'removed', removed_by: 'admin-1' }));
    expect(update.mock.calls[0][0].removed_at).toBeInstanceOf(Date);
    expect(result).toEqual({ post_id: postId, status: 'removed' });
  });

  it('idempotency: removing an already-removed post is a no-op, not an error', async () => {
    const update = jest.fn();
    const post: any = { id: postId, status: 'removed', update };
    findByPkPost.mockResolvedValue(post);

    const result = await removePost('admin-1', postId);

    expect(update).not.toHaveBeenCalled();
    expect(result).toEqual({ post_id: postId, status: 'removed' });
  });

  it('failure path: throws NotFoundError for a missing post', async () => {
    findByPkPost.mockResolvedValue(null);

    await expect(removePost('admin-1', 'missing-post')).rejects.toMatchObject({ error_class: 'NotFoundError' });
  });
});
