/**
 * podcastMediaService — picks a personalized, non-repeating podcast episode for
 * ONE student from the Buzzsprout-backed `podcasts` catalog, and records the pick
 * in `podcast_views` so the same student never hears the same episode twice
 * (until the pool is exhausted, then least-recently-heard rotation).
 *
 * Powers the Podcast curriculum type's auto-pick mode — the exact sibling of
 * networkVideoService (Testimonials), resolved per enrollment at feed-compose
 * time (see timelineService.getFeed) and STABLE per (enrollment, card).
 *
 * Personalization: overlap between the episode's ingest-derived tags/text (see
 * services/podcast/podcastTagger.ts) and tags derived from what we know about
 * the student (buildUserTags), plus a random jitter for variety. An optional
 * `metadata.podcast_category` filters to one subject bucket; blank = the whole
 * catalog. Fail-safe: any error resolves to null so the feed never breaks.
 */
import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import TimelineCard from '../../models/TimelineCard';
import { matchScore } from './networkVideoMatch';
import { buildUserTags } from './networkVideoService';
import type { FeedVideo } from './timelineService';

interface PodcastRow {
  id: string;
  title: string;
  description: string | null;
  audio_url: string | null;
  thumbnail_url: string | null;
  category: string | null;
  tags: unknown;
}

function toFeedVideo(p: PodcastRow): FeedVideo {
  // The audio_url is a direct .mp3 — the frontend renders an in-app audio player
  // (VideoEmbed's audio path) with the episode thumbnail as the poster.
  return { url: (p.audio_url || '').trim(), presenter: null, poster: p.thumbnail_url || null, title: p.title || null };
}

function score(p: PodcastRow, userTags: Set<string>): number {
  const ptags = Array.isArray(p.tags) ? (p.tags as unknown[]).map(String) : [];
  const base = matchScore(ptags, `${p.title || ''} ${p.description || ''}`, userTags);
  const jitter = Math.random() * 0.9; // variety so similar students differ
  return base + jitter;
}

function weightedPick(items: Array<{ p: PodcastRow; s: number }>): PodcastRow {
  const total = items.reduce((sum, i) => sum + Math.max(0.01, i.s), 0);
  let r = Math.random() * total;
  for (const it of items) { r -= Math.max(0.01, it.s); if (r <= 0) return it.p; }
  return items[0].p;
}

export interface PickedPodcast {
  video: FeedVideo;
  title: string | null;
  description: string | null;
}

/**
 * Pick (or reuse) the podcast episode this student should hear for this card.
 * Returns the FeedVideo PLUS the episode's own title + description (so the card
 * presents the actual episode, not the authored placeholder), or null if nothing
 * is available / on any error.
 */
export async function selectPodcastForEnrollment(
  enrollmentId: string,
  card: TimelineCard,
): Promise<PickedPodcast | null> {
  try {
    const meta = card.metadata && typeof card.metadata === 'object' ? (card.metadata as any) : {};
    const rawCat = typeof meta.podcast_category === 'string' ? meta.podcast_category.trim().toLowerCase() : '';
    const category = rawCat || null; // null = whole catalog (the feed is one show)
    const catClause = category ? 'AND p.category = :cat' : '';
    const catRepl = category ? { cat: category } : {};

    // 1. Reuse an existing per-card assignment (stable across refreshes).
    const assigned = await sequelize.query<PodcastRow>(
      `SELECT p.* FROM podcast_views vw JOIN podcasts p ON p.id = vw.podcast_id
        WHERE vw.enrollment_id = :eid AND vw.last_timeline_card_id = :cid
          AND p.is_active AND p.audio_url IS NOT NULL
        LIMIT 1`,
      { replacements: { eid: enrollmentId, cid: card.id }, type: QueryTypes.SELECT },
    );
    if (assigned.length) return { video: toFeedVideo(assigned[0]), title: assigned[0].title, description: assigned[0].description };

    // 2. Candidate pool: unheard by this student (within the category when set).
    let pool = await sequelize.query<PodcastRow>(
      `SELECT p.* FROM podcasts p
        WHERE p.is_active AND p.audio_url IS NOT NULL ${catClause}
          AND NOT EXISTS (
            SELECT 1 FROM podcast_views vw
             WHERE vw.enrollment_id = :eid AND vw.podcast_id = p.id)`,
      { replacements: { eid: enrollmentId, ...catRepl }, type: QueryTypes.SELECT },
    );

    // 3. All heard -> rotation: least-recently-heard.
    if (!pool.length) {
      pool = await sequelize.query<PodcastRow>(
        `SELECT p.* FROM podcasts p
           JOIN podcast_views vw ON vw.podcast_id = p.id
          WHERE p.is_active AND p.audio_url IS NOT NULL ${catClause} AND vw.enrollment_id = :eid
          ORDER BY vw.last_seen_at ASC LIMIT 20`,
        { replacements: { eid: enrollmentId, ...catRepl }, type: QueryTypes.SELECT },
      );
    }
    if (!pool.length) return null;

    // 4. Score by personalization + jitter; weighted pick among the top-K.
    const userTags = await buildUserTags(enrollmentId);
    const scored = pool.map((p) => ({ p, s: score(p, userTags) })).sort((a, b) => b.s - a.s);
    const pick = weightedPick(scored.slice(0, Math.min(5, scored.length)));

    // 5. Record the assignment/listen (idempotent; seen_count++ on repeat). The id is
    // generated in Node so the raw INSERT never depends on a DB-level uuid default.
    await sequelize.query(
      `INSERT INTO podcast_views (id, enrollment_id, podcast_id, category, last_timeline_card_id, context)
       VALUES (:id, :eid, :pid, :cat, :cid, :ctx::jsonb)
       ON CONFLICT (enrollment_id, podcast_id) DO UPDATE SET
         last_seen_at = NOW(),
         seen_count = podcast_views.seen_count + 1,
         last_timeline_card_id = EXCLUDED.last_timeline_card_id`,
      {
        replacements: {
          id: randomUUID(), eid: enrollmentId, pid: pick.id, cat: pick.category || category, cid: card.id,
          ctx: JSON.stringify({ reason: 'random-personalized', tags: [...userTags].slice(0, 12) }),
        },
        type: QueryTypes.INSERT,
      },
    );

    return { video: toFeedVideo(pick), title: pick.title, description: pick.description };
  } catch (err: any) {
    console.warn('[podcastMediaService] select failed:', err?.message?.split('\n')[0]);
    return null;
  }
}
