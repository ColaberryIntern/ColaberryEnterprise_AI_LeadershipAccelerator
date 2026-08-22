/**
 * videoLinkProbe — the I/O half of the curriculum video health check: how we ask
 * YouTube about a video, how fast we are allowed to ask, and how we decide
 * whether the answers we got back are worth believing.
 *
 * Split out of videoLinkHealthService so that file can stay about curriculum
 * blast radius and alerting. Everything here is about the measurement itself.
 *
 * THREE RULES, ALL OF THEM LEARNED THE HARD WAY:
 *
 * 1. PACE THE PROBES. At this corpus size (~150 videos, two requests each)
 *    rate limiting is the common case, not the exception. An earlier sweep at
 *    CONCURRENCY 4 with no spacing turned 46 healthy videos "unreachable", and
 *    the 2026-08-22 run got a bot challenge on all 149. Throttling is a fact
 *    about us, not about the videos, so the fix is to ask more slowly. A daily
 *    job has all the time in the world; two minutes at 6:20 AM costs nothing.
 *
 * 2. CARRY A CONTROL. Every batch is bracketed by a probe of a video we know is
 *    healthy — one of ours, so if it ever genuinely breaks we can fix it. If the
 *    control does not come back healthy, YouTube is not answering us honestly,
 *    and NOTHING in that batch may be called broken. This is the single
 *    technique that caught all three false readings during development, which is
 *    why it lives in the product now instead of in someone's debugging session.
 *    Bracketing rather than just leading the batch catches throttling that
 *    begins midway through.
 *
 * 3. NEVER CONDEMN ON ONE OBSERVATION. A video that fails once and passes on
 *    retry was never broken. The caller re-observes every suspect in a second,
 *    separately controlled burst before anything is allowed to alert.
 *
 * Failure-first notes:
 *  - Every outbound call has an explicit timeout and a capped retry ladder.
 *  - A throttle or a 5xx is never a verdict; it returns a null status, which the
 *    classifier degrades to UNKNOWN.
 *  - If the control itself is the thing that broke, the check goes quiet rather
 *    than loud. That is the safe direction, but it is silent, so the run result
 *    reports `untrusted_batches` and the service logs it at warn.
 */

import { classify, readPlayerResponse, extractPlayerResponse, type PlayerProbe } from './videoLinkClassifier';
import type { Verdict } from './videoLinkClassifier';

const OEMBED = 'https://www.youtube.com/oembed';
const WATCH = 'https://www.youtube.com/watch';
const CHANNEL = 'https://www.youtube.com/channel';

const TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;

/**
 * A public, embeddable video on our own channel, used to decide whether a batch
 * of answers can be believed. It must be ours: a third-party control could be
 * made private tomorrow and silently mute the whole check.
 */
export const CONTROL_VIDEO_ID = '2xRzYuit9ac';

/** Minimum gap between any two outbound YouTube requests, across all workers. */
export const PACE_MS = 350;

/** Videos per control-bracketed batch. */
export const BATCH_SIZE = 25;

/** In-flight probes. Low on purpose; the pacer is the real throttle. */
export const CONCURRENCY = 2;

/** Breathing room before re-observing suspects, so pass 2 is a fresh opinion. */
export const CONFIRM_COOLDOWN_MS = 20_000;

/** A desktop UA: the watch page serves a different shell to unknown clients. */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface OembedResult {
  /** null when the call never produced a meaningful status. Inconclusive. */
  status: number | null;
  /** author_name, available only on a 200. The fallback source for ownership. */
  author: string | null;
  /** We were rate limited. A statement about this run, not about the video. */
  throttled: boolean;
}

/** One video, both methods, plus what we learned about who owns it. */
export interface Observation {
  video_id: string;
  verdict: Verdict;
  channel: string | null;
  /** YouTube refused to answer for this video. Never a verdict. */
  challenged: boolean;
}

export interface BatchResult {
  /** False when the control did not come back healthy. Believe nothing. */
  trusted: boolean;
  observations: Observation[];
  /** Why the batch was rejected, for the log. */
  control_detail?: string;
}

export interface Prober {
  oembed(videoId: string): Promise<OembedResult>;
  player(videoId: string): Promise<PlayerProbe>;
  channelGone(channelId: string | null): Promise<boolean>;
}

/**
 * Serialises the START of every request behind a shared minimum gap, so raising
 * CONCURRENCY can never turn into a burst. Returns immediately when the gap is
 * zero, which is how the unit tests run without sleeping for minutes.
 */
export function makePacer(gapMs: number): () => Promise<void> {
  let nextAt = 0;
  return async function pace(): Promise<void> {
    if (gapMs <= 0) return;
    const now = Date.now();
    const at = Math.max(now, nextAt);
    nextAt = at + gapMs;
    if (at > now) await sleep(at - now);
  };
}

/** A 429 or a 5xx is YouTube declining, not a fact about the video. */
const isThrottle = (status: number): boolean => status === 429 || status >= 500;

export function createProber(gapMs: number = PACE_MS): Prober {
  const pace = makePacer(gapMs);

  async function get(url: string, headers: Record<string, string>): Promise<Response> {
    await pace();
    return fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers });
  }

  async function oembed(videoId: string): Promise<OembedResult> {
    const url = `${OEMBED}?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    let throttled = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await get(url, { 'User-Agent': UA });

        if (res.status === 200) {
          // A malformed body is not a dead video; keep the 200 and lose the author.
          let author: string | null = null;
          try {
            author = ((await res.json()) as { author_name?: string }).author_name ?? null;
          } catch {
            author = null;
          }
          return { status: 200, author, throttled };
        }

        if (isThrottle(res.status)) {
          throttled = true;
          if (attempt < MAX_ATTEMPTS) {
            await sleep(1500 * attempt);
            continue;
          }
          // Throttled to the end: no verdict, and say so.
          return { status: null, author: null, throttled: true };
        }

        // 401 / 403 / 404 are meaningful verdicts, not transport failures.
        return { status: res.status, author: null, throttled };
      } catch {
        if (attempt < MAX_ATTEMPTS) await sleep(1000 * attempt);
      }
    }
    return { status: null, author: null, throttled };
  }

  async function player(videoId: string): Promise<PlayerProbe> {
    const headers = { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'CONSENT=YES+1' };

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await get(`${WATCH}?v=${encodeURIComponent(videoId)}`, headers);

        if (res.status !== 200) {
          if (attempt < MAX_ATTEMPTS) {
            await sleep(1500 * attempt);
            continue;
          }
          return {
            reachable: false,
            challenged: isThrottle(res.status),
            note: `watch page HTTP ${res.status}`,
          };
        }

        const probe = readPlayerResponse(extractPlayerResponse(await res.text()));

        // A challenge will be served again immediately; burning retries on it
        // only deepens the throttle. Report it and let the control guard act.
        if (probe.challenged) return probe;

        if (!probe.reachable && attempt < MAX_ATTEMPTS) {
          await sleep(1500 * attempt);
          continue;
        }
        return probe;
      } catch (err) {
        const e = err as Error;
        if (attempt < MAX_ATTEMPTS) await sleep(1500 * attempt);
        else return { reachable: false, note: e.name === 'TimeoutError' ? 'TimeoutError' : e.name };
      }
    }
    return { reachable: false, note: 'exhausted attempts' };
  }

  /**
   * Does a channel we recorded as the owner still resolve? Discriminates
   * UPLOADER_CLOSED from a plain REMOVED, whose video URLs both 404.
   */
  async function channelGone(channelId: string | null): Promise<boolean> {
    if (!channelId) return false;
    try {
      const res = await get(`${CHANNEL}/${encodeURIComponent(channelId)}`, { 'User-Agent': UA });
      return res.status === 404;
    } catch {
      return false; // inconclusive: stay with the weaker, safer REMOVED
    }
  }

  return { oembed, player, channelGone };
}

/**
 * Both methods for one video, combined into a verdict.
 *
 * Ownership is read from the watch page's microformat when present and falls
 * back to the oEmbed author, because the microformat is absent for exactly the
 * videos a failure report is about.
 */
export async function observeOne(videoId: string, prober: Prober): Promise<Observation> {
  const o = await prober.oembed(videoId);
  const p = await prober.player(videoId);

  let verdict = classify(o.status, p);
  if (verdict.state === 'REMOVED' && (await prober.channelGone(p.channelId ?? null))) {
    verdict = classify(o.status, p, true);
  }

  return {
    video_id: videoId,
    verdict,
    channel: p.owner ?? o.author ?? null,
    challenged: Boolean(p.challenged) || o.throttled,
  };
}

/** Split a list into fixed-size batches. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Observe a batch, bracketed by the control video.
 *
 * The control is probed before AND after: a batch that starts clean and gets
 * throttled halfway through is exactly the shape that produced false failures,
 * and a leading control alone would have vouched for it.
 */
export async function observeBatch(videoIds: string[], prober: Prober): Promise<BatchResult> {
  if (!videoIds.length) return { trusted: true, observations: [] };

  const before = await observeOne(CONTROL_VIDEO_ID, prober);
  if (before.verdict.state !== 'HEALTHY') {
    return {
      trusted: false,
      observations: [],
      control_detail: `control failed before the batch: ${before.verdict.state} (${before.verdict.detail})`,
    };
  }

  const observations: Observation[] = new Array(videoIds.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < videoIds.length) {
      const i = cursor++;
      observations[i] = await observeOne(videoIds[i], prober);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, videoIds.length) }, worker));

  const after = await observeOne(CONTROL_VIDEO_ID, prober);
  if (after.verdict.state !== 'HEALTHY') {
    return {
      trusted: false,
      observations,
      control_detail: `control failed after the batch: ${after.verdict.state} (${after.verdict.detail})`,
    };
  }

  return { trusted: true, observations };
}
