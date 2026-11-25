/**
 * YouTube view counts for library link assets.
 *
 * Every link in the library is a YouTube URL (measured 2026-11-25: 17 of 17), so "how is
 * this video doing" is answerable, but only from YouTube. Nothing in our database held a
 * view count before this module.
 *
 * NO NEW DEPENDENCY. `YOUTUBE_API_KEY` was already set on production and was probed on
 * 2026-11-25: videos.list returned HTTP 200 with a real viewCount, and a fabricated video
 * id correctly came back absent. The videos.list endpoint costs ONE quota unit per call
 * regardless of how many ids it carries, and accepts 50 ids at a time, so the whole
 * library refreshes for a single unit out of 10,000 per day.
 *
 * THE KEY IS A CREDENTIAL. It is never logged, never put in an error message, and never
 * returned to a caller. `scrubKey` exists because an upstream error body can echo the
 * query string back at us.
 */

export class YouTubeStatsError extends Error {
  constructor(
    message: string,
    /** Stable classification, per CLAUDE.md's Observability Framework. Never a bare Error. */
    public readonly errorClass:
      | 'ConfigMissing'
      | 'TimeoutError'
      | 'RateLimitError'
      | 'AuthError'
      | 'UpstreamUnavailable'
      | 'ContractViolation',
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'YouTubeStatsError';
  }
}

export interface VideoStats {
  videoId: string;
  viewCount: number | null;
  likeCount: number | null;
}

/** YouTube accepts at most 50 ids per videos.list call. */
export const MAX_IDS_PER_CALL = 50;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;

/**
 * Pull the video id out of any YouTube URL shape we actually store.
 *
 * Pure and exported so the parsing is unit-testable without touching the network - the
 * shapes below are the ones present in the library plus the two obvious siblings.
 * Anything else returns null rather than a guess, because a wrong id would silently
 * attach another video's view count to our asset.
 */
export function extractYouTubeId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;

  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  const valid = (id: string | null | undefined): string | null =>
    id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;

  if (host === 'youtu.be') return valid(u.pathname.split('/')[1]);

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') return valid(u.searchParams.get('v'));
    if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'v' || parts[0] === 'live') {
      return valid(parts[1]);
    }
  }
  return null;
}

/** Remove any echo of the key from text that is about to be logged or thrown. */
export function scrubKey(text: string, key: string | undefined): string {
  let out = String(text);
  if (key) out = out.split(key).join('<redacted>');
  return out.replace(/([?&]key=)[^&\s"']+/g, '$1<redacted>');
}

/** Split into chunks the API will accept. Pure. */
export function chunkIds(ids: string[], size: number = MAX_IDS_PER_CALL): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** A count arrives as a decimal string, or is absent when the owner hides it. Pure. */
export function parseCount(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

/** Turn one videos.list payload into stats. Pure, so the contract is tested without a network. */
export function parseStatsResponse(payload: unknown): VideoStats[] {
  const items = (payload as { items?: unknown })?.items;
  if (!Array.isArray(items)) {
    throw new YouTubeStatsError('videos.list did not return an items array', 'ContractViolation');
  }
  const out: VideoStats[] = [];
  for (const item of items) {
    const id = (item as { id?: unknown })?.id;
    if (typeof id !== 'string' || id === '') continue;
    const stats = (item as { statistics?: Record<string, unknown> })?.statistics ?? {};
    out.push({
      videoId: id,
      viewCount: parseCount(stats.viewCount),
      likeCount: parseCount(stats.likeCount),
    });
  }
  return out;
}

/** Which failures are worth trying again. A 4xx other than 429 will fail identically forever. */
export function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

async function callOnce(ids: string[], key: string): Promise<VideoStats[]> {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'statistics');
  url.searchParams.set('id', ids.join(','));
  url.searchParams.set('key', key);

  // An outbound call without a timeout can hang the scheduler tick forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), { signal: controller.signal });
  } catch (err) {
    const e = err as Error;
    if (e.name === 'AbortError') {
      throw new YouTubeStatsError(`videos.list timed out after ${REQUEST_TIMEOUT_MS}ms`, 'TimeoutError');
    }
    throw new YouTubeStatsError(scrubKey(e.message, key), 'UpstreamUnavailable');
  } finally {
    clearTimeout(timer);
  }

  if (res.status !== 200) {
    const body = scrubKey((await res.text().catch(() => '')).slice(0, 300), key);
    if (res.status === 429) throw new YouTubeStatsError(`quota or rate limit: ${body}`, 'RateLimitError', 429);
    if (res.status === 401 || res.status === 403) {
      throw new YouTubeStatsError(`key rejected: ${body}`, 'AuthError', res.status);
    }
    throw new YouTubeStatsError(`videos.list HTTP ${res.status}: ${body}`, 'UpstreamUnavailable', res.status);
  }

  const json = await res.json().catch(() => {
    throw new YouTubeStatsError('videos.list returned a body that is not JSON', 'ContractViolation');
  });
  return parseStatsResponse(json);
}

/**
 * Fetch stats for any number of video ids.
 *
 * A video that is private, deleted, or simply unknown is OMITTED by YouTube rather than
 * returned with a zero - that is what the fabricated-id control proved - so the returned
 * map is deliberately sparse. A caller must treat "absent" as "no answer", never as zero
 * views, or a deleted video would quietly read as a failed one.
 *
 * Retries are capped at MAX_ATTEMPTS with exponential backoff, and only for failures that
 * could plausibly differ next time. Infinite retry is prohibited by CLAUDE.md.
 */
export async function fetchVideoStats(
  videoIds: string[],
  options: { apiKey?: string; sleep?: (ms: number) => Promise<void> } = {},
): Promise<Map<string, VideoStats>> {
  const key = options.apiKey ?? process.env.YOUTUBE_API_KEY ?? '';
  if (!key) {
    throw new YouTubeStatsError('YOUTUBE_API_KEY is not set', 'ConfigMissing');
  }
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const ids = Array.from(new Set(videoIds.filter((v) => typeof v === 'string' && v !== '')));
  const out = new Map<string, VideoStats>();
  if (ids.length === 0) return out;

  for (const batch of chunkIds(ids)) {
    let lastError: YouTubeStatsError | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        for (const stat of await callOnce(batch, key)) out.set(stat.videoId, stat);
        lastError = null;
        break;
      } catch (err) {
        const e = err instanceof YouTubeStatsError
          ? err
          : new YouTubeStatsError(scrubKey((err as Error).message, key), 'UpstreamUnavailable');
        lastError = e;
        const worthRetrying = e.errorClass === 'TimeoutError'
          || e.errorClass === 'UpstreamUnavailable'
          || (e.status !== undefined && isRetryable(e.status));
        if (!worthRetrying || attempt === MAX_ATTEMPTS) break;
        await sleep(500 * 2 ** (attempt - 1));
      }
    }
    if (lastError) throw lastError;
  }
  return out;
}
