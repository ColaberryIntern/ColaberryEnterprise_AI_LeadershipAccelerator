/**
 * videoLinkApiClient — the ONLY I/O boundary between the curriculum video health
 * check and the YouTube Data API v3.
 *
 * WHY THIS REPLACED THE SCRAPER. The previous probe read the watch page's
 * `ytInitialPlayerResponse`. That works from a laptop and does not work from the
 * production host, which YouTube serves a bot challenge ("Sign in to confirm
 * you're not a bot") instead of an answer. The 2026-08-22 dry run read those
 * challenges as verdicts and turned 146 healthy videos into PRIVATE; the fix that
 * followed correctly refused to believe them, which left the job permanently
 * blind: 150 checked, 150 unknown, 0 failures, every batch untrusted.
 *
 * The Data API answers the same questions directly — `status.privacyStatus`,
 * `status.embeddable`, `status.uploadStatus`, `contentDetails.regionRestriction`
 * — from an authenticated, quota-metered endpoint that has no reason to decide we
 * are a robot.
 *
 * QUOTA. `videos.list` costs 1 unit per call regardless of how many `part`s are
 * requested and accepts up to 50 ids, so the entire ~150-video corpus is 4 calls.
 * The default project allowance is 10,000 units/day. `search.list` costs 100
 * units and is deliberately never used here. See DAILY_QUOTA_NOTE.
 *
 * THE ABSENCE RULE, WHICH IS THE WHOLE POINT OF THIS FILE'S CONTRACT.
 * `videos.list` does not report an error for an id it cannot return. A private,
 * deleted or channel-terminated video is simply MISSING from `items[]`: ask for
 * 50 ids, get 47 items, and the three you did not get back are the three that are
 * broken. A client that returns a plain array invites the caller to iterate it
 * and call that a complete answer, which is precisely the shape of the bug that
 * produced 146 false positives in the other direction. So this returns a
 * `Map<id, ApiVideo>` of what was FOUND plus the ids that were requested, and
 * every consumer is forced to notice the difference.
 *
 * Failure-first notes:
 *  - Every call has an explicit timeout and a capped retry ladder.
 *  - Quota exhaustion, a rejected key and an IP restriction are all reported as
 *    `ok: false` with an `errorClass`. None of them is ever a statement about a
 *    video, so none of them may become a verdict.
 *  - A 200 whose body is not shaped like a videos.list response is a
 *    ContractViolation, not an empty result — an empty result would read as "all
 *    of these videos are gone".
 *  - A response carrying a `nextPageToken` sets `complete: false`. Absence from a
 *    truncated page means nothing, and the caller must discard the batch.
 *  - The API key is read from env at call time and NEVER logged, never included
 *    in an error message, and never returned in a result.
 */

/** `videos.list` accepts at most 50 ids per call. Asking for more silently truncates. */
export const MAX_IDS_PER_CALL = 50;

/**
 * Cost of one `videos.list` call in YouTube Data API quota units, independent of
 * the number of parts or ids. Stated as a constant so the daily budget is
 * arithmetic anyone can check rather than folklore.
 */
export const QUOTA_UNITS_PER_LIST_CALL = 1;

/**
 * Roughly what a daily run costs: ceil(150/49) batches + one confirmation batch.
 * Against the default 10,000 unit/day project allowance this is under 0.1%.
 */
export const DAILY_QUOTA_NOTE = '~5 units/day (4 sweep calls + 1 confirmation call) of a 10,000 unit default allowance';

const API = 'https://www.googleapis.com/youtube/v3';
const PARTS = 'status,snippet,contentDetails';

const TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;

/**
 * Force IPv4 egress. The production key is IP-restricted to the host's IPv4
 * address while the host egresses IPv6 by default, which the key rejects with a
 * 403 — a failure that looks exactly like "the whole curriculum is gone" to any
 * caller that treats an error as an empty result. Scoped to this module's calls;
 * no global runtime change. Mirrors `services/composer/youtubeClient.ts`.
 */
let ipv4Dispatcher: unknown;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Agent } = require('undici');
  ipv4Dispatcher = new Agent({ connect: { family: 4 } });
} catch {
  /* default dispatcher — the key's IP restriction must then allow IPv6 */
}

/** Why we could not see. Every one of these degrades to "unknown", never to a verdict. */
export type ApiErrorClass =
  | 'NotConfigured'
  | 'QuotaExceeded'
  | 'AuthError'
  | 'RateLimited'
  | 'UpstreamUnavailable'
  | 'ContractViolation';

/** One video as the Data API describes it. Every field is nullable on purpose. */
export interface ApiVideo {
  id: string;
  /** public | unlisted | private. null when the API did not say. */
  privacyStatus: string | null;
  /** processed | uploaded | deleted | failed | rejected. null when absent. */
  uploadStatus: string | null;
  /**
   * Whether the video may be played in an iframe. NULL IS NOT FALSE AND IT IS NOT
   * TRUE: it means the response carried no `status.embeddable`, which the
   * classifier must treat as "could not see" rather than defaulting either way.
   */
  embeddable: boolean | null;
  channelTitle: string | null;
  channelId: string | null;
  /** contentDetails.regionRestriction.allowed — a whitelist when present. */
  regionAllowed: string[] | null;
  /** contentDetails.regionRestriction.blocked — a blacklist when present. */
  regionBlocked: string[] | null;
  /** contentDetails.contentRating.ytRating, e.g. 'ytAgeRestricted'. */
  ytRating: string | null;
  /**
   * True length in whole seconds, read from `contentDetails.duration`.
   *
   * NULL means the response carried no parseable duration. It is never 0 — the
   * watch gate divides by this to derive a percentage, so a silent 0 would be
   * either a division by zero or a card that completes on the first frame.
   * Costs no extra quota: `contentDetails` is already in PARTS for
   * regionRestriction, so this is a field we were already paying for and
   * discarding.
   */
  durationSeconds: number | null;
}

export type VideoLookup =
  | {
      ok: true;
      /** Only the ids the API actually returned. Absence is the caller's problem. */
      found: Map<string, ApiVideo>;
      /** The ids that were asked for, so absence can be computed honestly. */
      requested: string[];
      /** False when the response was paginated: absence then proves nothing. */
      complete: boolean;
      /** Units spent by THIS call, retries included. Not a running total. */
      quotaUnits: number;
    }
  | {
      ok: false;
      errorClass: ApiErrorClass;
      /** Safe for logs. Never contains the key or any request URL. */
      detail: string;
      /** Units spent by THIS call, retries included. Not a running total. */
      quotaUnits: number;
    };

export interface VideoApiClient {
  lookup(ids: string[]): Promise<VideoLookup>;
  /** Units spent so far by this client instance. Reported on every run. */
  quotaUnits(): number;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

const strList = (v: unknown): string[] | null =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null;

/**
 * Read `status.embeddable` without ever inventing a default.
 *
 * `?? true` here would be a silent catastrophe: drop `status` from the part list,
 * or have YouTube rename the field, and every video in the curriculum becomes
 * embeddable-and-healthy in one stroke. Absent means absent.
 */
function readEmbeddable(status: Record<string, unknown>): boolean | null {
  if (Object.prototype.hasOwnProperty.call(status, 'embeddable') && typeof status.embeddable === 'boolean') {
    return status.embeddable;
  }
  return null;
}

/**
 * PURE — ISO-8601 media duration (`PT7M58S`, `PT1H2M3S`, `P1DT2H`) to whole
 * seconds. Returns null, never 0, for anything it cannot read.
 *
 * The null-not-zero rule is the whole contract. `watchProgressMath` treats a
 * duration of 0 as "never measurable" and fails the gate OPEN; it treats a small
 * positive number as ground truth and gates against it. Returning 0 for an
 * unreadable duration would therefore quietly mark videos complete. A live
 * stream reports `P0D`, which parses to 0 and is likewise returned as null —
 * a stream has no length to be 75% of.
 */
export function parseIso8601Duration(raw: unknown): number | null {
  if (typeof raw !== 'string' || !raw) return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(raw.trim());
  if (!m) return null;
  const [, d, h, min, sec] = m;
  if (d === undefined && h === undefined && min === undefined && sec === undefined) return null;
  const total = Number(d || 0) * 86400 + Number(h || 0) * 3600 + Number(min || 0) * 60 + Number(sec || 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  return Math.round(total);
}

/** Shape one `videos.list` item. Pure; exported for the unit tests. */
export function readApiVideo(item: Record<string, unknown>): ApiVideo | null {
  const id = str(item.id);
  if (!id) return null;

  const status = (item.status ?? {}) as Record<string, unknown>;
  const snippet = (item.snippet ?? {}) as Record<string, unknown>;
  const details = (item.contentDetails ?? {}) as Record<string, unknown>;
  const region = (details.regionRestriction ?? {}) as Record<string, unknown>;
  const rating = (details.contentRating ?? {}) as Record<string, unknown>;

  return {
    id,
    privacyStatus: str(status.privacyStatus),
    uploadStatus: str(status.uploadStatus),
    embeddable: readEmbeddable(status),
    channelTitle: str(snippet.channelTitle),
    channelId: str(snippet.channelId),
    regionAllowed: strList(region.allowed),
    regionBlocked: strList(region.blocked),
    ytRating: str(rating.ytRating),
    durationSeconds: parseIso8601Duration(details.duration),
  };
}

/** Google's error payloads nest the useful word several layers down. */
function reasonOf(body: unknown): string {
  const b = (body ?? {}) as { error?: { errors?: { reason?: string }[]; message?: string } };
  return b.error?.errors?.[0]?.reason ?? b.error?.message ?? '';
}

/**
 * Strip the key out of anything headed for a log or a return value.
 *
 * Belt and braces: nothing in this file deliberately puts the key in a detail
 * string, but `reasonOf` falls back to Google's `error.message`, which is upstream
 * text we do not control and which has been known to echo the request. A secret
 * that reaches a log is a rotated secret, so the guard is cheap at any price.
 */
function redact(text: string, key: string): string {
  return key ? text.split(key).join('<redacted>') : text;
}

/** A quota rejection arrives as a 403; only the reason separates it from a bad key. */
function classifyHttpError(status: number, reason: string): ApiErrorClass {
  if (status === 403 && /quota|dailyLimit|rateLimitExceeded|userRateLimit/i.test(reason)) return 'QuotaExceeded';
  if (status === 403 || status === 401 || /keyInvalid|ipRefererBlocked|forbidden/i.test(reason)) return 'AuthError';
  if (status === 429) return 'RateLimited';
  if (status >= 500) return 'UpstreamUnavailable';
  return 'ContractViolation';
}

export function createVideoApiClient(): VideoApiClient {
  let spent = 0;

  async function lookup(ids: string[]): Promise<VideoLookup> {
    // Units this call costs, retries included: a retried call is billed twice, so
    // the reported daily cost has to count attempts rather than batches.
    let used = 0;
    const key = (process.env.YOUTUBE_API_KEY || '').trim();
    if (!key) {
      return {
        ok: false,
        errorClass: 'NotConfigured',
        detail: 'YOUTUBE_API_KEY is not set in this environment',
        quotaUnits: 0,
      };
    }
    if (!ids.length) {
      return { ok: true, found: new Map(), requested: [], complete: true, quotaUnits: 0 };
    }
    if (ids.length > MAX_IDS_PER_CALL) {
      // Refuse rather than truncate. A truncated request would return fewer items
      // than asked for, and the caller reads a missing item as a broken video.
      return {
        ok: false,
        errorClass: 'ContractViolation',
        detail: `asked for ${ids.length} ids; videos.list accepts at most ${MAX_IDS_PER_CALL}`,
        quotaUnits: 0,
      };
    }

    const url =
      `${API}/videos?part=${PARTS}&id=${ids.map(encodeURIComponent).join(',')}` +
      `&maxResults=${MAX_IDS_PER_CALL}&key=${key}`;

    let lastClass: ApiErrorClass = 'UpstreamUnavailable';
    let lastDetail = 'no attempt completed';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let res: Response;
      try {
        spent += QUOTA_UNITS_PER_LIST_CALL;
        used += QUOTA_UNITS_PER_LIST_CALL;
        res = await fetch(url, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
          ...(ipv4Dispatcher ? { dispatcher: ipv4Dispatcher } : {}),
        } as RequestInit);
      } catch (err) {
        const e = err as Error;
        lastClass = 'UpstreamUnavailable';
        lastDetail = e.name === 'TimeoutError' ? 'request timed out' : `${e.name}: ${e.message}`;
        if (attempt < MAX_ATTEMPTS) await sleep(1000 * attempt);
        continue;
      }

      if (res.status !== 200) {
        const body = await res.json().catch(() => ({}));
        const reason = reasonOf(body);
        lastClass = classifyHttpError(res.status, reason);
        // The reason word is upstream text, so it is redacted before it can be
        // returned or logged. The URL, which carries the key, is never included.
        lastDetail = redact(`videos.list HTTP ${res.status}${reason ? ` (${reason})` : ''}`, key);

        // Quota and auth are settled facts: retrying spends units to be told the
        // same thing. Throttles and 5xx are worth one more try.
        if (lastClass === 'QuotaExceeded' || lastClass === 'AuthError' || lastClass === 'ContractViolation') {
          return { ok: false, errorClass: lastClass, detail: lastDetail, quotaUnits: used };
        }
        if (attempt < MAX_ATTEMPTS) await sleep(1500 * attempt);
        continue;
      }

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        lastClass = 'ContractViolation';
        lastDetail = 'videos.list returned a 200 whose body is not JSON';
        if (attempt < MAX_ATTEMPTS) await sleep(1000 * attempt);
        continue;
      }

      const parsed = (body ?? {}) as { items?: unknown; nextPageToken?: unknown };
      if (!Array.isArray(parsed.items)) {
        // An unshaped 200 must NOT read as "no videos found" — that is the same
        // as reporting the entire batch dead.
        return {
          ok: false,
          errorClass: 'ContractViolation',
          detail: 'videos.list returned a 200 with no items array',
          quotaUnits: used,
        };
      }

      const found = new Map<string, ApiVideo>();
      for (const raw of parsed.items) {
        const v = readApiVideo((raw ?? {}) as Record<string, unknown>);
        if (v) found.set(v.id, v);
      }

      return {
        ok: true,
        found,
        requested: [...ids],
        complete: !parsed.nextPageToken,
        quotaUnits: used,
      };
    }

    return { ok: false, errorClass: lastClass, detail: lastDetail, quotaUnits: used };
  }

  return { lookup, quotaUnits: () => spent };
}
