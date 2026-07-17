/**
 * podcastIngestionService — fetches the curated training-site podcast index and the
 * Buzzsprout RSS feed, enriches each curated episode with a real thumbnail/audio/GUID,
 * and idempotently upserts the result into the `podcasts` table.
 *
 * Failure-first design (see CLAUDE.md):
 *   - Both fetches have an explicit timeout and capped retries.
 *   - The index fetch is REQUIRED: if it fails after retries we throw and leave the table
 *     untouched — a failed/empty scrape must never wipe the curated catalog.
 *   - The feed fetch is OPTIONAL: if it fails we degrade to index-only (null thumbnails)
 *     rather than aborting, and report it in the summary.
 *   - Upsert is keyed on `website_url` (unique), so re-running produces the same rows with
 *     no duplicates. Content fields are written only when they actually change.
 */
import { Op } from 'sequelize';
import { Podcast } from '../../models';
import {
  parseTrainingIndex,
  parseBuzzsproutFeed,
  enrichEntries,
  PodcastRecord,
} from './podcastFeedParser';

export const TRAINING_INDEX_URL = 'https://training.colaberry.com/podcasts';
export const BUZZSPROUT_FEED_URL = 'https://feeds.buzzsprout.com/2456315.rss';

const FETCH_TIMEOUT_MS = 20_000;
const FETCH_ATTEMPTS = 3;
const USER_AGENT = 'ColaberryPodcastBot/1.0 (+https://enterprise.colaberry.ai)';

export interface PodcastRefreshOptions {
  dryRun?: boolean;
  indexUrl?: string;
  feedUrl?: string;
}

export interface PodcastRefreshSummary {
  ok: boolean;
  dryRun: boolean;
  total: number;
  inserted: number;
  updated: number;
  unchanged: number;
  failed: number;
  withThumbnail: number;
  withoutThumbnail: number;
  feedFetched: boolean;
  feedEpisodes: number;
  durationMs: number;
  startedAt: string;
  errors: string[];
}

function classifyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/abort/i.test(msg)) return 'TimeoutError';
  if (/HTTP 4\d\d/.test(msg)) return 'ClientError';
  if (/HTTP 5\d\d/.test(msg)) return 'UpstreamUnavailable';
  if (/fetch failed|ENOTFOUND|ECONN|network/i.test(msg)) return 'NetworkError';
  return 'Error';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch text with an explicit timeout and capped, backed-off retries. */
async function fetchText(url: string): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xml,*/*' },
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < FETCH_ATTEMPTS) await sleep(1000 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// Content fields compared to decide insert vs update vs unchanged (excludes last_seen_at).
const CONTENT_FIELDS: (keyof PodcastRecord)[] = [
  'title',
  'slug',
  'audioUrl',
  'thumbnailUrl',
  'description',
  'durationSeconds',
  'durationLabel',
  'publishedAt',
  'buzzsproutGuid',
  'featured',
  'source',
  'category',
  'tags',
];

function recordToRow(rec: PodcastRecord, now: Date) {
  return {
    title: rec.title,
    slug: rec.slug,
    website_url: rec.websiteUrl,
    audio_url: rec.audioUrl,
    thumbnail_url: rec.thumbnailUrl,
    description: rec.description,
    duration_seconds: rec.durationSeconds,
    duration_label: rec.durationLabel,
    published_at: rec.publishedAt,
    buzzsprout_guid: rec.buzzsproutGuid,
    featured: rec.featured,
    source: rec.source,
    category: rec.category,
    tags: rec.tags,
    raw_meta_json: { matched: rec.matched },
    last_seen_at: now,
  };
}

/** True when any content field on the existing row differs from the freshly scraped record. */
function hasContentChange(existing: Podcast, rec: PodcastRecord): boolean {
  for (const field of CONTENT_FIELDS) {
    const next = rec[field];
    if (field === 'tags') {
      if (JSON.stringify(existing.tags || []) !== JSON.stringify((next as string[]) || [])) return true;
      continue;
    }
    let current: unknown;
    switch (field) {
      case 'audioUrl': current = existing.audio_url; break;
      case 'thumbnailUrl': current = existing.thumbnail_url; break;
      case 'durationSeconds': current = existing.duration_seconds; break;
      case 'durationLabel': current = existing.duration_label; break;
      case 'publishedAt': current = existing.published_at; break;
      case 'buzzsproutGuid': current = existing.buzzsprout_guid; break;
      default: current = (existing as any)[field]; break;
    }
    if (field === 'publishedAt') {
      const a = next instanceof Date ? next.getTime() : null;
      const b = current instanceof Date ? current.getTime() : current ? new Date(current as any).getTime() : null;
      if (a !== b) return true;
    } else if ((current ?? null) !== (next ?? null)) {
      return true;
    }
  }
  return false;
}

/**
 * Scrape + enrich + upsert the podcast catalog. Safe to run repeatedly (weekly cron,
 * manual admin trigger, or CLI). Returns a structured summary.
 */
export async function refreshPodcasts(options: PodcastRefreshOptions = {}): Promise<PodcastRefreshSummary> {
  const startedAt = new Date();
  const dryRun = options.dryRun === true;
  const indexUrl = options.indexUrl || TRAINING_INDEX_URL;
  const feedUrl = options.feedUrl || BUZZSPROUT_FEED_URL;
  const errors: string[] = [];

  // 1. Index is required. Let a hard failure propagate (do NOT touch the table).
  const indexHtml = await fetchText(indexUrl);
  const indexEntries = parseTrainingIndex(indexHtml);
  if (indexEntries.length === 0) {
    throw new Error('ContractViolation: parsed 0 episodes from the training index (markup changed?)');
  }

  // 2. Feed is optional enrichment. Degrade gracefully on failure.
  let feedEpisodes: ReturnType<typeof parseBuzzsproutFeed> = [];
  let feedFetched = false;
  try {
    const feedXml = await fetchText(feedUrl);
    feedEpisodes = parseBuzzsproutFeed(feedXml);
    feedFetched = true;
  } catch (err) {
    const cls = classifyError(err);
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`feed:${cls}:${msg}`);
    console.warn(`[PodcastRefresh] feed fetch failed (${cls}) — continuing index-only:`, msg);
  }

  const records = enrichEntries(indexEntries, feedEpisodes);

  const summary: PodcastRefreshSummary = {
    ok: true,
    dryRun,
    total: records.length,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    withThumbnail: records.filter((r) => !!r.thumbnailUrl).length,
    withoutThumbnail: records.filter((r) => !r.thumbnailUrl).length,
    feedFetched,
    feedEpisodes: feedEpisodes.length,
    durationMs: 0,
    startedAt: startedAt.toISOString(),
    errors,
  };

  if (dryRun) {
    summary.durationMs = Date.now() - startedAt.getTime();
    console.log('[PodcastRefresh] dry-run summary:', JSON.stringify(summary));
    return summary;
  }

  // 3. Idempotent upsert keyed on website_url.
  for (const rec of records) {
    const now = new Date();
    try {
      const existing = await Podcast.findOne({ where: { website_url: rec.websiteUrl } });
      if (!existing) {
        await Podcast.create({ ...recordToRow(rec, now), is_active: true, created_at: now, updated_at: now } as any);
        summary.inserted++;
      } else if (hasContentChange(existing, rec)) {
        await existing.update({ ...recordToRow(rec, now), updated_at: now } as any);
        summary.updated++;
      } else {
        await existing.update({ last_seen_at: now } as any);
        summary.unchanged++;
      }
    } catch (err) {
      summary.failed++;
      const cls = classifyError(err);
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`upsert:${rec.slug}:${cls}:${msg}`);
      console.error(`[PodcastRefresh] upsert failed for ${rec.websiteUrl} (${cls}):`, msg);
    }
  }

  summary.ok = summary.failed === 0;
  summary.durationMs = Date.now() - startedAt.getTime();
  console.log('[PodcastRefresh] summary:', JSON.stringify(summary));
  return summary;
}

/**
 * Optional housekeeping: mark rows not seen in the latest successful scrape as inactive
 * so the portal can hide episodes the training site has dropped, without deleting history.
 * Not called by the weekly job by default (curated pages churn); exposed for admin use.
 */
export async function deactivateStalePodcasts(seenBeforeIso: string): Promise<number> {
  const [count] = await Podcast.update(
    { is_active: false, updated_at: new Date() },
    { where: { is_active: true, last_seen_at: { [Op.lt]: new Date(seenBeforeIso) } } }
  );
  return count;
}
