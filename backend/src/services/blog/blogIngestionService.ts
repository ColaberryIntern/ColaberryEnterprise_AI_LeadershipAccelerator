/**
 * blogIngestionService — keeps the `blog_posts` library in sync with
 * https://training.colaberry.com/blog (sibling of podcastIngestionService).
 *
 * One fetch of the blog index → parseBlogIndexHtml (__NEXT_DATA__ JSON) →
 * idempotent upsert by slug with match-ready tags. Runs weekly from the
 * scheduler ('BlogRefresh', Monday 03:30 America/Chicago) and once at boot when
 * the table is empty. FAIL-SAFE: a fetch/parse failure logs loudly and leaves
 * the existing catalog untouched — never destructive.
 */
import { randomUUID } from 'crypto';
import { sequelize } from '../../config/database';
import { parseBlogIndexHtml } from './blogFeedParser';
import { deriveBlogTags } from './blogTagger';

const BLOG_INDEX_URL = 'https://training.colaberry.com/blog';

/** Native fetch + AbortController with a hard timeout (anthropicCatalogScraper pattern). */
async function fetchWithTimeout(url: string, timeoutMs = 20_000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'ColaberryAccelerator/1.0 (+https://enterprise.colaberry.ai)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export interface BlogRefreshResult { found: number; inserted: number; updated: number }

/** Fetch the blog index and upsert every post by slug. Idempotent; safe weekly. */
export async function refreshBlogPosts(): Promise<BlogRefreshResult> {
  const html = await fetchWithTimeout(BLOG_INDEX_URL);
  const posts = parseBlogIndexHtml(html);
  if (!posts.length) {
    // Page shape changed (or empty payload) — keep the existing catalog, shout.
    console.warn('[blogIngestion] parsed 0 posts from', BLOG_INDEX_URL, '— __NEXT_DATA__ shape changed? Catalog left untouched.');
    return { found: 0, inserted: 0, updated: 0 };
  }
  let inserted = 0;
  let updated = 0;
  for (const p of posts) {
    // id/timestamps supplied explicitly so the raw INSERT never depends on DB-side
    // defaults (podcast PR #252 lesson) — though the DDL also carries defaults.
    const [rows]: any = await sequelize.query(
      `INSERT INTO blog_posts
         (id, source, slug, title, excerpt, author, url, thumbnail_url, published_at, hubspot_post_id, tags, is_active, ingested_at, updated_at)
       VALUES (:id, 'training-blog', :slug, :title, :excerpt, :author, :url, :thumb, :pub, :hub, :tags::jsonb, TRUE, NOW(), NOW())
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title, excerpt = EXCLUDED.excerpt, author = EXCLUDED.author,
         url = EXCLUDED.url, thumbnail_url = EXCLUDED.thumbnail_url, published_at = EXCLUDED.published_at,
         hubspot_post_id = EXCLUDED.hubspot_post_id, tags = EXCLUDED.tags,
         is_active = TRUE, updated_at = NOW()
       RETURNING (xmax = 0) AS inserted`,
      {
        replacements: {
          id: randomUUID(), slug: p.slug, title: p.title, excerpt: p.excerpt, author: p.author,
          url: p.url, thumb: p.thumbnail_url, pub: p.published_at, hub: p.hubspot_post_id,
          tags: JSON.stringify(deriveBlogTags(p.title, p.excerpt)),
        },
      },
    );
    if (Array.isArray(rows) && rows[0]?.inserted) inserted += 1; else updated += 1;
  }
  console.log(`[blogIngestion] refresh: found=${posts.length} inserted=${inserted} updated=${updated}`);
  return { found: posts.length, inserted, updated };
}

/** Boot helper — populate a fresh environment once, without blocking startup. */
export async function refreshBlogPostsIfEmpty(): Promise<void> {
  try {
    const [rows]: any = await sequelize.query(`SELECT count(*)::int AS n FROM blog_posts`);
    const n = Array.isArray(rows) && rows[0] ? Number(rows[0].n) : NaN;
    if (n === 0) {
      console.log('[blogIngestion] blog_posts is empty — running the initial refresh');
      await refreshBlogPosts();
    }
  } catch (err: any) {
    console.warn('[blogIngestion] boot refresh skipped:', err?.message?.split('\n')[0]);
  }
}
