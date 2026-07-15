/**
 * networkVideoService — picks a personalized, non-repeating testimonial video for
 * ONE student, from the ingested `network_videos` catalog, and records the pick in
 * `network_video_views` so the same student never sees the same testimonial twice
 * (until the pool is exhausted, then least-recently-seen rotation).
 *
 * Powers the Testimonials curriculum type's "random" mode. Resolution is per
 * enrollment, at feed-compose time (see timelineService.getFeed). The choice is
 * STABLE per (enrollment, card): once assigned it is reused on later loads, so the
 * card does not flicker to a new video on every refresh.
 *
 * Personalization: overlap between the video's tags/title and tags derived from
 * what we know about the student (UserCurriculumProfile + Enrollment + variables),
 * plus a gentle preference for reliably-embeddable hosts and a random jitter for
 * variety. Fail-safe: any error resolves to null so the feed never breaks.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import Enrollment from '../../models/Enrollment';
import UserCurriculumProfile from '../../models/UserCurriculumProfile';
import TimelineCard from '../../models/TimelineCard';
import { getAllVariables } from '../variableService';
import { deriveUserTagsFromText, matchScore } from './networkVideoMatch';
import type { FeedVideo } from './timelineService';

interface NetworkVideoRow {
  id: string;
  category: string;
  title: string | null;
  description: string | null;
  host: string | null;
  embed_url: string | null;
  watch_url: string | null;
  thumbnail_url: string | null;
  tags: unknown;
}

/** Build the student's signal tag-set from everything we know about them. */
export async function buildUserTags(enrollmentId: string): Promise<Set<string>> {
  const tags = new Set<string>();
  let profile: UserCurriculumProfile | null = null;
  let enrollment: Enrollment | null = null;
  let vars: Record<string, string> = {};
  try { profile = await UserCurriculumProfile.findOne({ where: { enrollment_id: enrollmentId } }); } catch { /* noop */ }
  try { enrollment = await Enrollment.findByPk(enrollmentId); } catch { /* noop */ }
  try { vars = await getAllVariables(enrollmentId); } catch { /* noop */ }

  const text = [
    profile?.industry, profile?.role, profile?.goal, profile?.identified_use_case,
    (enrollment as any)?.title, (enrollment as any)?.company,
    vars.industry, vars.role, vars.goal, vars.identified_use_case, vars.strategic_priority,
  ].filter(Boolean).join(' ').toLowerCase();

  for (const t of deriveUserTagsFromText(text)) tags.add(t);
  return tags;
}

function toFeedVideo(v: NetworkVideoRow): FeedVideo {
  // Pass the canonical watch URL; the frontend `parseVideoUrl` turns it into the
  // durable in-app embed. Title = this specific video's title (poster overlay).
  const url = (v.watch_url || v.embed_url || '').trim();
  return { url, presenter: null, poster: v.thumbnail_url || null, title: v.title || null };
}

function score(v: NetworkVideoRow, userTags: Set<string>): number {
  const vtags = Array.isArray(v.tags) ? (v.tags as unknown[]).map(String) : [];
  const base = matchScore(vtags, `${v.title || ''} ${v.description || ''}`, userTags);
  const hostPref = v.host && v.host !== 'vimeo' ? 0.5 : 0; // reliably-embeddable hosts nudged up
  const jitter = Math.random() * 0.9;                      // variety so similar students differ
  return base + hostPref + jitter;
}

function weightedPick(items: Array<{ v: NetworkVideoRow; s: number }>): NetworkVideoRow {
  const total = items.reduce((sum, i) => sum + Math.max(0.01, i.s), 0);
  let r = Math.random() * total;
  for (const it of items) { r -= Math.max(0.01, it.s); if (r <= 0) return it.v; }
  return items[0].v;
}

/**
 * Pick (or reuse) the testimonial video this student should see for this card.
 * Returns a FeedVideo, or null if nothing is available / on any error.
 */
export async function selectTestimonialForEnrollment(
  enrollmentId: string,
  card: TimelineCard,
): Promise<FeedVideo | null> {
  try {
    const meta = card.metadata && typeof card.metadata === 'object' ? card.metadata : {};
    const category = String(meta.testimonial_category || 'testimonial').toLowerCase();

    // 1. Reuse an existing per-card assignment (stable across refreshes).
    const assigned = await sequelize.query<NetworkVideoRow>(
      `SELECT v.* FROM network_video_views vw JOIN network_videos v ON v.id = vw.video_id
        WHERE vw.enrollment_id = :eid AND vw.last_timeline_card_id = :cid
          AND v.is_active AND v.playable
        LIMIT 1`,
      { replacements: { eid: enrollmentId, cid: card.id }, type: QueryTypes.SELECT },
    );
    if (assigned.length) return toFeedVideo(assigned[0]);

    // 2. Candidate pool: unseen by this student, in category, playable.
    let pool = await sequelize.query<NetworkVideoRow>(
      `SELECT v.* FROM network_videos v
        WHERE v.category = :cat AND v.is_active AND v.playable
          AND NOT EXISTS (
            SELECT 1 FROM network_video_views vw
             WHERE vw.enrollment_id = :eid AND vw.video_id = v.id)`,
      { replacements: { cat: category, eid: enrollmentId }, type: QueryTypes.SELECT },
    );

    // 3. All seen -> rotation: least-recently-seen in this category.
    if (!pool.length) {
      pool = await sequelize.query<NetworkVideoRow>(
        `SELECT v.* FROM network_videos v
           JOIN network_video_views vw ON vw.video_id = v.id
          WHERE v.category = :cat AND v.is_active AND v.playable AND vw.enrollment_id = :eid
          ORDER BY vw.last_seen_at ASC LIMIT 20`,
        { replacements: { cat: category, eid: enrollmentId }, type: QueryTypes.SELECT },
      );
    }
    if (!pool.length) return null;

    // 4. Score by personalization + jitter; weighted pick among the top-K.
    const userTags = await buildUserTags(enrollmentId);
    const scored = pool.map((v) => ({ v, s: score(v, userTags) })).sort((a, b) => b.s - a.s);
    const pick = weightedPick(scored.slice(0, Math.min(5, scored.length)));

    // 5. Record the assignment/view (idempotent; seen_count++ on repeat).
    await sequelize.query(
      `INSERT INTO network_video_views (enrollment_id, video_id, category, last_timeline_card_id, context)
       VALUES (:eid, :vid, :cat, :cid, :ctx::jsonb)
       ON CONFLICT (enrollment_id, video_id) DO UPDATE SET
         last_seen_at = NOW(),
         seen_count = network_video_views.seen_count + 1,
         last_timeline_card_id = EXCLUDED.last_timeline_card_id`,
      {
        replacements: {
          eid: enrollmentId, vid: pick.id, cat: category, cid: card.id,
          ctx: JSON.stringify({ reason: 'random-personalized', tags: [...userTags].slice(0, 12) }),
        },
        type: QueryTypes.INSERT,
      },
    );

    return toFeedVideo(pick);
  } catch (err: any) {
    console.warn('[networkVideoService] select failed:', err?.message?.split('\n')[0]);
    return null;
  }
}
