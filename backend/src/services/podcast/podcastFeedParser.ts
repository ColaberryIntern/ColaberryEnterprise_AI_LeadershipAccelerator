/**
 * podcastFeedParser — pure parsing + enrichment for the Colaberry AI Podcast catalog.
 *
 * Two sources, joined by normalized episode title:
 *   1. The curated training-site index (https://training.colaberry.com/podcasts) — the
 *      authoritative "which episodes to show students" list. Provides title, the public
 *      colaberry.ai episode URL, a short description, display date, and duration label.
 *      It carries NO per-episode thumbnails.
 *   2. The Buzzsprout RSS feed behind the show (feeds.buzzsprout.com/2456315.rss) — provides
 *      the real per-episode thumbnail (itunes:image), audio URL (enclosure), a stable dedup
 *      GUID, pubDate, and duration in seconds.
 *
 * Everything in this module is a pure function (no I/O), so it is fully unit-testable
 * without a network or database. The I/O + persistence lives in podcastIngestionService.ts.
 */
import * as cheerio from 'cheerio';

export interface TrainingIndexEntry {
  title: string;
  websiteUrl: string; // absolute colaberry.ai/resources/podcasts/<slug> link
  slug: string;
  description: string | null;
  displayDate: string | null; // e.g. "Jun 29, 2026" as shown on the card
  durationLabel: string | null; // e.g. "21:04"
  featured: boolean;
}

export interface FeedEpisode {
  title: string; // full RSS title incl. the "| <date>" suffix
  normalizedTitle: string; // join key
  guid: string; // e.g. "Buzzsprout-19336943"
  audioUrl: string | null;
  thumbnailUrl: string | null;
  description: string | null;
  publishedAt: Date | null;
  durationSeconds: number | null;
}

export interface PodcastRecord {
  title: string;
  slug: string;
  websiteUrl: string;
  audioUrl: string | null;
  thumbnailUrl: string | null;
  description: string | null;
  durationSeconds: number | null;
  durationLabel: string | null;
  publishedAt: Date | null;
  buzzsproutGuid: string | null;
  featured: boolean;
  source: string;
  matched: boolean; // true if a feed episode was matched (i.e. a real thumbnail was resolved)
}

export const PODCAST_SOURCE = 'training.colaberry.com';

/* ------------------------------------------------------------------ helpers */

/** Collapse a title to a stable join key: drop the "| <date>" suffix, lowercase,
 *  and strip all non-alphanumerics so punctuation/apostrophe/entity differences
 *  between the two sources can't break the match. */
export function normalizeTitle(raw: string): string {
  if (!raw) return '';
  const withoutSuffix = raw.split('|')[0]; // Buzzsprout titles end with "| 12th June 2026"
  return withoutSuffix
    .toLowerCase()
    .replace(/['’‘`]/g, '') // drop apostrophes so "Anthropic's" == "Anthropics"
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** "21:04" or "1:02:03" or "1382" (seconds) -> total seconds. */
export function parseDurationToSeconds(raw?: string | null): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const parts = s.split(':').map((p) => parseInt(p, 10));
  if (parts.length === 0 || parts.some((n) => Number.isNaN(n))) return null;
  return parts.reduce((acc, v) => acc * 60 + v, 0);
}

/** 1382 -> "23:02"; 3723 -> "1:02:03". */
export function secondsToLabel(sec?: number | null): string | null {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return null;
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

/** RFC-822 ("Wed, 15 Jul 2026 13:00:00 -0500") or "Jun 29, 2026" -> Date | null. */
export function parseDate(raw?: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function slugFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const seg = path.split('/').filter(Boolean).pop() || '';
    return seg;
  } catch {
    return stripTrailingSlash(url).split('/').filter(Boolean).pop() || '';
  }
}

/* -------------------------------------------------------------- index parse */

/**
 * Parse the training-site podcast index HTML into curated entries.
 * Cards come in two shapes on the page:
 *   - featured: <a class="pod-feat ..."> with <h2> + <p.pod-feat__sub> + <div.pod-feat__meta>
 *   - regular:  <a class="pod-card">     with <h3> + <p> + <span.pod-dur> + <span.pod-card__date>
 */
export function parseTrainingIndex(html: string): TrainingIndexEntry[] {
  const $ = cheerio.load(html);
  const entries: TrainingIndexEntry[] = [];
  const seen = new Set<string>();

  $('a.pod-feat, a.pod-card').each((_, el) => {
    const $el = $(el);
    const href = ($el.attr('href') || '').trim();
    if (!/\/resources\/podcasts\//.test(href)) return;

    const websiteUrl = stripTrailingSlash(href);
    if (seen.has(websiteUrl)) return; // de-dupe within a single page render
    seen.add(websiteUrl);

    const featured = ($el.attr('class') || '').split(/\s+/).includes('pod-feat');
    const title = $el.find('h1, h2, h3').first().text().trim();
    if (!title) return;

    const description = $el.find('p').first().text().trim() || null;

    let displayDate: string | null = null;
    let durationLabel: string | null = null;

    if (featured) {
      const metaText = $el
        .find('.pod-feat__meta > span')
        .map((__, s) => $(s).text().trim())
        .get();
      displayDate = metaText.find((t) => /[A-Za-z]{3,}\.?\s+\d/.test(t)) || null;
      durationLabel = metaText.find((t) => /^\d{1,3}:\d{2}(:\d{2})?$/.test(t)) || null;
    } else {
      durationLabel = ($el.find('.pod-dur').text().trim() || null) as string | null;
      displayDate = ($el.find('.pod-card__date').text().trim() || null) as string | null;
    }

    entries.push({
      title,
      websiteUrl,
      slug: slugFromUrl(websiteUrl),
      description,
      displayDate,
      durationLabel,
      featured,
    });
  });

  return entries;
}

/* --------------------------------------------------------------- feed parse */

/**
 * Parse a Buzzsprout RSS feed into episodes. Namespaced tags (itunes:image,
 * itunes:duration, itunes:summary) are read by scanning each <item>'s children
 * by tag name, which is robust to cheerio's namespace-selector quirks.
 */
export function parseBuzzsproutFeed(xml: string): FeedEpisode[] {
  const $ = cheerio.load(xml, { xml: true });
  const episodes: FeedEpisode[] = [];

  $('item').each((_, item) => {
    const $it = $(item);

    // Build a tag-name -> {text, attribs} map from the item's direct children.
    const fields: Record<string, { text: string; attribs: Record<string, string> }> = {};
    $it.children().each((__, child) => {
      const node = child as unknown as { tagName?: string; name?: string; attribs?: Record<string, string> };
      const name = (node.tagName || node.name || '').toLowerCase();
      if (!name || fields[name]) return;
      fields[name] = { text: $(child).text().trim(), attribs: node.attribs || {} };
    });

    const title = fields['title']?.text || fields['itunes:title']?.text || '';
    if (!title) return;

    const guid = fields['guid']?.text || '';
    const audioUrl = fields['enclosure']?.attribs?.url || null;
    const thumbnailUrl = fields['itunes:image']?.attribs?.href || null;
    const rawDescription = fields['itunes:summary']?.text || fields['description']?.text || null;

    episodes.push({
      title,
      normalizedTitle: normalizeTitle(title),
      guid,
      audioUrl,
      thumbnailUrl,
      description: cleanDescription(rawDescription),
      publishedAt: parseDate(fields['pubdate']?.text),
      durationSeconds: parseDurationToSeconds(fields['itunes:duration']?.text),
    });
  });

  return episodes;
}

/** Buzzsprout summaries can carry markup; reduce to a trimmed, single-spaced snippet. */
function cleanDescription(raw: string | null): string | null {
  if (!raw) return null;
  const text = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

/* ------------------------------------------------------------------ enrich */

/**
 * Join the curated index entries to the feed by normalized title, producing the
 * records to persist. Every index entry yields a record even when no feed match
 * is found (thumbnail/audio null, `matched: false`) so a curated episode is never
 * silently dropped just because the feed lagged.
 */
export function enrichEntries(index: TrainingIndexEntry[], feed: FeedEpisode[]): PodcastRecord[] {
  const byTitle = new Map<string, FeedEpisode>();
  for (const ep of feed) {
    if (ep.normalizedTitle && !byTitle.has(ep.normalizedTitle)) {
      byTitle.set(ep.normalizedTitle, ep);
    }
  }

  return index.map((entry) => {
    const ep = byTitle.get(normalizeTitle(entry.title)) || null;
    const durationSeconds = ep?.durationSeconds ?? parseDurationToSeconds(entry.durationLabel);

    return {
      title: entry.title,
      slug: entry.slug,
      websiteUrl: entry.websiteUrl,
      audioUrl: ep?.audioUrl ?? null,
      thumbnailUrl: ep?.thumbnailUrl ?? null,
      description: entry.description ?? ep?.description ?? null,
      durationSeconds: durationSeconds ?? null,
      durationLabel: entry.durationLabel ?? secondsToLabel(ep?.durationSeconds ?? null),
      publishedAt: ep?.publishedAt ?? parseDate(entry.displayDate),
      buzzsproutGuid: ep?.guid ?? null,
      featured: entry.featured,
      source: PODCAST_SOURCE,
      matched: !!ep,
    };
  });
}
