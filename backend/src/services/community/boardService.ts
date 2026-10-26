import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { CommunityLike, CommunityMember, CommunityPost } from '../../models';
import { getOrCreateMember, resolveCohortId } from '../communityService';
import { assembleBoard, laneOf, type BoardRow, type Lane, type PostLane } from './boardModel';
import { ritualOf, type PostRitual } from './boardRitual';
import { seenMarks } from './boardSeen';

/**
 * GET /api/portal/community/board (Campus v14 B1, Basecamp C65): the Community Board in sections for the viewer's cohort, scoped
 * exactly like GET /community/posts (cohort_id, status visible; a post above the viewer's level is a locked teaser, never its text).
 *
 * One read of the cohort's visible posts (light columns), then the pure boardModel decides lanes, buckets and lists; full post cards
 * are built only for the posts a list returns. Search narrows the lists (body or author name, case-insensitive), never the counts.
 * my_new_replies: replies by someone else on the viewer's posts newer than the viewer's last look at that post (or at the board).
 * FAILURE: any database error propagates; the route answers 500 with a stable class.
 */
export interface BoardPost {
  id: string;
  body: string | null;
  category: string | null;
  pinned: boolean;
  like_count: number;
  comment_count: number;
  viewer_has_liked: boolean;
  locked: boolean;
  min_level: number;
  created_at: string;
  member: { id: string; display_name: string; avatar_url: string | null; level: number };
  ritual: PostRitual | null;
  /** The ritual's guided field values (title and excerpt are built from these on the client); null when locked or not a ritual. */
  ritual_values: Record<string, string | string[]> | null;
  lane: PostLane;
  mine: boolean;
  /** Your own posts only: replies newer than your last look. */
  new_replies: number;
}

export interface BoardResponse {
  counts: Record<Lane, number>;
  open_questions: number;
  new_since: { at: string | null; count: number; by_lane: Record<Lane, number> };
  my_new_replies: number;
  pinned: BoardPost[];
  unanswered: BoardPost[];
  fresh: BoardPost[];
  this_week: BoardPost[];
  last_week: BoardPost[];
  older: { posts: BoardPost[]; next_cursor: string | null };
}

export interface BoardQuery { lane: Lane; q?: string; olderCursor: string | null; countsOnly: boolean }

interface Raw {
  id: string; member_id: string; category: string | null; pinned: boolean; created_at: Date; comment_count: number; like_count: number;
  min_level: number; body: string; week: number | null; ritual_meta: { ritual?: string; values?: Record<string, string | string[]> } | null;
}

function myNewReplies(rows: { post_id: string; created_at: Date | string }[], marks: Map<string, string>): Map<string, number> {
  const board = marks.get('board') ?? null;
  const out = new Map<string, number>();
  for (const r of rows) {
    const since = marks.get(`post:${r.post_id}`) ?? board;
    if (since && new Date(r.created_at).getTime() > new Date(since).getTime()) out.set(r.post_id, (out.get(r.post_id) ?? 0) + 1);
  }
  return out;
}

export async function getBoard(enrollmentId: string, query: BoardQuery, now = Date.now()): Promise<BoardResponse> {
  const started = Date.now();
  const [viewer, cohortId] = await Promise.all([getOrCreateMember(enrollmentId), resolveCohortId(enrollmentId)]);
  const raw = (await CommunityPost.findAll({
    where: { cohort_id: cohortId, status: 'visible' },
    attributes: ['id', 'member_id', 'category', 'pinned', 'created_at', 'comment_count', 'like_count', 'min_level', 'body', 'week', 'ritual_meta'],
    raw: true,
  })) as unknown as Raw[];
  const ritualById = new Map(raw.map((p) => [p.id, ritualOf(p.ritual_meta, p.body, p.week)]));
  const rows: BoardRow[] = raw.map((p) => ({
    id: p.id, member_id: p.member_id, category: p.category, pinned: !!p.pinned, ritual_key: ritualById.get(p.id)?.key ?? null,
    created_at: new Date(p.created_at).toISOString(), comment_count: Number(p.comment_count) || 0,
  }));

  const authorIds = Array.from(new Set(raw.map((p) => p.member_id)));
  const members = authorIds.length
    ? (await CommunityMember.findAll({ where: { id: authorIds }, attributes: ['id', 'display_name', 'avatar_url', 'level'], raw: true })) as unknown as BoardPost['member'][]
    : [];
  const memberById = new Map(members.map((m) => [m.id, m]));

  const byId = new Map(raw.map((p) => [p.id, p]));
  const term = (query.q ?? '').trim().toLowerCase();
  const listed = term
    ? rows.filter((r) => {
      const p = byId.get(r.id)!;
      return p.body.toLowerCase().includes(term) || (memberById.get(r.member_id)?.display_name ?? '').toLowerCase().includes(term);
    })
    : rows;

  const marks = await seenMarks(enrollmentId);
  const replyRows = await sequelize.query<{ post_id: string; created_at: Date }>(
    `SELECT c.post_id, c.created_at FROM community_comments c JOIN community_posts p ON p.id = c.post_id
      WHERE p.member_id = :me AND c.member_id <> :me AND c.status = 'visible'`,
    { replacements: { me: viewer.id }, type: QueryTypes.SELECT },
  );
  const newReplies = myNewReplies(replyRows, marks);
  const shape = assembleBoard(rows, listed, { lane: query.lane, viewerMemberId: viewer.id, seenAt: marks.get('board') ?? null, now, olderCursor: query.olderCursor });
  const head = {
    counts: shape.counts, open_questions: shape.open_questions, new_since: shape.new_since,
    my_new_replies: Array.from(newReplies.values()).reduce((a, b) => a + b, 0),
  };
  if (query.countsOnly) {
    return { ...head, pinned: [], unanswered: [], fresh: [], this_week: [], last_week: [], older: { posts: [], next_cursor: null } };
  }

  const wanted = [...shape.ids.pinned, ...shape.ids.unanswered, ...shape.ids.fresh, ...shape.ids.this_week, ...shape.ids.last_week, ...shape.ids.older.ids];
  const liked = wanted.length
    ? new Set(((await CommunityLike.findAll({ where: { likeable_type: 'post', likeable_id: wanted, member_id: viewer.id }, attributes: ['likeable_id'], raw: true })) as unknown as { likeable_id: string }[]).map((l) => l.likeable_id))
    : new Set<string>();
  const card = (id: string): BoardPost => {
    const p = byId.get(id)!;
    const mine = p.member_id === viewer.id;
    const locked = !mine && viewer.level < p.min_level;
    const ritual = ritualById.get(id) ?? null;
    const m = memberById.get(p.member_id);
    return {
      id, body: locked ? null : p.body, category: p.category, pinned: !!p.pinned, like_count: Number(p.like_count) || 0,
      comment_count: Number(p.comment_count) || 0, viewer_has_liked: liked.has(id), locked, min_level: p.min_level,
      created_at: new Date(p.created_at).toISOString(),
      member: { id: p.member_id, display_name: m?.display_name ?? 'Member', avatar_url: m?.avatar_url ?? null, level: m?.level ?? 1 },
      ritual, ritual_values: !locked && ritual && p.ritual_meta?.values ? p.ritual_meta.values : null,
      lane: laneOf({ pinned: !!p.pinned, category: p.category, ritual_key: ritual?.key ?? null }), mine, new_replies: mine ? newReplies.get(id) ?? 0 : 0,
    };
  };
  const res: BoardResponse = {
    ...head,
    pinned: shape.ids.pinned.map(card), unanswered: shape.ids.unanswered.map(card), fresh: shape.ids.fresh.map(card),
    this_week: shape.ids.this_week.map(card), last_week: shape.ids.last_week.map(card),
    older: { posts: shape.ids.older.ids.map(card), next_cursor: shape.ids.older.next_cursor },
  };
  console.log(JSON.stringify({ level: 'info', service: 'community-board', event: 'board_read', outcome: 'success', duration_ms: Date.now() - started, posts: raw.length, lane: query.lane, searched: !!term }));
  return res;
}
