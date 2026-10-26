import type { CommunityPost } from '../../../services/communityApi';

/**
 * The Community Board on the Quad (C30, v7 R3), pure. It is a noticeboard, not a building: no room, no presence. Notes are the
 * existing community feed's posts (GET /api/portal/community/posts); nothing is invented.
 *
 * DATA GAP (R0, logged for Ali): the feed has no question type with answers. The board's tabs map onto what exists:
 *  - Questions = posts in the "Support" category (their comments are the answers);
 *  - Announcements = pinned posts;
 *  - Posts = everything else.
 * "❓ Ask a question" posts to Support; "✏️ Post something" to General.
 */
export const BOARD_AT = { x: 560, y: 470 } as const; // the prototype's translate(560,470): just south-east of the fountain
export const BOARD_SPOT = { x: 560, y: 498 } as const; // where you stand to read it
export const BOARD_WALK_MS = 900;
export type NoteKind = 'q' | 'ann' | 'post';
export type BoardTab = 'all' | 'q' | 'post' | 'ann';
export const BOARD_TABS: [BoardTab, string][] = [['all', 'Everything'], ['q', 'Questions'], ['post', 'Posts'], ['ann', 'Announcements']];
export const QUESTION_CATEGORY = 'Support';
export const POST_CATEGORY = 'General';
/** Where-to words that find the board. */
export const BOARD_WORDS = ['community', 'post', 'question', 'ask', 'board', 'forum'];

export function noteKind(p: Pick<CommunityPost, 'pinned' | 'category'>): NoteKind {
  if (p.pinned) return 'ann';
  return p.category === QUESTION_CATEGORY ? 'q' : 'post';
}

export const onTab = (posts: CommunityPost[], tab: BoardTab): CommunityPost[] => (tab === 'all' ? posts : posts.filter((p) => noteKind(p) === tab));

/** A note's count line: questions count answers ("No answers yet"), the rest likes. */
export function noteCount(p: CommunityPost): string {
  if (noteKind(p) === 'q') return p.comment_count === 0 ? 'No answers yet' : p.comment_count === 1 ? '1 answer' : `${p.comment_count} answers`;
  return p.like_count === 1 ? '1 like' : `${p.like_count} likes`;
}

/** A slight, stable tilt per note (the prototype's pinned paper), from its id. */
export function tiltOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 7) - 3) * 0.6;
}

export const firstName = (n: string): string => n.trim().split(/\s+/)[0] || n;

/** The red badge: posts newer than your last look at the board (none counted before your first look). */
export function newSince(posts: Pick<CommunityPost, 'created_at'>[], lastSeen: number | null): number {
  if (lastSeen === null) return 0;
  return posts.filter((p) => new Date(p.created_at).getTime() > lastSeen).length;
}

export const means = (q: string): boolean => {
  const t = q.trim().toLowerCase();
  return t.length >= 3 && BOARD_WORDS.some((w) => w.startsWith(t) || t.split(/\s+/).includes(w));
};

const SEEN_KEY = 'cm-board-seen';
export function readSeen(): number | null {
  try { const v = window.localStorage.getItem(SEEN_KEY); return v ? Number(v) || null : null; } catch { return null; }
}
export function writeSeen(at: number): void {
  try { window.localStorage.setItem(SEEN_KEY, String(at)); } catch { /* private window: the badge simply restarts */ }
}
