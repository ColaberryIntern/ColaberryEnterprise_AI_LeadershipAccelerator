import CommunityMember, { CommunityPresenceStatus } from '../models/CommunityMember';
import CommunityPost from '../models/CommunityPost';
import CommunityComment from '../models/CommunityComment';
import CommunityLike, { CommunityLikeableType } from '../models/CommunityLike';
import Enrollment from '../models/Enrollment';
import { CreatePostInput, TogglePinInput, CreateCommentInput, UpdateProfileInput } from '../schemas/communitySchemas';

// Lite poll-presence (P0 per the approved design mockup — real-time websocket
// presence is explicitly P2). A client pings /presence/ping every ~45s while
// the Community tab is open; presence is derived here from staleness of
// last_active_at rather than trusted from a stored flag, so a crashed/closed
// tab reads as away then offline within these windows without any cleanup job.
const PRESENCE_ONLINE_MS = 90_000;
const PRESENCE_AWAY_MS = 10 * 60_000;

export function derivePresence(lastActiveAt: Date | null, now: Date = new Date()): CommunityPresenceStatus {
  if (!lastActiveAt) return 'offline';
  const ageMs = now.getTime() - lastActiveAt.getTime();
  if (ageMs < 0) return 'online'; // clock skew guard — treat future timestamps as fresh
  if (ageMs <= PRESENCE_ONLINE_MS) return 'online';
  if (ageMs <= PRESENCE_AWAY_MS) return 'away';
  return 'offline';
}

// Idempotent — repeat pings just bump last_active_at forward.
export async function touchPresence(enrollmentId: string): Promise<{ presence: CommunityPresenceStatus }> {
  const member = await getOrCreateMember(enrollmentId);
  await member.update({ last_active_at: new Date(), presence_status: 'online' });
  return { presence: 'online' };
}

// Deterministic, pure, recomputable from points alone — matches the approved
// member-profile-system design mockup's level tiers exactly. Full leaderboard
// ranking + level-gated content unlocks are a separate, later Epic 4 ticket
// ("Gamification: points -> levels -> leaderboards -> level-gated unlocks");
// this is only the level-badge derivation for the profile surface.
const LEVEL_TIERS = [
  { level: 1, min: 0 },
  { level: 2, min: 1500 },
  { level: 3, min: 2700 },
  { level: 4, min: 4200 },
] as const;

export function levelFor(points: number): number {
  return LEVEL_TIERS.reduce((acc, tier) => (points >= tier.min ? tier.level : acc), 1);
}

function log(level: 'info' | 'warn' | 'error', event: string, ctx: Record<string, unknown>): void {
  console[level](JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'community', event, ...ctx }));
}

function validationError(message: string): Error {
  return Object.assign(new Error(message), { error_class: 'ValidationError' });
}

function notFoundError(message: string): Error {
  return Object.assign(new Error(message), { error_class: 'NotFoundError' });
}

function forbiddenError(message: string): Error {
  return Object.assign(new Error(message), { error_class: 'ForbiddenError' });
}

export interface PostFeedItem {
  id: string;
  body: string;
  media_urls: string[];
  category: string | null;
  pinned: boolean;
  like_count: number;
  comment_count: number;
  mentioned_member_ids: string[];
  created_at: Date;
  member: { id: string; display_name: string; avatar_url: string | null };
}

// Idempotent — safe to call on every request. One CommunityMember row per
// enrollment; findOrCreate races resolve to the same row via the DB's unique
// constraint on enrollment_id.
export async function getOrCreateMember(enrollmentId: string): Promise<CommunityMember> {
  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) {
    throw notFoundError('Enrollment not found');
  }

  const [member] = await CommunityMember.findOrCreate({
    where: { enrollment_id: enrollmentId },
    defaults: { enrollment_id: enrollmentId, display_name: enrollment.full_name },
  });
  return member;
}

async function resolveCohortId(enrollmentId: string): Promise<string> {
  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) {
    throw notFoundError('Enrollment not found');
  }
  return enrollment.cohort_id;
}

export async function createPost(enrollmentId: string, input: CreatePostInput): Promise<PostFeedItem> {
  const [member, cohortId] = await Promise.all([
    getOrCreateMember(enrollmentId),
    resolveCohortId(enrollmentId),
  ]);

  const mentionedIds = input.mentioned_member_ids ?? [];
  if (mentionedIds.length > 0) {
    const mentionedMembers = await CommunityMember.findAll({
      where: { id: mentionedIds },
      include: [{ model: Enrollment, as: 'enrollment', attributes: ['cohort_id'] }],
    });
    const validIds = new Set(
      mentionedMembers
        .filter((m: any) => m.enrollment?.cohort_id === cohortId)
        .map((m) => m.id)
    );
    const invalidIds = mentionedIds.filter((id) => !validIds.has(id));
    if (invalidIds.length > 0) {
      throw validationError(`Mentioned member(s) not in this cohort: ${invalidIds.join(', ')}`);
    }
  }

  const post = await CommunityPost.create({
    member_id: member.id,
    cohort_id: cohortId,
    body: input.body,
    media_urls: input.media_urls ?? [],
    category: input.category ?? null,
    mentioned_member_ids: mentionedIds,
  });

  log('info', 'post_created', { post_id: post.id, member_id: member.id, cohort_id: cohortId, outcome: 'success' });

  return {
    id: post.id,
    body: post.body,
    media_urls: post.media_urls,
    category: post.category,
    pinned: post.pinned,
    like_count: post.like_count,
    comment_count: post.comment_count,
    mentioned_member_ids: post.mentioned_member_ids,
    created_at: post.created_at,
    member: { id: member.id, display_name: member.display_name, avatar_url: member.avatar_url },
  };
}

export async function listPosts(enrollmentId: string, category?: string): Promise<PostFeedItem[]> {
  const cohortId = await resolveCohortId(enrollmentId);

  const where: Record<string, unknown> = { cohort_id: cohortId };
  if (category) {
    where.category = category;
  }

  const posts = await CommunityPost.findAll({
    where,
    include: [{ model: CommunityMember, as: 'member', attributes: ['id', 'display_name', 'avatar_url'] }],
    order: [
      ['pinned', 'DESC'],
      ['created_at', 'DESC'],
    ],
  });

  return posts.map((post: any) => ({
    id: post.id,
    body: post.body,
    media_urls: post.media_urls,
    category: post.category,
    pinned: post.pinned,
    like_count: post.like_count,
    comment_count: post.comment_count,
    mentioned_member_ids: post.mentioned_member_ids,
    created_at: post.created_at,
    member: {
      id: post.member.id,
      display_name: post.member.display_name,
      avatar_url: post.member.avatar_url,
    },
  }));
}

// Author-only for v1 (smallest version that satisfies "students can ... pin").
// Broader moderator/admin pinning (e.g. staff pinning an announcement to
// someone else's post) is deferred — no staff role exists on CommunityMember
// yet. Idempotent: setting pinned to its current value is a no-op update.
export async function togglePin(
  enrollmentId: string,
  postId: string,
  input: TogglePinInput
): Promise<PostFeedItem> {
  const member = await getOrCreateMember(enrollmentId);

  const post = await CommunityPost.findByPk(postId, {
    include: [{ model: CommunityMember, as: 'member', attributes: ['id', 'display_name', 'avatar_url'] }],
  });
  if (!post) {
    throw notFoundError('Post not found');
  }
  if (post.member_id !== member.id) {
    throw forbiddenError('Only the post author can pin or unpin this post');
  }

  if (post.pinned !== input.pinned) {
    await post.update({ pinned: input.pinned });
  }

  log('info', 'post_pin_toggled', { post_id: post.id, member_id: member.id, pinned: input.pinned, outcome: 'success' });

  const postAny = post as any;
  return {
    id: post.id,
    body: post.body,
    media_urls: post.media_urls,
    category: post.category,
    pinned: post.pinned,
    like_count: post.like_count,
    comment_count: post.comment_count,
    mentioned_member_ids: post.mentioned_member_ids,
    created_at: post.created_at,
    member: {
      id: postAny.member.id,
      display_name: postAny.member.display_name,
      avatar_url: postAny.member.avatar_url,
    },
  };
}

// ─── Comments ───────────────────────────────────────────────────────────

export interface CommentItem {
  id: string;
  body: string;
  parent_comment_id: string | null;
  like_count: number;
  viewer_has_liked: boolean;
  created_at: Date;
  member: { id: string; display_name: string; avatar_url: string | null };
  replies: CommentItem[];
}

// One level deep only (comment -> reply), per BUILD_SPEC §7 / the CommunityComment
// model comment. The DB doesn't enforce depth (self-referential FK, no CHECK) so
// this is the app-layer guard: replying to a reply is rejected, not silently flattened.
export async function createComment(
  enrollmentId: string,
  postId: string,
  input: CreateCommentInput
): Promise<CommentItem> {
  const [member, cohortId] = await Promise.all([
    getOrCreateMember(enrollmentId),
    resolveCohortId(enrollmentId),
  ]);

  const post = await CommunityPost.findByPk(postId);
  if (!post || post.cohort_id !== cohortId) {
    throw notFoundError('Post not found');
  }

  let parentCommentId: string | null = null;
  if (input.parent_comment_id) {
    const parent = await CommunityComment.findByPk(input.parent_comment_id);
    if (!parent || parent.post_id !== postId) {
      throw notFoundError('Parent comment not found on this post');
    }
    if (parent.parent_comment_id) {
      throw validationError('Replies are one level deep only — cannot reply to a reply');
    }
    parentCommentId = parent.id;
  }

  const comment = await CommunityComment.create({
    post_id: postId,
    member_id: member.id,
    parent_comment_id: parentCommentId,
    body: input.body,
  });

  await post.increment('comment_count', { by: 1 });

  log('info', 'comment_created', {
    comment_id: comment.id,
    post_id: postId,
    member_id: member.id,
    is_reply: parentCommentId !== null,
    outcome: 'success',
  });

  return {
    id: comment.id,
    body: comment.body,
    parent_comment_id: comment.parent_comment_id,
    like_count: 0,
    viewer_has_liked: false,
    created_at: comment.created_at,
    member: { id: member.id, display_name: member.display_name, avatar_url: member.avatar_url },
    replies: [],
  };
}

export async function listComments(enrollmentId: string, postId: string): Promise<CommentItem[]> {
  const [member, cohortId] = await Promise.all([
    getOrCreateMember(enrollmentId),
    resolveCohortId(enrollmentId),
  ]);

  const post = await CommunityPost.findByPk(postId);
  if (!post || post.cohort_id !== cohortId) {
    throw notFoundError('Post not found');
  }

  const comments = await CommunityComment.findAll({
    where: { post_id: postId },
    include: [{ model: CommunityMember, as: 'member', attributes: ['id', 'display_name', 'avatar_url'] }],
    order: [['created_at', 'ASC']],
  });

  const commentIds = comments.map((c: any) => c.id);
  const likeCounts = new Map<string, number>();
  const viewerLiked = new Set<string>();

  if (commentIds.length > 0) {
    const likes = await CommunityLike.findAll({
      where: { likeable_type: 'comment', likeable_id: commentIds },
    });
    for (const like of likes as any[]) {
      likeCounts.set(like.likeable_id, (likeCounts.get(like.likeable_id) ?? 0) + 1);
      if (like.member_id === member.id) viewerLiked.add(like.likeable_id);
    }
  }

  const byId = new Map<string, CommentItem>();
  const topLevel: CommentItem[] = [];

  for (const c of comments as any[]) {
    const item: CommentItem = {
      id: c.id,
      body: c.body,
      parent_comment_id: c.parent_comment_id,
      like_count: likeCounts.get(c.id) ?? 0,
      viewer_has_liked: viewerLiked.has(c.id),
      created_at: c.created_at,
      member: { id: c.member.id, display_name: c.member.display_name, avatar_url: c.member.avatar_url },
      replies: [],
    };
    byId.set(c.id, item);
    if (!c.parent_comment_id) {
      topLevel.push(item);
    }
  }

  for (const c of comments as any[]) {
    if (c.parent_comment_id) {
      const parent = byId.get(c.parent_comment_id);
      const child = byId.get(c.id);
      if (parent && child) parent.replies.push(child);
    }
  }

  return topLevel;
}

// ─── Likes (the points currency) ────────────────────────────────────────

export interface LikeResult {
  liked: boolean;
  like_count: number;
}

// Idempotent toggle: a second call from the same member on the same target
// undoes the first (unlike). Backed by CommunityLike's UNIQUE(member_id,
// likeable_type, likeable_id) constraint — findOrCreate is Sequelize's
// race-safe insert-or-detect-existing, equivalent to the model's documented
// ON CONFLICT DO NOTHING intent (the DB constraint makes a true double-insert
// impossible regardless of which safe API reaches it first).
// 1 like = 1 point, awarded/removed on the TARGET AUTHOR's CommunityMember
// row, only when a like row is actually created/destroyed (never on a no-op) —
// self-likes are allowed (a member can like their own post/comment once) since
// the unique constraint already caps it at one point, not a farmable loop.
export async function toggleLike(
  enrollmentId: string,
  likeableType: CommunityLikeableType,
  likeableId: string
): Promise<LikeResult> {
  const [member, cohortId] = await Promise.all([
    getOrCreateMember(enrollmentId),
    resolveCohortId(enrollmentId),
  ]);

  let authorMemberId: string;
  let post: CommunityPost | null = null;

  if (likeableType === 'post') {
    post = await CommunityPost.findByPk(likeableId);
    if (!post || post.cohort_id !== cohortId) {
      throw notFoundError('Post not found');
    }
    authorMemberId = post.member_id;
  } else {
    const comment = await CommunityComment.findByPk(likeableId);
    if (!comment) {
      throw notFoundError('Comment not found');
    }
    const parentPost = await CommunityPost.findByPk(comment.post_id);
    if (!parentPost || parentPost.cohort_id !== cohortId) {
      throw notFoundError('Comment not found');
    }
    authorMemberId = comment.member_id;
  }

  const [likeRow, created] = await CommunityLike.findOrCreate({
    where: { member_id: member.id, likeable_type: likeableType, likeable_id: likeableId },
  });

  let liked: boolean;
  if (created) {
    await CommunityMember.increment('points', { by: 1, where: { id: authorMemberId } });
    if (post) await post.increment('like_count', { by: 1 });
    liked = true;
  } else {
    await likeRow.destroy();
    await CommunityMember.decrement('points', { by: 1, where: { id: authorMemberId } });
    if (post) await post.decrement('like_count', { by: 1 });
    liked = false;
  }

  const updatedAuthor = await CommunityMember.findByPk(authorMemberId);
  if (updatedAuthor) {
    const newLevel = levelFor(updatedAuthor.points);
    if (newLevel !== updatedAuthor.level) {
      await updatedAuthor.update({ level: newLevel });
    }
  }

  const likeCount = await CommunityLike.count({
    where: { likeable_type: likeableType, likeable_id: likeableId },
  });

  log('info', liked ? 'like_created' : 'like_removed', {
    likeable_type: likeableType,
    likeable_id: likeableId,
    member_id: member.id,
    author_member_id: authorMemberId,
    outcome: 'success',
  });

  return { liked, like_count: likeCount };
}

// ─── Member profiles + directory ────────────────────────────────────────

export interface MemberProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  level: number;
  points: number;
  presence: CommunityPresenceStatus;
  created_at: Date;
}

function toMemberProfile(member: CommunityMember): MemberProfile {
  return {
    id: member.id,
    display_name: member.display_name,
    avatar_url: member.avatar_url,
    bio: member.bio,
    level: member.level,
    points: member.points,
    presence: derivePresence(member.last_active_at),
    created_at: member.created_at,
  };
}

export async function getMyProfile(enrollmentId: string): Promise<MemberProfile> {
  const member = await getOrCreateMember(enrollmentId);
  return toMemberProfile(member);
}

// Cross-member lookups return NotFoundError uniformly whether the member
// doesn't exist OR belongs to a different cohort — avoids leaking cross-cohort
// member existence (per-student data isolation, root CLAUDE.md security rules).
export async function getMemberProfileById(enrollmentId: string, targetMemberId: string): Promise<MemberProfile> {
  const cohortId = await resolveCohortId(enrollmentId);

  const target = await CommunityMember.findByPk(targetMemberId, {
    include: [{ model: Enrollment, as: 'enrollment', attributes: ['cohort_id'] }],
  });
  if (!target || (target as any).enrollment?.cohort_id !== cohortId) {
    throw notFoundError('Member not found');
  }
  return toMemberProfile(target);
}

export async function updateMyProfile(enrollmentId: string, input: UpdateProfileInput): Promise<MemberProfile> {
  const member = await getOrCreateMember(enrollmentId);

  const updates: { display_name?: string; avatar_url?: string; bio?: string } = {};
  if (input.display_name !== undefined) updates.display_name = input.display_name;
  if (input.avatar_url !== undefined) updates.avatar_url = input.avatar_url;
  if (input.bio !== undefined) updates.bio = input.bio;

  await member.update(updates);
  log('info', 'profile_updated', { member_id: member.id, fields: Object.keys(updates), outcome: 'success' });
  return toMemberProfile(member);
}

// Cohort-scoped directory — ordered by points DESC, reusing the existing
// idx_community_members_points index. No leaderboard period/rank computation
// here (that's the separate, later "Gamification" ticket) — just a flat,
// point-ordered member list for the directory surface.
export async function listMembers(enrollmentId: string): Promise<MemberProfile[]> {
  const cohortId = await resolveCohortId(enrollmentId);

  const members = await CommunityMember.findAll({
    include: [{ model: Enrollment, as: 'enrollment', attributes: [], where: { cohort_id: cohortId } }],
    order: [['points', 'DESC']],
  });

  return members.map(toMemberProfile);
}
