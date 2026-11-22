// The real config, with made-up Zoom credentials, so zoomApiClient, zoomTranscripts and zoomService run for real.
jest.mock('../../../config/env', () => ({ env: { ...jest.requireActual('../../../config/env').env,
  zoomAccountId: 'acct-1', zoomClientId: 'client-1', zoomClientSecret: 'secret-1', zoomHostEmail: 'host@refactored.example' } }));
// zoomService looks up the host pool in the database; the pool is empty here, so only the configured host is asked.
jest.mock('../../zoom/zoomHostRegistry', () => ({ listHosts: async () => [] }));

import { __resetZoomTokenCacheForTests } from '../../zoom/zoomApiClient';
import { __resetRecordingHostCache } from '../../zoomService';
import { GAVE_UP_REASON, NO_TRANSCRIPT_REASON, NOTHING_REASON, runReplayPass, SCOPE_REASON } from '../replayJob';
import { NO_SPEAKER } from '../replayScoring';
import { BACKOFF_MINUTES, MAX_ATTEMPTS } from '../replayStore';
import { fakeIv, makeObservations, makeStore, makeZoom, MEETING, MP4_URL, type FakeIv, type ZoomScript } from './helpers/fakeReplayZoom';

/**
 * CP9.2 (kit F5 "replay"): the replay job on the REAL Zoom path (roomProvider -> replayFiles -> zoomTranscripts and
 * zoomService -> zoomApiClient -> fetch). Only `fetch` (Zoom's HTTP edge), the replay store (an in-memory copy of its
 * consent and claim rules; the SQL itself runs on Postgres in replayStore.integration.test.ts) and the observation
 * writer (prep_observations' UNIQUE rule) are stand-ins. No real Zoom or model call is made.
 */
const H = 3_600_000;
let zoom = makeZoom();
const clock = { now: Date.parse('2026-11-20T18:00:00Z') };

function setup(ivs: FakeIv[], script: ZoomScript = { detail: 'ok', mp4: true }) {
  zoom = makeZoom(script);
  global.fetch = zoom.fetch as unknown as typeof fetch;
  const s = makeStore(ivs, clock);
  const obs = makeObservations();
  return { ...s, obs, run: () => runReplayPass({ store: s.store, write: obs.write }) };
}

beforeEach(() => {
  __resetZoomTokenCacheForTests();
  __resetRecordingHostCache();
  clock.now = Date.parse('2026-11-20T18:00:00Z');
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('a held, fully consented, recorded interview', () => {
  it('is scored once: two answers, delivery and content per question, observations as real_interview', async () => {
    const t = setup([fakeIv()]);
    const res = await t.run();
    expect(res.outcomes.scored).toBe(1);
    const r = t.replays.get(fakeIv().id)!;
    expect(r.status).toBe('scored');
    const qs = r.turns as Array<{ n: number; question: string; pace: { score: number; value: string }; fillers: { value: string }; content: { covered: number; of: number } }>;
    expect(qs.map((q) => q.n)).toEqual([1, 2]); // "Thank you." is too short to be an answer
    expect(qs[0].question).toBe('Tell me about a data pipeline you built and how you measured its impact.');
    expect(qs[0].pace).toEqual({ score: 100, value: '117 wpm', target: '100 to 165 wpm' }); // 39 words over 20 seconds
    expect(qs[0].content).toEqual({ covered: 5, of: 5, score: 100 });
    expect(qs[1].fillers.value).toMatch(/^2 \(/); // "Um" and "you know", as the transcript shows them
    expect((r.scores as { score: number }).score).toBeGreaterThan(0);
    expect(r.recording).toEqual({ downloadUrl: MP4_URL, sizeBytes: 4, providerFileId: 'f-mp4' });
    expect([...t.obs.rows.values()].map((o) => [o.sourceRef, o.skill, o.source])).toEqual([
      [`replay:${fakeIv().id}:1`, 'pace_clarity', 'real_interview'], [`replay:${fakeIv().id}:1`, 'few_fillers', 'real_interview'],
      [`replay:${fakeIv().id}:2`, 'pace_clarity', 'real_interview'], [`replay:${fakeIv().id}:2`, 'few_fillers', 'real_interview']]);
    // The real fetch path: the recording detail, the transcript download, and the host's recordings for the MP4.
    const urls = zoom.zoomCalls().map((c) => c.url);
    expect(urls.some((u) => u.endsWith(`/meetings/${MEETING}/recordings`))).toBe(true);
    expect(urls.some((u) => u.includes('VTT-SECRET'))).toBe(true);
    expect(urls.some((u) => /\/users\/.+\/recordings\?from=2026-11-20&to=2026-11-21/.test(u))).toBe(true);
    expect(urls.some((u) => u.includes('MP4-SECRET'))).toBe(false); // the video is never downloaded to be analyzed
  });

  it('the job run twice makes one replay and no new observations (and asks Zoom nothing the second time)', async () => {
    const t = setup([fakeIv()]);
    await t.run();
    const calls = zoom.calls.length; const obs = t.obs.rows.size;
    clock.now += 24 * H;
    const again = await t.run();
    expect(again.scanned).toBe(0);
    expect(zoom.calls.length).toBe(calls);
    expect(t.obs.rows.size).toBe(obs);
    expect(t.replays.size).toBe(1);
  });

  it('two passes at the same moment: one claim, one transcript fetch, one replay', async () => {
    const t = setup([fakeIv()]);
    await Promise.all([t.run(), t.run()]);
    expect(t.claims).toHaveLength(1);
    expect(zoom.zoomCalls().filter((c) => c.url.includes('VTT-SECRET'))).toHaveLength(1);
    expect(t.obs.rows.size).toBe(4);
  });

  it('no field anywhere names a face, eye contact, expression or accent', async () => {
    const t = setup([fakeIv()]);
    await t.run();
    expect(JSON.stringify([...t.replays.values()])).not.toMatch(/face|eye|expression|accent|pronunciation/i);
  });
});

describe('never an unconsented or partly consented interview (checked in the scan AND before any fetch)', () => {
  const cases: Array<[string, Partial<FakeIv>]> = [
    ['the employer declined', { consents: { candidate: 'consent', employer: 'decline' }, recConsent: 'declined' }],
    ['only the candidate consented', { consents: { candidate: 'consent' }, recConsent: null }],
    ['recording unavailable (Zoom permission)', { recConsent: 'unavailable' }],
    ['recording failed to turn on', { recConsent: 'failed' }],
    ['rebooked: the consent was for the old meeting', { recMeeting: '99999999999' }],
    ['not held yet', { state: 'booked' }],
  ];
  it.each(cases)('%s: no replay, no observation, no Zoom call', async (_name, over) => {
    const t = setup([fakeIv(over)]);
    await t.run();
    expect(t.replays.size).toBe(0);
    expect(t.obs.rows.size).toBe(0);
    expect(zoom.calls).toHaveLength(0);
  });

  it('a row the scan listed that no longer passes the rule under the lock is not fetched', async () => {
    const iv = fakeIv();
    const t = setup([iv]);
    const list = t.store.listDue.getMockImplementation()!;
    t.store.listDue.mockImplementation(async () => { const due = await list(); iv.consents = { candidate: 'consent', employer: 'decline' }; return due; });
    const res = await t.run();
    expect(res.outcomes.skipped).toBe(1);
    expect(zoom.calls).toHaveLength(0);
  });
});

describe('Zoom failures: bounded, honest', () => {
  it('a missing Zoom permission: unavailable after ONE try, never retried', async () => {
    const t = setup([fakeIv()], { detail: 'scope', mp4: true });
    await t.run();
    expect(t.replays.get(fakeIv().id)).toMatchObject({ status: 'unavailable', reason: SCOPE_REASON });
    const calls = zoom.calls.length;
    clock.now += 48 * H;
    await t.run();
    expect(zoom.calls.length).toBe(calls);
  });

  it(`no recording yet: waiting, retried after attempts x ${BACKOFF_MINUTES} min, at most ${MAX_ATTEMPTS} times, then unavailable`, async () => {
    const t = setup([fakeIv()], { detail: 'missing', mp4: false });
    await t.run();
    expect(t.replays.get(fakeIv().id)).toMatchObject({ status: 'waiting', attempts: 1 });
    await t.run(); // inside the backoff: not tried again
    expect(t.claims).toHaveLength(1);
    for (let k = 0; k < 40; k += 1) { clock.now += 6 * H; await t.run(); }
    expect(t.claims).toHaveLength(MAX_ATTEMPTS);
    expect(t.replays.get(fakeIv().id)).toMatchObject({ status: 'unavailable', reason: NOTHING_REASON });
    expect(t.obs.rows.size).toBe(0);
  });

  it('Zoom down on every try: unavailable with the reason after the last attempt', async () => {
    const t = setup([fakeIv()], { detail: 'down', mp4: true });
    for (let k = 0; k < 20; k += 1) { await t.run(); clock.now += 6 * H; }
    expect(t.claims).toHaveLength(MAX_ATTEMPTS);
    expect(t.replays.get(fakeIv().id)).toMatchObject({ status: 'unavailable', reason: GAVE_UP_REASON });
  });

  it('a recording with no transcript by the last attempt: no_score, the recording kept for playback', async () => {
    const t = setup([fakeIv()], { detail: 'no_transcript', mp4: true });
    for (let k = 0; k < 20; k += 1) { await t.run(); clock.now += 6 * H; }
    expect(t.replays.get(fakeIv().id)).toMatchObject({ status: 'no_score', reason: NO_TRANSCRIPT_REASON, recording: { downloadUrl: MP4_URL } });
    expect(t.obs.rows.size).toBe(0);
  });
});

describe('scoring rules', () => {
  it('no voice matches the learner: no_score, nothing guessed, no observation', async () => {
    const t = setup([fakeIv({ fullName: 'Grace Hopper' })]);
    await t.run();
    expect(t.replays.get(fakeIv().id)).toMatchObject({ status: 'no_score', reason: NO_SPEAKER });
    expect(t.obs.rows.size).toBe(0);
  });

  it('the observations fail: the replay stays waiting; the next attempt finishes it, each observation written once', async () => {
    const t = setup([fakeIv()]);
    t.obs.setFail(true);
    const first = await t.run();
    expect(first.outcomes.failed).toBe(1);
    expect(t.replays.get(fakeIv().id)?.status).toBe('waiting');
    t.obs.setFail(false);
    clock.now += H;
    await t.run();
    expect(t.replays.get(fakeIv().id)?.status).toBe('scored');
    expect(t.obs.rows.size).toBe(4);
  });
});
