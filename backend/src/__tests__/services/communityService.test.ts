/**
 * communityService unit tests (Epic 4 feed, BC #10036783688 / todo 9985689693).
 * Model layer is mocked; no DB I/O.
 */

jest.mock('../../models/Enrollment', () => ({ findByPk: jest.fn() }));
jest.mock('../../models/CommunityMember', () => ({ findOrCreate: jest.fn(), findAll: jest.fn() }));
jest.mock('../../models/CommunityPost', () => ({ create: jest.fn(), findAll: jest.fn(), findByPk: jest.fn() }));

import { createPost, listPosts, togglePin, getOrCreateMember } from '../../services/communityService';
import Enrollment from '../../models/Enrollment';
import CommunityMember from '../../models/CommunityMember';
import CommunityPost from '../../models/CommunityPost';

const findByPkEnrollment = Enrollment.findByPk as jest.Mock;
const findOrCreateMember = CommunityMember.findOrCreate as jest.Mock;
const findAllMembers = CommunityMember.findAll as jest.Mock;
const createPostMock = CommunityPost.create as jest.Mock;
const findAllPosts = CommunityPost.findAll as jest.Mock;
const findByPkPost = CommunityPost.findByPk as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

const enrollmentId = '11111111-1111-1111-1111-111111111111';
const cohortId = '22222222-2222-2222-2222-222222222222';
const memberId = '33333333-3333-3333-3333-333333333333';

const mockEnrollment: any = { id: enrollmentId, full_name: 'Ada Lovelace', cohort_id: cohortId };
const mockMember: any = { id: memberId, enrollment_id: enrollmentId, display_name: 'Ada Lovelace', avatar_url: null };

describe('getOrCreateMember', () => {
  it('happy path: creates a member for a first-time poster', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, true]);

    const member = await getOrCreateMember(enrollmentId);

    expect(member).toBe(mockMember);
    expect(findOrCreateMember).toHaveBeenCalledWith({
      where: { enrollment_id: enrollmentId },
      defaults: { enrollment_id: enrollmentId, display_name: 'Ada Lovelace' },
    });
  });

  it('failure path: throws NotFoundError for a missing enrollment', async () => {
    findByPkEnrollment.mockResolvedValue(null);

    await expect(getOrCreateMember(enrollmentId)).rejects.toMatchObject({
      error_class: 'NotFoundError',
    });
  });

  it('idempotency: repeat calls resolve to the same member row (findOrCreate, not create)', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);

    const first = await getOrCreateMember(enrollmentId);
    const second = await getOrCreateMember(enrollmentId);

    expect(first).toBe(mockMember);
    expect(second).toBe(mockMember);
    expect(findOrCreateMember).toHaveBeenCalledTimes(2);
  });
});

describe('createPost', () => {
  it('happy path: creates a post with defaults', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    const createdPost: any = {
      id: 'post-1',
      body: 'Shipped my requirements today!',
      media_urls: [],
      category: null,
      pinned: false,
      like_count: 0,
      comment_count: 0,
      mentioned_member_ids: [],
      created_at: new Date('2026-07-07'),
    };
    createPostMock.mockResolvedValue(createdPost);

    const result = await createPost(enrollmentId, { body: 'Shipped my requirements today!' });

    expect(result.id).toBe('post-1');
    expect(result.member.id).toBe(memberId);
    expect(createPostMock).toHaveBeenCalledWith(
      expect.objectContaining({ member_id: memberId, cohort_id: cohortId, body: 'Shipped my requirements today!' })
    );
  });

  it('failure path: rejects a mention outside the author\'s cohort', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findAllMembers.mockResolvedValue([
      { id: 'other-member', enrollment: { cohort_id: 'different-cohort' } },
    ]);

    await expect(
      createPost(enrollmentId, { body: 'hi @someone', mentioned_member_ids: ['other-member'] })
    ).rejects.toMatchObject({ error_class: 'ValidationError' });
    expect(createPostMock).not.toHaveBeenCalled();
  });

  it('boundary path: accepts a mention that is in the same cohort', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findAllMembers.mockResolvedValue([{ id: 'peer-member', enrollment: { cohort_id: cohortId } }]);
    createPostMock.mockResolvedValue({
      id: 'post-2',
      body: 'cc @peer',
      media_urls: [],
      category: null,
      pinned: false,
      like_count: 0,
      comment_count: 0,
      mentioned_member_ids: ['peer-member'],
      created_at: new Date('2026-07-07'),
    });

    const result = await createPost(enrollmentId, { body: 'cc @peer', mentioned_member_ids: ['peer-member'] });

    expect(result.mentioned_member_ids).toEqual(['peer-member']);
  });
});

describe('listPosts', () => {
  it('happy path: scopes the feed to the caller\'s cohort', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findAllPosts.mockResolvedValue([]);

    await listPosts(enrollmentId);

    expect(findAllPosts).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cohort_id: cohortId } })
    );
  });

  it('boundary path: applies the category filter when provided', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findAllPosts.mockResolvedValue([]);

    await listPosts(enrollmentId, 'announcements');

    expect(findAllPosts).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cohort_id: cohortId, category: 'announcements' } })
    );
  });

  it('happy path: orders pinned posts first', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findAllPosts.mockResolvedValue([]);

    await listPosts(enrollmentId);

    const callArgs = findAllPosts.mock.calls[0][0];
    expect(callArgs.order).toEqual([
      ['pinned', 'DESC'],
      ['created_at', 'DESC'],
    ]);
  });
});

describe('togglePin', () => {
  const basePost: any = {
    id: 'post-1',
    member_id: memberId,
    body: 'hello',
    media_urls: [],
    category: null,
    pinned: false,
    like_count: 0,
    comment_count: 0,
    mentioned_member_ids: [],
    created_at: new Date('2026-07-07'),
    member: { id: memberId, display_name: 'Ada Lovelace', avatar_url: null },
    update: jest.fn(),
  };

  it('happy path: the author can pin their own post', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    const post = { ...basePost, update: jest.fn().mockImplementation(async function (this: any, patch) {
      this.pinned = patch.pinned;
    }) };
    findByPkPost.mockResolvedValue(post);

    const result = await togglePin(enrollmentId, 'post-1', { pinned: true });

    expect(post.update).toHaveBeenCalledWith({ pinned: true });
    expect(result.pinned).toBe(true);
  });

  it('failure path: a non-author cannot pin the post', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([{ ...mockMember, id: 'someone-else' }, false]);
    findByPkPost.mockResolvedValue(basePost);

    await expect(togglePin(enrollmentId, 'post-1', { pinned: true })).rejects.toMatchObject({
      error_class: 'ForbiddenError',
    });
  });

  it('failure path: throws NotFoundError for a missing post', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue(null);

    await expect(togglePin(enrollmentId, 'missing-post', { pinned: true })).rejects.toMatchObject({
      error_class: 'NotFoundError',
    });
  });

  it('idempotency: pinning an already-pinned post is a no-op update', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    const alreadyPinned = { ...basePost, pinned: true, update: jest.fn() };
    findByPkPost.mockResolvedValue(alreadyPinned);

    const result = await togglePin(enrollmentId, 'post-1', { pinned: true });

    expect(alreadyPinned.update).not.toHaveBeenCalled();
    expect(result.pinned).toBe(true);
  });
});
