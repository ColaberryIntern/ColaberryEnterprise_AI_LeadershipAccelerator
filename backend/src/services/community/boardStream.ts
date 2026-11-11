import { cursorOf, laneOf, type BoardRow, type Lane } from './boardModel';

/**
 * The Colaberry Now stream, the pure part (Campus v20 N2, Basecamp C133). Where the v14 board groups notes into Fresh / This week /
 * Older with caps, the stream is ONE list, newest first, that never ends: every visible post in the lane, 20 at a time by cursor.
 * Pinned announcements come first on Everything (page one only) and are not repeated in the list below them.
 */
export const STREAM_PAGE = 20;
export const SINCE_MAX = 50;

const newestFirst = (a: BoardRow, b: BoardRow): number => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);

export interface StreamOptions { lane: Lane; viewerMemberId: string; cursor: string | null; page?: number }
export interface StreamIds { pinned: string[]; posts: string[]; next_cursor: string | null }

export function streamIds(listed: BoardRow[], o: StreamOptions): StreamIds {
  const page = o.page ?? STREAM_PAGE;
  const inLane = (r: BoardRow): boolean => o.lane === 'all' || (o.lane === 'mine' ? r.member_id === o.viewerMemberId : laneOf(r) === o.lane);
  const rows = listed.filter(inLane).sort(newestFirst);
  const pinnedFirst = o.lane === 'all';
  const pinned = pinnedFirst && !o.cursor ? rows.filter((r) => r.pinned).map((r) => r.id) : [];
  const rest = pinnedFirst ? rows.filter((r) => !r.pinned) : rows;
  let start = 0;
  if (o.cursor) {
    const at = rest.findIndex((r) => cursorOf(r) === o.cursor);
    // A cursor that no longer matches (its post was deleted): resume after the first post older than it, never from the top.
    start = at >= 0 ? at + 1 : (() => { const [ts] = o.cursor.split('|'); const i = rest.findIndex((r) => r.created_at < ts); return i < 0 ? rest.length : i; })();
  }
  const slice = rest.slice(start, start + page);
  const more = start + page < rest.length && slice.length > 0;
  return { pinned, posts: slice.map((r) => r.id), next_cursor: more ? cursorOf(slice[slice.length - 1]) : null };
}

/** Posts by OTHER people newer than `afterId` (newest first, at most SINCE_MAX). An unknown `afterId` is nothing new. */
export function sinceIds(rows: BoardRow[], afterId: string, viewerMemberId: string, max = SINCE_MAX): string[] {
  const after = rows.find((r) => r.id === afterId);
  if (!after) return [];
  return rows
    .filter((r) => r.member_id !== viewerMemberId && (r.created_at > after.created_at || (r.created_at === after.created_at && r.id > after.id)))
    .sort(newestFirst).slice(0, max).map((r) => r.id);
}

/** The newest post in the Wins & builds lane, or null. */
export function latestWinId(rows: BoardRow[]): string | null {
  return rows.filter((r) => laneOf(r) === 'wins').sort(newestFirst)[0]?.id ?? null;
}
