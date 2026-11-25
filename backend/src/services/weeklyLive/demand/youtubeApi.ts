import { z } from 'zod';
import { iso8601ToSeconds, youtubeGet } from '../../composer/youtubeClient';

/**
 * The three YouTube Data API reads the demand job needs (WL3.2), through the app's one API client
 * (timeout, capped retries, key never logged). Public pages were tried first and YouTube refused them.
 *
 * Quota: the key is shared with the composer, openclaw and video health, 10,000 units a day. A search
 * is 100 units and every other read is 1, so a full 12-week run is about 2,500 units, once every 7 days.
 */
export interface Video { id: string; title: string; channel: string; channelId: string; views: number | null; ageDays: number; seconds: number; }
export type ApiGet = (path: string, params: Record<string, string>) => Promise<unknown>;

const DAY_MS = 86_400_000;
/** Shorts run up to 3 minutes and earn views differently, so they are never compared with full videos. */
const SHORT_MAX_SECONDS = 180;

const VideoItem = z.object({
  id: z.string(), snippet: z.object({ title: z.string(), channelTitle: z.string(), channelId: z.string(), publishedAt: z.string() }),
  statistics: z.object({ viewCount: z.string().regex(/^\d+$/).optional() }).optional(), contentDetails: z.object({ duration: z.string().optional() }).optional(),
});
const SearchItem = z.object({ id: z.object({ videoId: z.string().optional() }) });
const UploadItem = z.object({ contentDetails: z.object({ videoId: z.string() }) });

/** The validated list in a reply. A changed shape throws, so it is a failure and not "no videos". */
function items<T extends z.ZodType>(body: unknown, item: T): z.infer<T>[] {
  const p = z.object({ items: z.array(item) }).safeParse(body);
  if (!p.success) throw Object.assign(new Error('YouTube API reply had an unexpected shape'), { name: 'ContractViolation' });
  return p.data.items as z.infer<T>[];
}

export function median(xs: (number | null)[]): number | null {
  const s = xs.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (!s.length) return null;
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : Math.round((s[i - 1] + s[i]) / 2);
}

/** Full-length videos among these ids. A hidden view count is null, never 0. */
export async function videosById(ids: string[], get: ApiGet, now: number): Promise<Video[]> {
  const out: Video[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    for (const v of items(await get('videos', { part: 'snippet,statistics,contentDetails', id: ids.slice(i, i + 50).join(','), maxResults: '50' }), VideoItem)) {
      const seconds = iso8601ToSeconds(v.contentDetails?.duration || '');
      if (seconds <= SHORT_MAX_SECONDS) continue;
      out.push({ id: v.id, title: v.snippet.title, channel: v.snippet.channelTitle, channelId: v.snippet.channelId, seconds,
        views: v.statistics?.viewCount === undefined ? null : Number(v.statistics.viewCount),
        ageDays: Math.floor((now - Date.parse(v.snippet.publishedAt)) / DAY_MS) });
    }
  }
  return out;
}

/** Ids matching the queries, published in the last `days`. 100 units per query. */
export async function searchIds(queries: readonly string[], days: number, get: ApiGet, now: number): Promise<string[]> {
  const ids = new Set<string>();
  for (const q of queries) {
    const found = items(await get('search', { part: 'id', type: 'video', q, order: 'relevance', relevanceLanguage: 'en',
      publishedAfter: new Date(now - days * DAY_MS).toISOString(), maxResults: '50' }), SearchItem);
    found.forEach((f) => { if (f.id.videoId) ids.add(f.id.videoId); });
  }
  return [...ids];
}

/** A channel's latest full-length uploads, newest first. */
export async function channelUploads(channelId: string, get: ApiGet, now: number): Promise<Video[]> {
  // A channel's uploads playlist is its id with UU in place of UC.
  const list = items(await get('playlistItems', { part: 'contentDetails', playlistId: `UU${channelId.slice(2)}`, maxResults: '50' }), UploadItem);
  return (await videosById(list.map((x) => x.contentDetails.videoId), get, now)).sort((a, b) => a.ageDays - b.ageDays);
}
