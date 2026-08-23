/**
 * Shared fakes for the curriculum video health suites.
 *
 * Everything here is a pure builder - no `jest.mock`, no module-registry state -
 * because that machinery is per-suite and cannot be shared.
 *
 * These now build YOUTUBE DATA API responses rather than scraped watch pages.
 * The single most important thing a fake in this file can do is let a test
 * express "the API was asked for these ids and returned FEWER items than that",
 * because that is the shape of the bug the whole check now has to survive:
 * `videos.list` omits ids it cannot return, and any consumer that reads the
 * response instead of reconciling it against the request will call a dead video
 * healthy. `apiFetch({ absent: [...] })` is how a test says that out loud.
 */

export const CANONICAL = '92b98a72-8681-4f04-8ba1-16a18334cd0b';

/**
 * Every run paces its follow-up lookups and cools down between passes. Suites
 * drive a fake fetch, so the waiting proves nothing and would add minutes to the
 * run. Zero here means "do not sleep", not "pacing is optional".
 */
export const FAST = { paceMs: 0, confirmCooldownMs: 0 };

/** A public, embeddable video on our channel. Must match videoLinkProbe. */
export const CONTROL_ID = '2xRzYuit9ac';

export const OUR_CHANNEL = 'Colaberry School Of Data & AI';

/** Placeholder value only. Never a real key, and never logged by the client. */
export const TEST_KEY = 'test-key-do-not-log';

export const cardRow = (over: Record<string, unknown> = {}) => ({
  id: 'aebd4db9-9d28-40d7-99cb-ffb04d29733e',
  title: 'Tool use with the Claude 3 model family',
  week: 3,
  bucket: 'learn',
  type: 'video',
  visibility: 'published',
  status: 'active',
  cohort_id: null,
  program_id: CANONICAL,
  video_url: 'https://www.youtube.com/watch?v=6wkFb2_cUik',
  ...over,
});

/** A corpus the size of the real one, all of it healthy unless a test says not. */
export const corpusOf = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    cardRow({ id: `card-${i}`, video_url: `https://www.youtube.com/watch?v=vid${String(i).padStart(6, '0')}` }),
  );

export interface VideoSpec {
  privacyStatus?: string | null;
  uploadStatus?: string | null;
  /** `undefined` omits the key entirely, which is NOT the same as false. */
  embeddable?: boolean;
  /** Pass true to omit `status.embeddable` while keeping the rest of status. */
  omitEmbeddable?: boolean;
  channelTitle?: string | null;
  regionAllowed?: string[];
  regionBlocked?: string[];
}

/** Build one `videos.list` item. */
export function apiItem(id: string, spec: VideoSpec = {}): Record<string, unknown> {
  const status: Record<string, unknown> = {
    privacyStatus: spec.privacyStatus === undefined ? 'public' : spec.privacyStatus,
    uploadStatus: spec.uploadStatus === undefined ? 'processed' : spec.uploadStatus,
  };
  if (status.privacyStatus === null) delete status.privacyStatus;
  if (status.uploadStatus === null) delete status.uploadStatus;
  if (!spec.omitEmbeddable) status.embeddable = spec.embeddable ?? true;

  const contentDetails: Record<string, unknown> = { duration: 'PT6M42S' };
  if (spec.regionAllowed || spec.regionBlocked) {
    contentDetails.regionRestriction = {
      ...(spec.regionAllowed ? { allowed: spec.regionAllowed } : {}),
      ...(spec.regionBlocked ? { blocked: spec.regionBlocked } : {}),
    };
  }

  return {
    id,
    status,
    contentDetails,
    snippet: {
      title: `video ${id}`,
      channelId: 'UCrDwWp7EBBv4NwvScIpBDOA',
      channelTitle: spec.channelTitle === undefined ? 'Anthropic' : spec.channelTitle,
    },
  };
}

/** The ids a `videos.list` URL asked for. */
export function requestedIds(url: string): string[] {
  const m = /[?&]id=([^&]*)/.exec(url);
  return m ? decodeURIComponent(m[1]).split(',').filter(Boolean) : [];
}

export interface ApiRoutes {
  /** Per-id overrides. Any id not named here comes back healthy. */
  videos?: Record<string, VideoSpec>;
  /**
   * Ids the API must OMIT from its response, exactly as it does for private,
   * deleted and channel-terminated videos. The response still returns 200.
   */
  absent?: string[];
  /** Make the control video absent too, to void the batch. */
  controlAbsent?: boolean;
  /** Override the control video's own record. */
  control?: VideoSpec;
  /** Make videos.list fail. `{ status, reason }`, e.g. 403 quotaExceeded. */
  apiError?: { status: number; reason?: string };
  /** Fail videos.list only from the Nth call onward (1-based). Quota running out. */
  apiErrorFromCall?: number;
  /** Return a nextPageToken, so absence proves nothing. */
  paginate?: boolean;
  /** Return a 200 whose body has no items array at all. */
  unshaped?: boolean;
  /** oEmbed status per id, used to discriminate WHY an id is absent. */
  oembed?: Record<string, number>;
  /** Default oEmbed status for ids with no entry above. */
  oembedDefault?: number;
  /** Channel page status, for the UPLOADER_CLOSED upgrade. */
  channel?: number;
}

/**
 * Route fetch by URL across both surfaces the check uses: the Data API and the
 * oEmbed follow-up. The control video answers healthy unless a test says
 * otherwise, because a test describing a broken TARGET is not also asserting
 * that YouTube stopped answering us, and conflating the two would make every
 * failure test unreachable once the control guard landed.
 */
export function apiFetch(routes: ApiRoutes = {}) {
  let apiCalls = 0;

  return jest.fn(async (url: string) => {
    const u = String(url);

    if (u.startsWith('https://www.googleapis.com/youtube/v3/videos')) {
      apiCalls++;

      const failing =
        routes.apiError && (!routes.apiErrorFromCall || apiCalls >= routes.apiErrorFromCall);
      if (failing) {
        const { status, reason } = routes.apiError as { status: number; reason?: string };
        return {
          status,
          ok: false,
          json: async () => ({ error: { errors: [{ reason: reason ?? 'forbidden' }], message: reason } }),
        } as never;
      }

      if (routes.unshaped) {
        return { status: 200, ok: true, json: async () => ({ kind: 'youtube#videoListResponse' }) } as never;
      }

      const absent = new Set(routes.absent ?? []);
      const items = requestedIds(u)
        .filter((id) => {
          if (id === CONTROL_ID) return !routes.controlAbsent;
          return !absent.has(id);
        })
        .map((id) =>
          id === CONTROL_ID
            ? apiItem(id, { channelTitle: OUR_CHANNEL, privacyStatus: 'unlisted', ...(routes.control ?? {}) })
            : apiItem(id, routes.videos?.[id] ?? {}),
        );

      return {
        status: 200,
        ok: true,
        json: async () => ({ items, ...(routes.paginate ? { nextPageToken: 'CAUQAA' } : {}) }),
      } as never;
    }

    if (u.startsWith('https://www.youtube.com/oembed')) {
      const inner = decodeURIComponent(/url=([^&]*)/.exec(u)?.[1] ?? '');
      const id = /[?&]v=([A-Za-z0-9_-]+)/.exec(inner)?.[1] ?? '';
      const status = routes.oembed?.[id] ?? routes.oembedDefault ?? 404;
      return { status, json: async () => ({ author_name: null }), text: async () => '' } as never;
    }

    if (u.includes('/channel/')) return { status: routes.channel ?? 200, text: async () => '' } as never;

    // Anything else (notably the watch page the old scraper read) is a 404 here.
    return { status: 404, json: async () => ({}), text: async () => '' } as never;
  });
}

/**
 * A fetch whose answer for a given id changes between the first observation and
 * the second. This is how "failed once, fine on retry" is expressed: pass
 * `{ vid000000: [true, false] }` to have it absent from the first response and
 * present in the second.
 */
export function flakyApiFetch(absentPerCall: Record<string, boolean[]>, oembed: Record<string, number> = {}) {
  const seen: Record<string, number> = {};

  return jest.fn(async (url: string) => {
    const u = String(url);

    if (u.startsWith('https://www.googleapis.com/youtube/v3/videos')) {
      const items = requestedIds(u)
        .filter((id) => {
          const ladder = absentPerCall[id];
          if (!ladder) return true;
          const n = seen[id] ?? 0;
          seen[id] = n + 1;
          return !ladder[Math.min(n, ladder.length - 1)];
        })
        .map((id) =>
          id === CONTROL_ID
            ? apiItem(id, { channelTitle: OUR_CHANNEL, privacyStatus: 'unlisted' })
            : apiItem(id),
        );
      return { status: 200, ok: true, json: async () => ({ items }) } as never;
    }

    if (u.startsWith('https://www.youtube.com/oembed')) {
      const inner = decodeURIComponent(/url=([^&]*)/.exec(u)?.[1] ?? '');
      const id = /[?&]v=([A-Za-z0-9_-]+)/.exec(inner)?.[1] ?? '';
      return { status: oembed[id] ?? 404, json: async () => ({}), text: async () => '' } as never;
    }

    if (u.includes('/channel/')) return { status: 200, text: async () => '' } as never;
    return { status: 404, json: async () => ({}), text: async () => '' } as never;
  });
}
