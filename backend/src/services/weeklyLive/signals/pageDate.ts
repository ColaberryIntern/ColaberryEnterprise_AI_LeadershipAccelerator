import * as cheerio from 'cheerio';

/**
 * The publish date and title of a news page, read from the page itself (WL3.1: never from a search
 * snippet). Order: JSON-LD datePublished, publish meta tags, <time datetime>, then a written date in
 * a byline. No date on the page is null, and the signal is stored as "date unconfirmed": never guessed.
 */
export interface PageFacts { title: string | null; date: string | null; dateSource: 'json-ld' | 'meta' | 'time' | 'byline' | null; }

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** A date string as YYYY-MM-DD, taking the calendar day the publisher wrote, or null. */
export function toYmd(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?!\d)/);
  const words = s.match(/\b([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
  const day = s.match(/\b(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})\b/);
  let y = 0; let m = 0; let d = 0;
  if (iso) [y, m, d] = iso.slice(1).map(Number);
  else if (words) { m = MONTHS.indexOf(words[1].toLowerCase()) + 1; d = Number(words[2]); y = Number(words[3]); }
  else if (day) { d = Number(day[1]); m = MONTHS.indexOf(day[2].toLowerCase()) + 1; y = Number(day[3]); }
  if (!y || !m || !d) return null;
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function jsonLdDate(node: unknown): string | null {
  if (Array.isArray(node)) { for (const n of node) { const d = jsonLdDate(n); if (d) return d; } return null; }
  if (!node || typeof node !== 'object') return null;
  const o = node as Record<string, unknown>;
  return toYmd(o.datePublished) || jsonLdDate(o['@graph']) || jsonLdDate(o.mainEntity);
}

const META = ['meta[property="article:published_time"]', 'meta[name="article:published_time"]', 'meta[itemprop="datePublished"]',
  'meta[name="pubdate"]', 'meta[name="publish-date"]', 'meta[name="parsely-pub-date"]', 'meta[name="date"]', 'meta[name="dc.date"]'];

export function readPage(html: string): PageFacts {
  const $ = cheerio.load(html);
  const title = ($('meta[property="og:title"]').attr('content') || $('title').first().text() || '').replace(/\s+/g, ' ').trim().slice(0, 300) || null;
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    try {
      const d = jsonLdDate(JSON.parse($(el).text()));
      if (d) return { title, date: d, dateSource: 'json-ld' };
    } catch { /* a malformed JSON-LD block is common on real pages; the next source is tried */ }
  }
  for (const sel of META) { const d = toYmd($(sel).first().attr('content')); if (d) return { title, date: d, dateSource: 'meta' }; }
  const t = toYmd($('article time[datetime], header time[datetime], time[pubdate]').first().attr('datetime'));
  if (t) return { title, date: t, dateSource: 'time' };
  const by = toYmd($('[class*="byline"], [class*="publish"], [class*="dateline"], [rel="author"]').first().text());
  return by ? { title, date: by, dateSource: 'byline' } : { title, date: null, dateSource: null };
}
