/**
 * Routing/idempotency tests for the scheduled check. No real network, no DB.
 * The classifier and impact modules are deliberately NOT mocked: their real
 * logic is what decides alert-vs-silence, and mocking it would test nothing.
 *
 * The false-positive and false-negative guards - the absence rule, the control
 * video, two-observation confirmation, quota degradation and the ownership
 * metric - live in videoLinkFalsePositives.test.ts.
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

import { centralDate, runVideoLinkHealthCheck } from '../videoLinkHealthService';
import { FAST, OUR_CHANNEL, TEST_KEY, apiFetch, cardRow } from './helpers/videoLinkFixtures';

const savedKey = process.env.YOUTUBE_API_KEY;

/** The video id `cardRow()` points at. */
const CARD_VIDEO = '6wkFb2_cUik';

/** cards query first, then any student-impact counts. */
function primeDb(cards: Record<string, unknown>[], affected = 0) {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: string) => {
    if (String(sql).includes('FROM timeline_cards')) return [cards];
    return [[{ affected }]];
  });
}

/** The card's video is gone: absent from the API response, oEmbed says 404. */
const deadVideo = () => apiFetch({ absent: [CARD_VIDEO], oembed: { [CARD_VIDEO]: 404 } });

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

describe('idempotency', () => {
  it('is a no-op when it has already run today: no probes, no alerts', async () => {
    mockGetSetting.mockResolvedValue(centralDate());
    (global as any).fetch = apiFetch({});
    primeDb([cardRow()]);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('already_ran_today');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockEmitAlert).not.toHaveBeenCalled();
  });

  it('running twice in one day raises the alert once, not twice', async () => {
    (global as any).fetch = deadVideo();
    primeDb([cardRow()], 169);

    const first = await runVideoLinkHealthCheck(FAST);
    expect(first.alerts_emitted).toBe(1);

    // The first run stamped today's date; the guard reads it back on the second.
    mockGetSetting.mockResolvedValue(centralDate());
    const second = await runVideoLinkHealthCheck(FAST);

    expect(second.skipped).toBe(true);
    expect(mockEmitAlert).toHaveBeenCalledTimes(1);
  });

  it('force overrides the same-day guard', async () => {
    mockGetSetting.mockResolvedValue(centralDate());
    (global as any).fetch = apiFetch({});
    primeDb([cardRow()]);

    const result = await runVideoLinkHealthCheck({ ...FAST, force: true });

    expect(result.skipped).toBe(false);
    expect(result.checked).toBe(1);
  });

  it('dryRun probes but neither alerts nor stamps the run', async () => {
    (global as any).fetch = deadVideo();
    primeDb([cardRow()], 12);

    const result = await runVideoLinkHealthCheck({ ...FAST, dryRun: true });

    // It really did the work: the failure is found and reported...
    expect(result.ran).toBe(true);
    expect(result.failures).toHaveLength(1);
    // ...and neither side effect fired.
    expect(result.alerts_emitted).toBe(0);
    expect(mockEmitAlert).not.toHaveBeenCalled();
    expect(mockSetSetting).not.toHaveBeenCalled();
  });

  it('dryRun leaves the day unstamped, so a later real run is not skipped', async () => {
    (global as any).fetch = deadVideo();
    primeDb([cardRow()], 12);

    await runVideoLinkHealthCheck({ ...FAST, dryRun: true });

    expect(mockSetSetting).not.toHaveBeenCalledWith('curriculum_video_health_last_run', expect.anything());
  });
});

describe('happy path', () => {
  it('a healthy corpus alerts on nothing and records the run', async () => {
    (global as any).fetch = apiFetch({});
    primeDb([cardRow(), cardRow({ id: 'b', video_url: 'https://youtu.be/w7_yWjYyxjE' })]);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.checked).toBe(2);
    expect(result.healthy).toBe(2);
    expect(result.failures).toEqual([]);
    expect(result.sealed_weeks).toEqual([]);
    expect(mockEmitAlert).not.toHaveBeenCalled();
    expect(mockSetSetting).toHaveBeenCalledWith('curriculum_video_health_last_run', centralDate());
  });

  it('a healthy corpus is distinguishable from a blind one in the result itself', async () => {
    (global as any).fetch = apiFetch({});
    primeDb([cardRow()]);

    const result = await runVideoLinkHealthCheck(FAST);

    // Healthy: seen and fine. Blind would be healthy 0 / unknown 1 / unverified 1.
    expect(result).toMatchObject({ healthy: 1, unknown: 0, unverified: 0, untrusted_batches: 0 });
  });

  it('skips a non-YouTube URL instead of guessing at it', async () => {
    (global as any).fetch = apiFetch({});
    primeDb([cardRow({ video_url: 'https://storage.googleapis.com/sample/BigBuckBunny.mp4' })]);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.checked).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('blast radius reporting', () => {
  it('reports the card, the week and the number of students a dead video blocks', async () => {
    (global as any).fetch = deadVideo();
    primeDb([cardRow()], 169);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.failures).toHaveLength(1);
    const f = result.failures[0];
    expect(f.state).toBe('REMOVED');
    expect(f.seals_week).toBe(true);
    expect(f.students_affected).toBe(169);
    expect(f.cards[0].blocks).toContain('Week 3');
    expect(result.sealed_weeks).toEqual([3]);

    const alert = mockEmitAlert.mock.calls[0][0];
    expect(alert.type).toBe('critical');
    expect(alert.severity).toBe(9);
    expect(alert.entityId).toBe(CARD_VIDEO);
    expect(alert.description).toContain('169 student');
  });

  it('an archived card is reported but flagged as sealing nothing', async () => {
    (global as any).fetch = deadVideo();
    primeDb([cardRow({ visibility: 'archived' })]);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.failures[0].seals_week).toBe(false);
    expect(result.sealed_weeks).toEqual([]);
    const alert = mockEmitAlert.mock.calls[0][0];
    expect(alert.type).toBe('warning');
    expect(alert.severity).toBe(3);
  });

  it('flags a failure on OUR channel as fixable in our own settings', async () => {
    (global as any).fetch = apiFetch({
      videos: { [CARD_VIDEO]: { embeddable: false, channelTitle: OUR_CHANNEL } },
    });
    primeDb([cardRow()], 5);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.failures[0].state).toBe('EMBEDDING_DISABLED');
    expect(result.failures[0].ownership).toBe('ours');
    expect(mockEmitAlert.mock.calls[0][0].description).toContain('OUR CHANNEL');
  });

  it('reports a region-blocked video, which plays fine everywhere except here', async () => {
    (global as any).fetch = apiFetch({ videos: { [CARD_VIDEO]: { regionBlocked: ['US'] } } });
    primeDb([cardRow()], 5);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.failures[0].state).toBe('REGION_BLOCKED');
  });
});

describe('failure paths never manufacture an outage', () => {
  it('a total network outage reports UNKNOWN rather than a dead curriculum', async () => {
    (global as any).fetch = jest.fn(async () => {
      throw Object.assign(new Error('boom'), { name: 'TypeError' });
    });
    primeDb([cardRow(), cardRow({ id: 'b', video_url: 'https://youtu.be/w7_yWjYyxjE' })]);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.unknown).toBe(2);
    expect(result.failures).toEqual([]);
    expect(mockEmitAlert).not.toHaveBeenCalled();
  }, 30_000);

  it('an alert that fails to emit does not abort the rest of the run', async () => {
    mockEmitAlert.mockRejectedValue(new Error('alerts table down'));
    (global as any).fetch = deadVideo();
    primeDb([cardRow()], 4);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.ran).toBe(true);
    expect(result.failures).toHaveLength(1);
    expect(result.alerts_emitted).toBe(0);
  });

  it('an empty curriculum is handled without dividing by zero or hanging', async () => {
    (global as any).fetch = apiFetch({});
    primeDb([]);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.checked).toBe(0);
    expect(result.failures).toEqual([]);
  });

  it('an empty curriculum with no API key is still a clean no-op, not a skip', async () => {
    delete process.env.YOUTUBE_API_KEY;
    (global as any).fetch = apiFetch({});
    primeDb([]);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.skipped).toBe(false);
    expect(result.checked).toBe(0);
  });
});

/**
 * The gap that let Week 3 "Building with the Claude API" sit empty from
 * 2026-07-14 to 2026-08-23. `loadVideoCards` selected
 * `WHERE metadata->'video'->>'url' IS NOT NULL`, so a card with no URL was never
 * in the result set, was never probed, and reported healthy by omission. Two
 * students commented on the card itself before a third report reached us.
 */
describe('a card with no video URL is reported, not silently healthy', () => {
  const KNOWN_CARD = '361ae8d3-a198-4ad5-ab8b-04236f463bc1';
  const urlless = (over: Record<string, unknown> = {}) =>
    cardRow({ id: KNOWN_CARD, title: 'Building with the Claude API', video_url: null, ...over });

  it('reports the card rather than omitting it', async () => {
    (global as any).fetch = apiFetch({});
    primeDb([urlless()]);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.missing_url.map((m) => m.card_id)).toEqual([KNOWN_CARD]);
  });

  it('does not count it as a checked video, and does not call it healthy', async () => {
    (global as any).fetch = apiFetch({});
    primeDb([urlless()]);

    const result = await runVideoLinkHealthCheck(FAST);

    // There was no video, so nothing was checked and nothing passed. The old
    // behaviour was checked:0 healthy:0 failures:0 - indistinguishable from a
    // clean corpus, which is exactly the reading that has to become impossible.
    expect(result.checked).toBe(0);
    expect(result.healthy).toBe(0);
    expect(result.missing_url).toHaveLength(1);
  });

  it('is not counted as a broken video', async () => {
    (global as any).fetch = apiFetch({});
    primeDb([urlless()]);

    const result = await runVideoLinkHealthCheck(FAST);

    // A `failure` is keyed on a video_id and describes a link that broke. This
    // card has no video_id and describes a link never made. Folding it into
    // `failures` would spike the broken-video count without a video breaking.
    expect(result.failures).toEqual([]);
    expect(result.sealed_weeks).toEqual([]);
  });

  it('alerts once, as a warning that blocks nobody, never as a sealed week', async () => {
    (global as any).fetch = apiFetch({});
    primeDb([urlless()]);

    await runVideoLinkHealthCheck(FAST);

    expect(mockEmitAlert).toHaveBeenCalledTimes(1);
    const alert = mockEmitAlert.mock.calls[0][0];
    expect(alert.type).toBe('warning');
    expect(alert.urgency).toBe('low');
    expect(alert.entityId).toBe(KNOWN_CARD);
    expect(alert.metadata.seals_week).toBe(false);
    expect(alert.metadata.students_affected).toBe(0);
  });

  it('does not read at the same severity as a video that seals a week', async () => {
    (global as any).fetch = apiFetch({});
    primeDb([urlless()]);
    await runVideoLinkHealthCheck(FAST);
    const missingUrlAlert = mockEmitAlert.mock.calls[0][0];

    jest.clearAllMocks();
    mockEmitAlert.mockResolvedValue({ id: 'alert-2' });
    mockGetSetting.mockResolvedValue(null);
    (global as any).fetch = deadVideo();
    primeDb([cardRow()], 169);
    await runVideoLinkHealthCheck(FAST);
    const deadAlert = mockEmitAlert.mock.calls[0][0];

    expect(deadAlert.type).toBe('critical');
    expect(missingUrlAlert.severity).toBeLessThan(deadAlert.severity);
  });

  it('alerts only on the card students can reach, not on all 21', async () => {
    (global as any).fetch = apiFetch({});
    primeDb([
      urlless(),
      // The 7 real ones in program 7557ec5e, correctly scoped out of the classroom.
      urlless({ id: 'other-program', program_id: '7557ec5e-a7c1-4699-955d-c5b8021bdc03' }),
      // And the 13 archived ones.
      urlless({ id: 'archived', visibility: 'archived', status: 'inactive', program_id: null }),
    ]);

    const result = await runVideoLinkHealthCheck(FAST);

    expect(result.missing_url).toHaveLength(3);          // all reported
    expect(mockEmitAlert).toHaveBeenCalledTimes(1);      // one alerted
    expect(mockEmitAlert.mock.calls[0][0].entityId).toBe(KNOWN_CARD);
    // Reachable first, so the one that matters is not buried among the other 20.
    expect(result.missing_url[0].card_id).toBe(KNOWN_CARD);
  });

  it('does not confuse a missing URL with a URL we cannot check', async () => {
    (global as any).fetch = apiFetch({});
    primeDb([cardRow({ id: 'loom-card', video_url: 'https://www.loom.com/share/abc123' })]);

    const result = await runVideoLinkHealthCheck(FAST);

    // Both leave video_id null, and they are different findings: a Loom link is a
    // video we cannot inspect and must not guess at, not absent content.
    expect(result.missing_url).toEqual([]);
    expect(mockEmitAlert).not.toHaveBeenCalled();
  });

  it('still reports the gap when the API key is missing', async () => {
    delete process.env.YOUTUBE_API_KEY;
    (global as any).fetch = apiFetch({});
    primeDb([urlless(), cardRow({ id: 'has-video' })]);

    const result = await runVideoLinkHealthCheck(FAST);

    // The video check needs YouTube. Knowing a card carries no URL does not, so a
    // missing key must not hide the content gap along with the video check.
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('youtube_api_key_missing');
    expect(result.missing_url.map((m) => m.card_id)).toEqual([KNOWN_CARD]);
    expect(mockEmitAlert).not.toHaveBeenCalled();  // a blind run still alerts on nothing
  });

  it('selects URL-less cards in SQL instead of filtering them out', async () => {
    (global as any).fetch = apiFetch({});
    primeDb([urlless()]);

    await runVideoLinkHealthCheck(FAST);

    // Asserted on the query text because the bug lives in the WHERE clause, and a
    // mocked `sequelize.query` returns its fixture rows whatever the SQL says.
    const sql = String(mockQuery.mock.calls.find((c) => String(c[0]).includes('FROM timeline_cards'))?.[0]);
    expect(sql).toMatch(/type IN \(:cardOwnedVideoTypes\)/);
    // COALESCE, because `NOT (metadata->'video' ? 'url')` is NULL - not true - for
    // a card with no 'video' key, so the naive predicate drops the very rows it
    // hunts and returns a confident zero.
    expect(sql).toMatch(/COALESCE/);
  });
});

describe('centralDate', () => {
  it('formats as an ISO calendar date in Central time', () => {
    expect(centralDate(new Date('2026-08-21T12:00:00Z'))).toBe('2026-08-21');
  });

  it('uses the Central date, not UTC, just after UTC midnight', () => {
    // 01:30 UTC on the 22nd is still 20:30 on the 21st in Chicago.
    expect(centralDate(new Date('2026-08-22T01:30:00Z'))).toBe('2026-08-21');
  });
});
