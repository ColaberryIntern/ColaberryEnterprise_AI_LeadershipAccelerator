/**
 * CP9.2 test stand-ins for the replay: Zoom's HTTP edge (a fake `fetch`, so zoomApiClient, zoomTranscripts and
 * zoomService run for real), a transcript in Zoom's WEBVTT shape, and an in-memory replay store that applies the same
 * consent rule and claim rules as replayStore.ts (whose SQL runs on Postgres in replayStore.integration.test.ts).
 * No real Zoom call is ever made.
 */
import type { Claimed, DueRow, Finish } from '../../replayStore';
import { MAX_ATTEMPTS, BACKOFF_MINUTES } from '../../replayStore';
import type { StoredRecording } from '../../replayFiles';

export const MEETING = '81234567890';
export const MP4_URL = 'https://zoom.example/rec/download/MP4-SECRET';
export const VTT_URL = 'https://zoom.example/rec/download/VTT-SECRET';

const cue = (n: number, from: string, to: string, text: string) => `${n}\n${from} --> ${to}\n${text}`;
/** Pat (the employer) asks two questions; Ann (the learner) answers both at about 120 words a minute, then says thanks. */
export const VTT = ['WEBVTT', '',
  cue(1, '00:00:01.000', '00:00:06.000', 'Pat Kim: Tell me about a data pipeline you built and how you measured its impact.'), '',
  cue(2, '00:00:07.000', '00:00:17.000', 'Ann Lee: I built a pipeline that moved sales data from three systems into one warehouse every night for the team.'), '',
  cue(3, '00:00:17.000', '00:00:27.000', 'Ann Lee: We measured the impact by how fast reports were ready, and the wait dropped from two days to one hour.'), '',
  cue(4, '00:00:28.000', '00:00:32.000', 'Pat Kim: How did you handle failures when the pipeline broke overnight?'), '',
  cue(5, '00:00:33.000', '00:00:45.000', 'Ann Lee: Um, I added alerts and a retry with a limit, so a failure paged me and the next run picked up where it stopped, you know.'), '',
  cue(6, '00:00:46.000', '00:00:48.000', 'Pat Kim: Great, thank you.'), '',
  cue(7, '00:00:49.000', '00:00:50.000', 'Ann Lee: Thank you.'), ''].join('\n');

export interface ZoomScript { detail: 'ok' | 'missing' | 'scope' | 'down' | 'no_transcript'; mp4: boolean; hang?: boolean }
export interface ZoomCall { method: string; url: string }

export function makeZoom(script: ZoomScript = { detail: 'ok', mp4: true }) {
  const calls: ZoomCall[] = [];
  const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status }));
  const files = () => [
    ...(script.mp4 ? [{ id: 'f-mp4', file_type: 'MP4', file_size: 4, recording_type: 'active_speaker', download_url: MP4_URL }] : []),
    ...(script.detail === 'no_transcript' ? [] : [{ id: 'f-vtt', file_type: 'TRANSCRIPT', file_extension: 'VTT', download_url: VTT_URL }]),
  ];
  const fetch = jest.fn((url: string, init: { method?: string } = {}): Promise<Response> => {
    calls.push({ method: init.method ?? 'GET', url });
    if (url.startsWith('https://zoom.us/oauth/token')) return json({ access_token: 'tok-1', expires_in: 3600, scope: 'cloud_recording:read:list_user_recordings:admin' });
    if (script.detail === 'scope') return json({ code: 4711, message: 'Invalid access token, does not contain scopes:[cloud_recording:read:list_recording_files:admin].' }, 400);
    if (script.detail === 'down') return json({ message: 'upstream' }, 503);
    if (url.includes(`/meetings/${MEETING}/recordings`)) {
      return script.detail === 'missing' ? json({ code: 3301, message: 'This recording does not exist.' }, 404) : json({ uuid: 'u-1', recording_files: files() });
    }
    if (url.includes('/users/') && url.includes('/recordings')) {
      return json({ meetings: script.detail === 'missing' ? [] : [{ id: Number(MEETING), uuid: 'u-1', topic: 'Interview', recording_files: files() }] });
    }
    if (url === VTT_URL) return Promise.resolve(new Response(VTT, { status: 200 }));
    if (url === MP4_URL) return script.hang ? new Promise<Response>(() => undefined) : Promise.resolve(new Response('MP4!', { status: 200 }));
    return json({ message: `unexpected ${url}` }, 500);
  });
  return { fetch, calls, script, zoomCalls: () => calls.filter((c) => !c.url.startsWith('https://zoom.us/oauth')) };
}

export interface FakeIv {
  id: string; enrollmentId: string; fullName: string | null; state: string; meetingId: string | null; recConsent: string | null;
  recMeeting: string | null; consents: Partial<Record<'candidate' | 'employer', 'consent' | 'decline'>>; startsAt: Date;
}
export interface FakeReplay { status: string; attempts: number; last: number; reason: string | null; turns: unknown; scores: unknown; recording: StoredRecording | null }

export const fakeIv = (over: Partial<FakeIv> = {}): FakeIv => ({ id: '11111111-1111-4111-8111-111111111111', enrollmentId: 'enr-ann', fullName: 'Ann Lee', state: 'done',
  meetingId: MEETING, recConsent: 'on', recMeeting: MEETING, consents: { candidate: 'consent', employer: 'consent' }, startsAt: new Date('2026-11-20T15:00:00Z'), ...over });

/** replayStore.CONSENTED, in JavaScript. */
export const consented = (i: FakeIv): boolean => i.state === 'done' && !!i.meetingId && i.recConsent === 'on' && i.recMeeting === i.meetingId
  && i.consents.candidate === 'consent' && i.consents.employer === 'consent';

export function makeStore(ivs: FakeIv[], clock: { now: number }) {
  const replays = new Map<string, FakeReplay>();
  const claims: string[] = [];
  const due = (r: FakeReplay | undefined) => !r || (r.status === 'waiting' && r.attempts < MAX_ATTEMPTS && r.last < clock.now - r.attempts * BACKOFF_MINUTES * 60_000);
  const store = {
    listDue: jest.fn(async (): Promise<DueRow[]> => ivs.filter((i) => consented(i) && due(replays.get(i.id))).map((i) => ({ id: i.id }))),
    claim: jest.fn(async (id: string): Promise<Claimed | null> => {
      const i = ivs.find((x) => x.id === id);
      if (!i || !consented(i)) return null;
      const r = replays.get(id);
      if (!due(r)) return null;
      const attempts = (r?.attempts ?? 0) + 1;
      replays.set(id, { status: 'waiting', reason: null, turns: [], scores: {}, recording: r?.recording ?? null, attempts, last: clock.now });
      claims.push(id);
      return { interviewId: id, enrollmentId: i.enrollmentId, meetingId: String(i.meetingId), startsAt: i.startsAt, fullName: i.fullName, attempt: attempts };
    }),
    finish: jest.fn(async (c: Claimed, f: Finish): Promise<boolean> => {
      const r = replays.get(c.interviewId);
      if (!r || r.status !== 'waiting' || r.attempts !== c.attempt) return false;
      replays.set(c.interviewId, { ...r, status: f.status, reason: f.reason, turns: f.questions, scores: f.score === null ? {} : { score: f.score }, recording: f.recording });
      return true;
    }),
    keepWaiting: jest.fn(async (c: Claimed, rec: StoredRecording | null): Promise<void> => {
      const r = replays.get(c.interviewId);
      if (r && r.status === 'waiting' && r.attempts === c.attempt) replays.set(c.interviewId, { ...r, recording: rec ?? r.recording });
    }),
  };
  return { store, replays, claims };
}

/** prep_observations' UNIQUE (source_ref, skill_key), ON CONFLICT DO NOTHING. */
export function makeObservations() {
  const rows = new Map<string, { skill: string; value: number; source: string; sourceRef: string; enrollmentId: string }>();
  let fail = false;
  const write = jest.fn(async (list: ReadonlyArray<{ skill: string; value: number; source: string; sourceRef: string; enrollmentId: string }>): Promise<number> => {
    if (fail) throw Object.assign(new Error('db down'), { name: 'SequelizeConnectionError' });
    let n = 0;
    for (const r of list) { const k = `${r.sourceRef}|${r.skill}`; if (!rows.has(k)) { rows.set(k, r); n += 1; } }
    return n;
  });
  return { rows, write, setFail: (v: boolean) => { fail = v; } };
}
