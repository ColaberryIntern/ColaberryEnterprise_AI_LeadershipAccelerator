/**
 * blogMediaService — picks a personalized, non-repeating blog post for ONE
 * student from the training-site `blog_posts` library, and records the pick in
 * `blog_post_views` so the same student never sees the same post twice (until
 * the pool is exhausted, then least-recently-seen rotation).
 *
 * Powers the Blog curriculum type's auto-match mode — the third sibling of
 * networkVideoService (Testimonials) and podcastMediaService (Podcast), resolved
 * per enrollment at feed-compose time (timelineService.getFeed) and STABLE per
 * (enrollment, card).
 *
 * Matching (what's new vs the siblings): the post is scored against BOTH the
 * student's signals (buildUserTags) AND the topic of the WEEK the card sits on —
 * week tags come from the composed curriculum blueprint
 * (getBlueprintContext(program, week).prompt_text) with a static fallback to the
 * canonical course week theme. Week match outweighs student match (1.5×), plus a
 * mild newer-post bonus and a random jitter. Fail-safe: any error → null, the
 * feed never breaks.
 */
import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import TimelineCard from '../../models/TimelineCard';
import { deriveUserTagsFromText } from './networkVideoMatch';
import { buildUserTags } from './networkVideoService';
import { scoreBlogPost } from '../blog/blogTagger';
import { getBlueprintContext } from './blueprintContext';
import { allWeeks } from '../../data/canonicalCourse';
import type { FeedBlog } from './timelineService';

interface BlogPostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  url: string;
  thumbnail_url: string | null;
  published_at: string | Date | null;
  tags: unknown;
}

function toFeedBlog(p: BlogPostRow): FeedBlog {
  return { url: (p.url || '').trim(), title: p.title || null, excerpt: p.excerpt || null, thumbnail: p.thumbnail_url || null };
}

/** Tags describing what the card's WEEK is about — blueprint first, canonical fallback. */
export async function buildWeekTags(card: TimelineCard): Promise<Set<string>> {
  try {
    if (card.week == null) return new Set();
    const bp = await getBlueprintContext((card as any).program_id ?? null, card.week).catch(() => null);
    let text = bp?.prompt_text || '';
    if (!text) {
      const wk = allWeeks().find((w) => w.week_number === card.week);
      if (wk) text = `${wk.theme || ''} ${(wk as any).anthropic?.title || ''}`;
    }
    return deriveUserTagsFromText(text);
  } catch {
    return new Set();
  }
}

export interface PickedBlog {
  blog: FeedBlog;
  title: string | null;
  description: string | null;   // the post's excerpt — takes over the card description
}

/**
 * Pick (or reuse) the blog post this student should read for this card.
 * Returns the FeedBlog PLUS the post's own title + excerpt (so the card presents
 * the actual post, not the authored placeholder), or null when the library is
 * empty / on any error.
 */
export async function selectBlogForEnrollment(
  enrollmentId: string,
  card: TimelineCard,
): Promise<PickedBlog | null> {
  try {
    // 1. Reuse an existing per-card assignment (stable across refreshes).
    const assigned = await sequelize.query<BlogPostRow>(
      `SELECT b.* FROM blog_post_views vw JOIN blog_posts b ON b.id = vw.blog_post_id
        WHERE vw.enrollment_id = :eid AND vw.last_timeline_card_id = :cid AND b.is_active
        LIMIT 1`,
      { replacements: { eid: enrollmentId, cid: card.id }, type: QueryTypes.SELECT },
    );
    if (assigned.length) return { blog: toFeedBlog(assigned[0]), title: assigned[0].title, description: assigned[0].excerpt };

    // 2. Candidate pool: unread by this student.
    let pool = await sequelize.query<BlogPostRow>(
      `SELECT b.* FROM blog_posts b
        WHERE b.is_active
          AND NOT EXISTS (
            SELECT 1 FROM blog_post_views vw
             WHERE vw.enrollment_id = :eid AND vw.blog_post_id = b.id)`,
      { replacements: { eid: enrollmentId }, type: QueryTypes.SELECT },
    );

    // 3. Everything read -> rotation: least-recently-seen.
    if (!pool.length) {
      pool = await sequelize.query<BlogPostRow>(
        `SELECT b.* FROM blog_posts b
           JOIN blog_post_views vw ON vw.blog_post_id = b.id
          WHERE b.is_active AND vw.enrollment_id = :eid
          ORDER BY vw.last_seen_at ASC LIMIT 20`,
        { replacements: { eid: enrollmentId }, type: QueryTypes.SELECT },
      );
    }
    if (!pool.length) return null;

    // 4. Score: student match + 1.5× WEEK match + recency, then jitter + weighted top-K.
    const [userTags, weekTags] = await Promise.all([buildUserTags(enrollmentId), buildWeekTags(card)]);
    const scored = pool
      .map((p) => {
        const tags = Array.isArray(p.tags) ? (p.tags as unknown[]).map(String) : [];
        const s = scoreBlogPost(tags, `${p.title || ''} ${p.excerpt || ''}`, userTags, weekTags, p.published_at) + Math.random() * 0.9;
        return { p, s };
      })
      .sort((a, b) => b.s - a.s);
    const top = scored.slice(0, Math.min(5, scored.length));
    const total = top.reduce((sum, i) => sum + Math.max(0.01, i.s), 0);
    let r = Math.random() * total;
    let pick = top[0].p;
    for (const it of top) { r -= Math.max(0.01, it.s); if (r <= 0) { pick = it.p; break; } }

    // 5. Record the assignment/read (idempotent; seen_count++ on repeat). id/timestamps
    // supplied explicitly (podcast PR #252 lesson) even though the DDL has defaults.
    await sequelize.query(
      `INSERT INTO blog_post_views (id, enrollment_id, blog_post_id, first_seen_at, last_seen_at, seen_count, last_timeline_card_id, context)
       VALUES (:id, :eid, :bid, NOW(), NOW(), 1, :cid, :ctx::jsonb)
       ON CONFLICT (enrollment_id, blog_post_id) DO UPDATE SET
         last_seen_at = NOW(),
         seen_count = blog_post_views.seen_count + 1,
         last_timeline_card_id = EXCLUDED.last_timeline_card_id`,
      {
        replacements: {
          id: randomUUID(), eid: enrollmentId, bid: pick.id, cid: card.id,
          ctx: JSON.stringify({ reason: 'auto-matched', week: card.week, weekTags: [...weekTags].slice(0, 10), userTags: [...userTags].slice(0, 10) }),
        },
        type: QueryTypes.INSERT,
      },
    );

    return { blog: toFeedBlog(pick), title: pick.title, description: pick.excerpt };
  } catch (err: any) {
    console.warn('[blogMediaService] select failed:', err?.message?.split('\n')[0]);
    return null;
  }
}

/**
 * Resolve a pasted training-site blog URL against the library so link-mode cards
 * get the real title/thumbnail/excerpt automatically. Non-library URLs (or a
 * missing row) return null and the pasted URL is stored as-is.
 */
export async function lookupBlogByUrl(url: string): Promise<{ url: string; title: string | null; thumbnail: string | null; excerpt: string | null } | null> {
  try {
    const m = String(url || '').match(/training\.colaberry\.com\/blog\/([^/?#]+)/i);
    if (!m) return null;
    const rows = await sequelize.query<BlogPostRow>(
      `SELECT b.* FROM blog_posts b WHERE b.slug = :slug AND b.is_active LIMIT 1`,
      { replacements: { slug: decodeURIComponent(m[1]) }, type: QueryTypes.SELECT },
    );
    if (!rows.length) return null;
    return { url: rows[0].url, title: rows[0].title || null, thumbnail: rows[0].thumbnail_url || null, excerpt: rows[0].excerpt || null };
  } catch {
    return null;
  }
}
