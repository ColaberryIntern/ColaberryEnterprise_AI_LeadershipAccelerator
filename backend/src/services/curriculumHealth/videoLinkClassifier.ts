/**
 * videoLinkClassifier — pure decision logic for curriculum video link health.
 *
 * No I/O. Every function takes already-fetched inputs and returns a verdict, so
 * the whole failure taxonomy is unit-testable without touching the network.
 *
 * THE SOURCE OF TRUTH IS NOW THE YOUTUBE DATA API. The previous version of this
 * file classified a scraped watch page, and every hard-won rule in it existed to
 * survive the ambiguity of scraping: YouTube reuses `LOGIN_REQUIRED` for both
 * "this video is private" and "prove you are not a robot", so status alone could
 * never separate a dead video from a refused question. On 2026-08-22 that
 * ambiguity turned 146 healthy videos into PRIVATE. The guard that followed was
 * correct and left the job blind, because the production host is challenged on
 * every request. The Data API answers the same questions unambiguously and does
 * not serve bot challenges, so the ambiguity is gone at the source.
 *
 * WHAT REPLACED IT IS A DIFFERENT TRAP, AND IT IS WORSE. `videos.list` does not
 * error on an id it cannot return; it omits it. Ask for 50, get 47, and the three
 * missing ones are the three that are broken. Anything that iterates the response
 * and calls what it finds "the answer" reports a dead curriculum as perfectly
 * healthy — the same 146-video mistake with the sign flipped, and silent instead
 * of loud. `classifyAbsent` exists so that absence has to be classified
 * deliberately, and there is no code path on which a missing id becomes HEALTHY.
 *
 * WHY UNKNOWN NEVER ALERTS. A quota exhaustion, a rejected key, an IP
 * restriction, a timeout or a response shape we do not recognise must never be
 * reported as a dead video. Every inconclusive signal lands in UNKNOWN, which is
 * counted and reported and never paged on. "I could not see" has to stay
 * distinguishable from "everything is fine" in both directions: UNKNOWN is not
 * HEALTHY and it is not a failure.
 *
 * WHY NULL IS NOT FALSE. `ApiVideo.embeddable` is `boolean | null`, and null —
 * the API did not tell us — resolves to UNKNOWN rather than to either verdict.
 * Defaulting it to true would make a dropped `part=status` look like a clean
 * corpus; defaulting it to false would alert on all 150.
 */

import type { ApiVideo } from './videoLinkApiClient';

/** Failure modes are separated because the remedy differs completely. */
export type VideoState =
  | 'HEALTHY'
  | 'EMBEDDING_DISABLED'
  | 'PRIVATE'
  | 'REMOVED'
  | 'UPLOADER_CLOSED'
  | 'REGION_BLOCKED'
  /**
   * The API returned no record for this id, and the discriminator could not say
   * which flavour of gone it is. Still a real failure — a trusted `videos.list`
   * omits an id only when it is private, deleted, or its channel is closed — but
   * an honest one that does not pretend to know which.
   */
  | 'UNAVAILABLE'
  | 'UNKNOWN';

/**
 * Who owns a video, with "we could not tell" as a first-class answer.
 *
 * A boolean cannot carry that third case, and on 2026-08-22 it lied in the
 * reassuring direction: every failing video reported `ours: false`, read as "none
 * of these are ours", when in truth the owner was simply unreadable.
 */
export type Ownership = 'ours' | 'third_party' | 'unknown';

export interface Verdict {
  state: VideoState;
  /** Whether this verdict is solid enough to raise an alert on. */
  actionable: boolean;
  detail: string;
  remedy: string;
}

/**
 * What a secondary lookup learned about an id the Data API did not return.
 *
 * The API tells us WHETHER a video is retrievable; it cannot tell us why, because
 * private, deleted and channel-terminated videos are all simply absent. oEmbed
 * distinguishes them by status code, costs no API quota, and — unlike the watch
 * page — is not the surface that serves bot challenges. When it cannot answer,
 * the video is still a failure; it is just an UNAVAILABLE one.
 */
export interface AbsenceEvidence {
  /** oEmbed HTTP status, or null when the call never produced one. */
  oembedStatus: number | null;
  /** We were refused or rate limited. A statement about this run, not the video. */
  throttled: boolean;
  /** A channel we recorded for this video no longer resolves. */
  knownChannelGone?: boolean;
}

export const OUR_CHANNEL = 'Colaberry School Of Data & AI';

/** The market we serve. A video unavailable here is unavailable to students. */
export const HOME_REGION = 'US';

/**
 * Accepts watch?v=, youtu.be/, /embed/ and /shorts/ forms. Returns null for a
 * non-YouTube URL so those are reported as SKIPPED rather than guessed at.
 *
 * Canonical copy. `scripts/auditCurriculumVideoLinks.ts` re-exports this rather
 * than keeping its own, so the CLI audit and the scheduled check can never
 * disagree about what counts as a video reference.
 */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{6,})/,
    /youtu\.be\/([A-Za-z0-9_-]{6,})/,
    /\/embed\/([A-Za-z0-9_-]{6,})/,
    /\/shorts\/([A-Za-z0-9_-]{6,})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

/** Upload states that mean the file itself is gone or was never usable. */
const DEAD_UPLOAD_STATES = new Set(['deleted', 'failed', 'rejected']);

/**
 * Is the video playable in our home region?
 *
 * `allowed` is a whitelist and `blocked` is a blacklist; YouTube sends at most
 * one. An ABSENT restriction means no restriction — but an EMPTY allowed list
 * would mean "nowhere", so the two are not collapsed. The old scraper's
 * equivalent check deliberately treated an empty country list as "unknown, not
 * excluded", because it could not tell an unrestricted video from a page it had
 * failed to read. The API does not have that ambiguity: no `regionRestriction`
 * key means genuinely unrestricted.
 */
function regionBlocked(v: ApiVideo): boolean {
  if (v.regionBlocked && v.regionBlocked.includes(HOME_REGION)) return true;
  if (v.regionAllowed && !v.regionAllowed.includes(HOME_REGION)) return true;
  return false;
}

/**
 * Classify a video the API DID return.
 *
 * Order matters. "Gone" outranks "private" outranks "cannot be embedded"
 * outranks "cannot be watched here": each earlier state makes the later ones
 * moot, and reporting the earliest true one gives the curriculum owner the
 * remedy that actually resolves the card.
 */
export function classifyPresent(v: ApiVideo): Verdict {
  if (v.uploadStatus && DEAD_UPLOAD_STATES.has(v.uploadStatus)) {
    return {
      state: 'REMOVED',
      actionable: true,
      detail: `the API reports uploadStatus='${v.uploadStatus}'`,
      remedy: 'Deleted or taken down. Curriculum owner must choose a replacement.',
    };
  }

  if (v.privacyStatus === 'private') {
    return {
      state: 'PRIVATE',
      actionable: true,
      detail: 'the API reports privacyStatus=private, so no student can open it',
      remedy: 'Ours: set back to unlisted or public. Third party: replace the video.',
    };
  }

  // Never guess this one in either direction. See the header note on null.
  if (v.embeddable === null) {
    return {
      state: 'UNKNOWN',
      actionable: false,
      detail: `the API response carried no status.embeddable for this video (privacyStatus=${v.privacyStatus ?? 'n/a'})`,
      remedy: 'No action. The response shape changed or a part was dropped; investigate if it persists.',
    };
  }

  if (v.privacyStatus === null) {
    return {
      state: 'UNKNOWN',
      actionable: false,
      detail: 'the API response carried no status.privacyStatus for this video',
      remedy: 'No action. The response shape changed or a part was dropped; investigate if it persists.',
    };
  }

  // The trap: perfectly public, perfectly healthy to any naive check, and dead in
  // our iframe. One of the three real failures in the corpus is exactly this.
  if (v.embeddable === false) {
    return {
      state: 'EMBEDDING_DISABLED',
      actionable: true,
      detail: 'public on YouTube but status.embeddable=false, so it cannot play in our player',
      remedy: 'Ours: re-enable embedding. Third party: link out or replace the video.',
    };
  }

  if (regionBlocked(v)) {
    const how = v.regionBlocked?.includes(HOME_REGION)
      ? `${HOME_REGION} is on the blocked list`
      : `the allowed list (${v.regionAllowed?.length ?? 0} regions) excludes ${HOME_REGION}`;
    return {
      state: 'REGION_BLOCKED',
      actionable: true,
      detail: `playable and embeddable but ${how}`,
      remedy: 'Uploader geo-restricted it. Replace, or host a licensed copy.',
    };
  }

  return { state: 'HEALTHY', actionable: false, detail: 'public and embeddable', remedy: '' };
}

/**
 * Classify an id the API did NOT return.
 *
 * This is never HEALTHY and there is no argument under which it could be. A
 * `videos.list` call that succeeded, was not paginated, and was vouched for by a
 * control video in the same response omits an id only when that video is not
 * publicly retrievable: private, deleted, or on a terminated channel. All three
 * strand a student.
 *
 * The oEmbed evidence only decides WHICH. When it is missing the verdict stays
 * actionable and says so, because "we know it is broken and not which way" is a
 * true statement and a useful alert, while calling it UNKNOWN would silently drop
 * a real outage into the bucket that never pages.
 */
export function classifyAbsent(evidence: AbsenceEvidence): Verdict {
  const { oembedStatus, throttled, knownChannelGone } = evidence;

  if (oembedStatus === 403) {
    return {
      state: 'PRIVATE',
      actionable: true,
      detail: 'the API returned no record for this id and oEmbed reports it private',
      remedy: 'Ours: set back to unlisted or public. Third party: replace the video.',
    };
  }

  if (oembedStatus === 404) {
    if (knownChannelGone) {
      return {
        state: 'UPLOADER_CLOSED',
        actionable: true,
        detail: 'the API returned no record for this id and the uploading channel no longer resolves',
        remedy: 'Gone for good. Curriculum owner must choose a replacement.',
      };
    }
    return {
      state: 'REMOVED',
      actionable: true,
      detail: 'the API returned no record for this id and oEmbed reports it does not exist',
      remedy: 'Deleted or taken down. Curriculum owner must choose a replacement.',
    };
  }

  // oEmbed says the video is fine while the API says it does not exist. Two
  // trustworthy sources disagreeing is not evidence of anything; do not pick one.
  // Note this lands in UNKNOWN and NOT in HEALTHY: a disagreement is a reason to
  // look again, never a reason to sign the video off.
  if (oembedStatus === 200) {
    return {
      state: 'UNKNOWN',
      actionable: false,
      detail: 'the API returned no record for this id but oEmbed answered 200; the two sources disagree',
      remedy: 'No action. Re-checked next run; investigate if the disagreement persists.',
    };
  }

  return {
    state: 'UNAVAILABLE',
    actionable: true,
    detail: throttled
      ? 'the API returned no record for this id; the follow-up lookup was refused, so the exact cause is unconfirmed'
      : `the API returned no record for this id; the follow-up lookup was inconclusive (oEmbed=${oembedStatus ?? 'n/a'})`,
    remedy: 'Private, deleted, or the uploading channel is closed. Open the link to confirm which, then replace it.',
  };
}

/** Is this one of ours? A failure on our channel is a settings mistake we can fix. */
export function isOurChannel(channel: string | null | undefined): boolean {
  return (channel ?? '').trim().toLowerCase() === OUR_CHANNEL.toLowerCase();
}

/**
 * Ownership with an honest third answer.
 *
 * Prefer this over `isOurChannel` anywhere the result is counted or reported.
 * `isOurChannel(null)` is `false`, which is correct as a predicate and wrong as
 * a statistic: aggregate enough of them and you get "0 failures on our channel"
 * from a run that never learned who owned anything.
 */
export function ownershipOf(channel: string | null | undefined): Ownership {
  const name = (channel ?? '').trim();
  if (!name) return 'unknown';
  return isOurChannel(name) ? 'ours' : 'third_party';
}
