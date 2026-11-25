import { Op } from 'sequelize';
import { MediaAsset } from '../../models';
import { extractYouTubeId, fetchVideoStats, YouTubeStatsError } from './youtubeStats';

/**
 * Refresh the stored view counts for every YouTube link in the library.
 *
 * WHY STORED AND NOT LIVE. The library grid renders up to 100 tiles. Calling YouTube
 * during a render would put an external network round trip on the critical path of a
 * page load, and would make the page fail when YouTube does. The counts are therefore
 * fetched on a schedule and read from the row, and every tile shows WHEN it was last
 * checked so a stale number is visibly stale rather than quietly wrong.
 *
 * WHERE IT IS STORED. `media_assets.metadata.youtube`. This needs no migration and no new
 * table: metadata is an existing jsonb column on the model. The whole library is 17 links,
 * so the write volume is trivial.
 *
 * IDEMPOTENCY, stated plainly as CLAUDE.md requires. Running this twice inserts no rows,
 * sends nothing, and creates no duplicate of anything; it overwrites the same key on the
 * same rows with the same counts. `checkedAt` does advance on the second run, and that is
 * intended: it records when the measurement was taken, and a refresh whose timestamp never
 * moved could not be told apart from one that never ran.
 *
 * FAILURE PATH. A failure to reach YouTube leaves every stored count exactly as it was -
 * the previous numbers stay readable, with their original (now older) checkedAt, so the
 * screen degrades to "last known" rather than to blank. Nothing is written on a failed
 * fetch. The error is classified and rethrown for the scheduler's dead-letter wrapper.
 */

export interface YoutubeViewRecord {
  videoId: string;
  viewCount: number | null;
  likeCount: number | null;
  /** ISO-8601, UTC. The UI renders it in Central. */
  checkedAt: string;
}

export interface RefreshSummary {
  /** Link assets that carry a parseable YouTube id. */
  considered: number;
  /** Distinct video ids asked about (a video linked twice is asked about once). */
  requested: number;
  /** Ids YouTube answered for. */
  answered: number;
  /** Rows whose stored record changed. */
  updated: number;
  /**
   * Ids YouTube omitted: private, deleted, or never existed. Deliberately NOT written as
   * zero views - absent means "no answer", and a deleted video must not read as a flop.
   */
  unanswered: number;
}

/** Merge the youtube record into existing metadata without disturbing other keys. Pure. */
export function mergeYoutubeMetadata(
  existing: Record<string, unknown> | null | undefined,
  record: YoutubeViewRecord,
): Record<string, unknown> {
  return { ...(existing ?? {}), youtube: record };
}

/** True when the newly fetched counts differ from what is already stored. Pure. */
export function countsChanged(
  existing: unknown,
  next: YoutubeViewRecord,
): boolean {
  const prev = existing as Partial<YoutubeViewRecord> | undefined;
  if (!prev) return true;
  return prev.viewCount !== next.viewCount
    || prev.likeCount !== next.likeCount
    || prev.videoId !== next.videoId;
}

export async function refreshYoutubeViews(now: Date = new Date()): Promise<RefreshSummary> {
  // Archived rows are skipped: nobody is looking at them, and they would spend quota.
  const assets = await MediaAsset.findAll({
    where: { kind: 'link', archived_at: { [Op.is]: null } },
    attributes: ['id', 'source_url', 'metadata'],
  });

  const byVideoId = new Map<string, MediaAsset[]>();
  for (const asset of assets) {
    const videoId = extractYouTubeId((asset as unknown as { source_url: string | null }).source_url);
    if (!videoId) continue;
    const list = byVideoId.get(videoId);
    if (list) list.push(asset);
    else byVideoId.set(videoId, [asset]);
  }

  const summary: RefreshSummary = {
    considered: Array.from(byVideoId.values()).reduce((n, list) => n + list.length, 0),
    requested: byVideoId.size,
    answered: 0,
    updated: 0,
    unanswered: 0,
  };
  if (byVideoId.size === 0) return summary;

  const stats = await fetchVideoStats(Array.from(byVideoId.keys()));
  const checkedAt = now.toISOString();

  for (const [videoId, rows] of byVideoId) {
    const stat = stats.get(videoId);
    if (!stat) {
      summary.unanswered += 1;
      continue;
    }
    summary.answered += 1;
    const record: YoutubeViewRecord = {
      videoId,
      viewCount: stat.viewCount,
      likeCount: stat.likeCount,
      checkedAt,
    };
    for (const row of rows) {
      const meta = (row as unknown as { metadata: Record<string, unknown> | null }).metadata;
      const changed = countsChanged(meta?.youtube, record);
      await row.update({ metadata: mergeYoutubeMetadata(meta, record) });
      if (changed) summary.updated += 1;
    }
  }
  return summary;
}

/** Entry point for the scheduler. Logs one structured line and lets the wrapper handle failure. */
export async function runYoutubeViewRefresh(): Promise<void> {
  const started = Date.now();
  try {
    const summary = await refreshYoutubeViews();
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'media-library',
      event: 'youtube_view_refresh',
      duration_ms: Date.now() - started,
      outcome: summary.unanswered === 0 ? 'success' : 'partial',
      context: summary,
    }));
  } catch (err) {
    const e = err as YouTubeStatsError;
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'media-library',
      event: 'youtube_view_refresh',
      duration_ms: Date.now() - started,
      outcome: 'failure',
      error_class: e.errorClass ?? 'UpstreamUnavailable',
      context: { message: e.message },
    }));
    throw err;
  }
}
