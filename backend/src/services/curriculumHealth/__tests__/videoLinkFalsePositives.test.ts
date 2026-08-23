/**
 * The guards that keep the check from manufacturing an outage - and, since the
 * move to the YouTube Data API, the guard that keeps it from manufacturing a
 * clean bill of health, which is the same mistake pointing the other way and is
 * silent instead of loud.
 *
 * Every suite here corresponds to something that actually happened:
 *
 *   1. 2026-08-22: the check was merged, dry-run once, and reported 149 failures
 *      out of 149 videos. 146 were provably healthy minutes later. YouTube had
 *      served a bot challenge to every probe and the challenge was read as a
 *      verdict.
 *   2. 2026-08-23: the fix for that was correct and left the job blind - 150
 *      checked, 150 unknown, 0 failures, 6 untrusted batches, done in nine
 *      seconds because every batch bailed after its control probe failed. No
 *      false alerts, and no coverage either.
 *   3. The trap the API introduces: `videos.list` omits ids it cannot return, so
 *      a check that reads the response instead of reconciling it against the
 *      request reports dead videos as healthy and never says a word.
 *
 * The four defences these tests protect:
 *   - an id missing from the response is a failure, never a pass
 *   - a batch is only believed if its control video was
 *   - nothing is condemned on a single observation
 *   - the ownership metric admits what it does not know
 */
const mockQuery = jest.fn();
const mockGetSetting = jest.fn();
const mockSetSetting = jest.fn();
const mockEmitAlert = jest.fn();

jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
jest.mock('../../settingsService', () => ({
  getSetting: (...a: unknown[]) => mockGetSetting(...a),
  setSetting: (...a: unknown[]) => mockSetSetting(...a),
}));
jest.mock('../../alertService', () => ({ emitAlert: (...a: unknown[]) => mockEmitAlert(...a) }));
jest.mock('../../timeline/curriculumScope', () => ({
  CANONICAL_PROGRAM_ID: '92b98a72-8681-4f04-8ba1-16a18334cd0b',
}));
jest.mock('../../timeline/timelineGatingService', () => ({ isCompletableType: () => true }));

import { CONTROL_VIDEO_ID, runVideoLinkHealthCheck } from '../videoLinkHealthService';
import {
  FAST,
  OUR_CHANNEL,
  TEST_KEY,
  apiFetch,
  cardRow,
  corpusOf,
  flakyApiFetch,
} from './helpers/videoLinkFixtures';

const savedKey = process.env.YOUTUBE_API_KEY;

/** cards query first, then any student-impact counts. */
function primeDb(cards: Record<string, unknown>[], affected = 0) {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: string) => {
    if (String(sql).includes('FROM timeline_cards')) return [cards];
    return [[{ affected }]];
  });
}

const vid = (n: number) => `vid${String(n).padStart(6, '0')}`;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.YOUTUBE_API_KEY = TEST_KEY;
  mockGetSetting.mockResolvedValue(null);
  mockSetSetting.mockResolvedValue(undefined);
  mockEmitAlert.mockResolvedValue({ id: 'alert-1' });
});

afterAll(() => {
  if (savedKey === undefined) delete process.env.YOUTUBE_API_KEY;
  else process.env.YOUTUBE_API_KEY = savedKey;
});

/**
 * The trap the Data API brings with it. `videos.list` does not error on an id it
 * cannot return; it leaves it out. Ask for 50 and get 47, and the three you did
 * not get back are the three that are broken.
 */
describe('a video missing from the API response is not a healthy video', () => {
  it('THE HEADLINE: an omitted id is reported as a failure while its neighbours pass', async () => {
    (global as any).fetch = apiFetch({ absent: [vid(1)], oembed: { [vid(1)]: 404 } });
    primeDb(corpusOf(3), 169);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.checked).toBe(3);
    expect(result.healthy).toBe(2);
    expect(result.failures.map((f) => f.video_id)).toEqual([vid(1)]);
    expect(result.failures[0].state).toBe('REMOVED');
  });

  // Deliberately exceeds Jest's 5s default: a 5xx on the follow-up lookup makes it
  // burn its capped retry ladder with backoff, twice (once per confirmation pass).
  // That slowness is the retry policy working, so the test is given room rather
  // than the policy being weakened.
  it('the omitted id never lands in the healthy count, whatever the follow-up says', async () => {
    // No oEmbed answer at all: we know it is gone, we do not know which flavour.
    (global as any).fetch = apiFetch({ absent: [vid(1)], oembedDefault: 500 });
    primeDb(corpusOf(3), 169);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.healthy).toBe(2);
    expect(result.failures.map((f) => f.state)).toEqual(['UNAVAILABLE']);
    expect(mockEmitAlert).toHaveBeenCalledTimes(1);
  }, 60_000);

  it('a corpus where MOST ids are omitted still reports every one of them', async () => {
    const gone = [vid(0), vid(2), vid(4), vid(6), vid(8)];
    (global as any).fetch = apiFetch({
      absent: gone,
      oembed: Object.fromEntries(gone.map((g) => [g, 403])),
    });
    primeDb(corpusOf(10), 169);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.checked).toBe(10);
    expect(result.healthy).toBe(5);
    expect(result.failures.map((f) => f.video_id).sort()).toEqual([...gone].sort());
    expect(result.failures.every((f) => f.state === 'PRIVATE')).toBe(true);
  });

  it('catches the embedding-disabled trap, which is present in the response and looks fine', async () => {
    (global as any).fetch = apiFetch({ videos: { [vid(1)]: { embeddable: false } } });
    primeDb(corpusOf(3), 169);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.healthy).toBe(2);
    expect(result.failures.map((f) => f.state)).toEqual(['EMBEDDING_DISABLED']);
  });
});

/**
 * The 2026-08-23 dry run, in the shape the API version of it takes: the API
 * refuses to answer, so nothing at all is known. Had the flag been on and this
 * degraded to "broken", that is 150 alerts through a subscription with email on
 * it; had it degraded to "healthy", it is a permanently silent check.
 */
describe('an API that will not answer is neither healthy nor broken', () => {
  it.each([
    ['quota exhaustion', { status: 403, reason: 'quotaExceeded' }],
    ['an IP-restricted key', { status: 403, reason: 'ipRefererBlocked' }],
    ['an upstream outage', { status: 503, reason: 'backendError' }],
  ])('%s produces 0 failures, 0 alerts and 150 unverified', async (_label, apiError) => {
    (global as any).fetch = apiFetch({ apiError });
    primeDb(corpusOf(150), 169);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.checked).toBe(150);
    expect(result.failures).toEqual([]);
    expect(result.alerts_emitted).toBe(0);
    expect(mockEmitAlert).not.toHaveBeenCalled();

    // The distinction the whole design turns on: 150 videos we could not see,
    // not 150 healthy videos and not 150 broken ones.
    expect(result.healthy).toBe(0);
    expect(result.unknown).toBe(150);
    expect(result.unverified).toBe(150);
    expect(result.untrusted_batches).toBeGreaterThan(0);
  }, 30_000);

  it('a blind run does not stamp the day, so it cannot consume a sighted run\'s slot', async () => {
    (global as any).fetch = apiFetch({ apiError: { status: 403, reason: 'quotaExceeded' } });
    primeDb(corpusOf(50), 169);

    const result = await runVideoLinkHealthCheck({ paceMs: 0, confirmCooldownMs: 0 });

    expect(result.unverified).toBe(50);
    expect(mockSetSetting).not.toHaveBeenCalled();
  }, 30_000);

  it('a run that DID see stamps the day as normal', async () => {
    (global as any).fetch = apiFetch({});
    primeDb(corpusOf(3));

    await runVideoLinkHealthCheck({ paceMs: 0, confirmCooldownMs: 0 });

    expect(mockSetSetting).toHaveBeenCalledWith('curriculum_video_health_last_run', expect.any(String));
  });

  it('quota running out mid-run leaves the earlier batches trusted and the rest unverified', async () => {
    // 150 videos is four batches; the API starts refusing on the third call.
    (global as any).fetch = apiFetch({
      apiError: { status: 403, reason: 'quotaExceeded' },
      apiErrorFromCall: 3,
    });
    primeDb(corpusOf(150));

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.healthy).toBe(98);
    expect(result.unverified).toBe(52);
    expect(result.healthy + result.unverified).toBe(150);
    expect(result.failures).toEqual([]);
  }, 30_000);

  it('a 200 with no items array reports nothing seen, rather than everything dead', async () => {
    (global as any).fetch = apiFetch({ unshaped: true });
    primeDb(corpusOf(10));

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.failures).toEqual([]);
    expect(result.unverified).toBe(10);
    expect(result.healthy).toBe(0);
  });

  it('a paginated response is discarded rather than read as absence', async () => {
    (global as any).fetch = apiFetch({ paginate: true, absent: [vid(1)] });
    primeDb(corpusOf(3));

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.failures).toEqual([]);
    expect(result.unverified).toBe(3);
  });

  it('refuses to run at all with no API key, instead of reporting a clean corpus', async () => {
    delete process.env.YOUTUBE_API_KEY;
    (global as any).fetch = apiFetch({});
    primeDb(corpusOf(150));

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('youtube_api_key_missing');
    expect(result.healthy).toBe(0);
    expect(result.unverified).toBe(150);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockEmitAlert).not.toHaveBeenCalled();
    expect(mockSetSetting).not.toHaveBeenCalled();
  });
});

/**
 * A control video of ours, known good, carried inside the same `videos.list`
 * call as the batch it vouches for. If the API will not answer honestly about a
 * video we know is fine, it is not answering honestly about the other 49 either.
 */
describe('the control video decides whether a batch may be believed', () => {
  it('a failed control means nothing in the batch is called broken', async () => {
    // Every target is missing from the response, and so is the control.
    (global as any).fetch = apiFetch({ controlAbsent: true, absent: corpusOf(10).map((_, i) => vid(i)) });
    primeDb(corpusOf(10), 169);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.failures).toEqual([]);
    expect(mockEmitAlert).not.toHaveBeenCalled();
    expect(result.untrusted_batches).toBeGreaterThan(0);
    expect(result.unverified).toBe(10);
  });

  it('a control that comes back unembeddable also voids the batch', async () => {
    (global as any).fetch = apiFetch({ control: { embeddable: false }, absent: [vid(0)] });
    primeDb(corpusOf(3), 169);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.failures).toEqual([]);
    expect(result.unverified).toBe(3);
  });

  it('a passing control lets a genuine failure through', async () => {
    (global as any).fetch = apiFetch({ absent: ['6wkFb2_cUik'], oembed: { '6wkFb2_cUik': 404 } });
    primeDb([cardRow()], 169);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.failures).toHaveLength(1);
    expect(result.untrusted_batches).toBe(0);
    expect(result.unverified).toBe(0);
  });

  it('asks about the control even when the curriculum is entirely healthy', async () => {
    (global as any).fetch = apiFetch({});
    primeDb([cardRow()]);

    await runVideoLinkHealthCheck(FAST);

    const urls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes(CONTROL_VIDEO_ID))).toBe(true);
  });
});

/**
 * "Failed once" is a measurement, not a fact. Every actionable verdict is
 * re-observed in a second, separately controlled call before it can alert.
 */
describe('no video is condemned on a single observation', () => {
  it('a video absent once and present on retry never becomes a failure', async () => {
    (global as any).fetch = flakyApiFetch({ [vid(0)]: [true, false] }, { [vid(0)]: 404 });
    primeDb([cardRow({ video_url: `https://www.youtube.com/watch?v=${vid(0)}` })], 169);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.failures).toEqual([]);
    expect(mockEmitAlert).not.toHaveBeenCalled();
    expect(result.healthy).toBe(1);
  });

  it('a video absent twice is confirmed and does alert', async () => {
    (global as any).fetch = flakyApiFetch({ [vid(0)]: [true] }, { [vid(0)]: 404 });
    primeDb([cardRow({ video_url: `https://www.youtube.com/watch?v=${vid(0)}` })], 169);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].state).toBe('REMOVED');
    expect(mockEmitAlert).toHaveBeenCalledTimes(1);
  });

  it('looks a suspect up twice and a healthy video once: the retry is targeted', async () => {
    (global as any).fetch = flakyApiFetch({ [vid(0)]: [true] }, { [vid(0)]: 404 });
    primeDb(
      [
        cardRow({ id: 'a', video_url: `https://www.youtube.com/watch?v=${vid(0)}` }),
        cardRow({ id: 'b', video_url: `https://www.youtube.com/watch?v=${vid(1)}` }),
      ],
      169,
    );

    await runVideoLinkHealthCheck(FAST);

    const listCalls = (global.fetch as jest.Mock).mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.startsWith('https://www.googleapis.com/youtube/v3/videos'));
    expect(listCalls.filter((u) => u.includes(vid(0)))).toHaveLength(2);
    expect(listCalls.filter((u) => u.includes(vid(1)))).toHaveLength(1);
  });

  it('spends a handful of quota units on a full corpus, not one call per video', async () => {
    (global as any).fetch = apiFetch({});
    primeDb(corpusOf(150));

    const result = await runVideoLinkHealthCheck(FAST);

    // 150 videos is four batches of 49 or fewer. One unit each.
    expect(result.quota_units).toBe(4);
  }, 30_000);
});

/**
 * `failing_on_our_channel = 0` was not a finding on 2026-08-22. `channel` was
 * null for every video, so the number counted nothing and read as reassurance.
 */
describe('the channel metric says what it knows and admits what it does not', () => {
  it('names our channel when the API reports it, so the fix lands with us', async () => {
    (global as any).fetch = apiFetch({
      videos: { '6wkFb2_cUik': { embeddable: false, channelTitle: OUR_CHANNEL } },
    });
    primeDb([cardRow()], 5);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.failures[0].state).toBe('EMBEDDING_DISABLED');
    expect(result.failures[0].channel).toBe(OUR_CHANNEL);
    expect(result.failures[0].ownership).toBe('ours');
  });

  it('says unknown rather than third_party when the video is absent and has no owner to read', async () => {
    (global as any).fetch = apiFetch({ absent: ['6wkFb2_cUik'], oembed: { '6wkFb2_cUik': 403 } });
    primeDb([cardRow()], 5);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.failures[0].state).toBe('PRIVATE');
    expect(result.failures[0].channel).toBeNull();
    expect(result.failures[0].ownership).toBe('unknown');
    expect(result.ownership).toEqual({ ours: 0, third_party: 0, unknown: 1 });
  });

  it('breaks the count down three ways so an unknown owner is never counted as not-ours', async () => {
    const gone = [vid(0), vid(1), vid(2)];
    (global as any).fetch = apiFetch({ absent: gone, oembed: Object.fromEntries(gone.map((g) => [g, 404])) });
    primeDb(corpusOf(3), 169);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.failures).toHaveLength(3);
    expect(result.ownership.ours + result.ownership.third_party + result.ownership.unknown).toBe(3);
    expect(result.ownership.unknown).toBe(3);
  });
});

describe('pacing', () => {
  it('paces the follow-up lookups by default, so they cannot burst', async () => {
    (global as any).fetch = apiFetch({ absent: ['6wkFb2_cUik'], oembed: { '6wkFb2_cUik': 404 } });
    primeDb([cardRow()]);

    const started = Date.now();
    await runVideoLinkHealthCheck({ force: true, confirmCooldownMs: 0 });

    // Two follow-up lookups (one per pass), each spaced by the pacer.
    expect(Date.now() - started).toBeGreaterThan(300);
  }, 30_000);
});
