/**
 * communityService unit tests (Epic 4 feed, BC #10036783688 / todo 9985689693).
 * Model layer is mocked; no DB I/O.
 */

jest.mock('../../models/Enrollment', () => ({ findByPk: jest.fn() }));
jest.mock('../../models/CommunityMember', () => ({ findOrCreate: jest.fn(), findAll: jest.fn(), increment: jest.fn(), findByPk: jest.fn() }));
jest.mock('../../models/CommunityPost', () => ({ create: jest.fn(), findAll: jest.fn(), findByPk: jest.fn() }));
jest.mock('../../models/CommunityNotification', () => ({ bulkCreate: jest.fn() }));
jest.mock('../../models/CommunityLike', () => ({ findAll: jest.fn() }));
jest.mock('../../models/CommunityPointsEvent', () => ({ create: jest.fn() }));
jest.mock('../../models/CommunityComment', () => ({ findAll: jest.fn() }));
// Points/level fold into the canonical system now; mock so the real model
// methods don't run (award/getPointsSummary/getTotalsForEnrollments/levelForPoints).
jest.mock('../../services/pointsService', () => ({
  award: jest.fn(async () => ({ awarded: true, points: 0 })),
  hasAwarded: jest.fn(async () => false),
  sumPointsTodayByEventTypes: jest.fn(async () => 0),
  getPointsSummary: jest.fn(async () => ({ total: 0, events: [] })),
  getTotalsForEnrollments: jest.fn(async () => new Map()),
  levelForPoints: jest.fn(() => ({ level: 1, name: 'Apprentice' })),
}));
jest.mock('../../services/progression/communityXpService', () => ({ awardCommunityXp: jest.fn(async () => {}) }));

import { createPost, listPosts, togglePin, getOrCreateMember, derivePresence, touchPresence, levelFor } from '../../services/communityService';
import { env } from '../../config/env';
import { levelForPoints, award } from '../../services/pointsService';
import Enrollment from '../../models/Enrollment';
import CommunityMember from '../../models/CommunityMember';
import CommunityPost from '../../models/CommunityPost';
import CommunityNotification from '../../models/CommunityNotification';
import CommunityLike from '../../models/CommunityLike';
import CommunityPointsEvent from '../../models/CommunityPointsEvent';
import CommunityComment from '../../models/CommunityComment';

const findByPkEnrollment = Enrollment.findByPk as jest.Mock;
const findOrCreateMember = CommunityMember.findOrCreate as jest.Mock;
const findAllMembers = CommunityMember.findAll as jest.Mock;
const createPostMock = CommunityPost.create as jest.Mock;
const findAllPosts = CommunityPost.findAll as jest.Mock;
const findByPkPost = CommunityPost.findByPk as jest.Mock;
const bulkCreateNotifications = CommunityNotification.bulkCreate as jest.Mock;
const findAllLikes = CommunityLike.findAll as jest.Mock;
const incrementMember = CommunityMember.increment as jest.Mock;
const findByPkMember = CommunityMember.findByPk as jest.Mock;
const createPointsEvent = CommunityPointsEvent.create as jest.Mock;
const findAllComments = CommunityComment.findAll as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  // Default: viewer has liked nothing. Individual tests override to assert
  // the per-viewer viewer_has_liked contract (Phase 4).
  findAllLikes.mockResolvedValue([]);
  // Contribution-points path (createPost/createComment award points) — default
  // to a clean no-op so it never interferes with unrelated assertions.
  incrementMember.mockResolvedValue(undefined);
  createPointsEvent.mockResolvedValue(undefined);
  findByPkMember.mockResolvedValue(null);
  // recent-commenters query (listPosts) — default to no comments.
  findAllComments.mockResolvedValue([]);
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
    expect(bulkCreateNotifications).not.toHaveBeenCalled();
  });

  it('awards contribution points to the author on post (Ali feedback 2026-07-20)', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    createPostMock.mockResolvedValue({
      id: 'post-pts', body: 'earning points', media_urls: [], category: null, pinned: false,
      like_count: 0, comment_count: 0, mentioned_member_ids: [], min_level: 0, created_at: new Date('2026-07-20'),
    });

    await createPost(enrollmentId, { body: 'earning points' });

    expect(incrementMember).toHaveBeenCalledWith('points', { by: 5, where: { id: memberId } });
    expect(createPointsEvent).toHaveBeenCalledWith({ member_id: memberId, points: 5 });
  });

  it('post-quality gate ON: a new post is created but awards NO points (withheld until a peer likes it)', async () => {
    (env as any).communityPostQualityGateEnabled = true;
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    createPostMock.mockResolvedValue({
      id: 'post-gated', body: 'first post', media_urls: [], category: null, pinned: false,
      like_count: 0, comment_count: 0, mentioned_member_ids: [], min_level: 0, created_at: new Date('2026-07-21'),
    });

    const result = await createPost(enrollmentId, { body: 'first post' });

    expect(result.id).toBe('post-gated');
    // No reward bundle on creation: legacy points withheld AND canonical community_post withheld.
    expect(incrementMember).not.toHaveBeenCalled();
    expect(createPointsEvent).not.toHaveBeenCalled();
    expect(award).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: 'community_post' }));

    (env as any).communityPostQualityGateEnabled = false;
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
    expect(bulkCreateNotifications).toHaveBeenCalledWith([
      { member_id: 'peer-member', actor_member_id: memberId, notification_type: 'mention', source_type: 'post', source_id: 'post-2' },
    ]);
  });

  it('happy path (REQ-C4): passes min_level through to the created post, defaulting to 0 when omitted', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    createPostMock.mockResolvedValue({
      id: 'post-3', body: 'ungated', media_urls: [], category: null, pinned: false, like_count: 0,
      comment_count: 0, mentioned_member_ids: [], min_level: 0, created_at: new Date('2026-07-13'),
    });

    await createPost(enrollmentId, { body: 'ungated' });

    expect(createPostMock).toHaveBeenCalledWith(expect.objectContaining({ min_level: 0 }));
  });

  it('happy path (REQ-C4): a gated post is created with the requested min_level', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    createPostMock.mockResolvedValue({
      id: 'post-4', body: 'bonus content', media_urls: [], category: null, pinned: false, like_count: 0,
      comment_count: 0, mentioned_member_ids: [], min_level: 3, created_at: new Date('2026-07-13'),
    });

    const result = await createPost(enrollmentId, { body: 'bonus content', min_level: 3 });

    expect(createPostMock).toHaveBeenCalledWith(expect.objectContaining({ min_level: 3 }));
    expect(result.min_level).toBe(3);
    expect(result.locked).toBe(false);
  });
});

describe('listPosts', () => {
  beforeEach(() => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([{ ...mockMember, level: 1, points: 0 }, false]);
  });

  it('happy path: scopes the feed to the caller\'s cohort', async () => {
    findAllPosts.mockResolvedValue([]);

    await listPosts(enrollmentId);

    expect(findAllPosts).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cohort_id: cohortId, status: 'visible' } })
    );
  });

  it('boundary path: applies the category filter when provided', async () => {
    findAllPosts.mockResolvedValue([]);

    await listPosts(enrollmentId, { category: 'announcements' });

    expect(findAllPosts).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cohort_id: cohortId, status: 'visible', category: 'announcements' } })
    );
  });

  it('happy path: orders pinned posts first, then newest, with an id tiebreak for stable keyset paging', async () => {
    findAllPosts.mockResolvedValue([]);

    await listPosts(enrollmentId);

    const callArgs = findAllPosts.mock.calls[0][0];
    expect(callArgs.order).toEqual([
      ['pinned', 'DESC'],
      ['created_at', 'DESC'],
      ['id', 'DESC'],
    ]);
  });

  it('failure/boundary (REQ-C4): a post gated above the viewer\'s level is returned locked, with no body/media leaked', async () => {
    findAllPosts.mockResolvedValue([
      {
        id: 'post-locked', member_id: 'other-member', cohort_id: cohortId, body: 'secret bonus content',
        media_urls: ['https://example.com/a.png'], category: null, pinned: false, like_count: 0, comment_count: 0,
        mentioned_member_ids: [], min_level: 3, created_at: new Date('2026-07-13'),
        member: { id: 'other-member', display_name: 'Staff', avatar_url: null },
      },
    ]);

    const { posts: [item] } = await listPosts(enrollmentId);

    expect(item.locked).toBe(true);
    expect(item.body).toBeNull();
    expect(item.media_urls).toEqual([]);
    expect(item.min_level).toBe(3);
  });

  it('happy path (REQ-C4): the author sees their own gated post unlocked regardless of level', async () => {
    findOrCreateMember.mockResolvedValue([{ ...mockMember, level: 1, points: 0 }, false]);
    findAllPosts.mockResolvedValue([
      {
        id: 'post-own', member_id: memberId, cohort_id: cohortId, body: 'my bonus content',
        media_urls: [], category: null, pinned: false, like_count: 0, comment_count: 0,
        mentioned_member_ids: [], min_level: 3, created_at: new Date('2026-07-13'),
        member: { id: memberId, display_name: 'Ada Lovelace', avatar_url: null },
      },
    ]);

    const { posts: [item] } = await listPosts(enrollmentId);

    expect(item.locked).toBe(false);
    expect(item.body).toBe('my bonus content');
  });

  it('boundary path (REQ-C4): a viewer exactly at the required level sees the post unlocked', async () => {
    findOrCreateMember.mockResolvedValue([{ ...mockMember, level: 3, points: 2700 }, false]);
    findAllPosts.mockResolvedValue([
      {
        id: 'post-atlevel', member_id: 'other-member', cohort_id: cohortId, body: 'week 4 bonus',
        media_urls: [], category: null, pinned: false, like_count: 0, comment_count: 0,
        mentioned_member_ids: [], min_level: 3, created_at: new Date('2026-07-13'),
        member: { id: 'other-member', display_name: 'Staff', avatar_url: null },
      },
    ]);

    const { posts: [item] } = await listPosts(enrollmentId);

    expect(item.locked).toBe(false);
    expect(item.body).toBe('week 4 bonus');
  });

  it('happy path (Phase 4): viewer_has_liked reflects the viewer\'s own like row, not a client default', async () => {
    findAllPosts.mockResolvedValue([
      {
        id: 'post-liked', member_id: 'other-member', cohort_id: cohortId, body: 'nice work',
        media_urls: [], category: null, pinned: false, like_count: 5, comment_count: 0,
        mentioned_member_ids: [], min_level: 0, created_at: new Date('2026-07-13'),
        member: { id: 'other-member', display_name: 'Peer', avatar_url: null },
      },
      {
        id: 'post-unliked', member_id: 'other-member', cohort_id: cohortId, body: 'wip',
        media_urls: [], category: null, pinned: false, like_count: 0, comment_count: 0,
        mentioned_member_ids: [], min_level: 0, created_at: new Date('2026-07-12'),
        member: { id: 'other-member', display_name: 'Peer', avatar_url: null },
      },
    ]);
    // Viewer has liked only 'post-liked'.
    findAllLikes.mockResolvedValue([{ likeable_id: 'post-liked' }]);

    const { posts } = await listPosts(enrollmentId);

    expect(posts.find((p) => p.id === 'post-liked')!.viewer_has_liked).toBe(true);
    expect(posts.find((p) => p.id === 'post-unliked')!.viewer_has_liked).toBe(false);
    // One batched like lookup for the whole page, scoped to this viewer + posts.
    expect(findAllLikes).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ likeable_type: 'post', member_id: memberId }),
      })
    );
  });

  it('happy path (Phase 4): a full page returns a next_cursor; a partial page returns null', async () => {
    // limit 2, service fetches limit+1 (3). Three rows back => there is a next page.
    const rows = [1, 2, 3].map((n) => ({
      id: `post-${n}`, member_id: 'other-member', cohort_id: cohortId, body: `p${n}`,
      media_urls: [], category: null, pinned: false, like_count: 0, comment_count: 0,
      mentioned_member_ids: [], min_level: 0, created_at: new Date(`2026-07-1${n}`),
      member: { id: 'other-member', display_name: 'Peer', avatar_url: null },
    }));
    findAllPosts.mockResolvedValue(rows);

    const page = await listPosts(enrollmentId, { limit: 2 });

    // Only `limit` items are returned; the extra probe row is dropped.
    expect(page.posts).toHaveLength(2);
    expect(page.next_cursor).toBeTruthy();
    // limit+1 requested.
    expect(findAllPosts.mock.calls[0][0].limit).toBe(3);

    // Now the last page: fewer rows than limit+1 => no further cursor.
    findAllPosts.mockResolvedValue(rows.slice(0, 2));
    const lastPage = await listPosts(enrollmentId, { limit: 2 });
    expect(lastPage.posts).toHaveLength(2);
    expect(lastPage.next_cursor).toBeNull();
  });

  it('boundary path (Phase 4): a malformed cursor degrades to the first page rather than throwing', async () => {
    findAllPosts.mockResolvedValue([]);

    await expect(listPosts(enrollmentId, { cursor: 'not-a-real-cursor' })).resolves.toEqual({
      posts: [],
      next_cursor: null,
    });
    // No keyset filter added for a bad cursor — where stays the plain cohort scope.
    expect(findAllPosts).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cohort_id: cohortId, status: 'visible' } })
    );
  });
});

describe('togglePin', () => {
  const basePost: any = {
    id: 'post-1',
    member_id: memberId,
    cohort_id: cohortId,
    status: 'visible',
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

  it('failure path (REQ-C9): a post from a different cohort is ForbiddenError, not NotFoundError', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue({ ...basePost, cohort_id: 'different-cohort' });

    await expect(togglePin(enrollmentId, 'post-1', { pinned: true })).rejects.toMatchObject({
      error_class: 'ForbiddenError',
    });
  });

  it('boundary path: a removed post is NotFoundError, same as a missing one', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    findOrCreateMember.mockResolvedValue([mockMember, false]);
    findByPkPost.mockResolvedValue({ ...basePost, status: 'removed' });

    await expect(togglePin(enrollmentId, 'post-1', { pinned: true })).rejects.toMatchObject({
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

describe('derivePresence', () => {
  const now = new Date('2026-07-10T12:00:00.000Z');

  it('happy path: recent activity (< 90s) reads online', () => {
    expect(derivePresence(new Date(now.getTime() - 30_000), now)).toBe('online');
  });

  it('happy path: activity between 90s and 10min reads away', () => {
    expect(derivePresence(new Date(now.getTime() - 5 * 60_000), now)).toBe('away');
  });

  it('happy path: activity older than 10min reads offline', () => {
    expect(derivePresence(new Date(now.getTime() - 20 * 60_000), now)).toBe('offline');
  });

  it('boundary: never-active member (null last_active_at) reads offline', () => {
    expect(derivePresence(null, now)).toBe('offline');
  });

  it('boundary: exactly at the online threshold (90s) still reads online', () => {
    expect(derivePresence(new Date(now.getTime() - 90_000), now)).toBe('online');
  });

  it('boundary: exactly at the away threshold (10min) still reads away', () => {
    expect(derivePresence(new Date(now.getTime() - 10 * 60_000), now)).toBe('away');
  });

  it('failure/edge case: clock-skewed future timestamp reads online rather than throwing', () => {
    expect(derivePresence(new Date(now.getTime() + 5_000), now)).toBe('online');
  });
});

describe('touchPresence', () => {
  it('happy path: bumps last_active_at and presence_status on the member row', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    const update = jest.fn();
    findOrCreateMember.mockResolvedValue([{ ...mockMember, update }, false]);

    const result = await touchPresence(enrollmentId);

    expect(result.presence).toBe('online');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ presence_status: 'online' }));
  });

  it('idempotency: repeat pings are safe, each just bumps the timestamp forward', async () => {
    findByPkEnrollment.mockResolvedValue(mockEnrollment);
    const update = jest.fn();
    findOrCreateMember.mockResolvedValue([{ ...mockMember, update }, false]);

    await touchPresence(enrollmentId);
    await touchPresence(enrollmentId);

    expect(update).toHaveBeenCalledTimes(2);
  });

  it('failure path: propagates NotFoundError for a missing enrollment', async () => {
    findByPkEnrollment.mockResolvedValue(null);

    await expect(touchPresence(enrollmentId)).rejects.toMatchObject({ error_class: 'NotFoundError' });
  });
});

// COMMUNITY_LEVEL_USE_CANONICAL reconcile (Phase 3): levelFor either uses the
// legacy 0/1500/2700/4200 tiers (flag OFF, default) or defers to the ONE
// canonical points ladder (flag ON).
describe('levelFor — canonical reconcile flag', () => {
  afterEach(() => {
    (env as any).communityLevelUseCanonical = false;
    // restore the top-level mock default so later suites are unaffected
    (levelForPoints as jest.Mock).mockReturnValue({ level: 1, name: 'Apprentice' });
  });

  it('OFF (default): uses the legacy 0/1500/2700/4200 tiers and never consults the canonical ladder', () => {
    (env as any).communityLevelUseCanonical = false;
    (levelForPoints as jest.Mock).mockClear();
    expect(levelFor(0)).toBe(1);
    expect(levelFor(1499)).toBe(1);
    expect(levelFor(1500)).toBe(2);
    expect(levelFor(2700)).toBe(3);
    expect(levelFor(4200)).toBe(4);
    expect(levelForPoints).not.toHaveBeenCalled();
  });

  it('ON: defers to the canonical points ladder (levelForPoints) instead of legacy tiers', () => {
    (env as any).communityLevelUseCanonical = true;
    (levelForPoints as jest.Mock).mockReturnValue({ level: 42, name: 'Sentinel' });
    // legacy tiers would map 1500 -> 2; canonical deferral returns levelForPoints().level
    expect(levelFor(1500)).toBe(42);
    expect(levelForPoints).toHaveBeenCalledWith(1500);
  });
});
