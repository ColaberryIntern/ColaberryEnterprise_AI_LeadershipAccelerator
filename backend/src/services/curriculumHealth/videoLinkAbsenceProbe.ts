/**
 * videoLinkAbsenceProbe — the follow-up lookup that says WHICH kind of gone an
 * id is, once `videos.list` has established THAT it is gone.
 *
 * `videos.list` omits private, deleted and channel-terminated videos identically:
 * they are all just missing from `items[]`. That is enough to know the card is
 * broken, and not enough to tell the curriculum owner what to do about it —
 * "make it public again" and "pick a new video" are very different asks. oEmbed
 * separates them by status code (403 private, 404 gone), costs no Data API quota,
 * and is a different service from the watch page, which is the surface that
 * serves the production host a bot challenge.
 *
 * DELIBERATELY SMALL BLAST RADIUS. This runs only for ids the API did not return
 * — three of them in the current corpus, not 150 — so it can be paced generously
 * without lengthening the run. It is a refinement, never a gate: if every call
 * here fails, the videos are still reported as failures, just as UNAVAILABLE
 * rather than as PRIVATE or REMOVED. Nothing about this file can turn a broken
 * video healthy, and nothing about it can turn a healthy video broken, because it
 * is only ever consulted about ids the API already declined to return.
 *
 * Failure-first notes:
 *  - Explicit timeout, capped retries, backoff on 429/5xx.
 *  - A throttle returns `oembedStatus: null` with `throttled: true`. Never a verdict.
 *  - `channelGone` returns false when it cannot tell, which keeps the weaker and
 *    safer REMOVED rather than upgrading to UPLOADER_CLOSED on a guess.
 */

import type { AbsenceEvidence } from './videoLinkClassifier';

const OEMBED = 'https://www.youtube.com/oembed';
const CHANNEL = 'https://www.youtube.com/channel';

const TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;

/** A desktop UA: YouTube serves a different shell to unknown clients. */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface AbsenceProbe {
  /** Why is this id missing from the API response? */
  explain(videoId: string): Promise<AbsenceEvidence>;
  /** Does a channel we recorded still resolve? Used to upgrade REMOVED. */
  channelGone(channelId: string | null): Promise<boolean>;
}

/**
 * Serialises the START of every request behind a shared minimum gap, so the
 * follow-up lookups cannot arrive as a burst. Returns immediately when the gap is
 * zero, which is how the unit tests run without sleeping.
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

export function createAbsenceProbe(gapMs = 350): AbsenceProbe {
  const pace = makePacer(gapMs);

  async function get(url: string): Promise<Response> {
    await pace();
    return fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': UA } });
  }

  async function explain(videoId: string): Promise<AbsenceEvidence> {
    const url = `${OEMBED}?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`;
    let throttled = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await get(url);

        if (isThrottle(res.status)) {
          throttled = true;
          if (attempt < MAX_ATTEMPTS) {
            await sleep(1500 * attempt);
            continue;
          }
          return { oembedStatus: null, throttled: true };
        }

        // 200 / 401 / 403 / 404 are all meaningful here, not transport failures.
        return { oembedStatus: res.status, throttled };
      } catch {
        if (attempt < MAX_ATTEMPTS) await sleep(1000 * attempt);
      }
    }
    return { oembedStatus: null, throttled };
  }

  async function channelGone(channelId: string | null): Promise<boolean> {
    if (!channelId) return false;
    try {
      const res = await get(`${CHANNEL}/${encodeURIComponent(channelId)}`);
      return res.status === 404;
    } catch {
      return false; // inconclusive: stay with the weaker, safer REMOVED
    }
  }

  return { explain, channelGone };
}
