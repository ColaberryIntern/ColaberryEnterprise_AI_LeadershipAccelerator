import CommunityMember from '../models/CommunityMember';
import CommunityPost from '../models/CommunityPost';
import Enrollment from '../models/Enrollment';
import { CreatePostInput, TogglePinInput } from '../schemas/communitySchemas';

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
