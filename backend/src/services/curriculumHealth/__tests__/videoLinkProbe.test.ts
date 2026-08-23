/**
 * Batch-level trust rules. These sit between the API client (which knows only
 * about HTTP) and the health service (which knows only about curriculum), and
 * they are where "we could not see" is separated from both "healthy" and
 * "broken".
 *
 * Two properties are load-bearing here and neither is obvious from reading
 * observeBatch in isolation:
 *
 *  1. Every id in the REQUEST comes back with a verdict, including the ids the
 *     API omitted. A response-driven loop would return 47 observations for 50
 *     ids and the three dead videos would vanish from the report rather than
 *     appear in it.
 *  2. An untrusted batch yields NO observations at all. Not "the ones we managed
 *     to read" - none. Half an answer from an API we have caught lying is not a
 *     partial result, it is not a result.
 */
import { BATCH_SIZE, CONTROL_VIDEO_ID, chunk, observeBatch, type ProbeDeps } from '../videoLinkProbe';
import { MAX_IDS_PER_CALL, type ApiVideo, type VideoLookup } from '../videoLinkApiClient';

const apiVideo = (id: string, over: Partial<ApiVideo> = {}): ApiVideo => ({
  id,
  privacyStatus: 'public',
  uploadStatus: 'processed',
  embeddable: true,
  channelTitle: 'Anthropic',
  channelId: 'UC-x',
  regionAllowed: null,
  regionBlocked: null,
  ytRating: null,
  ...over,
});

/** A client that returns everything asked for except the named ids. */
function fakeApi(opts: {
  absent?: string[];
  overrides?: Record<string, Partial<ApiVideo>>;
  fail?: { errorClass: 'QuotaExceeded' | 'AuthError' | 'UpstreamUnavailable'; detail: string };
  paginated?: boolean;
} = {}) {
  const calls: string[][] = [];
  const lookup = jest.fn(async (ids: string[]): Promise<VideoLookup> => {
    calls.push(ids);
    if (opts.fail) return { ok: false, ...opts.fail, quotaUnits: 1 };
    const found = new Map<string, ApiVideo>();
    for (const id of ids) {
      if (opts.absent?.includes(id)) continue;
      found.set(id, apiVideo(id, opts.overrides?.[id]));
    }
    return { ok: true, found, requested: [...ids], complete: !opts.paginated, quotaUnits: 1 };
  });
  return { client: { lookup, quotaUnits: () => calls.length }, calls };
}

const absenceProbe = (oembed: Record<string, number> = {}, channelGone = false) => ({
  explain: jest.fn(async (id: string) => ({ oembedStatus: oembed[id] ?? null, throttled: false })),
  channelGone: jest.fn(async () => channelGone),
});

const deps = (api: ReturnType<typeof fakeApi>['client'], absence = absenceProbe()): ProbeDeps =>
  ({ api, absence } as unknown as ProbeDeps);

describe('chunk', () => {
  it('splits to the API ceiling minus the control, so the control rides along free', () => {
    expect(BATCH_SIZE).toBe(MAX_IDS_PER_CALL - 1);
    expect(chunk(Array.from({ length: 150 }, (_, i) => `v${i}`), BATCH_SIZE).map((c) => c.length))
      .toEqual([49, 49, 49, 3]);
  });
});

describe('every requested id gets a verdict', () => {
  it('THE HEADLINE: an id the API omitted is reported as a failure, not skipped as healthy', async () => {
    const ids = ['alive1', 'gone000', 'alive2'];
    const { client } = fakeApi({ absent: ['gone000'] });

    const res = await observeBatch(ids, deps(client, absenceProbe({ gone000: 404 })));

    expect(res.trusted).toBe(true);
    // Three ids in, three verdicts out. A response-driven loop returns two.
    expect(res.observations.map((o) => o.video_id)).toEqual(ids);
    expect(res.observations.find((o) => o.video_id === 'gone000')?.verdict.state).toBe('REMOVED');
    expect(res.observations.find((o) => o.video_id === 'gone000')?.verdict.actionable).toBe(true);
  });

  it('an omitted id is never HEALTHY even when nothing else can explain it', async () => {
    const { client } = fakeApi({ absent: ['gone000'] });

    const res = await observeBatch(['gone000'], deps(client, absenceProbe({})));

    expect(res.observations[0].verdict.state).toBe('UNAVAILABLE');
    expect(res.observations[0].verdict.state).not.toBe('HEALTHY');
  });

  it('upgrades REMOVED to UPLOADER_CLOSED when a known channel no longer resolves', async () => {
    const { client } = fakeApi({ absent: ['gone000'] });
    const absence = absenceProbe({ gone000: 404 }, true);
    const probeDeps = { ...deps(client, absence), knownChannels: new Map([['gone000', 'UC-dead']]) };

    const res = await observeBatch(['gone000'], probeDeps);

    expect(res.observations[0].verdict.state).toBe('UPLOADER_CLOSED');
    expect(absence.channelGone).toHaveBeenCalledWith('UC-dead');
  });

  it('does not spend a channel lookup on ids that are merely private', async () => {
    const { client } = fakeApi({ absent: ['p'] });
    const absence = absenceProbe({ p: 403 });

    await observeBatch(['p'], { ...deps(client, absence), knownChannels: new Map([['p', 'UC-x']]) });

    expect(absence.channelGone).not.toHaveBeenCalled();
  });

  it('classifies present-but-broken videos without any follow-up lookup at all', async () => {
    const { client } = fakeApi({ overrides: { trap: { embeddable: false } } });
    const absence = absenceProbe();

    const res = await observeBatch(['trap'], deps(client, absence));

    expect(res.observations[0].verdict.state).toBe('EMBEDDING_DISABLED');
    expect(absence.explain).not.toHaveBeenCalled();
  });
});

describe('the control video decides whether the answer may be believed', () => {
  it('rides inside the same request, costing no extra call', async () => {
    const { client, calls } = fakeApi();

    await observeBatch(['a', 'b'], deps(client));

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([CONTROL_VIDEO_ID, 'a', 'b']);
  });

  it('is not asked for twice when it is itself part of the corpus', async () => {
    const { client, calls } = fakeApi();

    await observeBatch(['a', CONTROL_VIDEO_ID], deps(client));

    expect(calls[0]).toEqual(['a', CONTROL_VIDEO_ID]);
    expect(calls[0].filter((id) => id === CONTROL_VIDEO_ID)).toHaveLength(1);
  });

  it('voids the batch when the control is absent, rather than declaring 49 videos dead', async () => {
    const { client } = fakeApi({ absent: [CONTROL_VIDEO_ID, 'a', 'b'] });

    const res = await observeBatch(['a', 'b'], deps(client));

    expect(res.trusted).toBe(false);
    expect(res.observations).toEqual([]);
    expect(res.control_detail).toContain(CONTROL_VIDEO_ID);
  });

  it('voids the batch when the control comes back unhealthy', async () => {
    const { client } = fakeApi({ overrides: { [CONTROL_VIDEO_ID]: { embeddable: false } } });

    const res = await observeBatch(['a'], deps(client));

    expect(res.trusted).toBe(false);
    expect(res.observations).toEqual([]);
  });
});

describe('an API that will not answer is never an answer about a video', () => {
  it.each([
    ['QuotaExceeded' as const, 'videos.list HTTP 403 (quotaExceeded)'],
    ['AuthError' as const, 'videos.list HTTP 403 (ipRefererBlocked)'],
    ['UpstreamUnavailable' as const, 'request timed out'],
  ])('%s voids the batch with zero observations', async (errorClass, detail) => {
    const { client } = fakeApi({ fail: { errorClass, detail } });

    const res = await observeBatch(['a', 'b', 'c'], deps(client));

    expect(res.trusted).toBe(false);
    expect(res.observations).toEqual([]);
    expect(res.control_detail).toContain(errorClass);
  });

  it('voids a paginated response, because absence from a truncated page proves nothing', async () => {
    const { client } = fakeApi({ absent: ['b'], paginated: true });

    const res = await observeBatch(['a', 'b'], deps(client));

    expect(res.trusted).toBe(false);
    expect(res.observations).toEqual([]);
    expect(res.control_detail).toMatch(/paginated/);
  });

  it('reports the quota it spent even on a batch it threw away', async () => {
    const { client } = fakeApi({ fail: { errorClass: 'QuotaExceeded', detail: 'out of units' } });

    const res = await observeBatch(['a'], deps(client));

    expect(res.quota_units).toBe(1);
  });

  it('an empty id list is a no-op that spends nothing', async () => {
    const { client, calls } = fakeApi();

    const res = await observeBatch([], deps(client));

    expect(res).toEqual({ trusted: true, observations: [], quota_units: 0 });
    expect(calls).toHaveLength(0);
  });
});
