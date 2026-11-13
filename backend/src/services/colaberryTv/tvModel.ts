import { z } from 'zod';

/**
 * Colaberry TV, the pure part (Campus v20 N3, Basecamp C134): which link is a YouTube short, who sees which short, and the request
 * shapes the playlist routes accept. No I/O.
 */
export const AUDIENCES = ['all', 'explorers', 'members'] as const;
export type TvAudience = typeof AUDIENCES[number];
/** The campus audience of the viewer (campusAudienceFor): staff, business, explorer or member. */
export type TvViewer = 'staff' | 'business' | 'explorer' | 'member';

export interface TvVideoRow {
  id: string;
  youtube_id: string;
  title: string | null;
  duration_s: number | null;
  audience: TvAudience;
  on_air: boolean;
  position: number;
  created_at: string | Date;
}

/** What a learner's player gets: on-air shorts only, in play order. */
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

/** Staff see every short; explorers see all + explorers; members (and business accounts) see all + members. */
export function audienceSees(audience: TvAudience, viewer: TvViewer): boolean {
  if (audience === 'all' || viewer === 'staff') return true;
  return audience === (viewer === 'explorer' ? 'explorers' : 'members');
}

/** A title to show: the stored one, else a neutral label (never an invented name). */
export function displayTitle(row: Pick<TvVideoRow, 'title'>): string {
  const t = (row.title ?? '').trim();
  return t || 'Colaberry short';
}

export function toViewerList(rows: TvVideoRow[], viewer: TvViewer): TvVideo[] {
  return rows
    .filter((r) => r.on_air && audienceSees(r.audience, viewer))
    .sort((a, b) => a.position - b.position)
    .map((r) => ({ id: r.id, youtube_id: r.youtube_id, title: displayTitle(r), duration_s: r.duration_s,
      created_at: new Date(r.created_at).toISOString() }));
}

/** Positions 1..n for the order staff set (the manager sends every id once). */
export function nextPositions(ids: readonly string[]): Array<{ id: string; position: number }> {
  return ids.map((id, i) => ({ id, position: i + 1 }));
}

export const AddBody = z.object({ url: z.string().trim().min(1).max(500) }).strict();
export const UpdateBody = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  audience: z.enum(AUDIENCES).optional(),
  on_air: z.boolean().optional(),
}).strict().refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change' });
export const OrderBody = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).strict()
  .refine((b) => new Set(b.ids).size === b.ids.length, { message: 'Each short appears once' });
export const IdParam = z.object({ id: z.string().uuid() }).strict();
