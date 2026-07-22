/**
 * blogReaderService — server-side reader so a student can read a training.colaberry.com
 * blog post INSIDE the Workspace. That site sends X-Frame-Options: DENY +
 * frame-ancestors 'none', so its pages can't be iframed directly; instead we fetch the
 * post once, extract + sanitize its article (blogReaderParser), and hand the client the
 * clean body to render in a sandboxed iframe.
 *
 * Cached in-memory (bodies change rarely; a restart just re-fetches — no schema change).
 * FAIL-SOFT: any fetch/parse failure returns { ok:false } with the source url so the
 * client falls back to the external "Read on the training site" link. Never throws into
 * the request. Read-only + deterministic ⇒ idempotent.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { parseBlogPostHtml } from './blogReaderParser';

export interface BlogReaderContent {
  ok: boolean;
  title: string | null;
  body_html: string | null;
  excerpt: string | null;
  author: string | null;
  featured_image: string | null;
  source_url: string | null;
}

interface BlogRow {
  title: string;
  excerpt: string | null;
  url: string;
  author: string | null;
  thumbnail_url: string | null;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;   // 6h — blog bodies change rarely
const FETCH_TIMEOUT_MS = 15_000;
const cache = new Map<string, { at: number; content: BlogReaderContent }>();

/** Native fetch + AbortController hard timeout (blogIngestionService pattern). */
async function fetchPostHtml(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'ColaberryAccelerator/1.0 (+https://enterprise.colaberry.ai)' },
    });
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { error_class: 'UpstreamUnavailable' });
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function loadBlogRow(blogId: string): Promise<BlogRow | null> {
  const rows = await sequelize.query<BlogRow>(
    `SELECT title, excerpt, url, author, thumbnail_url FROM blog_posts WHERE id = :id AND is_active`,
    { replacements: { id: blogId }, type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}

/**
 * Read one blog's in-system article. `now` is injectable for deterministic tests.
 * Returns ok:false (never throws) when the library row / fetch / parse is unavailable.
 */
export async function getBlogReader(blogId: string, now: number = Date.now()): Promise<BlogReaderContent> {
  const hit = cache.get(blogId);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.content;

  const row = await loadBlogRow(blogId);
  if (!row?.url) {
    return { ok: false, title: row?.title ?? null, body_html: null, excerpt: row?.excerpt ?? null, author: row?.author ?? null, featured_image: row?.thumbnail_url ?? null, source_url: row?.url ?? null };
  }

  try {
    const html = await fetchPostHtml(row.url);
    const parsed = parseBlogPostHtml(html);
    if (!parsed) throw Object.assign(new Error('blog article shape mismatch'), { error_class: 'ContractViolation' });
    const content: BlogReaderContent = {
      ok: true,
      title: parsed.title || row.title,
      body_html: parsed.body_html,
      excerpt: parsed.excerpt ?? row.excerpt,
      author: parsed.author ?? row.author,
      featured_image: parsed.featured_image ?? row.thumbnail_url,
      source_url: row.url,
    };
    cache.set(blogId, { at: now, content });
    return content;
  } catch (err: any) {
    // Fail-soft: log the class + first line, don't cache (a transient blip shouldn't
    // wedge the reader for the whole TTL), and let the client fall back to the link.
    console.warn('[blogReader] fetch/parse failed for', blogId, '—', err?.error_class || err?.name || 'Error', '·', String(err?.message || '').split('\n')[0]);
    return { ok: false, title: row.title, body_html: null, excerpt: row.excerpt, author: row.author, featured_image: row.thumbnail_url, source_url: row.url };
  }
}
