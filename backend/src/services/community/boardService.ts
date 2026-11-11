import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { Cohort, CommunityLike, CommunityMember, CommunityPost } from '../../models';
import { publicRitual, ritualForWeek } from '../runtime/communityRituals';
import { getOrCreateMember, resolveCohortId } from '../communityService';
import { assembleBoard, cohortWeek, laneOf, WEEK_MS, type BoardRow, type Lane, type PostLane } from './boardModel';
import { ritualOf, type PostRitual } from './boardRitual';
import { seenMarks } from './boardSeen';
import { noteText } from './boardText';

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
  /** The note's title and excerpt (boardText.noteText): never the ritual heading; a locked post says what unlocks it. */
  title: string;
  excerpt: string;
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
  /** This week's ritual bar (v14 B2): the viewer's cohort week, its ritual (prompt, guided fields, reaction) and how many posted it
   *  this week. Null with no cohort week (staff, business) and on counts_only. */
  week_ritual: { week: number; ritual: ReturnType<typeof publicRitual>; posted: number; category: string } | null;
}

export interface BoardQuery { lane: Lane; q?: string; olderCursor: string | null; countsOnly: boolean }

export interface Raw {
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

async function weekRitualFor(cohortId: string, rows: BoardRow[], now: number): Promise<BoardResponse['week_ritual']> {
  const cohort = (await Cohort.findByPk(cohortId, { attributes: ['start_date'], raw: true })) as unknown as { start_date: string } | null;
  const week = cohortWeek(cohort?.start_date, now);
  if (week === null) return null;
  const ritual = ritualForWeek(week);
  const since = now - WEEK_MS;
  const posted = rows.filter((r) => r.ritual_key === ritual.key && new Date(r.created_at).getTime() >= since).length;
  return { week, ritual: publicRitual(ritual), posted, category: ritual.category };
}

/** Everything a board read needs, loaded once: the viewer, their cohort's visible posts (light columns), authors, seen marks and the
 *  replies on the viewer's posts. Shared by getBoard and the Colaberry Now stream (boardStreamService, Campus v20 N2, C133). */
export interface BoardContext {
  viewer: { id: string; level: number };
  cohortId: string;
  raw: Raw[];
  rows: BoardRow[];
  listed: BoardRow[];
  term: string;
  byId: Map<string, Raw>;
  ritualById: Map<string, PostRitual | null>;
  memberById: Map<string, BoardPost['member']>;
  marks: Map<string, string>;
  newReplies: Map<string, number>;
  myNewReplies: number;
}

export async function loadBoardContext(enrollmentId: string, q?: string): Promise<BoardContext> {
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
  const term = (q ?? '').trim().toLowerCase();
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
  return {
    viewer, cohortId, raw, rows, listed, term, byId, ritualById, memberById, marks, newReplies,
    myNewReplies: Array.from(newReplies.values()).reduce((a, b) => a + b, 0),
  };
}

/** Full post cards for these ids (one likes read), exactly as the board shows them: a post above the viewer's level is a locked teaser. */
export async function cardsFor(ctx: BoardContext, ids: string[]): Promise<BoardPost[]> {
  const { viewer, byId, ritualById, memberById, newReplies } = ctx;
  const liked = ids.length
    ? new Set(((await CommunityLike.findAll({ where: { likeable_type: 'post', likeable_id: ids, member_id: viewer.id }, attributes: ['likeable_id'], raw: true })) as unknown as { likeable_id: string }[]).map((l) => l.likeable_id))
    : new Set<string>();
  return ids.map((id): BoardPost => {
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
      ...noteText({ body: locked ? null : p.body, locked, min_level: p.min_level, ritual_key: ritual?.key ?? null, ritual_values: p.ritual_meta?.values ?? null }),
    };
  });
}

/** This week's ritual for the context's cohort (null without a cohort week). */
export function weekRitualOf(ctx: BoardContext, now: number): Promise<BoardResponse['week_ritual']> {
  return weekRitualFor(ctx.cohortId, ctx.rows, now);
}

export async function getBoard(enrollmentId: string, query: BoardQuery, now = Date.now()): Promise<BoardResponse> {
  const started = Date.now();
  const ctx = await loadBoardContext(enrollmentId, query.q);
  const shape = assembleBoard(ctx.rows, ctx.listed, { lane: query.lane, viewerMemberId: ctx.viewer.id, seenAt: ctx.marks.get('board') ?? null, now, olderCursor: query.olderCursor });
  const head = { counts: shape.counts, open_questions: shape.open_questions, new_since: shape.new_since, my_new_replies: ctx.myNewReplies };
  if (query.countsOnly) {
    return { ...head, pinned: [], unanswered: [], fresh: [], this_week: [], last_week: [], older: { posts: [], next_cursor: null }, week_ritual: null };
  }

  const wanted = [...shape.ids.pinned, ...shape.ids.unanswered, ...shape.ids.fresh, ...shape.ids.this_week, ...shape.ids.last_week, ...shape.ids.older.ids];
  const cards = new Map((await cardsFor(ctx, wanted)).map((c) => [c.id, c]));
  const card = (id: string): BoardPost => cards.get(id)!;
  const res: BoardResponse = {
    ...head,
    pinned: shape.ids.pinned.map(card), unanswered: shape.ids.unanswered.map(card), fresh: shape.ids.fresh.map(card),
    this_week: shape.ids.this_week.map(card), last_week: shape.ids.last_week.map(card),
    older: { posts: shape.ids.older.ids.map(card), next_cursor: shape.ids.older.next_cursor },
    week_ritual: await weekRitualOf(ctx, now),
  };
  console.log(JSON.stringify({ level: 'info', service: 'community-board', event: 'board_read', outcome: 'success', duration_ms: Date.now() - started, posts: ctx.raw.length, lane: query.lane, searched: !!ctx.term }));
  return res;
}
