/**
 * rssParser — pure parsing of RSS 2.0 and Atom feeds into normalized items.
 *
 * Reuses the repo's established feed-parse approach (podcastFeedParser
 * parseBuzzsproutFeed): cheerio in xml mode, reading each entry's children by
 * tag name so it is robust to namespaces. No network, no DB — fully unit-testable
 * with a fixture. I/O + persistence live in aiNewsIngestionService.ts.
 *
 * Handles both feed dialects:
 *   RSS 2.0:  <rss><channel><item> title / link (text) / guid / description / pubDate
 *   Atom:     <feed><entry> title / link[href] / id / summary|content / published|updated
 */
import * as cheerio from 'cheerio';
import { createHash } from 'crypto';

export interface RssItem {
  guid: string;            // stable dedup key, namespaced by source
  title: string;
  url: string | null;
  excerpt: string | null;
  publishedAt: Date | null;
}

/** Strip tags + collapse whitespace to a short plain-text snippet. */
function toSnippet(raw: string | null | undefined, max = 600): string | null {
  if (!raw) return null;
  const text = raw.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** RFC-822 or ISO-8601 date string -> Date | null. */
function parseDate(raw?: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

const sha1 = (s: string): string => createHash('sha1').update(s).digest('hex').slice(0, 24);

/**
 * Parse a feed's XML into normalized items. `source` namespaces the guid so two
 * feeds can never collide, and provides a stable fallback key when a feed omits
 * <guid>/<id>. Returns [] on any shape it can't read (caller keeps prior state).
 */
export function parseRssFeed(xml: string, source: string): RssItem[] {
  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(xml, { xml: true });
  } catch {
    return [];
  }
  const items: RssItem[] = [];
  const seen = new Set<string>();

  $('item, entry').each((_, el) => {
    const $el = $(el);

    // tag-name -> {text, attribs} for direct children (first wins), per the
    // podcast Buzzsprout parser — robust to namespace-selector quirks.
    const fields: Record<string, { text: string; attribs: Record<string, string> }> = {};
    // Atom allows multiple <link>; capture the best article href separately.
    let atomLink: string | null = null;
    $el.children().each((__, child) => {
      const node = child as unknown as { tagName?: string; name?: string; attribs?: Record<string, string> };
      const name = (node.tagName || node.name || '').toLowerCase();
      if (!name) return;
      if (name === 'link' && node.attribs?.href) {
        const rel = (node.attribs.rel || 'alternate').toLowerCase();
        if (!atomLink || rel === 'alternate') atomLink = node.attribs.href;
      }
      if (fields[name]) return;
      fields[name] = { text: $(child).text().trim(), attribs: node.attribs || {} };
    });

    const title = (fields['title']?.text || '').trim();
    if (!title) return;

    const url = atomLink || fields['link']?.text?.trim() || fields['link']?.attribs?.href || null;
    const excerpt = toSnippet(
      fields['description']?.text || fields['summary']?.text || fields['content']?.text || fields['content:encoded']?.text,
    );
    const publishedAt = parseDate(
      fields['pubdate']?.text || fields['published']?.text || fields['updated']?.text || fields['dc:date']?.text,
    );

    const guidBasis = (fields['guid']?.text || fields['id']?.text || url || title).trim();
    const guid = `${source}:${sha1(guidBasis)}`;
    if (seen.has(guid)) return;
    seen.add(guid);

    items.push({ guid, title, url, excerpt, publishedAt });
  });

  return items;
}

/**
 * Deterministic importance score (0-100) for ranking. Source authority + recency
 * + headline signal words. Pure — no clock reads beyond the passed `now` so it
 * stays testable and resume-safe.
 */
const SOURCE_WEIGHT: Record<string, number> = {
  Anthropic: 40, OpenAI: 38, 'Google DeepMind': 36, 'Microsoft AI': 32,
  'Meta AI': 30, 'Hugging Face': 30, NVIDIA: 30, GitHub: 26,
};
const SIGNAL_WORDS = /\b(launch|launches|introducing|announc|release|released|gpt|claude|gemini|llama|model|funding|raises|acquire|breakthrough|state[- ]of[- ]the[- ]art|sota|agent|reasoning)\b/i;

export function rankImportance(item: { source: string; title: string; publishedAt: Date | null }, now: Date): number {
  let score = SOURCE_WEIGHT[item.source] ?? 20;
  if (SIGNAL_WORDS.test(item.title)) score += 20;
  if (item.publishedAt) {
    const ageDays = (now.getTime() - item.publishedAt.getTime()) / (24 * 3600 * 1000);
    if (ageDays <= 2) score += 30;
    else if (ageDays <= 7) score += 20;
    else if (ageDays <= 30) score += 8;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}
