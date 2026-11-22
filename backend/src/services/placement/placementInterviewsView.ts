import { sequelize } from '../../config/database';
import { candidateRoomUrl } from './roomLink';
import { isInterviewState, type InterviewState } from './interviewStates';
import { CONSENTED } from './replayStore';
import { summarize as replaySummary, type ReplaySummary } from './replayView';

/**
 * Career Prep v27, CP8.3 (kit F4): what the learner's Interviews sheet shows about the interviews the job-search inbox
 * found for them. Only their OWN rows (the enrollment comes from the session token). The meeting provider's link is
 * NEVER read here (the statement does not select room_url or room_provider_id): "Join" is the consent-room PAGE
 * (`/portal/career/interview/<id>`, roomLink.candidateRoomUrl), and only for a booked interview.
 *
 *   kpis        Upcoming (booked, not over), Waiting on employer (new, awaiting), With your recruiter (review), Held (done),
 *               scored (held interviews whose replay was scored, CP9.2; the sheet says "Held and scored" once it is > 0)
 *   replay      for a held interview: its replay state, the plain words (why there is none, or still preparing) and
 *               the score when scored (replayView.summarize). null for an interview not held yet.
 *   history     state changes from placement_events, in plain words; internal bookkeeping rows are left out
 *   prepId      the learner's prep row for a booked (or held) interview at the same time, so "Continue prep" opens the
 *               room anchored on it (absent otherwise: the room would not offer it as an anchor)
 * At most 100 interviews (newest first) and 2,000 history rows; a database error goes to the route (an honest 500).
 */
export const JOIN_EARLY_MS = 10 * 60_000;
export const MAX_INTERVIEWS = 100;
export const MAX_EVENTS = 2000;

export interface HistoryItem { at: string; label: string }
export interface PlacementInterviewView {
  id: string; company: string | null; role: string | null; state: InterviewState; stateLabel: string;
  startsAt: string | null; minutes: number; readAs: string | null; confidence: number | null;
  roomPage: string | null; joinOpensAt: string | null; joinClosesAt: string | null; prepId: string | null; history: HistoryItem[];
  replay: ReplaySummary | null;
}
export interface PlacementInterviews { kpis: { upcoming: number; waiting: number; recruiter: number; held: number; scored: number }; interviews: PlacementInterviewView[] }

export const STATE_LABEL: Record<InterviewState, string> = {
  new: 'Waiting on employer', awaiting: 'Waiting on employer', review: 'With your recruiter', booked: 'Booked', done: 'Held', cancelled: 'Cancelled',
};
const TYPE_LABEL: Record<string, string> = { recruiter: 'Recruiter screen', hiring_manager: 'Hiring manager', technical: 'Technical', behavioral: 'Behavioral' };
const MOVED_TO: Record<InterviewState, string> = {
  new: 'Rescheduled: a new time is being arranged', awaiting: 'The employer opened the booking link', review: 'Passed to your recruiter',
  booked: 'Booked', done: 'Held', cancelled: 'Cancelled',
};

/** A history row in plain words, or null for bookkeeping the learner does not need (retries, holds, reminders). */
export function historyLabel(event: string, from: string | null, to: string | null): string | null {
  if (event === 'detected') return 'Found in your job-search inbox';
  if (event === 'booking_link_sent') return 'Booking link sent to the employer';
  if (!to || from === to || !isInterviewState(to)) return null;
  return MOVED_TO[to];
}

type Row = { id: string; company: string | null; position: string | null; type: string | null; sub_type: string | null; confidence: string | number | null;
  state: string; starts_at: Date | string | null; minutes: number | null; prep_id: string | null;
  recording_consent?: string | null; rec_current?: boolean; consented?: boolean; r_status?: string | null; r_reason?: string | null; r_score?: string | number | null };
type Ev = { subject_id: string; event: string; from_state: string | null; to_state: string | null; created_at: Date | string };

const iso = (d: Date | string) => new Date(d).toISOString();
const text = (s: string | null) => (s && s.trim() ? s.trim() : null);

export function toView(r: Row, events: Ev[]): PlacementInterviewView | null {
  if (!isInterviewState(r.state)) return null;
  const minutes = Number(r.minutes ?? 30);
  const start = r.starts_at ? new Date(r.starts_at) : null;
  const booked = r.state === 'booked' && !!start;
  const conf = r.confidence === null || r.confidence === undefined ? null : Number(r.confidence);
  return {
    id: String(r.id), company: text(r.company), role: text(r.position), state: r.state, stateLabel: STATE_LABEL[r.state],
    startsAt: start ? start.toISOString() : null, minutes,
    readAs: (r.type && TYPE_LABEL[r.type]) || text(r.sub_type), confidence: conf !== null && Number.isFinite(conf) ? conf : null,
    roomPage: booked ? candidateRoomUrl(String(r.id), '') : null,
    joinOpensAt: booked && start ? new Date(start.getTime() - JOIN_EARLY_MS).toISOString() : null,
    joinClosesAt: booked && start ? new Date(start.getTime() + minutes * 60_000).toISOString() : null,
    prepId: (r.state === 'booked' || r.state === 'done') && r.prep_id ? String(r.prep_id) : null,
    history: events.filter((e) => String(e.subject_id) === String(r.id))
      .map((e) => ({ at: iso(e.created_at), label: historyLabel(e.event, e.from_state, e.to_state) }))
      .filter((h): h is HistoryItem => h.label !== null),
    replay: r.state === 'done' ? replayOf(r) : null,
  };
}

function replayOf(r: Row): ReplaySummary {
  const score = r.r_score === null || r.r_score === undefined ? null : Number(r.r_score);
  return replaySummary({ state: r.state, recording_consent: r.recording_consent ?? null, rec_current: !!r.rec_current, consented: !!r.consented,
    r_status: (r.r_status ?? null) as never, r_reason: r.r_reason ?? null }, score !== null && Number.isFinite(score) ? score : null);
}

/** Upcoming booked interviews first (soonest first), then every other one, newest first (the statement's order). */
export function summarize(views: PlacementInterviewView[], now: Date): PlacementInterviews {
  const t = now.getTime();
  const upcoming = views.filter((v) => v.state === 'booked' && v.joinClosesAt && Date.parse(v.joinClosesAt) > t)
    .sort((a, b) => Date.parse(a.startsAt as string) - Date.parse(b.startsAt as string));
  const rest = views.filter((v) => !upcoming.includes(v));
  return {
    kpis: { upcoming: upcoming.length, waiting: views.filter((v) => v.state === 'new' || v.state === 'awaiting').length,
      recruiter: views.filter((v) => v.state === 'review').length, held: views.filter((v) => v.state === 'done').length,
      scored: views.filter((v) => v.replay?.status === 'scored').length },
    interviews: [...upcoming, ...rest],
  };
}

export async function listPlacementInterviews(enrollmentId: string, now = new Date()): Promise<PlacementInterviews> {
  const [rows] = await sequelize.query(
    `SELECT i.id, i.company, i.position, i.type, i.sub_type, i.confidence, i.state, i.starts_at, i.minutes, c.id AS prep_id, i.recording_consent,
            (i.recording_meeting_id IS NOT NULL AND i.recording_meeting_id = i.room_provider_id) AS rec_current, (${CONSENTED}) AS consented,
            r.status AS r_status, r.reason AS r_reason, r.scores->>'score' AS r_score
       FROM placement_interviews i
       LEFT JOIN career_interviews c ON c.placement_interview_id = i.id AND c.enrollment_id = i.enrollment_id AND c.starts_at = i.starts_at
       LEFT JOIN interview_replays r ON r.interview_id = i.id
      WHERE i.enrollment_id = :e ORDER BY i.created_at DESC, i.id LIMIT ${MAX_INTERVIEWS}`,
    { replacements: { e: enrollmentId } });
  const list = rows as Row[];
  if (!list.length) return summarize([], now);
  const [events] = await sequelize.query(
    `SELECT subject_id, event, from_state, to_state, created_at FROM placement_events
      WHERE subject_type = 'placement_interview' AND subject_id IN (:ids)
        AND (event IN ('detected','booking_link_sent') OR (to_state IS NOT NULL AND from_state IS DISTINCT FROM to_state))
      ORDER BY created_at DESC, id DESC LIMIT ${MAX_EVENTS}`,
    { replacements: { ids: list.map((r) => String(r.id)) } });
  const oldestFirst = (events as Ev[]).slice().reverse(); // the newest rows survive the cap; the drawer reads oldest first
  return summarize(list.map((r) => toView(r, oldestFirst)).filter((v): v is PlacementInterviewView => v !== null), now);
}
