/**
 * Colaberry TV, the pure part (Campus v20 N3, Basecamp C134): which link is a YouTube short, and
 * what title to show for one. No I/O.
 *
 * TV-2 removed the rest. `AUDIENCES`/`TvAudience`, `audienceSees`, `toViewerList`, `nextPositions`
 * and the four Zod request bodies all existed to serve the second playlist in
 * `colaberry_tv_videos` and its manage routes. The library is the playlist now and has no audience,
 * no position and no on-air flag, so none of them had a caller left.
 */

/** The campus audience of the viewer (campusAudienceFor): staff, business, explorer or member. */
export type TvViewer = 'staff' | 'business' | 'explorer' | 'member';

/** What a learner's player gets: shorts in play order. */
export interface TvVideo {
  id: string;
  youtube_id: string;
  title: string;
  duration_s: number | null;
  created_at: string;
}

const ID = /^[\w-]{11}$/;

/** The 11-character video id from any YouTube link form (watch, shorts, youtu.be, embed, live, music), or null. */
export function parseYoutubeId(raw: string): string | null {
  const url = String(raw ?? '').trim();
  if (!url || url.length > 500) return null;
  const m = url.match(/^(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtube-nocookie\.com\/embed\/|youtu\.be\/)([\w-]{11})(?:[?&#/].*)?$/i);
  return m && ID.test(m[1]) ? m[1] : null;
}

/**
 * A title to show: the stored one, else a neutral label (never an invented name).
 *
 * Takes the shape rather than a row type, because the only caller now passes a library asset's
 * `alt_text`, not a `colaberry_tv_videos` row.
 */
export function displayTitle(row: { title: string | null }): string {
  const t = (row.title ?? '').trim();
  return t || 'Colaberry short';
}
