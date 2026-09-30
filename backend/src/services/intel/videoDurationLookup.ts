/**
 * videoDurationLookup — resolve a video's TRUE length at ingestion time, so a
 * generated card is born knowing how long its video actually is.
 *
 * WHY THIS EXISTS. Both intel ingestion paths stamped `estimated_time: 6` on
 * every card they created, a literal that had nothing to do with the video. The
 * watch gate divides accumulated play time by the card's duration to decide
 * whether a student has watched 75%, so a wrong duration is not a cosmetic label
 * — it is the denominator of the completion gate.
 *
 * Measured on production on 2026-08-26, across the 50 published video cards that
 * carried no stored duration: real lengths ran from 6 SECONDS to 3h11m against a
 * uniform 6-minute stamp; 39 of the 50 were wrong by more than 15%; and 11 were
 * mathematically impossible to complete, because 75% of a 6-minute estimate is
 * 4.5 minutes of watching and the video was shorter than that. On a 6-second
 * video the highest reachable score was 2%.
 *
 * Those 50 cards were repaired in place. This module is what stops the next one
 * being born broken.
 *
 * COST. Reuses `videoLinkApiClient`, the single audited I/O boundary to the
 * YouTube Data API — same IPv4 dispatcher, same timeout, same capped retry
 * ladder, same key redaction, same absence rule. `videos.list` costs 1 quota unit
 * per call regardless of parts or ids, and `contentDetails` is already in the
 * requested parts, so reading duration here is quota-free relative to the health
 * check that already runs daily.
 *
 * FAILURE-FIRST. Every failure mode returns null and the caller keeps its
 * documented fallback:
 *  - no API key configured        -> null (dev machines, CI)
 *  - quota exhausted / auth error -> null
 *  - upstream timeout or 5xx      -> null (the client already retried)
 *  - the id was not returned      -> null (private, deleted, or terminated)
 *  - a live stream (`P0D`)        -> null (no length to be a percentage of)
 * A null is never a statement that the video is 0 seconds long. It means "we
 * could not see", and a card that cannot see falls back rather than gating a
 * student against a number nobody measured.
 */
import { createVideoApiClient, VideoApiClient } from '../curriculumHealth/videoLinkApiClient';

/**
 * What a generated card's `estimated_time` falls back to when the true length
 * could not be read. Previously this value was an unexplained literal `6` at two
 * call sites; naming it makes it a documented default rather than a guess that
 * reads like a measurement.
 */
export const FALLBACK_ESTIMATED_MINUTES = 6;

/**
 * PURE — the 11-character YouTube id in a URL, or null.
 *
 * Mirrors the provider pattern in `utils/videoUrl.isPlayableVideoUrl`. Only
 * YouTube is resolvable here: the Data API is a YouTube API, and Vimeo/Loom/
 * Wistia/direct-file links legitimately return null and take the fallback.
 */
export function youtubeIdFromUrl(raw: string | null | undefined): string | null {
  const url = String(raw || '').trim();
  if (!url) return null;
  const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(url);
  return m ? m[1] : null;
}

/**
 * PURE — whole minutes to display for a known length, floored at 1.
 *
 * A 6-second video rounds to 0 minutes, and a card advertising "0 min" reads as
 * broken. 1 is the smallest honest label. This affects DISPLAY only: the watch
 * gate uses `metadata.video.duration_seconds`, never this.
 */
export function estimatedMinutesFor(durationSeconds: number): number {
  return Math.max(1, Math.round(durationSeconds / 60));
}

/**
 * The true length of a video URL in seconds, or null when it cannot be read.
 * Never throws — every caller is a content pipeline that must keep running.
 */
export async function resolveVideoDurationSeconds(
  url: string | null | undefined,
  client?: VideoApiClient,
): Promise<number | null> {
  const id = youtubeIdFromUrl(url);
  if (!id) return null;

  try {
    const api = client ?? createVideoApiClient();
    const res = await api.lookup([id]);
    if (!res.ok) {
      // Not a statement about the video — only about our ability to see it.
      console.warn(`[intel] duration lookup unavailable (${res.errorClass}): ${res.detail}`);
      return null;
    }
    // The absence rule: an id the API did not return is missing, not zero-length.
    const video = res.found.get(id);
    if (!video) return null;
    return video.durationSeconds ?? null;
  } catch (err) {
    console.warn(`[intel] duration lookup threw: ${(err as Error).message}`);
    return null;
  }
}

/**
 * The `estimated_time` + `metadata.video` pair for one ingested item, resolved
 * against the provider when possible. Returns the fallback minutes and an
 * unchanged video block when the length is unknown, so a card is always
 * creatable.
 */
export async function resolveCardTiming(
  videoBlock: { url: string; title: string | null } | null,
  client?: VideoApiClient,
): Promise<{ estimatedMinutes: number; video: { url: string; title: string | null; duration_seconds?: number } | null }> {
  if (!videoBlock) return { estimatedMinutes: FALLBACK_ESTIMATED_MINUTES, video: null };

  const seconds = await resolveVideoDurationSeconds(videoBlock.url, client);
  if (seconds == null) return { estimatedMinutes: FALLBACK_ESTIMATED_MINUTES, video: videoBlock };

  return {
    estimatedMinutes: estimatedMinutesFor(seconds),
    // `duration_seconds` is what watchProgressService.resolveAuthoritativeDurationS
    // reads to PIN the gate's denominator to ground truth.
    video: { ...videoBlock, duration_seconds: seconds },
  };
}
