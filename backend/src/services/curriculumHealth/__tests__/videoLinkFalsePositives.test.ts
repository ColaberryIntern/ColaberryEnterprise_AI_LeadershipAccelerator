/**
 * The guards that keep the check from manufacturing an outage.
 *
 * Every suite in this file corresponds to a false positive that actually
 * happened, not to one that seemed likely. The check was merged, dry-run once,
 * and reported 149 failures out of 149 videos — 146 of them provably healthy
 * from an unthrottled workstation minutes later. These are the tests that fail
 * if any of the four defences regress:
 *
 *   1. a bot challenge is not a verdict
 *   2. a batch is only believed if its control video was
 *   3. nothing is condemned on a single observation
 *   4. the ownership metric admits what it does not know
 *
 * Split out of videoLinkHealthService.test.ts when that file passed the 500-line
 * ceiling. Shared fakes live in ./helpers/videoLinkFixtures.
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
import { FAST, cardRow, corpusOf, flakyFetch, routeFetch } from './helpers/videoLinkFixtures';

/** cards query first, then any student-impact counts. */
function primeDb(cards: Record<string, unknown>[], affected = 0) {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: string) => {
    if (String(sql).includes('FROM timeline_cards')) return [cards];
    return [[{ affected }]];
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSetting.mockResolvedValue(null);
  mockSetSetting.mockResolvedValue(undefined);
  mockEmitAlert.mockResolvedValue({ id: 'alert-1' });
});

/**
 * The incident itself, at full scale. YouTube served a bot challenge to every
 * probe and the challenge was read as a verdict. Had the flag been on, that is
 * 149 alerts through a subscription that includes email.
 */
describe('the 2026-08-22 false-positive storm', () => {
  it('149 challenged probes produce 0 failures and 0 alerts', async () => {
    (global as any).fetch = routeFetch({ oembed: 403, watch: 'challenge' });
    primeDb(corpusOf(149), 169);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.checked).toBe(149);
    expect(result.failures).toEqual([]);
    expect(result.alerts_emitted).toBe(0);
    expect(mockEmitAlert).not.toHaveBeenCalled();
  });

  it('reports the storm as throttling of us, not as a broken curriculum', async () => {
    (global as any).fetch = routeFetch({ oembed: 403, watch: 'challenge' });
    primeDb(corpusOf(149), 169);

    const result = await runVideoLinkHealthCheck(FAST);

    // The safety net that read 0 during the incident must now carry the volume.
    expect(result.unknown).toBe(149);
    expect(result.throttled).toBeGreaterThan(0);
    expect(result.healthy).toBe(0);
  });
});

/**
 * A control video of ours, known good, probed in the same burst as the batch it
 * vouches for. If YouTube will not answer honestly about a video we know is
 * fine, it is not answering honestly about the other 24 either. This single
 * technique caught all three false readings during development; it belongs in
 * the product, not in a debugging session.
 */
describe('the control video decides whether a batch may be believed', () => {
  it('a failed control means nothing in the batch is called broken', async () => {
    // Every target looks stone dead, and so does the control. The batch is void.
    (global as any).fetch = routeFetch({
      oembed: 404,
      watch: { status: 'ERROR', embeddable: false },
      control: 'challenge',
      controlOembed: 403,
    });
    primeDb(corpusOf(10), 169);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.failures).toEqual([]);
    expect(mockEmitAlert).not.toHaveBeenCalled();
    expect(result.untrusted_batches).toBeGreaterThan(0);
    expect(result.unverified).toBe(10);
  });

  it('a passing control lets a genuine failure through', async () => {
    (global as any).fetch = routeFetch({ oembed: 404, watch: { status: 'ERROR', embeddable: false } });
    primeDb([cardRow()], 169);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.failures).toHaveLength(1);
    expect(result.untrusted_batches).toBe(0);
    expect(result.unverified).toBe(0);
  });

  it('probes the control even when the curriculum is entirely healthy', async () => {
    (global as any).fetch = routeFetch({});
    primeDb([cardRow()]);

    await runVideoLinkHealthCheck(FAST);

    const urls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes(CONTROL_VIDEO_ID))).toBe(true);
  });
});

/**
 * "Failed once" is a measurement, not a fact. Every actionable verdict is
 * re-observed in a second, separately controlled burst before it can alert.
 */
describe('no video is condemned on a single observation', () => {
  it('a video that fails once and passes on retry never becomes a failure', async () => {
    (global as any).fetch = flakyFetch(
      { vid000000: [{ status: 'ERROR', embeddable: false }, { status: 'OK', embeddable: true }] },
      { vid000000: [404, 200] },
    );
    primeDb([cardRow({ video_url: 'https://www.youtube.com/watch?v=vid000000' })], 169);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.failures).toEqual([]);
    expect(mockEmitAlert).not.toHaveBeenCalled();
    expect(result.healthy).toBe(1);
  });

  it('a video that fails twice is confirmed and does alert', async () => {
    (global as any).fetch = flakyFetch(
      { vid000000: [{ status: 'ERROR', embeddable: false }] },
      { vid000000: [404] },
    );
    primeDb([cardRow({ video_url: 'https://www.youtube.com/watch?v=vid000000' })], 169);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].state).toBe('REMOVED');
    expect(mockEmitAlert).toHaveBeenCalledTimes(1);
  });

  it('observes a suspect twice and a healthy video once: the retry is targeted', async () => {
    (global as any).fetch = flakyFetch({ vid000000: [{ status: 'ERROR', embeddable: false }] }, { vid000000: [404] });
    primeDb(
      [
        cardRow({ id: 'a', video_url: 'https://www.youtube.com/watch?v=vid000000' }),
        cardRow({ id: 'b', video_url: 'https://www.youtube.com/watch?v=vid000001' }),
      ],
      169,
    );

    await runVideoLinkHealthCheck(FAST);

    // startsWith, not includes: the oEmbed URL carries a /watch URL inside its
    // query string and would otherwise be counted as a watch-page probe.
    const watches = (global.fetch as jest.Mock).mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.startsWith('https://www.youtube.com/watch'));
    expect(watches.filter((u) => u.includes('vid000000'))).toHaveLength(2);
    expect(watches.filter((u) => u.includes('vid000001'))).toHaveLength(1);
  });
});

/**
 * `failing_on_our_channel = 0` was not a finding. `channel` was null for every
 * video, so the number counted nothing and read as reassurance. Ownership is now
 * tri-state and the unknown bucket is reported, so it can never again be silently
 * zero.
 */
describe('the channel metric says what it knows and admits what it does not', () => {
  it('falls back to the oEmbed author when the watch page carries no microformat', async () => {
    (global as any).fetch = routeFetch({
      oembed: 200,
      oembedAuthor: 'Colaberry School Of Data & AI',
      watch: { status: 'OK', embeddable: false, owner: null },
    });
    primeDb([cardRow()], 5);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.failures[0].state).toBe('EMBEDDING_DISABLED');
    expect(result.failures[0].channel).toBe('Colaberry School Of Data & AI');
    expect(result.failures[0].ownership).toBe('ours');
  });

  it('says unknown rather than third_party when neither source knows the owner', async () => {
    // A private video has no microformat and its oEmbed carries no body either.
    (global as any).fetch = routeFetch({
      oembed: 403,
      watch: { status: 'LOGIN_REQUIRED', embeddable: false, owner: null },
    });
    primeDb([cardRow()], 5);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.failures[0].state).toBe('PRIVATE');
    expect(result.failures[0].channel).toBeNull();
    expect(result.failures[0].ownership).toBe('unknown');
    expect(result.ownership).toEqual({ ours: 0, third_party: 0, unknown: 1 });
  });

  it('breaks the count down three ways so an unknown owner is never counted as not-ours', async () => {
    (global as any).fetch = routeFetch({ oembed: 404, watch: { status: 'ERROR', embeddable: false, owner: null } });
    primeDb(corpusOf(3), 169);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.failures).toHaveLength(3);
    expect(result.ownership.ours + result.ownership.third_party + result.ownership.unknown).toBe(3);
    expect(result.ownership.unknown).toBe(3);
  });
});

describe('pacing', () => {
  it('is on by default, so a run cannot burst its way into a challenge', async () => {
    (global as any).fetch = routeFetch({});
    primeDb([cardRow()]);

    const started = Date.now();
    await runVideoLinkHealthCheck({ force: true });

    // Two probes for the card plus the control's, each spaced by the pacer.
    expect(Date.now() - started).toBeGreaterThan(500);
  }, 30_000);
});
