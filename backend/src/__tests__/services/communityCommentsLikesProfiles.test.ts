/**
 * communityService unit tests — comments, likes, profiles + directory
 * (Epic 4, "Build: Threaded comments + likes; profiles + member directory",
 * BC todo 9985689717). Model layer is mocked; no DB I/O.
 */

jest.mock('../../models/Enrollment', () => ({ findByPk: jest.fn() }));
jest.mock('../../models/CommunityMember', () => ({
  findOrCreate: jest.fn(),
  findAll: jest.fn(),
  findByPk: jest.fn(),
  increment: jest.fn(),
  decrement: jest.fn(),
}));
jest.mock('../../models/CommunityPost', () => ({ findByPk: jest.fn() }));
jest.mock('../../models/CommunityComment', () => ({ create: jest.fn(), findByPk: jest.fn(), findAll: jest.fn() }));
jest.mock('../../models/CommunityLike', () => ({ findOrCreate: jest.fn(), findAll: jest.fn(), count: jest.fn() }));
jest.mock('../../models/CommunityPointsEvent', () => ({ create: jest.fn() }));
jest.mock('../../models/CommunityNotification', () => ({ create: jest.fn() }));
// listMembersForAdmin flags comped seats via subscriptionService — mock it so
// this unit test stays isolated from the billing layer (no comp by default).
jest.mock('../../services/subscriptionService', () => ({ activeCompEnrollmentIds: jest.fn(async () => new Set()) }));
// setMemberRole best-effort auto-syncs 'staff' to auto_staff_sync orgs — mock the
// org models so this unit test stays isolated (no auto-sync orgs by default).
jest.mock('../../models/Organization', () => ({ findAll: jest.fn(async () => []) }));
jest.mock('../../models/OrgMember', () => ({ findOrCreate: jest.fn(), destroy: jest.fn() }));
// communityService now folds into the canonical points system; mock those so
// their real model methods don't hit the DB (points/level come from here).
jest.mock('../../services/pointsService', () => ({
  award: jest.fn(async () => ({ awarded: true, points: 0 })),
  revoke: jest.fn(async () => ({ revoked: true })),
  hasAwarded: jest.fn(async () => false),
  sumPointsTodayByEventTypes: jest.fn(async () => 0),
  getPointsSummary: jest.fn(async () => ({ total: 0, events: [] })),
  getTotalsForEnrollments: jest.fn(async () => new Map()),
  levelForPoints: jest.fn(() => ({ level: 1, name: 'Apprentice' })),
}));
jest.mock('../../services/progression/communityXpService', () => ({ awardCommunityXp: jest.fn(async () => {}) }));
// Recognition badges surfaced on the directory/profile come from ContributionEvent.
jest.mock('../../models/ContributionEvent', () => ({
  __esModule: true,
  default: { findAll: jest.fn(async () => []) },
  CATEGORY_META: {
    helpful_guide: { label: 'Helpful Guide', emoji: '🧭', blurb: '' },
    community_host: { label: 'Community Host', emoji: '🏠', blurb: '' },
  },
}));

import {
  createComment, listComments, toggleLike, levelFor,
  getMyProfile, getMemberProfileById, updateMyProfile, listMembers,
  setMemberRole, isMemberRole, listMembersForAdmin,
} from '../../services/communityService';
import ContributionEvent from '../../models/ContributionEvent';
import { getTotalsForEnrollments } from '../../services/pointsService';
import { Op } from 'sequelize';

const findAllContributions = (ContributionEvent as unknown as { findAll: jest.Mock }).findAll;
const totalsForEnrollments = getTotalsForEnrollments as jest.Mock;
import Enrollment from '../../models/Enrollment';
import CommunityMember from '../../models/CommunityMember';
import CommunityPost from '../../models/CommunityPost';
import CommunityComment from '../../models/CommunityComment';
import CommunityLike from '../../models/CommunityLike';
import CommunityPointsEvent from '../../models/CommunityPointsEvent';
import CommunityNotification from '../../models/CommunityNotification';
import { award, revoke, hasAwarded } from '../../services/pointsService';
import { env } from '../../config/env';

const awardCanonical = award as jest.Mock;
const revokeCanonical = revoke as jest.Mock;
const hasAwardedMock = hasAwarded as jest.Mock;
const findByPkEnrollment = Enrollment.findByPk as jest.Mock;
const findOrCreateMember = CommunityMember.findOrCreate as jest.Mock;
const findAllMembers = CommunityMember.findAll as jest.Mock;
const findByPkMember = CommunityMember.findByPk as jest.Mock;
const incrementMember = CommunityMember.increment as jest.Mock;
const decrementMember = CommunityMember.decrement as jest.Mock;
const findByPkPost = CommunityPost.findByPk as jest.Mock;
const createComment_ = CommunityComment.create as jest.Mock;
const findByPkComment = CommunityComment.findByPk as jest.Mock;
const findAllComments = CommunityComment.findAll as jest.Mock;
const findOrCreateLike = CommunityLike.findOrCreate as jest.Mock;
const findAllLikes = CommunityLike.findAll as jest.Mock;
const countLikes = CommunityLike.count as jest.Mock;
const createPointsEvent = CommunityPointsEvent.create as jest.Mock;
const createNotification = CommunityNotification.create as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

const enrollmentId = '11111111-1111-1111-1111-111111111111';
const cohortId = '22222222-2222-2222-2222-222222222222';
const memberId = '33333333-3333-3333-3333-333333333333';
const otherMemberId = '44444444-4444-4444-4444-444444444444';
const postId = '55555555-5555-5555-5555-555555555555';

const mockEnrollment: any = { id: enrollmentId, full_name: 'Ada Lovelace', cohort_id: cohortId };
const mockMember: any = { id: memberId, enrollment_id: enrollmentId, display_name: 'Ada Lovelace', avatar_url: null };

describe('levelFor', () => {
  it('happy path: maps points to the correct tier', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(1500)).toBe(2);
    expect(levelFor(2700)).toBe(3);
    expect(levelFor(4200)).toBe(4);
  });

  it('boundary path: one point below a threshold stays in the lower tier', () => {
    expect(levelFor(1499)).toBe(1);
    expect(levelFor(2699)).toBe(2);
    expect(levelFor(4199)).toBe(3);
  });

  it('boundary path: negative/zero points never go below level 1', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(-5)).toBe(1);
  });
});

describe('createComment', () => {
  const mockPost: any = { id: postId, cohort_id: cohortId, status: 'visible', increment: jest.fn() };

  it('happy path: creates a top-level comment', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue(mockPost);
    createComment_.mockResolvedValue({
      id: 'comment-1', post_id: postId, member_id: memberId, parent_comment_id: null,
      body: 'Nice work!', created_at: new Date('2026-07-07'),
    });

    const result = await createComment(enrollmentId, postId, { body: 'Nice work!' });

    expect(result.id).toBe('comment-1');
    expect(result.replies).toEqual([]);
    expect(mockPost.increment).toHaveBeenCalledWith('comment_count', { by: 1 });
  });

  it('failure path (REQ-C9): rejects a comment on a post outside the cohort with ForbiddenError (403), not NotFoundError', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue({ ...mockPost, cohort_id: 'different-cohort' });

    await expect(createComment(enrollmentId, postId, { body: 'hi' })).rejects.toMatchObject({
      error_class: 'ForbiddenError',
    });
    expect(createComment_).not.toHaveBeenCalled();
  });

  it('boundary path: rejects a comment on a removed post with NotFoundError (hidden from every participant)', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue({ ...mockPost, status: 'removed' });

    await expect(createComment(enrollmentId, postId, { body: 'hi' })).rejects.toMatchObject({
      error_class: 'NotFoundError',
    });
    expect(createComment_).not.toHaveBeenCalled();
  });

  it('happy path: a top-level comment accepts a reply', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue(mockPost);
    findByPkComment.mockResolvedValue({ id: 'parent-1', post_id: postId, parent_comment_id: null });
    createComment_.mockResolvedValue({
      id: 'comment-2', post_id: postId, member_id: memberId, parent_comment_id: 'parent-1',
      body: 'Reply', created_at: new Date('2026-07-07'),
    });

    const result = await createComment(enrollmentId, postId, { body: 'Reply', parent_comment_id: 'parent-1' });

    expect(result.parent_comment_id).toBe('parent-1');
  });

  it('happy path (REQ-C6): a top-level comment notifies the post author', async () => {
    const otherAuthorPost = { ...mockPost, member_id: otherMemberId };
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue(otherAuthorPost);
    createComment_.mockResolvedValue({
      id: 'comment-3', post_id: postId, member_id: memberId, parent_comment_id: null,
      body: 'Great post!', created_at: new Date('2026-07-14'),
    });

    await createComment(enrollmentId, postId, { body: 'Great post!' });

    expect(createNotification).toHaveBeenCalledWith({
      member_id: otherMemberId, actor_member_id: memberId, notification_type: 'reply', source_type: 'comment', source_id: 'comment-3',
    });
  });

  it('happy path (REQ-C6): a reply notifies the parent comment\'s author, not the post author', async () => {
    const otherAuthorPost = { ...mockPost, member_id: 'post-author-member' };
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue(otherAuthorPost);
    findByPkComment.mockResolvedValue({ id: 'parent-1', post_id: postId, parent_comment_id: null, member_id: otherMemberId });
    createComment_.mockResolvedValue({
      id: 'comment-4', post_id: postId, member_id: memberId, parent_comment_id: 'parent-1',
      body: 'Agreed', created_at: new Date('2026-07-14'),
    });

    await createComment(enrollmentId, postId, { body: 'Agreed', parent_comment_id: 'parent-1' });

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ member_id: otherMemberId, source_type: 'comment', source_id: 'comment-4' })
    );
  });

  it('boundary path (REQ-C6): commenting on your own post does not notify yourself', async () => {
    const ownPost = { ...mockPost, member_id: memberId };
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue(ownPost);
    createComment_.mockResolvedValue({
      id: 'comment-5', post_id: postId, member_id: memberId, parent_comment_id: null,
      body: 'Following up on my own post', created_at: new Date('2026-07-14'),
    });

    await createComment(enrollmentId, postId, { body: 'Following up on my own post' });

    expect(createNotification).not.toHaveBeenCalled();
  });

  it('boundary path: rejects a reply-to-a-reply (one level deep only)', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue(mockPost);
    findByPkComment.mockResolvedValue({ id: 'reply-1', post_id: postId, parent_comment_id: 'parent-1' });

    await expect(
      createComment(enrollmentId, postId, { body: 'nested reply', parent_comment_id: 'reply-1' })
    ).rejects.toMatchObject({ error_class: 'ValidationError' });
    expect(createComment_).not.toHaveBeenCalled();
  });
});

describe('listComments', () => {
  it('happy path: nests replies one level under their parent', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue({ id: postId, cohort_id: cohortId });
    findAllComments.mockResolvedValue([
      { id: 'c1', post_id: postId, member_id: memberId, parent_comment_id: null, body: 'top', created_at: new Date(), member: { id: memberId, display_name: 'Ada', avatar_url: null } },
      { id: 'c2', post_id: postId, member_id: memberId, parent_comment_id: 'c1', body: 'reply', created_at: new Date(), member: { id: memberId, display_name: 'Ada', avatar_url: null } },
    ]);
    findAllLikes.mockResolvedValue([]);

    const result = await listComments(enrollmentId, postId);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c1');
    expect(result[0].replies).toHaveLength(1);
    expect(result[0].replies[0].id).toBe('c2');
  });

  it('failure path (REQ-C9): throws ForbiddenError (403) for a post outside the cohort', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue({ id: postId, cohort_id: 'different-cohort', status: 'visible' });

    await expect(listComments(enrollmentId, postId)).rejects.toMatchObject({ error_class: 'ForbiddenError' });
  });

  it('boundary path: throws NotFoundError for a removed post', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue({ id: postId, cohort_id: cohortId, status: 'removed' });

    await expect(listComments(enrollmentId, postId)).rejects.toMatchObject({ error_class: 'NotFoundError' });
  });

  it('boundary path: an empty comment list returns an empty array without querying likes', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue({ id: postId, cohort_id: cohortId });
    findAllComments.mockResolvedValue([]);

    const result = await listComments(enrollmentId, postId);

    expect(result).toEqual([]);
    expect(findAllLikes).not.toHaveBeenCalled();
  });
});

describe('toggleLike', () => {
  const mockPost: any = { id: postId, cohort_id: cohortId, member_id: otherMemberId, increment: jest.fn(), decrement: jest.fn() };
  const mockAuthor: any = { id: otherMemberId, points: 5, level: 1, update: jest.fn() };

  it('happy path: liking a post awards a point to the post author', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue(mockPost);
    findOrCreateLike.mockResolvedValue([{ id: 'like-1' }, true]);
    findByPkMember.mockResolvedValue({ ...mockAuthor });
    countLikes.mockResolvedValue(1);

    const result = await toggleLike(enrollmentId, 'post', postId);

    expect(result).toEqual({ liked: true, like_count: 1 });
    expect(incrementMember).toHaveBeenCalledWith('points', { by: 1, where: { id: otherMemberId } });
    expect(mockPost.increment).toHaveBeenCalledWith('like_count', { by: 1 });
    expect(createPointsEvent).toHaveBeenCalledWith({ member_id: otherMemberId, points: 1 });
  });

  it('idempotency: liking the same post twice unlikes it (toggle), removing the point', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue(mockPost);
    const existingLike = { id: 'like-1', destroy: jest.fn() };
    findOrCreateLike.mockResolvedValue([existingLike, false]);
    findByPkMember.mockResolvedValue({ ...mockAuthor, points: 6 });
    countLikes.mockResolvedValue(0);

    const result = await toggleLike(enrollmentId, 'post', postId);

    expect(result).toEqual({ liked: false, like_count: 0 });
    expect(existingLike.destroy).toHaveBeenCalled();
    expect(decrementMember).toHaveBeenCalledWith('points', { by: 1, where: { id: otherMemberId } });
    expect(mockPost.decrement).toHaveBeenCalledWith('like_count', { by: 1 });
    expect(createPointsEvent).toHaveBeenCalledWith({ member_id: otherMemberId, points: -1 });
  });

  it('canonical: liking a post credits community_like into the canonical ledger (leaderboard) for the author', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue(mockPost);
    findOrCreateLike.mockResolvedValue([{ id: 'like-can-1' }, true]);
    findByPkMember.mockResolvedValue({ ...mockAuthor, enrollment_id: 'author-enr-1' });
    countLikes.mockResolvedValue(1);

    await toggleLike(enrollmentId, 'post', postId);

    // Keyed by (likeable, liker) so it's presence-based + idempotent, and awarded
    // to the AUTHOR's enrollment (the leaderboard reads StudentPointsEvent).
    expect(awardCanonical).toHaveBeenCalledWith('author-enr-1', expect.objectContaining({
      eventType: 'community_like',
      eventKey: `community_like:post:${postId}:${memberId}`,
      points: 1,
    }));
    expect(revokeCanonical).not.toHaveBeenCalled();
  });

  it('canonical: unliking a post revokes the community_like from the canonical ledger (drops off the leaderboard)', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue(mockPost);
    findOrCreateLike.mockResolvedValue([{ id: 'like-can-2', destroy: jest.fn() }, false]);
    findByPkMember.mockResolvedValue({ ...mockAuthor, enrollment_id: 'author-enr-1' });
    countLikes.mockResolvedValue(0);

    await toggleLike(enrollmentId, 'post', postId);

    expect(revokeCanonical).toHaveBeenCalledWith('author-enr-1', `community_like:post:${postId}:${memberId}`);
    expect(awardCanonical).not.toHaveBeenCalled();
  });

  it('failure path (REQ-C9): throws ForbiddenError (403) for a post outside the cohort', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue({ ...mockPost, cohort_id: 'different-cohort' });

    await expect(toggleLike(enrollmentId, 'post', postId)).rejects.toMatchObject({ error_class: 'ForbiddenError' });
    expect(findOrCreateLike).not.toHaveBeenCalled();
  });

  it('boundary path: throws NotFoundError when liking a removed post', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue({ ...mockPost, status: 'removed' });

    await expect(toggleLike(enrollmentId, 'post', postId)).rejects.toMatchObject({ error_class: 'NotFoundError' });
    expect(findOrCreateLike).not.toHaveBeenCalled();
  });

  it('failure path (REQ-C9): liking a comment whose parent post is in a different cohort is ForbiddenError (403)', async () => {
    const commentId = 'comment-cross-cohort';
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkComment.mockResolvedValue({ id: commentId, post_id: postId, member_id: otherMemberId });
    findByPkPost.mockResolvedValue({ id: postId, cohort_id: 'different-cohort', status: 'visible' });

    await expect(toggleLike(enrollmentId, 'comment', commentId)).rejects.toMatchObject({ error_class: 'ForbiddenError' });
    expect(findOrCreateLike).not.toHaveBeenCalled();
  });

  it('happy path: liking a comment resolves the author via the comment\'s parent post', async () => {
    const commentId = 'comment-1';
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkComment.mockResolvedValue({ id: commentId, post_id: postId, member_id: otherMemberId });
    findByPkPost.mockResolvedValue({ id: postId, cohort_id: cohortId });
    findOrCreateLike.mockResolvedValue([{ id: 'like-2' }, true]);
    findByPkMember.mockResolvedValue({ ...mockAuthor });
    countLikes.mockResolvedValue(1);

    const result = await toggleLike(enrollmentId, 'comment', commentId);

    expect(result.liked).toBe(true);
    expect(incrementMember).toHaveBeenCalledWith('points', { by: 1, where: { id: otherMemberId } });
  });

  it('boundary path: a level-up recomputes and persists the author\'s level', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue(mockPost);
    findOrCreateLike.mockResolvedValue([{ id: 'like-3' }, true]);
    const authorAtThreshold = { id: otherMemberId, points: 1500, level: 1, update: jest.fn() };
    findByPkMember.mockResolvedValue(authorAtThreshold);
    countLikes.mockResolvedValue(1);

    await toggleLike(enrollmentId, 'post', postId);

    expect(authorAtThreshold.update).toHaveBeenCalledWith({ level: 2 });
  });

  it('notification: liking a post notifies its author (REQ-C6, Ali 2026-07-20)', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue(mockPost);
    findOrCreateLike.mockResolvedValue([{ id: 'like-4' }, true]);
    findByPkMember.mockResolvedValue({ ...mockAuthor });
    countLikes.mockResolvedValue(1);

    await toggleLike(enrollmentId, 'post', postId);

    expect(createNotification).toHaveBeenCalledWith({
      member_id: otherMemberId,
      actor_member_id: memberId,
      notification_type: 'like',
      source_type: 'post',
      source_id: postId,
    });
  });

  it('notification boundary: a self-like never notifies the author', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    // Liker IS the author (same member id as the post's member_id).
    findOrCreateMember.mockResolvedValue([{ ...mockMember, id: otherMemberId }, false]);
    findByPkPost.mockResolvedValue(mockPost);
    findOrCreateLike.mockResolvedValue([{ id: 'like-self' }, true]);
    findByPkMember.mockResolvedValue({ ...mockAuthor });
    countLikes.mockResolvedValue(1);

    await toggleLike(enrollmentId, 'post', postId);

    expect(createNotification).not.toHaveBeenCalled();
  });

  it('notification idempotency: unliking a post creates no notification', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue(mockPost);
    findOrCreateLike.mockResolvedValue([{ id: 'like-1', destroy: jest.fn() }, false]);
    findByPkMember.mockResolvedValue({ ...mockAuthor, points: 6 });
    countLikes.mockResolvedValue(0);

    await toggleLike(enrollmentId, 'post', postId);

    expect(createNotification).not.toHaveBeenCalled();
  });

  it('notification failure path: a notification insert error does not fail the like', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue(mockPost);
    findOrCreateLike.mockResolvedValue([{ id: 'like-6' }, true]);
    findByPkMember.mockResolvedValue({ ...mockAuthor });
    countLikes.mockResolvedValue(1);
    // Simulates the deploy window where the CHECK constraint still rejects 'like'.
    // Once-only so the rejection never leaks into later tests (clearAllMocks keeps
    // implementations, not just call history).
    createNotification.mockRejectedValueOnce(new Error('violates check constraint'));

    const result = await toggleLike(enrollmentId, 'post', postId);

    expect(result).toEqual({ liked: true, like_count: 1 });
    expect(incrementMember).toHaveBeenCalledWith('points', { by: 1, where: { id: otherMemberId } });
  });

  it('notification: liking a comment notifies the comment author', async () => {
    const commentId = 'comment-notify';
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkComment.mockResolvedValue({ id: commentId, post_id: postId, member_id: otherMemberId });
    findByPkPost.mockResolvedValue({ id: postId, cohort_id: cohortId });
    findOrCreateLike.mockResolvedValue([{ id: 'like-5' }, true]);
    findByPkMember.mockResolvedValue({ ...mockAuthor });
    countLikes.mockResolvedValue(1);

    await toggleLike(enrollmentId, 'comment', commentId);

    expect(createNotification).toHaveBeenCalledWith({
      member_id: otherMemberId,
      actor_member_id: memberId,
      notification_type: 'like',
      source_type: 'comment',
      source_id: commentId,
    });
  });
});

// Post-quality gate (COMMUNITY_POST_QUALITY_GATE_ENABLED): a post's +5 is
// withheld at creation and released on the FIRST PEER like (see createPost + the
// gate hook in toggleLike). These tests exercise the release side (toggleLike).
describe('post-quality gate release on first peer like (COMMUNITY_POST_QUALITY_GATE_ENABLED)', () => {
  const gatePost: any = {
    id: postId, cohort_id: cohortId, status: 'visible', member_id: otherMemberId,
    min_level: 0, increment: jest.fn(), decrement: jest.fn(),
  };
  const author: any = { id: otherMemberId, points: 0, level: 1, enrollment_id: 'author-enr-1', update: jest.fn() };

  afterEach(() => {
    (env as any).communityPostQualityGateEnabled = false;
  });

  it('flag OFF: a peer like awards only the like point, never a post reward (byte-identical to today)', async () => {
    (env as any).communityPostQualityGateEnabled = false;
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]); // liker = memberId (a peer)
    findByPkPost.mockResolvedValue(gatePost);
    findOrCreateLike.mockResolvedValue([{ id: 'like-g0' }, true]);
    findByPkMember.mockResolvedValue({ ...author });
    countLikes.mockResolvedValue(1);

    await toggleLike(enrollmentId, 'post', postId);

    expect(awardCanonical).toHaveBeenCalledWith('author-enr-1', expect.objectContaining({ eventType: 'community_like' }));
    expect(awardCanonical).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: 'community_post' }));
    expect(hasAwardedMock).not.toHaveBeenCalled();
  });

  it('flag ON: the first peer like releases the withheld +5 to the post author (keyed to the post)', async () => {
    (env as any).communityPostQualityGateEnabled = true;
    hasAwardedMock.mockResolvedValue(false); // not yet rewarded
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]); // liker peer
    findByPkPost.mockResolvedValue(gatePost);
    findOrCreateLike.mockResolvedValue([{ id: 'like-g1' }, true]);
    findByPkMember.mockResolvedValue({ ...author });
    countLikes.mockResolvedValue(1);

    await toggleLike(enrollmentId, 'post', postId);

    expect(hasAwardedMock).toHaveBeenCalledWith('author-enr-1', `community_post:${postId}`);
    expect(awardCanonical).toHaveBeenCalledWith('author-enr-1', expect.objectContaining({
      eventType: 'community_post',
      eventKey: `community_post:${postId}`,
      points: 5,
    }));
    // legacy contribution points are released to the AUTHOR too (member_id otherMemberId)
    expect(incrementMember).toHaveBeenCalledWith('points', { by: 5, where: { id: otherMemberId } });
  });

  it('flag ON: a self-like never releases the post reward', async () => {
    (env as any).communityPostQualityGateEnabled = true;
    hasAwardedMock.mockResolvedValue(false);
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    // liker IS the author (same member id as the post's member_id)
    findOrCreateMember.mockResolvedValue([{ ...mockMember, id: otherMemberId }, false]);
    findByPkPost.mockResolvedValue(gatePost);
    findOrCreateLike.mockResolvedValue([{ id: 'like-self-g' }, true]);
    findByPkMember.mockResolvedValue({ ...author });
    countLikes.mockResolvedValue(1);

    await toggleLike(enrollmentId, 'post', postId);

    expect(hasAwardedMock).not.toHaveBeenCalled();
    expect(awardCanonical).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: 'community_post' }));
  });

  it('flag ON: a re-like / second peer like does not double-release (already rewarded)', async () => {
    (env as any).communityPostQualityGateEnabled = true;
    hasAwardedMock.mockResolvedValue(true); // the post was already rewarded on the first peer like
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue(gatePost);
    findOrCreateLike.mockResolvedValue([{ id: 'like-g2' }, true]);
    findByPkMember.mockResolvedValue({ ...author });
    countLikes.mockResolvedValue(2);

    await toggleLike(enrollmentId, 'post', postId);

    expect(hasAwardedMock).toHaveBeenCalledWith('author-enr-1', `community_post:${postId}`);
    expect(awardCanonical).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: 'community_post' }));
  });

  it('flag ON: liking a COMMENT never releases a post reward', async () => {
    (env as any).communityPostQualityGateEnabled = true;
    hasAwardedMock.mockResolvedValue(false);
    const commentId = 'comment-gate';
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkComment.mockResolvedValue({ id: commentId, post_id: postId, member_id: otherMemberId });
    findByPkPost.mockResolvedValue({ id: postId, cohort_id: cohortId, status: 'visible', min_level: 0 });
    findOrCreateLike.mockResolvedValue([{ id: 'like-cmt-g' }, true]);
    findByPkMember.mockResolvedValue({ ...author });
    countLikes.mockResolvedValue(1);

    await toggleLike(enrollmentId, 'comment', commentId);

    expect(hasAwardedMock).not.toHaveBeenCalled();
    expect(awardCanonical).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: 'community_post' }));
  });
});

describe('level-gated content (REQ-C4)', () => {
  const gatedPost: any = {
    id: postId, cohort_id: cohortId, status: 'visible', member_id: otherMemberId, min_level: 3, increment: jest.fn(),
  };

  it('createComment failure path: a viewer below the required level is ForbiddenError, not allowed to comment', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([{ ...mockMember, level: 1 }, false]);
    findByPkPost.mockResolvedValue(gatedPost);

    await expect(createComment(enrollmentId, postId, { body: 'hi' })).rejects.toMatchObject({
      error_class: 'ForbiddenError',
    });
    expect(createComment_).not.toHaveBeenCalled();
  });

  it('createComment boundary path: a viewer exactly at the required level can comment', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([{ ...mockMember, level: 3 }, false]);
    findByPkPost.mockResolvedValue(gatedPost);
    createComment_.mockResolvedValue({
      id: 'comment-gated', post_id: postId, member_id: memberId, parent_comment_id: null,
      body: 'unlocked', created_at: new Date('2026-07-13'),
    });

    const result = await createComment(enrollmentId, postId, { body: 'unlocked' });

    expect(result.id).toBe('comment-gated');
  });

  it('listComments failure path: a viewer below the required level is ForbiddenError', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([{ ...mockMember, level: 2 }, false]);
    findByPkPost.mockResolvedValue(gatedPost);

    await expect(listComments(enrollmentId, postId)).rejects.toMatchObject({ error_class: 'ForbiddenError' });
  });

  it('toggleLike failure path: a viewer below the required level cannot like gated content', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([{ ...mockMember, level: 1 }, false]);
    findByPkPost.mockResolvedValue(gatedPost);

    await expect(toggleLike(enrollmentId, 'post', postId)).rejects.toMatchObject({ error_class: 'ForbiddenError' });
    expect(findOrCreateLike).not.toHaveBeenCalled();
  });

  it('toggleLike happy path: the author can always interact with their own gated post', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([{ ...mockMember, id: otherMemberId, level: 1 }, false]);
    findByPkPost.mockResolvedValue(gatedPost);
    findOrCreateLike.mockResolvedValue([{ id: 'like-own' }, true]);
    findByPkMember.mockResolvedValue({ id: otherMemberId, points: 0, level: 1, update: jest.fn() });
    countLikes.mockResolvedValue(1);

    const result = await toggleLike(enrollmentId, 'post', postId);

    expect(result.liked).toBe(true);
  });

  it('toggleLike (comment branch) failure path: a viewer below the level required by the parent post cannot like the comment', async () => {
    const commentId = 'comment-under-gated-post';
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([{ ...mockMember, level: 1 }, false]);
    findByPkComment.mockResolvedValue({ id: commentId, post_id: postId, member_id: otherMemberId });
    findByPkPost.mockResolvedValue(gatedPost);

    await expect(toggleLike(enrollmentId, 'comment', commentId)).rejects.toMatchObject({ error_class: 'ForbiddenError' });
    expect(findOrCreateLike).not.toHaveBeenCalled();
  });
});

describe('member profiles + directory', () => {
  it('getMyProfile happy path: returns the caller\'s own profile', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([{ ...mockMember, bio: null, level: 1, points: 0, created_at: new Date() }, false]);

    const profile = await getMyProfile(enrollmentId);

    expect(profile.id).toBe(memberId);
  });

  it('getMemberProfileById happy path: returns a member\'s profile regardless of cohort', async () => {
    findByPkMember.mockResolvedValue({
      id: otherMemberId, display_name: 'Grace Hopper', avatar_url: null, bio: null, level: 1, points: 0,
      created_at: new Date(), enrollment: { cohort_id: cohortId },
    });

    const profile = await getMemberProfileById(enrollmentId, otherMemberId);

    expect(profile.id).toBe(otherMemberId);
  });

  it('getMemberProfileById happy path: a cross-cohort member also resolves (platform-wide, not cohort-scoped)', async () => {
    findByPkMember.mockResolvedValue({
      id: otherMemberId, display_name: 'Someone Else', avatar_url: null, bio: null, level: 1, points: 0,
      created_at: new Date(), enrollment: { cohort_id: 'different-cohort' },
    });

    const profile = await getMemberProfileById(enrollmentId, otherMemberId);

    expect(profile.id).toBe(otherMemberId);
  });

  it('getMemberProfileById failure path: a nonexistent member is NotFoundError', async () => {
    findByPkMember.mockResolvedValue(null);

    await expect(getMemberProfileById(enrollmentId, otherMemberId)).rejects.toMatchObject({
      error_class: 'NotFoundError',
    });
  });

  it('updateMyProfile happy path: updates only the provided fields', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    const memberToUpdate = { ...mockMember, bio: null, level: 1, points: 0, created_at: new Date(), update: jest.fn() };
    findOrCreateMember.mockResolvedValue([memberToUpdate, false]);

    await updateMyProfile(enrollmentId, { bio: 'Building AI systems.' });

    expect(memberToUpdate.update).toHaveBeenCalledWith({ bio: 'Building AI systems.' });
  });

  it('listMembers happy path: platform-wide, no cohort filter (sorted by canonical points in JS)', async () => {
    findAllMembers.mockResolvedValue([]);

    const page = await listMembers(enrollmentId);

    const callArgs = findAllMembers.mock.calls[0][0];
    expect(callArgs.include[0].where).toBeUndefined();
    expect(page).toEqual({ members: [], total: 0, has_more: false });
  });

  const dirMember = (id: string, enr: string, name: string, role = 'student') => ({
    id, enrollment_id: enr, display_name: name, avatar_url: null, bio: null,
    last_active_at: null, created_at: new Date('2026-07-01'), role,
  });

  it('listMembers role filter: passes the role to the DB where clause', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findAllMembers.mockResolvedValue([]);

    await listMembers(enrollmentId, { role: 'mentor' });

    expect(findAllMembers.mock.calls[0][0].where.role).toBe('mentor');
  });

  it('listMembers search: filters display_name case-insensitively (ILIKE)', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findAllMembers.mockResolvedValue([]);

    await listMembers(enrollmentId, { search: 'ada' });

    const where = findAllMembers.mock.calls[0][0].where;
    expect(where.display_name[Op.iLike]).toBe('%ada%');
  });

  it('listMembers directory: sorts by canonical points DESC and paginates (page 1 of 2)', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findAllMembers.mockResolvedValue([dirMember('m1', 'e1', 'Ada'), dirMember('m2', 'e2', 'Bab'), dirMember('m3', 'e3', 'Cyd')]);
    totalsForEnrollments.mockResolvedValueOnce(new Map([['e1', 10], ['e2', 30], ['e3', 20]]));

    const page = await listMembers(enrollmentId, { limit: 2, offset: 0 });

    expect(page.total).toBe(3);
    expect(page.has_more).toBe(true);
    expect(page.members.map((m) => m.id)).toEqual(['m2', 'm3']); // 30 then 20
    expect(page.members[0].points).toBe(30);
  });

  it('listMembers directory: last page reports has_more=false', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findAllMembers.mockResolvedValue([dirMember('m1', 'e1', 'Ada'), dirMember('m2', 'e2', 'Bab'), dirMember('m3', 'e3', 'Cyd')]);
    totalsForEnrollments.mockResolvedValueOnce(new Map([['e1', 10], ['e2', 30], ['e3', 20]]));

    const page = await listMembers(enrollmentId, { limit: 2, offset: 2 });

    expect(page.members.map((m) => m.id)).toEqual(['m1']); // the remaining 10-pt member
    expect(page.has_more).toBe(false);
  });

  it('listMembers badges: attaches each member\'s recognition badges (count DESC)', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findAllMembers.mockResolvedValue([dirMember('m1', 'e1', 'Ada')]);
    totalsForEnrollments.mockResolvedValueOnce(new Map([['e1', 5]]));
    findAllContributions.mockResolvedValueOnce([
      { enrollment_id: 'e1', category: 'helpful_guide' },
      { enrollment_id: 'e1', category: 'helpful_guide' },
      { enrollment_id: 'e1', category: 'community_host' },
    ]);

    const page = await listMembers(enrollmentId, {});

    expect(page.members[0].badges).toEqual([
      { category: 'helpful_guide', label: 'Helpful Guide', emoji: '🧭', count: 2 },
      { category: 'community_host', label: 'Community Host', emoji: '🏠', count: 1 },
    ]);
  });

  it('setMemberRole happy path: updates the member\'s role and returns the profile', async () => {
    const member = { ...dirMember(otherMemberId, 'e-other', 'Grace'), update: jest.fn() };
    findByPkMember.mockResolvedValue(member);

    const profile = await setMemberRole(otherMemberId, 'mentor');

    expect(member.update).toHaveBeenCalledWith({ role: 'mentor' });
    expect(profile.id).toBe(otherMemberId);
  });

  it('setMemberRole failure path: NotFoundError for a missing member', async () => {
    findByPkMember.mockResolvedValue(null);
    await expect(setMemberRole('nope', 'staff')).rejects.toMatchObject({ error_class: 'NotFoundError' });
  });

  it('setMemberRole failure path: ValidationError for an invalid role (never reaches the DB)', async () => {
    await expect(setMemberRole(otherMemberId, 'wizard' as any)).rejects.toMatchObject({ error_class: 'ValidationError' });
    expect(findByPkMember).not.toHaveBeenCalled();
  });

  it('isMemberRole guards the allowed set', () => {
    expect(isMemberRole('student')).toBe(true);
    expect(isMemberRole('mentor')).toBe(true);
    expect(isMemberRole('staff')).toBe(true);
    expect(isMemberRole('wizard')).toBe(false);
  });

  it('listMembersForAdmin: name+email+role+signed_up_at rows, ILIKE search, newest-first (nulls last)', async () => {
    // Deliberately unsorted input incl. a null-enrollment row, to prove the
    // service orders by sign-up DESC and pushes the null-enrollment row last.
    findAllMembers.mockResolvedValue([
      { id: 'm1', enrollment_id: 'enr-1', display_name: 'Ada', role: 'mentor', enrollment: { email: 'ada@x.com', created_at: '2026-07-01T00:00:00Z' } },
      { id: 'm2', enrollment_id: null, display_name: 'Bob', role: 'student', enrollment: null },
      { id: 'm3', enrollment_id: 'enr-3', display_name: 'Cid', role: 'staff', enrollment: { email: 'cid@x.com', created_at: '2026-07-10T00:00:00Z' } },
    ]);

    const rows = await listMembersForAdmin('ad');

    // Name search still builds the ILIKE where clause.
    expect(findAllMembers.mock.calls[0][0].where.display_name[Op.iLike]).toBe('%ad%');
    // DB-side ordering is by enrollment.created_at DESC (so the 200-cap keeps newest).
    const order = findAllMembers.mock.calls[0][0].order;
    expect(order[0][1]).toBe('created_at');
    expect(order[0][2]).toBe('DESC');
    // Final rows: newest sign-up first, null-enrollment last. free_access defaults
    // false here (mock members carry no enrollment_id → empty comp set).
    expect(rows).toEqual([
      { id: 'm3', enrollment_id: 'enr-3', display_name: 'Cid', email: 'cid@x.com', role: 'staff', signed_up_at: '2026-07-10T00:00:00.000Z', free_access: false },
      { id: 'm1', enrollment_id: 'enr-1', display_name: 'Ada', email: 'ada@x.com', role: 'mentor', signed_up_at: '2026-07-01T00:00:00.000Z', free_access: false },
      { id: 'm2', enrollment_id: null, display_name: 'Bob', email: null, role: 'student', signed_up_at: null, free_access: false },
    ]);
  });
});
