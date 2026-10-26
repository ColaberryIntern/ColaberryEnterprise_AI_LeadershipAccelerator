import portalApi from '../../../utils/portalApi';
import type { PublicRitual, RitualField } from '../../../pages/portal/runtime/runtimeApi';

/**
 * The Community Board's data (Campus v14, Basecamp C65-C70): GET /api/portal/community/board in sections, the server-side seen mark,
 * and posting a ritual answer the way the ritual composer does (ritual_meta + the composed body). Mirrors
 * backend/src/services/community/boardService.ts; the backend is the contract.
 */
export const LANE_KEYS = ['all', 'mine', 'ann', 'q', 'intro', 'wins', 'tips', 'ideas', 'general'] as const;
export type Lane = typeof LANE_KEYS[number];
export type PostLane = Exclude<Lane, 'all' | 'mine'>;

export interface PostRitual { key: string; name: string; icon: string; week: number; reaction: { emoji: string; label: string } }
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
  ritual_values: Record<string, string | string[]> | null;
  lane: PostLane;
  mine: boolean;
  new_replies: number;
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
  /** The feed category a ritual answer is filed under (the ritual's own). */
  week_ritual: { week: number; ritual: PublicRitual; posted: number; category: string } | null;
}

export interface BoardQuery { lane?: Lane; q?: string; olderCursor?: string | null; countsOnly?: boolean }

export async function getBoard(q: BoardQuery = {}): Promise<BoardResponse> {
  const params: Record<string, string> = {};
  if (q.lane && q.lane !== 'all') params.lane = q.lane;
  if (q.q && q.q.trim()) params.q = q.q.trim();
  if (q.olderCursor !== undefined && q.olderCursor !== null) params.older_cursor = q.olderCursor || 'start';
  if (q.countsOnly) params.counts_only = '1';
  const { data } = await portalApi.get<BoardResponse>('/api/portal/community/board', { params, timeout: 15000 });
  return data;
}

/** Mark the board (or one of your posts) seen; idempotent on the server. */
export async function markBoardSeen(body: { post_id?: string; at?: string; migrate?: boolean } = {}): Promise<string | null> {
  const { data } = await portalApi.post<{ seen_at: string }>('/api/portal/community/board/seen', body, { timeout: 10000 });
  return data?.seen_at ?? null;
}

/**
 * The ritual composer's body, exactly as the server composes it (communityRituals.composeBody: the heading line, then one
 * "<Label>: <value>" paragraph per filled non-link field), so a board answer reads the same everywhere.
 */
export function composeRitualBody(r: Pick<PublicRitual, 'icon' | 'name' | 'week'> & { fields: RitualField[] }, values: Record<string, string>): string {
  const parts = [`${r.icon} ${r.name} · Week ${r.week}`];
  for (const f of r.fields) {
    if (f.kind === 'link') continue;
    const v = (values[f.key] ?? '').trim();
    if (!v) continue;
    parts.push(`${f.label}: ${f.kind === 'list' ? v.split('\n').map((x) => x.trim()).filter(Boolean).join(', ') : v}`);
  }
  return parts.join('\n\n');
}

/** Guided values in the shape ritual_meta stores (list fields as arrays). */
export function ritualValues(fields: RitualField[], values: Record<string, string>): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const f of fields) {
    const v = (values[f.key] ?? '').trim();
    if (!v) continue;
    out[f.key] = f.kind === 'list' ? v.split('\n').map((x) => x.trim()).filter(Boolean) : v;
  }
  return out;
}

export async function postRitualAnswer(r: PublicRitual, week: number, values: Record<string, string>, category: string): Promise<void> {
  await portalApi.post('/api/portal/community/posts', {
    body: composeRitualBody({ ...r, week }, values),
    category,
    week,
    ritual_meta: { ritual: r.key, values: ritualValues(r.fields, values) },
  });
}
