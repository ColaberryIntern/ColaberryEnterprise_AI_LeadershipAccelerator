/**
 * videoLinkProbe — the measurement half of the curriculum video health check:
 * how we ask the YouTube Data API about a batch of videos, and how we decide
 * whether the answer we got back is worth believing.
 *
 * Split from videoLinkHealthService so that file can stay about curriculum blast
 * radius and alerting. Everything here is about the measurement itself.
 *
 * THREE RULES, ALL OF THEM LEARNED THE HARD WAY:
 *
 * 1. ABSENCE IS AN ANSWER, AND IT IS NOT "FINE". `videos.list` omits ids it
 *    cannot return rather than erroring on them, so 47 items back from 50 ids
 *    means three videos are broken. This module never iterates the response; it
 *    iterates the REQUEST and looks each id up, so there is no path on which a
 *    missing video is quietly skipped and counted as healthy. That mistake would
 *    be the 2026-08-22 incident with the sign flipped — 146 false positives
 *    became loud and were caught in a day; false negatives are silent forever.
 *
 * 2. CARRY A CONTROL. Every batch includes a video we know is healthy — one of
 *    ours, so if it ever genuinely breaks we can fix it — in the same
 *    `videos.list` call, at no extra quota cost. If the control does not come
 *    back healthy, the API is not answering us honestly and NOTHING in that batch
 *    may be called broken, including the ids that were absent from it. This is
 *    what keeps quota exhaustion, a rejected key and an IP restriction from
 *    reading as "the entire curriculum is gone".
 *
 * 3. NEVER CONDEMN ON ONE OBSERVATION. A video that fails once and passes on
 *    retry was never broken. The caller re-observes every suspect in a second,
 *    separately controlled call before anything is allowed to alert.
 *
 * Failure-first notes:
 *  - The API client owns timeouts and retries; this module owns trust.
 *  - Any client failure returns `trusted: false`, which the service counts as
 *    `unverified` — reported, never alerted, and never counted as healthy.
 *  - A paginated response also returns `trusted: false`: absence from a truncated
 *    page is not evidence of anything.
 *  - If the control itself is the thing that broke, the check goes quiet rather
 *    than loud. That is the safe direction, but it is silent, so the run result
 *    reports `untrusted_batches` and the service logs it at warn.
 */

import { classifyAbsent, classifyPresent, type Verdict } from './videoLinkClassifier';
import { MAX_IDS_PER_CALL, type VideoApiClient } from './videoLinkApiClient';
import type { AbsenceProbe } from './videoLinkAbsenceProbe';

export { sleep } from './videoLinkAbsenceProbe';

/**
 * A public, embeddable video on our own channel, used to decide whether a batch
 * of answers can be believed. It must be ours: a third-party control could be
 * made private tomorrow and silently mute the whole check.
 */
export const CONTROL_VIDEO_ID = '2xRzYuit9ac';

/**
 * Targets per call. One below the API's 50-id ceiling so the control rides along
 * in the same request — same answer, same conditions, zero extra quota.
 */
export const BATCH_SIZE = MAX_IDS_PER_CALL - 1;

/** Minimum gap between the follow-up oEmbed lookups. */
export const PACE_MS = 350;

/** Breathing room before re-observing suspects, so pass 2 is a fresh opinion. */
export const CONFIRM_COOLDOWN_MS = 20_000;

/** One video, classified, plus what we learned about who owns it. */
export interface Observation {
  video_id: string;
  verdict: Verdict;
  channel: string | null;
  /** A follow-up lookup was refused. Never a verdict; feeds the throttle metric. */
  challenged: boolean;
}

export interface BatchResult {
  /** False when the API did not answer, or did not answer honestly. Believe nothing. */
  trusted: boolean;
  observations: Observation[];
  /** Why the batch was rejected, for the log. Never contains the API key. */
  control_detail?: string;
  /** Quota units this batch spent, so the run can report its daily cost. */
  quota_units: number;
}

export interface ProbeDeps {
  api: VideoApiClient;
  absence: AbsenceProbe;
  /**
   * Channel ids we already know for a video, used to upgrade REMOVED to
   * UPLOADER_CLOSED. Absent for most videos, which is why the upgrade is opt-in
   * rather than assumed.
   */
  knownChannels?: Map<string, string>;
}

/** Split a list into fixed-size batches. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const untrusted = (detail: string, units: number): BatchResult => ({
  trusted: false,
  observations: [],
  control_detail: detail,
  quota_units: units,
});

/**
 * Observe one batch of videos in a single `videos.list` call that also carries
 * the control video.
 *
 * The control travels INSIDE the request rather than bracketing it, which is
 * strictly stronger than the two extra calls the scraping version needed: it is
 * subject to the identical quota state, the identical key, the identical network
 * path and the identical response, so there is no window in which conditions
 * could change between vouching for the batch and measuring it.
 */
export async function observeBatch(videoIds: string[], deps: ProbeDeps): Promise<BatchResult> {
  if (!videoIds.length) return { trusted: true, observations: [], quota_units: 0 };

  // The control may legitimately be one of the corpus videos; asking for it twice
  // would waste an id slot and return one item for two requested ids, which is
  // exactly the arithmetic this module refuses to get wrong.
  const ids = videoIds.includes(CONTROL_VIDEO_ID) ? [...videoIds] : [CONTROL_VIDEO_ID, ...videoIds];

  const res = await deps.api.lookup(ids);
  if (!res.ok) {
    return untrusted(`videos.list did not answer: ${res.errorClass} - ${res.detail}`, res.quotaUnits);
  }
  if (!res.complete) {
    // A truncated page means an id can be missing for a reason that has nothing to
    // do with the video. Absence is only evidence when the answer was whole.
    return untrusted('videos.list returned a paginated response; absence is not evidence', res.quotaUnits);
  }

  const control = res.found.get(CONTROL_VIDEO_ID);
  if (!control) {
    return untrusted(`the control video ${CONTROL_VIDEO_ID} was absent from the response`, res.quotaUnits);
  }
  const controlVerdict = classifyPresent(control);
  if (controlVerdict.state !== 'HEALTHY') {
    return untrusted(
      `the control video came back ${controlVerdict.state} (${controlVerdict.detail})`,
      res.quotaUnits,
    );
  }

  const observations: Observation[] = [];
  for (const id of videoIds) {
    const found = res.found.get(id);

    if (found) {
      observations.push({
        video_id: id,
        verdict: classifyPresent(found),
        channel: found.channelTitle,
        challenged: false,
      });
      continue;
    }

    // Absent from a trusted, complete response. Broken; the only open question is
    // which way, and that question is never allowed to make it healthy.
    const evidence = await deps.absence.explain(id);
    const channelId = deps.knownChannels?.get(id) ?? null;
    const knownChannelGone =
      evidence.oembedStatus === 404 && channelId ? await deps.absence.channelGone(channelId) : false;

    observations.push({
      video_id: id,
      verdict: classifyAbsent({ ...evidence, knownChannelGone }),
      channel: null,
      challenged: evidence.throttled,
    });
  }

  return { trusted: true, observations, quota_units: res.quotaUnits };
}
