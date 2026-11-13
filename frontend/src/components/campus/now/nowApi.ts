import portalApi from '../../../utils/portalApi';
import type { BoardPost, BoardResponse, Lane } from '../board/boardData';

/**
 * Colaberry Now's stream API (Campus v20 N2, Basecamp C133). Mirrors backend/src/routes/colaberryNowRoutes.ts and
 * services/community/boardStreamService.ts + services/colaberryNow/happeningService.ts; the backend is the contract.
 */
export type StreamHead = Pick<BoardResponse, 'counts' | 'open_questions' | 'new_since' | 'my_new_replies' | 'week_ritual'>;
export interface StreamResponse extends StreamHead { pinned: BoardPost[]; posts: BoardPost[]; next_cursor: string | null }
export interface Happening {
  on_campus: { count: number; busiest: string | null; busiest_count: number } | null;
  next_event: { id: string; title: string; starts_at: string; timezone: string } | null;
  open_questions: number | null;
  latest_win: { id: string; title: string; author: string } | null;
  shorts: number | null;
}

export async function getStream(q: { lane?: Lane; q?: string; cursor?: string | null } = {}): Promise<StreamResponse> {
  const params: Record<string, string> = {};
  if (q.lane && q.lane !== 'all') params.lane = q.lane;
  if (q.q && q.q.trim()) params.q = q.q.trim();
  if (q.cursor) params.cursor = q.cursor;
  return (await portalApi.get<StreamResponse>('/api/portal/community/board/stream', { params, timeout: 15000 })).data;
}

/** Other people's posts newer than `afterId` (the "n new posts" pill). The viewer's own posts are never in it. */
export async function getSince(afterId: string): Promise<{ posts: BoardPost[]; count: number }> {
  return (await portalApi.get<{ posts: BoardPost[]; count: number }>('/api/portal/community/board/since', { params: { after: afterId }, timeout: 10000 })).data;
}

export async function getHappening(): Promise<Happening> {
  return (await portalApi.get<Happening>('/api/portal/colaberry-now/happening', { timeout: 15000 })).data;
}
