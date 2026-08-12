/**
 * Community moderation core (REQ-C9, BC #10077100017; comment removal added
 * 2026-08-05 for the Community Organizer role). Owns the actual soft-delete
 * for posts and comments. Two callers reach it: the admin console
 * (communityModerationRoutes.ts, admin JWT via requireAdmin — reports queue +
 * post removal, audited by auditMiddleware on that router) and the portal
 * feed itself (communityService.removePostAsModerator/removeCommentAsModerator,
 * participant JWT — this is how Owner/Admin/Community Organizer delete
 * someone else's post/comment right from the Belong feed, per Ali 2026-08-05).
 * Neither caller re-implements the soft-delete logic here.
 */
import CommunityPost from '../models/CommunityPost';
import CommunityPostReport from '../models/CommunityPostReport';
import CommunityMember from '../models/CommunityMember';
import CommunityComment from '../models/CommunityComment';

function notFoundError(message: string): Error {
  return Object.assign(new Error(message), { error_class: 'NotFoundError' });
}

function log(level: 'info' | 'warn' | 'error', event: string, ctx: Record<string, unknown>): void {
  console[level](JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'community_moderation', event, ...ctx }));
}

export interface ReportedPostSummary {
  post_id: string;
  body: string;
  cohort_id: string;
  status: 'visible' | 'removed';
  report_count: number;
  reasons: (string | null)[];
  author: { id: string; display_name: string };
  created_at: Date;
}

/**
 * Every still-visible post that has at least one report, most-reported
 * first. Removed posts drop off this view once staff has acted on them.
 */
export async function listReportedPosts(): Promise<ReportedPostSummary[]> {
  const reports = await CommunityPostReport.findAll({
    include: [
      {
        model: CommunityPost,
        as: 'post',
        where: { status: 'visible' },
        include: [{ model: CommunityMember, as: 'member', attributes: ['id', 'display_name'] }],
      },
    ],
    order: [['created_at', 'DESC']],
  });

  const byPost = new Map<string, ReportedPostSummary>();
  for (const r of reports as any[]) {
    const post = r.post;
    if (!post) continue; // report on a post since deleted outright (FK cascade edge case)

    if (!byPost.has(post.id)) {
      byPost.set(post.id, {
        post_id: post.id,
        body: post.body,
        cohort_id: post.cohort_id,
        status: post.status,
        report_count: 0,
        reasons: [],
        author: { id: post.member.id, display_name: post.member.display_name },
        created_at: post.created_at,
      });
    }
    const summary = byPost.get(post.id)!;
    summary.report_count += 1;
    summary.reasons.push(r.reason ?? null);
  }

  return Array.from(byPost.values()).sort((a, b) => b.report_count - a.report_count);
}

export interface RemovePostResult {
  post_id: string;
  status: 'visible' | 'removed';
}

/**
 * Idempotent — removing an already-removed post is a no-op that returns the
 * same end state, not an error.
 */
export async function removePost(adminUserId: string, postId: string): Promise<RemovePostResult> {
  const post = await CommunityPost.findByPk(postId);
  if (!post) {
    throw notFoundError('Post not found');
  }

  if (post.status !== 'removed') {
    await post.update({ status: 'removed', removed_at: new Date(), removed_by: adminUserId });
    log('info', 'post_removed', { post_id: postId, admin_user_id: adminUserId, outcome: 'success' });
  }

  return { post_id: post.id, status: post.status };
}

export interface RemoveCommentResult {
  comment_id: string;
  status: 'visible' | 'removed';
}

/**
 * Idempotent — removing an already-removed comment is a no-op that returns
 * the same end state, not an error. `actorId` is whoever took the action
 * (an admin User id from the admin console, or a CommunityMember id from a
 * Community Organizer acting in the portal feed — see
 * communityService.removeCommentAsModerator) recorded for audit only, no FK.
 */
export async function removeComment(actorId: string, commentId: string): Promise<RemoveCommentResult> {
  const comment = await CommunityComment.findByPk(commentId);
  if (!comment) {
    throw notFoundError('Comment not found');
  }

  if (comment.status !== 'removed') {
    await comment.update({ status: 'removed', removed_at: new Date(), removed_by: actorId });
    await CommunityPost.decrement('comment_count', { by: 1, where: { id: comment.post_id } });
    log('info', 'comment_removed', { comment_id: commentId, actor_id: actorId, outcome: 'success' });
  }

  return { comment_id: comment.id, status: comment.status };
}
