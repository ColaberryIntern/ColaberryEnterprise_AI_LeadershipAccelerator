/**
 * blogFeedParser — PURE parser for the training.colaberry.com blog index.
 *
 * The training site is Next.js: one GET of /blog embeds the ENTIRE post catalog
 * as JSON in <script id="__NEXT_DATA__"> → props.pageProps.posts[] (verified
 * live: 89 posts, 1:1 with sitemap.xml). No RSS / wp-json exists. This module
 * only turns that HTML into typed rows — no I/O, trivially unit-testable
 * (sibling of services/podcast/podcastFeedParser.ts).
 */
import * as cheerio from 'cheerio';

export interface ParsedBlogPost {
  slug: string;
  title: string;
  excerpt: string | null;
  author: string | null;
  url: string;
  thumbnail_url: string | null;
  published_at: string | null;    // ISO string as published by the site
  hubspot_post_id: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** PURE — parse the /blog index HTML into typed posts. Returns [] on any shape
 *  mismatch (the caller logs loudly and keeps the existing catalog). */
export function parseBlogIndexHtml(html: string, baseUrl = 'https://training.colaberry.com'): ParsedBlogPost[] {
  try {
    const $ = cheerio.load(html);
    const raw = $('script#__NEXT_DATA__').first().html();
    if (!raw) return [];
    const data = JSON.parse(raw);
    const posts = data?.props?.pageProps?.posts;
    if (!Array.isArray(posts)) return [];
    const out: ParsedBlogPost[] = [];
    for (const p of posts) {
      const slug = str(p?.slug);
      const title = str(p?.title);
      if (!slug || !title) continue;   // slug is the dedup key; title is the card face
      out.push({
        slug,
        title,
        excerpt: str(p?.excerpt),
        author: str(p?.authorName),
        url: `${baseUrl}/blog/${slug}`,
        thumbnail_url: str(p?.featuredImage),
        published_at: str(p?.publishedAt),
        hubspot_post_id: str(p?.hubspotPostId),
      });
    }
    return out;
  } catch {
    return [];
  }
}
