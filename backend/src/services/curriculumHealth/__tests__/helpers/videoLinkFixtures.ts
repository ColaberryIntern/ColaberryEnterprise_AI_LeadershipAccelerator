/**
 * Shared fakes for the curriculum video health suites.
 *
 * Extracted when videoLinkHealthService.test.ts crossed the 500-line ceiling and
 * a second suite needed the same YouTube stand-ins. Everything here is a pure
 * builder — no `jest.mock`, no module-registry state — because that machinery is
 * per-suite and cannot be shared.
 */

export const CANONICAL = '92b98a72-8681-4f04-8ba1-16a18334cd0b';

/**
 * Every run is paced and cooled down in production. Suites drive a fake fetch, so
 * the waiting proves nothing and would add minutes to the run. Zero here means
 * "do not sleep", not "pacing is optional" — the `pacing` suite is what proves
 * the defaults are the safe ones.
 */
export const FAST = { paceMs: 0, confirmCooldownMs: 0 };

/** A public, embeddable video on our channel. Must match videoLinkProbe. */
export const CONTROL_ID = '2xRzYuit9ac';

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

/** Build a watch page whose embedded player response says what we want. */
export const watchPage = (opts: { status: string; embeddable: boolean; owner?: string | null }) => {
  const mf: Record<string, unknown> = {
    externalChannelId: 'UCrDwWp7EBBv4NwvScIpBDOA',
    availableCountries: ['US'],
  };
  // An explicit null means the page names no owner, which is the whole point of
  // the oEmbed fallback. Only `undefined` takes the convenience default.
  if (opts.owner !== null) mf.ownerChannelName = opts.owner ?? 'Anthropic';
  if (opts.embeddable) mf.embed = { iframeUrl: 'https://www.youtube.com/embed/x' };
  return `<script>var ytInitialPlayerResponse = ${JSON.stringify({
    playabilityStatus: { status: opts.status },
    microformat: { playerMicroformatRenderer: mf },
  })};</script>`;
};

/**
 * The page YouTube serves when it decides the caller is a robot. No microformat,
 * so no owner and no embed key — which is why the 2026-08-22 dry run reported a
 * null channel for all 149 videos as well as a false PRIVATE for 146 of them.
 */
export const challengePage = () =>
  `<script>var ytInitialPlayerResponse = ${JSON.stringify({
    playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm you’re not a bot' },
  })};</script>`;

export type WatchSpec = { status: string; embeddable: boolean; owner?: string | null } | number | 'challenge';

export const HEALTHY_WATCH: WatchSpec = { status: 'OK', embeddable: true };

export const renderWatch = (w: WatchSpec) => {
  if (w === 'challenge') return { status: 200, text: async () => challengePage() } as never;
  if (typeof w === 'number') return { status: w, text: async () => '' } as never;
  return { status: 200, text: async () => watchPage(w) } as never;
};

export const videoIdOf = (url: string): string => new URL(url, 'https://x').searchParams.get('v') ?? '';

/**
 * Route fetch by URL so ordering between oEmbed and watch cannot drift.
 *
 * The control video is served healthy unless a test says otherwise. A test that
 * wants to describe a broken *target* is not also asserting that YouTube stopped
 * answering us, and conflating the two would make every failure test unreachable
 * once the control guard landed.
 */
export function routeFetch(routes: {
  oembed?: number;
  oembedAuthor?: string | null;
  watch?: WatchSpec;
  channel?: number;
  control?: WatchSpec;
  controlOembed?: number;
}) {
  return jest.fn(async (url: string) => {
    const isControl = url.includes(CONTROL_ID);
    if (url.includes('/oembed')) {
      const status = isControl ? routes.controlOembed ?? 200 : routes.oembed ?? 200;
      const author = isControl ? 'Colaberry School Of Data & AI' : routes.oembedAuthor ?? null;
      return { status, json: async () => ({ author_name: author }), text: async () => '' } as never;
    }
    if (url.includes('/channel/')) return { status: routes.channel ?? 200, text: async () => '' } as never;
    if (isControl) return renderWatch(routes.control ?? HEALTHY_WATCH);
    return renderWatch(routes.watch ?? HEALTHY_WATCH);
  });
}

/**
 * A fetch whose answer for a given video changes between the first observation
 * and the second. This is how "failed once, fine on retry" is expressed.
 */
export function flakyFetch(
  perVideo: Record<string, WatchSpec[]>,
  oembedPerVideo: Record<string, number[]> = {},
) {
  const seen: Record<string, number> = {};
  return jest.fn(async (url: string) => {
    if (url.includes(CONTROL_ID)) {
      if (url.includes('/oembed')) {
        return {
          status: 200,
          json: async () => ({ author_name: 'Colaberry School Of Data & AI' }),
          text: async () => '',
        } as never;
      }
      return renderWatch(HEALTHY_WATCH);
    }
    if (url.includes('/channel/')) return { status: 200, text: async () => '' } as never;

    const id = videoIdOf(url.replace('&format=json', ''));
    if (url.includes('/oembed')) {
      const ladder = oembedPerVideo[id] ?? [200];
      const n = seen[`o:${id}`] ?? 0;
      seen[`o:${id}`] = n + 1;
      return {
        status: ladder[Math.min(n, ladder.length - 1)],
        json: async () => ({ author_name: null }),
        text: async () => '',
      } as never;
    }
    const ladder = perVideo[id] ?? [HEALTHY_WATCH];
    const n = seen[`w:${id}`] ?? 0;
    seen[`w:${id}`] = n + 1;
    return renderWatch(ladder[Math.min(n, ladder.length - 1)]);
  });
}
