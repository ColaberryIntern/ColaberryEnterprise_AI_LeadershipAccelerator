import { Op } from 'sequelize';
import CommunityMember, { CommunityPresenceStatus, CommunityMemberRole } from '../models/CommunityMember';
import ContributionEvent, { CATEGORY_META, ContributionCategory } from '../models/ContributionEvent';
import CommunityPost from '../models/CommunityPost';
import CommunityComment from '../models/CommunityComment';
import CommunityLike, { CommunityLikeableType } from '../models/CommunityLike';
import CommunityPostReport from '../models/CommunityPostReport';
import CommunityPointsEvent from '../models/CommunityPointsEvent';
import { awardCommunityXp } from './progression/communityXpService';
import { award, revoke, hasAwarded, sumPointsTodayByEventTypes, getPointsSummary, getTotalsForEnrollments, levelForPoints } from './pointsService';
import { centralDateKey } from './centralDate';
import { applyDailyCap, COMMUNITY_CAP, COMMUNITY_EVENT_TYPES } from './progression/dailyCap';
import CommunityNotification from '../models/CommunityNotification';
import Enrollment from '../models/Enrollment';
import Organization from '../models/Organization';
import OrgMember from '../models/OrgMember';
import { env } from '../config/env';
import { activeCompEnrollmentIds } from './subscriptionService';
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
// member-profile-system design mockup's level tiers exactly. Leaderboard
// ranking lives in communityLeaderboardService.ts (REQ-C4); level-gated
// content enforcement is assertLevelUnlocked()/toFeedItem() below.
const LEVEL_TIERS = [
  { level: 1, min: 0 },
  { level: 2, min: 1500 },
  { level: 3, min: 2700 },
  { level: 4, min: 4200 },
] as const;

export function levelFor(points: number): number {
  // Reconcile (flag-gated, default OFF via COMMUNITY_LEVEL_USE_CANONICAL): defer
  // to the ONE canonical points ladder so the community level uses the same
  // 0/150/400/900 thresholds as the HUD/leaderboard, instead of the legacy
  // 0/1500/2700/4200 tiers below. Fully reversible — flag OFF is byte-identical
  // to the historical behavior.
  if (env.communityLevelUseCanonical) {
    return levelForPoints(points).level;
  }
  return LEVEL_TIERS.reduce((acc, tier) => (points >= tier.min ? tier.level : acc), 1);
}

// Contribution points — awarded to the author for creating content, so posting
// and commenting move the needle (previously only likes-received earned points,
// which made the leaderboard feel static). Tunable; adjust here to reweight.
const POINTS_PER_POST = 5;
const POINTS_PER_COMMENT = 2;

// Best-effort points award, mirroring the like→points path (bump points, log a
// points event so period leaderboards see it, recompute level). Wrapped so a
// points failure can NEVER fail the post/comment itself (failure-first).
async function awardContributionPoints(memberId: string, points: number): Promise<void> {
  try {
    await CommunityMember.increment('points', { by: points, where: { id: memberId } });
    await CommunityPointsEvent.create({ member_id: memberId, points });
    const member = await CommunityMember.findByPk(memberId);
    if (member) {
      const newLevel = levelFor(member.points);
      if (newLevel !== member.level) await member.update({ level: newLevel });
    }
  } catch (err) {
    log('warn', 'award_points_failed', {
      member_id: memberId, points, outcome: 'failure', error_class: (err as any)?.error_class ?? 'Error',
    });
  }
}

// Anti-cheat community daily cap (POINTS_DAILY_CAPS_ENABLED, default OFF). Clamp
// a canonical community points award (post/comment/like) so an enrollment's
// community-category total can never exceed COMMUNITY_CAP in one Central day.
// Governs the CANONICAL StudentPointsEvent ledger only — the one the HUD +
// leaderboard read; the legacy CommunityMember.points column is intentionally
// left alone. Flag OFF ⇒ returns the proposed amount unchanged (no query).
async function clampCommunityAward(enrollmentId: string, proposed: number): Promise<number> {
  if (!env.pointsDailyCapsEnabled) return proposed;
  const already = await sumPointsTodayByEventTypes(
    enrollmentId, [...COMMUNITY_EVENT_TYPES], centralDateKey(Date.now()),
  );
  return applyDailyCap({ alreadyAwardedToday: already, proposedAward: proposed, cap: COMMUNITY_CAP });
}

// The full "+5 for a post" reward bundle: legacy CommunityMember.points, the
// canonical StudentPointsEvent (HUD + leaderboard, community-cap-clamped), and
// the Community XP lane. Idempotent on the post's own event key
// (`community_post:<postId>`), so granting it twice is a no-op — that key also
// doubles as the post-quality gate's "already rewarded" marker, so the canonical
// event is written even when the daily cap clamps the grant to 0. Used at BOTH
// creation (gate OFF) and on the first peer like (gate ON), so whichever path
// grants the reward, it is identical. Best-effort throughout (never fails the
// post/like).
async function awardPostReward(enrollmentId: string, memberId: string, postId: string): Promise<void> {
  await awardContributionPoints(memberId, POINTS_PER_POST);
  const points = await clampCommunityAward(enrollmentId, POINTS_PER_POST);
  await award(enrollmentId, { eventType: 'community_post', eventKey: `community_post:${postId}`, points }).catch(() => {});
  await awardCommunityXp(enrollmentId, POINTS_PER_POST, `cxp:post:${postId}`, 'community:post').catch(() => {});
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
  body: string | null;
  media_urls: string[];
  category: string | null;
  pinned: boolean;
  like_count: number;
  comment_count: number;
  // Server-authenticated per-viewer like state (Phase 4 contract fix). The
  // frontend must render from this rather than defaulting every post to "not
  // liked" in transient component state — a page refresh used to lose the
  // viewer's likes because the truth never left the server.
  viewer_has_liked: boolean;
  mentioned_member_ids: string[];
  min_level: number;
  locked: boolean;
  created_at: Date;
  member: { id: string; display_name: string; avatar_url: string | null; level: number };
  // Up to 3 most-recent distinct commenters (avatar stack on the card).
  recent_commenters: { id: string; display_name: string; avatar_url: string | null }[];
}

// Cursor-based feed pagination (Phase 4 #4). The cursor is an opaque, ordering-
// aware keyset over (pinned, created_at, id) — the exact tuple listPosts orders
// by — so paging never skips or duplicates a row even as new posts land. It is
// base64url(JSON) rather than a bare offset so the client treats it as opaque.
interface PostCursor {
  pinned: boolean;
  created_at: string;
  id: string;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function encodePostCursor(item: { pinned: boolean; created_at: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ p: item.pinned, c: item.created_at.toISOString(), i: item.id })
  ).toString('base64url');
}

// Returns null (not throws) for a malformed cursor so a stale/garbage cursor
// degrades to "start from the top" rather than 500ing the feed.
function decodePostCursor(cursor: string): PostCursor | null {
  try {
    const raw = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof raw?.p !== 'boolean' || typeof raw?.c !== 'string' || typeof raw?.i !== 'string') {
      return null;
    }
    if (Number.isNaN(Date.parse(raw.c))) return null;
    return { pinned: raw.p, created_at: raw.c, id: raw.i };
  } catch {
    return null;
  }
}

// Batched viewer-liked lookup for a page of posts — one query for the whole
// page instead of N. Empty input short-circuits (no query) so an empty feed
// costs nothing.
async function viewerLikedPostIds(postIds: string[], viewerMemberId: string): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const likes = await CommunityLike.findAll({
    where: { likeable_type: 'post', likeable_id: postIds, member_id: viewerMemberId },
    attributes: ['likeable_id'],
  });
  return new Set((likes as any[]).map((l) => l.likeable_id));
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

// Exported for reuse by communityLeaderboardService.ts — same cohort
// resolution, single source of truth rather than a second copy.
export async function resolveCohortId(enrollmentId: string): Promise<string> {
  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) {
    throw notFoundError('Enrollment not found');
  }
  return enrollment.cohort_id;
}

// Systematic per-cohort authz check (REQ-C9): genuinely-missing or
// staff-removed posts are 404 (nothing to distinguish — hidden from every
// participant regardless of cohort); a real post that belongs to another
// cohort is 403, not 404 — the caller is explicitly denied, not left to
// guess whether the id exists. Every route that takes a :postId funnels
// through here so the cross-cohort behavior is enforced in one place.
async function requireVisiblePostInCohort(postId: string, cohortId: string): Promise<CommunityPost> {
  const post = await CommunityPost.findByPk(postId);
  if (!post || post.status === 'removed') {
    throw notFoundError('Post not found');
  }
  if (post.cohort_id !== cohortId) {
    throw forbiddenError('This post belongs to a different cohort');
  }
  return post;
}

// REQ-C4 gamification — hard block for interactions (comment/like/report) on
// content the viewer hasn't unlocked yet. The author can always reach their
// own post regardless of its gate. Read paths (listPosts/getPostById) do NOT
// call this — they degrade to a locked teaser instead of throwing (see
// toFeedItem) so the feed can still show that gated content exists.
function assertLevelUnlocked(post: CommunityPost, viewerMemberId: string, viewerLevel: number): void {
  if (post.member_id !== viewerMemberId && viewerLevel < post.min_level) {
    throw forbiddenError(`This content unlocks at level ${post.min_level}`);
  }
}

function toFeedItem(
  post: CommunityPost & { member: { id: string; display_name: string; avatar_url: string | null; level: number } },
  viewerMemberId: string,
  viewerLevel: number,
  viewerHasLiked: boolean,
  recentCommenters: PostFeedItem['recent_commenters'] = []
): PostFeedItem {
  const locked = post.member_id !== viewerMemberId && viewerLevel < post.min_level;
  return {
    id: post.id,
    body: locked ? null : post.body,
    media_urls: locked ? [] : post.media_urls,
    category: post.category,
    pinned: post.pinned,
    like_count: post.like_count,
    comment_count: post.comment_count,
    viewer_has_liked: viewerHasLiked,
    mentioned_member_ids: locked ? [] : post.mentioned_member_ids,
    min_level: post.min_level,
    locked,
    created_at: post.created_at,
    member: { id: post.member.id, display_name: post.member.display_name, avatar_url: post.member.avatar_url, level: post.member.level },
    recent_commenters: recentCommenters,
  };
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
    min_level: input.min_level ?? 0,
    // Curriculum tether — only present on Community Ritual posts (service-derived).
    program_id: input.program_id ?? null,
    week: input.week ?? null,
    source_card_id: input.source_card_id ?? null,
    ritual_meta: input.ritual_meta ?? null,
  });

  // In-app notification per mention (REQ-C6) — one row per (recipient, post),
  // fired exactly once since the post itself is only ever created once here.
  if (mentionedIds.length > 0) {
    await CommunityNotification.bulkCreate(
      mentionedIds.map((mentionedId) => ({
        member_id: mentionedId,
        actor_member_id: member.id,
        notification_type: 'mention' as const,
        source_type: 'post' as const,
        source_id: post.id,
      }))
    );
  }

  // Reward the author for contributing (Ali feedback 2026-07-20 — posting now
  // earns points, not just likes-received): legacy points + the canonical ONE
  // ledger (HUD + leaderboard) + the Community XP lane. Best-effort; never
  // breaks the post.
  //
  // Post-quality gate (COMMUNITY_POST_QUALITY_GATE_ENABLED, default OFF): when
  // ON, the +5 is WITHHELD at creation — a spam post that no peer engages with
  // earns nothing — and released on the first peer like instead (see
  // toggleLike). Flag OFF ⇒ the reward fires on creation exactly as before.
  if (!env.communityPostQualityGateEnabled) {
    await awardPostReward(enrollmentId, member.id, post.id);
  }

  log('info', 'post_created', {
    post_id: post.id, member_id: member.id, cohort_id: cohortId, min_level: post.min_level, outcome: 'success',
  });

  // The author is creating their own post — never locked to them, so this
  // is a plain projection rather than a toFeedItem() lock check. Author badge
  // uses the canonical level (one ladder).
  const authorLevel = levelForPoints((await getPointsSummary(enrollmentId)).total).level;
  return {
    id: post.id,
    body: post.body,
    media_urls: post.media_urls,
    category: post.category,
    pinned: post.pinned,
    like_count: post.like_count,
    comment_count: post.comment_count,
    viewer_has_liked: false,
    mentioned_member_ids: post.mentioned_member_ids,
    min_level: post.min_level,
    locked: false,
    created_at: post.created_at,
    member: { id: member.id, display_name: member.display_name, avatar_url: member.avatar_url, level: authorLevel },
    recent_commenters: [],
  };
}

export interface ListPostsOptions {
  category?: string;
  cursor?: string | null;
  limit?: number;
}

export interface PostFeedPage {
  posts: PostFeedItem[];
  next_cursor: string | null;
}

// Cursor-paginated cohort feed. Ordering is (pinned DESC, created_at DESC,
// id DESC) — the id tiebreak makes it deterministic when two posts share a
// timestamp, which is exactly what keyset pagination needs to never skip or
// repeat a row. A cursor selects "everything strictly after this tuple" via a
// row-value comparison expressed as an Op.or ladder; without a cursor the first
// page is returned unfiltered (so the existing cohort/category where-shape is
// unchanged). Fetches limit+1 to detect whether a further page exists.
// Up to 3 most-recent distinct commenters per post (avatar stack on the card).
// One query for the whole page; empty input short-circuits.
async function recentCommentersByPost(
  postIds: string[]
): Promise<Map<string, { id: string; display_name: string; avatar_url: string | null }[]>> {
  const byPost = new Map<string, { id: string; display_name: string; avatar_url: string | null }[]>();
  if (postIds.length === 0) return byPost;
  const comments = await CommunityComment.findAll({
    where: { post_id: postIds },
    include: [{ model: CommunityMember, as: 'member', attributes: ['id', 'display_name', 'avatar_url', 'level', 'enrollment_id'] }],
    order: [['created_at', 'DESC']],
  });
  for (const c of comments as any[]) {
    const list = byPost.get(c.post_id) ?? [];
    if (list.length < 3 && !list.some((m) => m.id === c.member.id)) {
      list.push({ id: c.member.id, display_name: c.member.display_name, avatar_url: c.member.avatar_url });
      byPost.set(c.post_id, list);
    }
  }
  return byPost;
}

// The post-author level badge must show the ONE canonical level (same ladder as
// the profile/leaderboard/HUD), not the legacy CommunityMember.level. Batched:
// one query resolves every distinct author's canonical total → level.
async function canonicalLevelByMemberId(
  members: Array<{ id: string; enrollment_id?: string | null; level: number }>,
): Promise<Map<string, number>> {
  const enrollmentIds = members.map((m) => m.enrollment_id).filter(Boolean) as string[];
  const totals = await getTotalsForEnrollments(enrollmentIds);
  const out = new Map<string, number>();
  for (const m of members) {
    out.set(m.id, m.enrollment_id ? levelForPoints(totals.get(m.enrollment_id) ?? 0).level : m.level);
  }
  return out;
}

export async function listPosts(
  enrollmentId: string,
  options: ListPostsOptions = {}
): Promise<PostFeedPage> {
  const [viewer, cohortId] = await Promise.all([
    getOrCreateMember(enrollmentId),
    resolveCohortId(enrollmentId),
  ]);

  const limit = Math.min(Math.max(1, options.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);

  const where: Record<string, unknown> = { cohort_id: cohortId, status: 'visible' };
  if (options.category) {
    where.category = options.category;
  }

  const cursor = options.cursor ? decodePostCursor(options.cursor) : null;
  if (cursor) {
    // Row-value keyset: rows after (pinned, created_at, id) under the DESC
    // ordering above. Booleans compare false < true in Postgres, so a
    // pinned-false cursor correctly yields no earlier (pinned-true) rows.
    where[Op.or as any] = [
      { pinned: { [Op.lt]: cursor.pinned } },
      { pinned: cursor.pinned, created_at: { [Op.lt]: new Date(cursor.created_at) } },
      { pinned: cursor.pinned, created_at: new Date(cursor.created_at), id: { [Op.lt]: cursor.id } },
    ];
  }

  const rows = await CommunityPost.findAll({
    where,
    include: [{ model: CommunityMember, as: 'member', attributes: ['id', 'display_name', 'avatar_url', 'level', 'enrollment_id'] }],
    order: [
      ['pinned', 'DESC'],
      ['created_at', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: limit + 1,
  });

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const postIds = pageRows.map((p: any) => p.id);
  const [likedIds, commentersByPost] = await Promise.all([
    viewerLikedPostIds(postIds, viewer.id),
    recentCommentersByPost(postIds),
  ]);
  const posts = pageRows.map((post: any) =>
    toFeedItem(post, viewer.id, viewer.level, likedIds.has(post.id), commentersByPost.get(post.id) ?? []));

  // Author badges show the canonical level (one ladder everywhere).
  const authorLevels = await canonicalLevelByMemberId(pageRows.map((p: any) => p.member).filter(Boolean));
  for (const p of posts) p.member.level = authorLevels.get(p.member.id) ?? p.member.level;

  const last = pageRows[pageRows.length - 1] as any;
  const next_cursor = hasMore && last ? encodePostCursor(last) : null;

  return { posts, next_cursor };
}

// New read endpoint (REQ-C4) — the demo surface for "open gated content, see
// it locked." Unlike the interact endpoints, a locked post is not an error:
// it's a 200 with a teaser (no body/media/mentions) so the feed can still
// show that gated content exists and what level unlocks it.
export async function getPostById(enrollmentId: string, postId: string): Promise<PostFeedItem> {
  const [viewer, cohortId] = await Promise.all([
    getOrCreateMember(enrollmentId),
    resolveCohortId(enrollmentId),
  ]);

  const post = await requireVisiblePostInCohort(postId, cohortId);
  const withMember = await CommunityPost.findByPk(post.id, {
    include: [{ model: CommunityMember, as: 'member', attributes: ['id', 'display_name', 'avatar_url', 'level', 'enrollment_id'] }],
  });
  const likedIds = await viewerLikedPostIds([post.id], viewer.id);
  const item = toFeedItem(withMember as any, viewer.id, viewer.level, likedIds.has(post.id));
  const author = (withMember as any)?.member;
  if (author) item.member.level = (await canonicalLevelByMemberId([author])).get(author.id) ?? item.member.level;
  return item;
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
  const [member, cohortId] = await Promise.all([
    getOrCreateMember(enrollmentId),
    resolveCohortId(enrollmentId),
  ]);

  const post = await CommunityPost.findByPk(postId, {
    include: [{ model: CommunityMember, as: 'member', attributes: ['id', 'display_name', 'avatar_url', 'level', 'enrollment_id'] }],
  });
  if (!post || post.status === 'removed') {
    throw notFoundError('Post not found');
  }
  if (post.cohort_id !== cohortId) {
    throw forbiddenError('This post belongs to a different cohort');
  }
  if (post.member_id !== member.id) {
    throw forbiddenError('Only the post author can pin or unpin this post');
  }

  if (post.pinned !== input.pinned) {
    await post.update({ pinned: input.pinned });
  }

  log('info', 'post_pin_toggled', { post_id: post.id, member_id: member.id, pinned: input.pinned, outcome: 'success' });

  // Author-only route — never locked to the caller. The author may still have
  // liked their own post, so surface the real viewer_has_liked rather than
  // hardcoding false (which would flicker the like button off after a pin).
  const likedIds = await viewerLikedPostIds([post.id], member.id);
  const postAny = post as any;
  // Author-only route — the author IS the caller, so the canonical badge level
  // is the caller's own canonical level (one ladder).
  const authorLevel = levelForPoints((await getPointsSummary(enrollmentId)).total).level;
  return {
    id: post.id,
    body: post.body,
    media_urls: post.media_urls,
    category: post.category,
    pinned: post.pinned,
    like_count: post.like_count,
    comment_count: post.comment_count,
    viewer_has_liked: likedIds.has(post.id),
    mentioned_member_ids: post.mentioned_member_ids,
    min_level: post.min_level,
    locked: false,
    created_at: post.created_at,
    member: {
      id: postAny.member.id,
      display_name: postAny.member.display_name,
      avatar_url: postAny.member.avatar_url,
      level: authorLevel,
    },
    recent_commenters: [],
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

  const post = await requireVisiblePostInCohort(postId, cohortId);
  assertLevelUnlocked(post, member.id, member.level);

  let parentCommentId: string | null = null;
  let notifyRecipientId: string | null = post.member_id;
  if (input.parent_comment_id) {
    const parent = await CommunityComment.findByPk(input.parent_comment_id);
    if (!parent || parent.post_id !== postId) {
      throw notFoundError('Parent comment not found on this post');
    }
    if (parent.parent_comment_id) {
      throw validationError('Replies are one level deep only — cannot reply to a reply');
    }
    parentCommentId = parent.id;
    // A reply notifies the parent comment's author, not the post's author —
    // one recipient per comment event, keeping this a 1:1 event->notification.
    notifyRecipientId = parent.member_id;
  }

  const comment = await CommunityComment.create({
    post_id: postId,
    member_id: member.id,
    parent_comment_id: parentCommentId,
    body: input.body,
  });

  await post.increment('comment_count', { by: 1 });

  // Reward the commenter for contributing (Ali feedback 2026-07-20). The
  // canonical award is community-cap-clamped (POINTS_DAILY_CAPS_ENABLED); flag
  // OFF ⇒ full POINTS_PER_COMMENT, byte-identical to today.
  await awardContributionPoints(member.id, POINTS_PER_COMMENT);
  const commentPoints = await clampCommunityAward(enrollmentId, POINTS_PER_COMMENT);
  await award(enrollmentId, { eventType: 'community_comment', eventKey: `community_comment:${comment.id}`, points: commentPoints }).catch(() => {});
  await awardCommunityXp(enrollmentId, POINTS_PER_COMMENT, `cxp:comment:${comment.id}`, 'community:comment').catch(() => {});

  // In-app "reply" notification (REQ-C6) — skip self-notifying when a member
  // comments on their own post/comment.
  if (notifyRecipientId && notifyRecipientId !== member.id) {
    await CommunityNotification.create({
      member_id: notifyRecipientId,
      actor_member_id: member.id,
      notification_type: 'reply',
      source_type: 'comment',
      source_id: comment.id,
    });
  }

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

  const post = await requireVisiblePostInCohort(postId, cohortId);
  assertLevelUnlocked(post, member.id, member.level);

  const comments = await CommunityComment.findAll({
    where: { post_id: postId },
    include: [{ model: CommunityMember, as: 'member', attributes: ['id', 'display_name', 'avatar_url', 'level', 'enrollment_id'] }],
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
    post = await requireVisiblePostInCohort(likeableId, cohortId);
    assertLevelUnlocked(post, member.id, member.level);
    authorMemberId = post.member_id;
  } else {
    const comment = await CommunityComment.findByPk(likeableId);
    if (!comment) {
      throw notFoundError('Comment not found');
    }
    // Cohort/removed-status is enforced against the parent post — a comment
    // has no cohort_id of its own (see model), so this is the only place a
    // wrong-cohort like attempt would surface.
    const parentPost = await requireVisiblePostInCohort(comment.post_id, cohortId);
    assertLevelUnlocked(parentPost, member.id, member.level);
    authorMemberId = comment.member_id;
  }

  const [likeRow, created] = await CommunityLike.findOrCreate({
    where: { member_id: member.id, likeable_type: likeableType, likeable_id: likeableId },
  });

  // Resolve the author's canonical (enrollment-scoped) identity + a stable,
  // presence-based key so a like awards +1 into the canonical StudentPointsEvent
  // ledger and an unlike revokes it. The community leaderboard reads only that
  // ledger, so without this likes-received would not count toward standings
  // (posts/comments/recognition already award canonically; this restores likes to
  // parity). Separate from the line-764 refetch, which reads post-increment points
  // for the legacy level column.
  const authorMember = await CommunityMember.findByPk(authorMemberId);
  const authorEnrollmentId = authorMember?.enrollment_id ?? null;
  const likeEventKey = `community_like:${likeableType}:${likeableId}:${member.id}`;

  let liked: boolean;
  if (created) {
    await CommunityMember.increment('points', { by: 1, where: { id: authorMemberId } });
    await CommunityPointsEvent.create({ member_id: authorMemberId, points: 1 });
    // Canonical: likes-received count on the leaderboard. Presence-based +
    // idempotent on (author, likeable, liker); self-likes award too (parity with
    // the legacy +1, capped at 1 by the unique like row). Best-effort, matching
    // the createPost/createComment canonical-award pattern in this file.
    if (authorEnrollmentId) {
      // Community-cap-clamped (POINTS_DAILY_CAPS_ENABLED); flag OFF ⇒ +1, byte-identical.
      const likePoints = await clampCommunityAward(authorEnrollmentId, 1);
      await award(authorEnrollmentId, {
        eventType: 'community_like',
        eventKey: likeEventKey,
        points: likePoints,
        metadata: { likeable_type: likeableType, likeable_id: likeableId, liker_member_id: member.id },
      }).catch(() => {});
    }

    // Post-quality gate (COMMUNITY_POST_QUALITY_GATE_ENABLED, default OFF): a
    // post's withheld +5 creation reward is released on the FIRST PEER like — a
    // like from someone other than the author (authorMemberId !== member.id, so a
    // self-like never triggers it). Idempotent: hasAwarded on the post's own
    // event key means a second peer like or a re-like after unlike never
    // double-releases. Only for post likes, never comment likes. Flag OFF ⇒ inert.
    if (
      env.communityPostQualityGateEnabled &&
      likeableType === 'post' &&
      authorMemberId !== member.id &&
      authorEnrollmentId
    ) {
      const alreadyRewarded = await hasAwarded(authorEnrollmentId, `community_post:${likeableId}`);
      if (!alreadyRewarded) {
        await awardPostReward(authorEnrollmentId, authorMemberId, likeableId);
      }
    }

    if (post) await post.increment('like_count', { by: 1 });
    // Notify the author that someone liked their content (Ali feedback 2026-07-20).
    // Only on a real new like (created) and never for a self-like. The notify is a
    // secondary side effect: a like must never fail because its notification failed.
    // This also keeps the like path working during a deploy where the new 'like'
    // code lands before the CHECK-constraint migration (20260720) runs — the insert
    // would be rejected, but the like itself still succeeds.
    if (authorMemberId !== member.id) {
      try {
        await CommunityNotification.create({
          member_id: authorMemberId,
          actor_member_id: member.id,
          notification_type: 'like',
          source_type: likeableType,
          source_id: likeableId,
        });
      } catch (err) {
        log('warn', 'like_notification_failed', {
          error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
          author_member_id: authorMemberId,
          actor_member_id: member.id,
          likeable_type: likeableType,
          likeable_id: likeableId,
        });
      }
    }
    liked = true;
  } else {
    await likeRow.destroy();
    await CommunityMember.decrement('points', { by: 1, where: { id: authorMemberId } });
    await CommunityPointsEvent.create({ member_id: authorMemberId, points: -1 });
    // Canonical: reverse the like-point so an unlike removes it from the
    // leaderboard. Idempotent — revoking an absent event is a no-op.
    if (authorEnrollmentId) {
      await revoke(authorEnrollmentId, likeEventKey).catch(() => {});
    }
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

// ─── Reporting (REQ-C9) ─────────────────────────────────────────────────

export interface ReportResult {
  report_id: string;
}

// Idempotent — a member reporting the same post twice returns the existing
// report row rather than creating a duplicate (unique constraint on
// post_id+reporter_member_id). Cross-cohort/removed-post reporting is
// rejected the same way any other post interaction is.
export async function reportPost(enrollmentId: string, postId: string, reason?: string): Promise<ReportResult> {
  const [member, cohortId] = await Promise.all([
    getOrCreateMember(enrollmentId),
    resolveCohortId(enrollmentId),
  ]);

  const post = await requireVisiblePostInCohort(postId, cohortId);
  assertLevelUnlocked(post, member.id, member.level);

  const [report] = await CommunityPostReport.findOrCreate({
    where: { post_id: postId, reporter_member_id: member.id },
    defaults: { post_id: postId, reporter_member_id: member.id, reason: reason ?? null },
  });

  log('info', 'post_reported', { post_id: postId, reporter_member_id: member.id, outcome: 'success' });

  return { report_id: report.id };
}

// ─── Member profiles + directory ────────────────────────────────────────

// A member's earned recognition badges, surfaced on the directory + profile
// drawer. Reuses the Rooms recognition ledger (ContributionEvent) — these are
// the same badges getImpact() shows, not a parallel system.
export interface MemberBadge {
  category: ContributionCategory;
  label: string;
  emoji: string;
  count: number;
}

export interface MemberProfile {
  id: string;
  // Enrollment id — the DM + friend flows are enrollment-keyed (openDm,
  // sendFriendRequest), and the profile drawer wires those buttons. Already
  // client-exposed via the cohort presence API, so this is not a new leak.
  enrollment_id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  level: number;
  points: number;
  role: CommunityMemberRole;
  badges: MemberBadge[];
  presence: CommunityPresenceStatus;
  created_at: Date;
}

// Batch a set of enrollments -> their earned badges (grouped ContributionEvent
// categories, count DESC). One query for the whole directory page rather than
// getImpact() per member. Enrollments with no recognition get an empty array.
async function badgesByEnrollment(enrollmentIds: string[]): Promise<Map<string, MemberBadge[]>> {
  const out = new Map<string, MemberBadge[]>();
  if (enrollmentIds.length === 0) return out;

  const rows = await ContributionEvent.findAll({ where: { enrollment_id: enrollmentIds } });
  const byEnr = new Map<string, Map<ContributionCategory, number>>();
  for (const r of rows as any[]) {
    const cats = byEnr.get(r.enrollment_id) ?? new Map<ContributionCategory, number>();
    cats.set(r.category, (cats.get(r.category) ?? 0) + 1);
    byEnr.set(r.enrollment_id, cats);
  }
  for (const [enr, cats] of byEnr) {
    const badges = Array.from(cats.entries())
      .map(([category, count]) => ({ category, label: CATEGORY_META[category].label, emoji: CATEGORY_META[category].emoji, count }))
      .sort((a, b) => b.count - a.count);
    out.set(enr, badges);
  }
  return out;
}

// points/level come from the ONE canonical ledger (StudentPointsEvent + the
// LEVELS ladder), NOT the legacy CommunityMember.points column — so a member's
// score/level here matches the top-right HUD everywhere.
function toMemberProfile(member: CommunityMember, canonicalPoints: number, badges: MemberBadge[] = []): MemberProfile {
  return {
    id: member.id,
    enrollment_id: member.enrollment_id,
    display_name: member.display_name,
    avatar_url: member.avatar_url,
    bio: member.bio,
    level: levelForPoints(canonicalPoints).level,
    points: canonicalPoints,
    role: member.role ?? 'student',
    badges,
    presence: derivePresence(member.last_active_at),
    created_at: member.created_at,
  };
}

export async function getMyProfile(enrollmentId: string): Promise<MemberProfile> {
  const [member, summary] = await Promise.all([getOrCreateMember(enrollmentId), getPointsSummary(enrollmentId)]);
  const badges = (await badgesByEnrollment([member.enrollment_id])).get(member.enrollment_id) ?? [];
  return toMemberProfile(member, summary.total, badges);
}

// Platform-wide member lookup (not cohort-scoped) — any signed-in participant
// can view any other member's profile, matching the fully-open People
// directory below and the cross-cohort friend requests in friendshipService.ts.
export async function getMemberProfileById(enrollmentId: string, targetMemberId: string): Promise<MemberProfile> {
  const target = await CommunityMember.findByPk(targetMemberId, {
    include: [{ model: Enrollment, as: 'enrollment', attributes: ['cohort_id'] }],
  });
  if (!target) {
    throw notFoundError('Member not found');
  }
  const total = (await getPointsSummary(target.enrollment_id)).total;
  const badges = (await badgesByEnrollment([target.enrollment_id])).get(target.enrollment_id) ?? [];
  return toMemberProfile(target, total, badges);
}

export async function updateMyProfile(enrollmentId: string, input: UpdateProfileInput): Promise<MemberProfile> {
  const member = await getOrCreateMember(enrollmentId);

  const updates: { display_name?: string; avatar_url?: string; bio?: string } = {};
  if (input.display_name !== undefined) updates.display_name = input.display_name;
  if (input.avatar_url !== undefined) updates.avatar_url = input.avatar_url;
  if (input.bio !== undefined) updates.bio = input.bio;

  await member.update(updates);
  log('info', 'profile_updated', { member_id: member.id, fields: Object.keys(updates), outcome: 'success' });
  const total = (await getPointsSummary(enrollmentId)).total;
  const badges = (await badgesByEnrollment([member.enrollment_id])).get(member.enrollment_id) ?? [];
  return toMemberProfile(member, total, badges);
}

// Directory search/filter/pagination (People directory). search = name substring
// (case-insensitive); role = exact role; minLevel filters on the CANONICAL level
// (derived from points, so applied in JS after totals resolve). Pagination is
// offset/limit over the points-sorted set — cohort-scale, so fetch-all-then-slice
// is fine and keeps the canonical sort authoritative.
export interface DirectoryQuery {
  search?: string;
  role?: CommunityMemberRole;
  minLevel?: number;
  limit?: number;
  offset?: number;
}

export interface DirectoryPage {
  members: MemberProfile[];
  total: number;
  has_more: boolean;
}

const DIRECTORY_DEFAULT_LIMIT = 24;
const DIRECTORY_MAX_LIMIT = 100;

// Platform-wide directory (not cohort-scoped) — ordered by canonical points
// DESC. Points/level/badges come from the ONE ledger + recognition (batched),
// so this matches the leaderboard + HUD. `members` is always present; new
// callers read total/has_more.
export async function listMembers(enrollmentId: string, query: DirectoryQuery = {}): Promise<DirectoryPage> {
  const where: Record<string, unknown> = {};
  if (query.role) where.role = query.role;
  const search = query.search?.trim();
  if (search) where.display_name = { [Op.iLike]: `%${search}%` };

  const members = await CommunityMember.findAll({
    where,
    include: [{ model: Enrollment, as: 'enrollment', attributes: [] }],
  });

  const enrollmentIds = members.map((m: any) => m.enrollment_id);
  const [totals, badges] = await Promise.all([
    getTotalsForEnrollments(enrollmentIds),
    badgesByEnrollment(enrollmentIds),
  ]);

  let ranked = members
    .map((m: any) => {
      const pts = totals.get(m.enrollment_id) ?? 0;
      return { profile: toMemberProfile(m, pts, badges.get(m.enrollment_id) ?? []), pts };
    })
    .sort((a, b) => b.pts - a.pts || a.profile.display_name.localeCompare(b.profile.display_name));

  if (typeof query.minLevel === 'number') {
    ranked = ranked.filter((x) => x.profile.level >= (query.minLevel as number));
  }

  const total = ranked.length;
  const offset = Math.max(0, query.offset ?? 0);
  const limit = Math.min(DIRECTORY_MAX_LIMIT, Math.max(1, query.limit ?? DIRECTORY_DEFAULT_LIMIT));
  const page = ranked.slice(offset, offset + limit).map((x) => x.profile);

  return { members: page, total, has_more: offset + page.length < total };
}

// Admin-only: set a member's directory role. Idempotent — setting the same role
// again is a no-op write. Validates the role against the allowed set so a bad
// value never reaches the CHECK constraint. Returns the updated profile.
const MEMBER_ROLES: readonly CommunityMemberRole[] = ['student', 'mentor', 'staff'];

export function isMemberRole(value: string): value is CommunityMemberRole {
  return (MEMBER_ROLES as readonly string[]).includes(value);
}

// Admin roster for the role-assignment screen: every community member (across
// cohorts), name + email + current role, so an admin can find someone and
// promote them. Name search (ILIKE), capped. Not cohort-scoped — this is an
// admin-only surface (requireAdmin at the route).
export interface AdminMemberRow {
  id: string;
  // The member's enrollment id — used to mint the read-only "View as" token.
  enrollment_id: string | null;
  display_name: string;
  email: string | null;
  role: CommunityMemberRole;
  // Enrollment (sign-up) timestamp, ISO-8601, or null if the member has no
  // linked enrollment. The admin roster is ordered newest-first by this.
  signed_up_at: string | null;
  // True when this member's enrollment holds an active comped ('Free Access')
  // seat — full program access at $0, granted by an admin (not a paid plan).
  free_access: boolean;
  // Management-portal role (owner/admin/curriculum/revenue/admissions/support)
  // for staff members, or null. Drives the Mgmt Role control on the roster.
  mgmt_role: string | null;
}

export async function listMembersForAdmin(search?: string): Promise<AdminMemberRow[]> {
  const where: Record<string, unknown> = {};
  const q = search?.trim();
  if (q) where.display_name = { [Op.iLike]: `%${q}%` };

  // Order newest-first by sign-up (enrollment.created_at) DB-side so the 200-row
  // cap keeps the most recent members, then re-sort in JS to make the final
  // order deterministic and push null-enrollment rows last (Postgres would sort
  // NULLs first under DESC).
  const members = await CommunityMember.findAll({
    where,
    include: [{ model: Enrollment, as: 'enrollment', attributes: ['email', 'created_at'] }],
    order: [[{ model: Enrollment, as: 'enrollment' }, 'created_at', 'DESC']],
    limit: 200,
  });

  // Flag who currently holds a comped ('Free Access') seat — one batched query.
  const compSet = await activeCompEnrollmentIds(
    members.map((m: any) => m.enrollment_id).filter(Boolean),
  );

  const rows: AdminMemberRow[] = members.map((m: any) => ({
    id: m.id,
    enrollment_id: m.enrollment_id ?? null,
    display_name: m.display_name,
    email: m.enrollment?.email ?? null,
    role: (m.role as CommunityMemberRole) ?? 'student',
    signed_up_at: m.enrollment?.created_at ? new Date(m.enrollment.created_at).toISOString() : null,
    free_access: m.enrollment_id ? compSet.has(m.enrollment_id) : false,
    mgmt_role: m.mgmt_role ?? null,
  }));

  rows.sort((a, b) => (b.signed_up_at ?? '').localeCompare(a.signed_up_at ?? ''));
  return rows;
}

/**
 * Auto-roster sync: keep every org flagged `auto_staff_sync` in step with the
 * community 'staff' role. Assigning staff adds the person as a member (idempotent
 * on (org_id, email); it never downgrades an existing manager); un-assigning staff
 * removes their member row. Manager rows are never touched by a role change.
 * Best-effort — a sync failure must never fail the role change itself.
 */
async function syncStaffToAutoOrgs(enrollmentId: string, isStaff: boolean): Promise<void> {
  try {
    const orgs = await Organization.findAll({ where: { auto_staff_sync: true }, attributes: ['id'] });
    if (!orgs.length) return;
    const enrollment = await Enrollment.findByPk(enrollmentId, { attributes: ['email'] });
    const email = (enrollment as any)?.email;
    if (!email) return;
    for (const org of orgs) {
      if (isStaff) {
        await OrgMember.findOrCreate({
          where: { org_id: org.id, email },
          defaults: {
            org_id: org.id, enrollment_id: enrollmentId, email,
            role: 'member', invite_status: 'active', team: 'Staff', joined_at: new Date(),
          } as any,
        });
      } else {
        // Demoted from staff → drop them from the auto-roster (member rows only; a
        // manager is never removed by a community role change).
        await OrgMember.destroy({ where: { org_id: org.id, email, role: 'member' } });
      }
    }
  } catch (err: any) {
    log('warn', 'staff_org_sync_failed', {
      enrollment_id: enrollmentId, is_staff: isStaff, outcome: 'failure', error_class: err?.error_class ?? 'Error',
    });
  }
}

export async function setMemberRole(targetMemberId: string, role: CommunityMemberRole): Promise<MemberProfile> {
  if (!isMemberRole(role)) {
    throw Object.assign(new Error(`Invalid role: ${role}`), { error_class: 'ValidationError' });
  }
  const member = await CommunityMember.findByPk(targetMemberId);
  if (!member) {
    throw notFoundError('Member not found');
  }
  await member.update({ role });
  log('info', 'member_role_set', { member_id: member.id, role, outcome: 'success' });
  // Keep auto_staff_sync org rosters in step with the staff role (best-effort).
  await syncStaffToAutoOrgs(member.enrollment_id, role === 'staff');
  const total = (await getPointsSummary(member.enrollment_id)).total;
  const badges = (await badgesByEnrollment([member.enrollment_id])).get(member.enrollment_id) ?? [];
  return toMemberProfile(member, total, badges);
}
