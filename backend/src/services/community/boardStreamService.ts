import { assembleBoard, type Lane } from './boardModel';
import { cardsFor, loadBoardContext, weekRitualOf, type BoardPost, type BoardResponse } from './boardService';
import { latestWinId, sinceIds, streamIds } from './boardStream';

/**
 * The Colaberry Now stream and its "n new posts" pill (Campus v20 N2, Basecamp C133). Same data and the same scoping as the v14
 * board (loadBoardContext: the viewer's cohort, visible posts only, a post above the viewer's level is a locked teaser), shaped as
 * one endless list. The header numbers (counts, open questions, new since, my new replies, this week's ritual) are the board's own.
 * FAILURE: a database error propagates; the route answers a classified 500.
 */
export type StreamHead = Pick<BoardResponse, 'counts' | 'open_questions' | 'new_since' | 'my_new_replies' | 'week_ritual'>;
export interface StreamResponse extends StreamHead { pinned: BoardPost[]; posts: BoardPost[]; next_cursor: string | null }

export async function getStream(enrollmentId: string, q: { lane: Lane; q?: string; cursor: string | null }, now = Date.now()): Promise<StreamResponse> {
  const ctx = await loadBoardContext(enrollmentId, q.q);
  const shape = assembleBoard(ctx.rows, ctx.listed, { lane: q.lane, viewerMemberId: ctx.viewer.id, seenAt: ctx.marks.get('board') ?? null, now, olderCursor: null });
  const ids = streamIds(ctx.listed, { lane: q.lane, viewerMemberId: ctx.viewer.id, cursor: q.cursor });
  const cards = new Map((await cardsFor(ctx, [...ids.pinned, ...ids.posts])).map((c) => [c.id, c]));
  return {
    counts: shape.counts, open_questions: shape.open_questions, new_since: shape.new_since, my_new_replies: ctx.myNewReplies,
    week_ritual: q.cursor ? null : await weekRitualOf(ctx, now),
    pinned: ids.pinned.map((id) => cards.get(id)!), posts: ids.posts.map((id) => cards.get(id)!), next_cursor: ids.next_cursor,
  };
}

export async function getSince(enrollmentId: string, afterId: string): Promise<{ posts: BoardPost[]; count: number }> {
  const ctx = await loadBoardContext(enrollmentId);
  const posts = await cardsFor(ctx, sinceIds(ctx.rows, afterId, ctx.viewer.id));
  return { posts, count: posts.length };
}

/** The board's part of the Happening-now strip: open questions and the latest win (title and author only). */
export async function boardHappening(enrollmentId: string): Promise<{ open_questions: number; latest_win: { id: string; title: string; author: string } | null }> {
  const ctx = await loadBoardContext(enrollmentId);
  const shape = assembleBoard(ctx.rows, ctx.rows, { lane: 'all', viewerMemberId: ctx.viewer.id, seenAt: null, now: Date.now(), olderCursor: null });
  const winId = latestWinId(ctx.rows);
  const win = winId ? (await cardsFor(ctx, [winId]))[0] : null;
  return { open_questions: shape.open_questions, latest_win: win ? { id: win.id, title: win.title, author: win.member.display_name } : null };
}
