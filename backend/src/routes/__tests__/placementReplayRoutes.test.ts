jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
const mockEnabled = jest.fn();
jest.mock('../../services/careerPrep/careerPrepFlag', () => ({ careerPrepEnabled: (...a: unknown[]) => mockEnabled(...a) }));
jest.mock('../../services/campus/campusPilot', () => ({ campusOnFor: () => true }));
jest.mock('../../services/caseStudy/caseStudySurfaceProfiles', () => ({ getCaseStudySurfaceProfile: () => ({ publicBaseUrl: 'https://hire.refactored.ai' }) }));
jest.mock('../../config/env', () => ({ env: { ...jest.requireActual('../../config/env').env,
  zoomAccountId: 'acct-1', zoomClientId: 'client-1', zoomClientSecret: 'secret-1', zoomHostEmail: 'host@refactored.example' } }));

// The replay rows by statement: the candidate's (feedback included, own enrollment only), the employer's (no feedback
// columns at all) and the stored recording. Each records that it was asked. The SQL runs on Postgres in
// replayStore.integration.test.ts; the employer link's gate is roomGuide's real guideGate.
const mockRows = { list: [] as Array<Record<string, unknown>>, asked: [] as string[], recording: null as unknown };
jest.mock('../../services/placement/replayStore', () => ({
  ...jest.requireActual('../../services/placement/replayStore'),
  candidateReplayRow: async (e: string, id: string) => { mockRows.asked.push('candidate'); return mockRows.list.find((r) => r.id === id && r.enrollment_id === e); },
  employerReplayRow: async (id: string) => {
    mockRows.asked.push('employer');
    const r = mockRows.list.find((x) => x.id === id);
    return r ? Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'turns' && k !== 'scores')) : undefined;
  },
  storedRecording: async () => { mockRows.asked.push('recording'); return mockRows.recording; },
}));
jest.mock('../../services/placement/roomGuide', () => {
  const real = jest.requireActual('../../services/placement/roomGuide');
  return { ...real, employerGuide: async (id: string, endMs: number) => {
    const r = mockRows.list.find((x) => x.id === id);
    const g = real.guideGate(r, endMs);
    return g ?? { status: 'ok', guide: { company: r?.company ?? null, role: null, questions: [], notes: [{ id: '1', body: 'Strong on pipelines.', at: '2026-11-20T15:20:00.000Z' }] } };
  } };
});

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { roomPageUrl } from '../../services/placement/roomLink';
import { recordingPath } from '../../services/placement/replayLink';
import { streamStoredRecording } from '../../services/placement/replayFiles';
import { __resetZoomTokenCacheForTests } from '../../services/zoom/zoomApiClient';
import { expectNoRoomUrl, SENTINEL_PROVIDER_URL } from '../../services/placement/__tests__/helpers/noRoomUrl';
import { makeZoom, MP4_URL } from '../../services/placement/__tests__/helpers/fakeReplayZoom';
import { CandidateReplayResponse, EmployerReplayResponse } from '../placementReplayRoutes';

/**
 * CP9.2 (kit F5 "replay"): the replay routes through the REAL routers and the REAL replayView; the recording streams
 * through the REAL roomProvider -> zoomService.streamZoomFile with only `fetch` (Zoom's edge) faked.
 */
const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '33333333-3333-4333-8333-333333333333';
const START = new Date('2026-11-20T15:00:00Z');
const END = new Date(START.getTime() + 30 * 60_000);
let clock = new Date(END.getTime() + 30 * 60_000);
const token = (sub = 'enr-ann') => `Bearer ${jwt.sign({ sub, cohort_id: 'coh-1', role: 'participant' }, env.jwtSecret)}`;
const link = (id = ID, end = END) => { const u = new URL(roomPageUrl(id, end)); return `e=${u.searchParams.get('e')}&t=${u.searchParams.get('t')}`; };
const QUESTION = { n: 1, question: 'Tell me about a pipeline.', answer: 'I built one.', at: 7, seconds: 20,
  pace: { score: 100, value: '117 wpm', target: '100 to 165 wpm' }, fillers: { score: 100, value: '0 (0%)', target: 'under 3% of words' }, content: { score: 100, covered: 1, of: 1 } };
const row = (over: Record<string, unknown> = {}) => ({ id: ID, enrollment_id: 'enr-ann', state: 'done', company: 'Acme', position: 'Data Analyst', starts_at: START, minutes: 30,
  recording_consent: 'on', rec_current: true, consented: true, r_status: 'scored', r_reason: null, r_has_recording: true, room_url: SENTINEL_PROVIDER_URL,
  turns: [QUESTION], scores: { score: 81 }, ...over });

let shared: express.Express | null = null;
let timeoutApp: express.Express | null = null;
beforeAll(async () => {
  const { createReplayRouters } = await import('../placementReplayRoutes');
  const make = (opts: Parameters<typeof createReplayRouters>[0]) => { const r = createReplayRouters(opts); const a = express(); a.use(express.json()); a.use(r.candidate, r.public); return a; };
  shared = make({ now: () => clock });
  timeoutApp = make({ now: () => clock, stream: (rec, o) => streamStoredRecording(rec, { ...o, connectMs: 50 }) });
}, 60_000);
const app = () => { if (!shared) throw new Error('the router did not load'); return shared; };

let zoom = makeZoom();
beforeEach(() => {
  mockEnabled.mockReset().mockResolvedValue(true);
  mockRows.list = [row(), row({ id: OTHER, enrollment_id: 'enr-bob' })];
  mockRows.asked = [];
  mockRows.recording = { downloadUrl: MP4_URL, sizeBytes: 4, providerFileId: 'f-mp4' };
  clock = new Date(END.getTime() + 30 * 60_000);
  __resetZoomTokenCacheForTests();
  zoom = makeZoom();
  global.fetch = zoom.fetch as unknown as typeof fetch;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const CAND = (id = ID) => `/api/portal/career-prep/replays/${id}`;
const EMP = (id = ID) => `/api/public/room/${id}/replay`;

describe('candidate replay', () => {
  it('401 without a session, 404 with Career Prep off, 400 for a bad id or any query; nothing read', async () => {
    expect((await request(app()).get(CAND())).status).toBe(401);
    expect((await request(app()).get(CAND('nope')).set('Authorization', token())).status).toBe(400);
    expect((await request(app()).get(`${CAND()}?enrollment=enr-bob`).set('Authorization', token())).status).toBe(400);
    mockEnabled.mockResolvedValue(false);
    expect((await request(app()).get(CAND()).set('Authorization', token())).status).toBe(404);
    expect(mockRows.asked).toEqual([]);
  });
  it('another learner\'s interview is 404', async () => {
    expect((await request(app()).get(CAND(OTHER)).set('Authorization', token())).status).toBe(404);
  });
  it('200: score, questions, a signed recording path on OUR server; never the provider link or Zoom\'s file location', async () => {
    const r = await request(app()).get(CAND()).set('Authorization', token());
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(CandidateReplayResponse.safeParse(r.body).success).toBe(true);
    expect(r.body.replay).toMatchObject({ status: 'scored', score: 81, questions: [QUESTION], note: 'Scored from the audio and the words only, never the video.' });
    expect(r.body.replay.recording).toMatch(new RegExp(`^/api/public/replays/${ID}/recording\\?p=c&x=\\d+&t=`)); // signed for the candidate only
    expectNoRoomUrl(r.body);
    expect(JSON.stringify(r.body)).not.toContain('zoom.example');
  });
  it('an unrecorded interview: no replay, the sheet says why, no score, no recording', async () => {
    mockRows.list = [row({ recording_consent: 'declined', rec_current: false, consented: false, r_status: null, r_has_recording: null, turns: null, scores: null })];
    const r = await request(app()).get(CAND()).set('Authorization', token());
    expect(r.body.replay).toMatchObject({ status: 'not_recorded', note: 'Not recorded: someone chose not to be recorded, so there is no replay.', score: null, recording: null, questions: [] });
  });
  it('held and consented, Zoom still preparing: waiting; not held yet: not_held', async () => {
    mockRows.list = [row({ r_status: 'waiting', r_has_recording: false, turns: [], scores: {} })];
    expect((await request(app()).get(CAND()).set('Authorization', token())).body.replay).toMatchObject({ status: 'waiting', score: null, recording: null, questions: [] });
    mockRows.list = [row({ state: 'booked', r_status: null })];
    expect((await request(app()).get(CAND()).set('Authorization', token())).body.replay.status).toBe('not_held');
  });
});

describe('employer replay (the signed room link)', () => {
  it('401 for no link, a bad signature, another interview\'s link, or past end + 2 h; nothing read', async () => {
    expect((await request(app()).get(EMP())).status).toBe(401);
    expect((await request(app()).get(`${EMP()}?e=${END.getTime()}&t=${'A'.repeat(43)}`)).status).toBe(401);
    expect((await request(app()).get(`${EMP()}?${link(OTHER)}`)).status).toBe(401);
    clock = new Date(END.getTime() + 121 * 60_000);
    expect((await request(app()).get(`${EMP()}?${link()}`)).status).toBe(401);
    expect(mockRows.asked).toEqual([]);
  });
  it('200: status, recording path and THEIR notes; the candidate\'s feedback is absent (strict schema, and never selected)', async () => {
    const r = await request(app()).get(`${EMP()}?${link()}`);
    expect(r.status).toBe(200);
    expect(EmployerReplayResponse.safeParse(r.body).success).toBe(true);
    expect(r.body.replay).toMatchObject({ status: 'recorded', note: 'Recorded. The recording is ready.', notes: [{ body: 'Strong on pipelines.' }] });
    for (const k of ['score', 'questions', 'turns', 'scores', 'pace', 'fillers', 'content']) expect(JSON.stringify(r.body)).not.toContain(`"${k}"`);
    expect(JSON.stringify(r.body)).not.toContain('zoom.example'); // neither the meeting link nor Zoom's file location
    expect(r.body.replay.recording).toContain(`?p=e&e=${END.getTime()}&x=`);
    expect(mockRows.asked).toEqual(['employer']);
    expectNoRoomUrl(r.body);
  });
  it('a link from before a reschedule is 410 moved', async () => {
    const r = await request(app()).get(`${EMP()}?${link(ID, new Date(END.getTime() - 60 * 60_000))}`);
    expect([r.status, r.body.reason]).toEqual([410, 'moved']);
  });
});

describe('the recording stream', () => {
  const cand = (id = ID, now = clock) => recordingPath(id, { kind: 'candidate' }, now);
  const emp = (id = ID, now = clock, e = END.getTime()) => recordingPath(id, { kind: 'employer', e }, now);
  const bytes = (req: request.Test) => req.buffer(true).parse((res, cb) => { const b: Buffer[] = []; res.on('data', (d: Buffer) => b.push(d)); res.on('end', () => cb(null, Buffer.concat(b))); });
  it('401 for a bad signature, another interview, or after one hour; nothing read', async () => {
    expect((await request(app()).get(`/api/public/replays/${ID}/recording?p=c&x=1&t=${'A'.repeat(43)}`)).status).toBe(401);
    expect((await request(app()).get(cand(OTHER).replace(OTHER, ID))).status).toBe(401);
    const old = cand(ID, new Date(clock.getTime() - 61 * 60_000));
    expect((await request(app()).get(old)).body.reason).toBe('expired');
    expect(mockRows.asked).toEqual([]);
  });
  it('bound to ONE party: a candidate link cannot be used as an employer link, nor the reverse, nor for another booking', async () => {
    const c = cand(); const e = emp();
    const asEmployer = c.replace('p=c', `p=e&e=${END.getTime()}`);
    const asCandidate = e.replace(`p=e&e=${END.getTime()}`, 'p=c');
    const otherBooking = e.replace(`e=${END.getTime()}`, `e=${END.getTime() + 60_000}`);
    for (const bad of [asEmployer, asCandidate, otherBooking]) expect((await request(app()).get(bad)).status).toBe(401);
    expect((await bytes(request(app()).get(c))).status).toBe(200);
    expect((await bytes(request(app()).get(e))).status).toBe(200);
    expect(mockRows.asked.filter((a) => a === 'recording')).toHaveLength(2);
  });
  it('an employer\'s link also ends with their room link (end + 2 h), and a moved booking is 410', async () => {
    clock = new Date(END.getTime() + 119 * 60_000);
    const e = emp();
    clock = new Date(END.getTime() + 121 * 60_000);
    expect((await request(app()).get(e)).body.reason).toBe('expired');
    clock = new Date(END.getTime() + 30 * 60_000);
    mockRows.list = [row({ starts_at: new Date(START.getTime() + 60 * 60_000) })];
    expect((await request(app()).get(emp())).status).toBe(410);
  });
  it('200 video/mp4: the bytes come through our server from Zoom\'s file (the location never leaves)', async () => {
    const r = await bytes(request(app()).get(cand()));
    expect(r.status).toBe(200);
    expect([r.headers['content-type'], r.headers['accept-ranges']]).toEqual(['video/mp4', 'bytes']);
    expect(String(r.body)).toBe('MP4!');
    expect(zoom.calls.some((c) => c.url === MP4_URL)).toBe(true);
  });
  it('HTTP Range: forwarded to Zoom, answered 206 with Content-Range; a malformed Range is not forwarded', async () => {
    const r = await bytes(request(app()).get(cand()).set('Range', 'bytes=1-2'));
    expect(r.status).toBe(206);
    expect([r.headers['content-range'], r.headers['accept-ranges'], String(r.body)]).toEqual(['bytes 1-2/4', 'bytes', 'P4']);
    expect(zoom.calls.find((c) => c.url === MP4_URL)?.range).toBe('bytes=1-2');
    const bad = await bytes(request(app()).get(cand()).set('Range', 'bytes=1-2, 3-4; x'));
    expect(bad.status).toBe(200);
    expect(zoom.calls.filter((c) => c.url === MP4_URL).at(-1)?.range).toBeUndefined();
  });
  it('no recording: 404; Zoom failing: 502; Zoom not answering in time: 502 and the Zoom request is ABORTED', async () => {
    mockRows.recording = null;
    expect((await request(app()).get(cand())).status).toBe(404);
    mockRows.recording = { downloadUrl: MP4_URL, sizeBytes: 4, providerFileId: 'f-mp4' };
    zoom = makeZoom({ detail: 'down', mp4: true });
    global.fetch = zoom.fetch as unknown as typeof fetch;
    expect((await request(app()).get(cand())).status).toBe(502);
    zoom = makeZoom({ detail: 'ok', mp4: true, hang: true });
    global.fetch = zoom.fetch as unknown as typeof fetch;
    expect((await request(timeoutApp!).get(cand())).status).toBe(502);
    expect(String((console.error as jest.Mock).mock.calls.at(-1)?.[0])).toContain('"error_class":"TimeoutError"');
    expect(zoom.signals).toHaveLength(1);
    expect(zoom.signals[0]?.aborted).toBe(true);
  });
});
