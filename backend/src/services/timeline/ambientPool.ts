/**
 * ambientPool — the bottomless supply behind the Today Timeline v2 feed.
 *
 * Where the per-card pickers (blogMediaService / podcastMediaService /
 * networkVideoService) resolve ONE stable media item for a single authored card,
 * this selector answers a different question: "give me the next N fresh ambient
 * items of type X for this student." It powers the never-ending scroll — unseen
 * items first, then least-recently-seen rotation (so it never runs dry until the
 * pool is truly empty), reusing the SAME `*_views` ledgers as the pickers so the
 * two share one consistent "seen" history per student.
 *
 * Selection here is intentionally simpler than the pickers (no tag-scoring): the
 * Today feed's job is fresh rotation + variety, and the composer persists each
 * pick as a `today_feed_impressions` row so pagination is stable regardless.
 * Fail-safe: any error resolves to [] so the feed never breaks.
 */
import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import type { FeedVideo, FeedBlog } from './timelineService';

export type AmbientProviderSlug = 'blog' | 'podcast' | 'testimonial';
export const AMBIENT_PROVIDERS: AmbientProviderSlug[] = ['blog', 'podcast', 'testimonial'];

export interface AmbientItem {
  provider: AmbientProviderSlug;
  ref: string; // stable dedup key: `${provider}:${media_id}`
  media_id: string;
  title: string | null;
  description: string | null;
  video: FeedVideo | null;
  blog: FeedBlog | null;
  image: string | null;
}

interface BlogRow { id: string; title: string | null; excerpt: string | null; url: string; thumbnail_url: string | null; }
interface PodcastRow { id: string; title: string | null; description: string | null; audio_url: string | null; thumbnail_url: string | null; }
interface NetworkVideoRow { id: string; title: string | null; description: string | null; host: string | null; provider_video_id: string | null; embed_url: string | null; watch_url: string | null; thumbnail_url: string | null; }

const ref = (provider: AmbientProviderSlug, id: string) => `${provider}:${id}`;

/** Build "AND x.id NOT IN (:excl)" only when there is something to exclude (empty IN () is a SQL error). */
function exclusion(column: string, excludeIds: string[]): { clause: string; repl: Record<string, unknown> } {
  if (!excludeIds.length) return { clause: '', repl: {} };
  return { clause: `AND ${column} NOT IN (:excl)`, repl: { excl: excludeIds } };
}

async function pickBlogs(eid: string, count: number, excludeIds: string[]): Promise<AmbientItem[]> {
  const { clause, repl } = exclusion('b.id', excludeIds);
  const rows = await sequelize.query<BlogRow>(
    `SELECT b.id, b.title, b.excerpt, b.url, b.thumbnail_url
       FROM blog_posts b
       LEFT JOIN blog_post_views vw ON vw.blog_post_id = b.id AND vw.enrollment_id = :eid
      WHERE b.is_active ${clause}
      ORDER BY vw.last_seen_at ASC NULLS FIRST, b.published_at DESC NULLS LAST
      LIMIT :count`,
    { replacements: { eid, count, ...repl }, type: QueryTypes.SELECT },
  );
  for (const r of rows) {
    await sequelize.query(
      `INSERT INTO blog_post_views (id, enrollment_id, blog_post_id, first_seen_at, last_seen_at, seen_count, context)
       VALUES (:id, :eid, :bid, NOW(), NOW(), 1, '{"reason":"today-ambient"}'::jsonb)
       ON CONFLICT (enrollment_id, blog_post_id) DO UPDATE SET last_seen_at = NOW(), seen_count = blog_post_views.seen_count + 1`,
      { replacements: { id: randomUUID(), eid, bid: r.id }, type: QueryTypes.INSERT },
    );
  }
  return rows.map((r): AmbientItem => {
    const blog: FeedBlog = { url: (r.url || '').trim(), title: r.title || null, excerpt: r.excerpt || null, thumbnail: r.thumbnail_url || null };
    return { provider: 'blog', ref: ref('blog', r.id), media_id: r.id, title: r.title || null, description: r.excerpt || null, video: null, blog, image: r.thumbnail_url || null };
  });
}

async function pickPodcasts(eid: string, count: number, excludeIds: string[]): Promise<AmbientItem[]> {
  const { clause, repl } = exclusion('p.id', excludeIds);
  const rows = await sequelize.query<PodcastRow>(
    `SELECT p.id, p.title, p.description, p.audio_url, p.thumbnail_url
       FROM podcasts p
       LEFT JOIN podcast_views vw ON vw.podcast_id = p.id AND vw.enrollment_id = :eid
      WHERE p.is_active AND p.audio_url IS NOT NULL ${clause}
      ORDER BY vw.last_seen_at ASC NULLS FIRST, p.published_at DESC NULLS LAST
      LIMIT :count`,
    { replacements: { eid, count, ...repl }, type: QueryTypes.SELECT },
  );
  for (const r of rows) {
    await sequelize.query(
      `INSERT INTO podcast_views (id, enrollment_id, podcast_id, first_seen_at, last_seen_at, seen_count, context)
       VALUES (:id, :eid, :pid, NOW(), NOW(), 1, '{"reason":"today-ambient"}'::jsonb)
       ON CONFLICT (enrollment_id, podcast_id) DO UPDATE SET last_seen_at = NOW(), seen_count = podcast_views.seen_count + 1`,
      { replacements: { id: randomUUID(), eid, pid: r.id }, type: QueryTypes.INSERT },
    );
  }
  return rows.map((r): AmbientItem => {
    const video: FeedVideo = { url: (r.audio_url || '').trim(), presenter: null, poster: r.thumbnail_url || null, title: r.title || null };
    return { provider: 'podcast', ref: ref('podcast', r.id), media_id: r.id, title: r.title || null, description: r.description || null, video, blog: null, image: r.thumbnail_url || null };
  });
}

async function pickTestimonials(eid: string, count: number, excludeIds: string[]): Promise<AmbientItem[]> {
  const { clause, repl } = exclusion('v.id', excludeIds);
  const rows = await sequelize.query<NetworkVideoRow>(
    `SELECT v.id, v.title, v.description, v.host, v.provider_video_id, v.embed_url, v.watch_url, v.thumbnail_url
       FROM network_videos v
       LEFT JOIN network_video_views vw ON vw.video_id = v.id AND vw.enrollment_id = :eid
      WHERE v.is_active AND v.playable ${clause}
      ORDER BY vw.last_seen_at ASC NULLS FIRST, v.ingested_at DESC NULLS LAST
      LIMIT :count`,
    { replacements: { eid, count, ...repl }, type: QueryTypes.SELECT },
  );
  for (const r of rows) {
    await sequelize.query(
      `INSERT INTO network_video_views (enrollment_id, video_id, seen_count, context)
       VALUES (:eid, :vid, 1, '{"reason":"today-ambient"}'::jsonb)
       ON CONFLICT (enrollment_id, video_id) DO UPDATE SET last_seen_at = NOW(), seen_count = network_video_views.seen_count + 1`,
      { replacements: { eid, vid: r.id }, type: QueryTypes.INSERT },
    );
  }
  return rows.map((r): AmbientItem => {
    const url = (r.watch_url || r.embed_url || '').trim();
    let poster = r.thumbnail_url || null;
    if (!poster && r.host === 'youtube' && r.provider_video_id) poster = `https://img.youtube.com/vi/${r.provider_video_id}/hqdefault.jpg`;
    const video: FeedVideo = { url, presenter: null, poster, title: r.title || null };
    return { provider: 'testimonial', ref: ref('testimonial', r.id), media_id: r.id, title: r.title || null, description: r.description || null, video, blog: null, image: poster };
  });
}

/**
 * Pick up to `count` fresh ambient items of one provider for this student,
 * excluding a set of media ids already placed in the feed (so re-generation never
 * reassigns the same item). Marks each pick in the provider's `*_views` ledger.
 */
export async function pickAmbientBatch(
  enrollmentId: string,
  provider: AmbientProviderSlug,
  count: number,
  excludeMediaIds: string[] = [],
): Promise<AmbientItem[]> {
  if (count <= 0) return [];
  try {
    if (provider === 'blog') return await pickBlogs(enrollmentId, count, excludeMediaIds);
    if (provider === 'podcast') return await pickPodcasts(enrollmentId, count, excludeMediaIds);
    return await pickTestimonials(enrollmentId, count, excludeMediaIds);
  } catch (err: any) {
    console.warn(`[ambientPool] ${provider} batch failed:`, err?.message?.split('\n')[0]);
    return [];
  }
}
