/**
 * blogReaderParser — PURE parser for a SINGLE training.colaberry.com blog post page.
 *
 * The training site is Next.js: a GET of /blog/<slug> embeds the post as JSON in
 * <script id="__NEXT_DATA__"> → props.pageProps.post ({ title, body, excerpt,
 * authorName, featuredImage, … }). This module turns that HTML into a sanitized,
 * self-contained article we can render INSIDE the Workspace (the site itself sends
 * X-Frame-Options: DENY + frame-ancestors 'none', so it can't be iframed directly).
 *
 * No I/O — trivially unit-testable (sibling of blogFeedParser.ts, which parses the
 * /blog INDEX). Returns null on any shape mismatch so the caller can fall back.
 */
import * as cheerio from 'cheerio';

export interface ParsedBlogArticle {
  title: string;
  body_html: string;              // sanitized — no <script>/<style>, inline handlers, or javascript: urls
  excerpt: string | null;
  author: string | null;
  featured_image: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Strip anything executable from the post body before it reaches an iframe. Mirrors
 *  CardDetailBody.stripUnsafe on the client (defense-in-depth — the iframe is also
 *  sandboxed opaque-origin). Keeps images, embeds, tables, and text markup. */
export function sanitizeArticleHtml(html: string): string {
  return String(html || '')
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

/** PURE — parse a training.colaberry.com post page into a sanitized article, or null
 *  on any shape mismatch (missing __NEXT_DATA__, no post.body/title, bad JSON). */
export function parseBlogPostHtml(html: string): ParsedBlogArticle | null {
  try {
    const $ = cheerio.load(html);
    const raw = $('script#__NEXT_DATA__').first().html();
    if (!raw) return null;
    const post = JSON.parse(raw)?.props?.pageProps?.post;
    const body = str(post?.body);
    const title = str(post?.title);
    if (!body || !title) return null;   // no article to render
    return {
      title,
      body_html: sanitizeArticleHtml(body),
      excerpt: str(post?.excerpt),
      author: str(post?.authorName),
      featured_image: str(post?.featuredImage),
    };
  } catch {
    return null;
  }
}
