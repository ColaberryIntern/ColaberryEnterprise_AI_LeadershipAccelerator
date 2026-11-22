import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../../config/env';
import { employerGuide, type GuideNote } from './roomGuide';
import type { ScoredQuestion } from './replayScoring';
import { candidateReplayRow, employerReplayRow, type ReplayRow } from './replayStore';

/**
 * Career Prep v27, CP9.2 (kit F5 "replay"): what the candidate and the employer are shown about a held interview's
 * replay. The candidate (their own interview only) gets the status, the score and the per-question feedback; the
 * employer (their signed room link) gets the status, the recording and THEIR notes, and never the feedback (their
 * statement does not even select it). Neither ever gets the meeting provider's link or Zoom's download location: the
 * recording is a path on OUR server, signed for one interview and one hour (recordingPath / checkRecordingLink).
 *
 *   status   not_held      the interview is not held yet
 *            not_recorded  no consented recording for the meeting it was held in; `note` says why (declined,
 *                          Zoom permission, could not be turned on, or not recorded)
 *            waiting       consented and held; Zoom is still preparing the recording
 *            scored | no_score | unavailable  the replay row's own status; `note` carries its reason
 */
export type ReplayState = 'not_held' | 'not_recorded' | 'waiting' | 'scored' | 'no_score' | 'unavailable';
export interface ReplaySummary { status: ReplayState; note: string; score: number | null }
export interface CandidateReplay extends ReplaySummary { interviewId: string; company: string | null; role: string | null; startsAt: string | null; recording: string | null; questions: ScoredQuestion[] }
export type EmployerState = 'not_held' | 'not_recorded' | 'waiting' | 'recorded' | 'unavailable';
export interface EmployerReplay { interviewId: string; company: string | null; role: string | null; startsAt: string | null; status: EmployerState; note: string; recording: string | null; notes: GuideNote[] }

export const RECORDING_LINK_MS = 60 * 60_000;
export const EMPLOYER_READY = 'Recorded. The recording is ready.';
export const EMPLOYER_NO_FILE = 'Recorded, but Zoom has no recording file to play.';

const NOT_RECORDED: Record<string, string> = {
  declined: 'Not recorded: someone chose not to be recorded, so there is no replay.',
  unavailable: 'Not recorded: the Zoom permission to record was missing, so there is no replay.',
  failed: 'Not recorded: the recording could not be turned on, so there is no replay.',
};
export const NOTES: Record<ReplayState, string> = {
  not_held: 'The replay appears here after the interview is held.',
  not_recorded: 'This interview was not recorded, so there is no replay.',
  waiting: 'Zoom is still preparing the recording. The replay appears here when it is ready.',
  scored: 'Scored from the audio and the words only, never the video.',
  no_score: 'Recorded, but nothing was scored.',
  unavailable: 'There is no replay for this interview.',
};

/** Pure: one row's replay state and its plain words. */
export function summarize(r: Pick<ReplayRow, 'state' | 'recording_consent' | 'rec_current' | 'consented' | 'r_status' | 'r_reason'>, score: number | null = null): ReplaySummary {
  if (r.state !== 'done') return { status: 'not_held', note: NOTES.not_held, score: null };
  if (!r.consented) {
    const why = r.recording_consent === 'declined' || r.rec_current ? NOT_RECORDED[String(r.recording_consent)] : undefined;
    return { status: 'not_recorded', note: why ?? NOTES.not_recorded, score: null };
  }
  const status: ReplayState = r.r_status && r.r_status !== 'waiting' ? r.r_status : 'waiting';
  return { status, note: (status !== 'scored' && r.r_reason) || NOTES[status], score: status === 'scored' && typeof score === 'number' ? score : null };
}

const key = (secret = env.jwtSecret): Buffer => createHmac('sha256', String(secret)).update('placement-replay-recording-v1').digest();
const sign = (id: string, x: number, secret?: string) => createHmac('sha256', key(secret)).update(`${id}.${x}`).digest('base64url');

/** Our server's path for the recording, signed for this interview until `now` + one hour. */
export function recordingPath(interviewId: string, now: Date, secret?: string): string {
  const x = now.getTime() + RECORDING_LINK_MS;
  return `/api/public/replays/${encodeURIComponent(interviewId)}/recording?x=${x}&t=${sign(interviewId, x, secret)}`;
}

export function checkRecordingLink(input: { i: string; x: string; t: string; now: Date; secret?: string }): 'ok' | 'expired' | 'invalid' {
  if (!/^\d{1,15}$/.test(input.x) || !/^[A-Za-z0-9_-]{43}$/.test(input.t)) return 'invalid';
  const want = Buffer.from(sign(input.i, Number(input.x), input.secret));
  const got = Buffer.from(input.t);
  if (!(want.length === got.length && timingSafeEqual(want, got))) return 'invalid';
  return input.now.getTime() > Number(input.x) ? 'expired' : 'ok';
}

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);
const scoreOf = (s: unknown): number | null => {
  const v = (s as { score?: unknown } | null)?.score;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};
const questionsOf = (t: unknown): ScoredQuestion[] => (Array.isArray(t) ? (t as ScoredQuestion[]) : []);
const playable = (r: ReplayRow, s: ReplaySummary) => (s.status === 'scored' || s.status === 'no_score') && !!r.r_has_recording;

export async function candidateReplay(enrollmentId: string, interviewId: string, now: Date): Promise<CandidateReplay | null> {
  const r = await candidateReplayRow(enrollmentId, interviewId);
  if (!r) return null;
  const s = summarize(r, scoreOf(r.scores));
  return { interviewId: String(r.id), company: r.company, role: r.position, startsAt: iso(r.starts_at), ...s,
    recording: playable(r, s) ? recordingPath(String(r.id), now) : null, questions: s.status === 'scored' ? questionsOf(r.turns) : [] };
}

export type EmployerResult = { status: 'ok'; replay: EmployerReplay } | { status: 'not_found' | 'moved' | 'not_booked' };

/** The employer link's own gate (roomGuide: this interview, this booking's end time) first, then the summary. */
export async function employerReplay(interviewId: string, endMs: number, now: Date): Promise<EmployerResult> {
  const g = await employerGuide(interviewId, endMs);
  if (g.status !== 'ok') return g;
  const r = await employerReplayRow(interviewId);
  if (!r) return { status: 'not_found' };
  const s = summarize(r);
  const ready = playable(r, s);
  // Whether the candidate was scored, and why not, is the candidate's feedback: the employer sees "recorded" only.
  const recorded = s.status === 'scored' || s.status === 'no_score';
  const status: EmployerReplay['status'] = s.status === 'scored' || s.status === 'no_score' ? 'recorded' : s.status;
  const note = recorded ? (ready ? EMPLOYER_READY : EMPLOYER_NO_FILE) : s.note;
  return { status: 'ok', replay: { interviewId: String(r.id), company: r.company, role: r.position, startsAt: iso(r.starts_at), status, note,
    recording: ready ? recordingPath(String(r.id), now) : null, notes: g.guide.notes } };
}
