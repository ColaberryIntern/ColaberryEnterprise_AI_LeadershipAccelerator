import { sequelize } from '../../config/database';
import type { StoredRecording } from './replayFiles';
import type { ScoredQuestion } from './replayScoring';

/**
 * Career Prep v27, CP9.2: every statement the replay needs, in one place (replayJob.ts writes, replayView.ts reads).
 *
 *   CONSENTED   the one consent rule (T22): the interview is HELD (state done), its recording state is 'on' FOR THE
 *               MEETING IT WAS HELD IN (recording_meeting_id = room_provider_id), BOTH sides consented and nobody
 *               declined. Anything else (declined, unavailable, failed, pending, NULL, a rebooked meeting) has no
 *               replay. Checked in the job's scan AND again under the interview row lock right before any Zoom fetch.
 *   claim       under that lock: insert the replay row (attempt 1), or take the next attempt of a 'waiting' row whose
 *               backoff has passed (attempts x BACKOFF_MINUTES) and is under MAX_ATTEMPTS. Two passes at once: one
 *               wins, the other gets null and does nothing. A finished row (scored, no_score, unavailable) is never
 *               claimed again, so a re-run writes nothing.
 *   finish      only the attempt that claimed it may finish it (status 'waiting' AND the same attempt number).
 */
export const MAX_ATTEMPTS = 12;
export const BACKOFF_MINUTES = 15;
export const PASS_LIMIT = 20;

export const CONSENTED = `i.state = 'done' AND i.room_provider_id IS NOT NULL AND i.recording_consent = 'on'
  AND i.recording_meeting_id = i.room_provider_id
  AND EXISTS (SELECT 1 FROM interview_consents c WHERE c.interview_id = i.id AND c.party = 'candidate' AND c.decision = 'consent')
  AND EXISTS (SELECT 1 FROM interview_consents c WHERE c.interview_id = i.id AND c.party = 'employer' AND c.decision = 'consent')
  AND NOT EXISTS (SELECT 1 FROM interview_consents c WHERE c.interview_id = i.id AND c.decision = 'decline')`;

const DUE = `(r.id IS NULL OR (r.status = 'waiting' AND r.attempts < ${MAX_ATTEMPTS}
  AND (r.last_attempt_at IS NULL OR r.last_attempt_at < NOW() - (r.attempts * INTERVAL '${BACKOFF_MINUTES} minutes'))))`;

export interface DueRow { id: string }
export interface Claimed { interviewId: string; enrollmentId: string; meetingId: string; startsAt: Date; fullName: string | null; attempt: number }
export type ReplayStatus = 'waiting' | 'scored' | 'no_score' | 'unavailable';
export interface Finish { status: Exclude<ReplayStatus, 'waiting'>; reason: string | null; questions: ScoredQuestion[]; score: number | null; recording: StoredRecording | null }

const rows = async <T>(sql: string, replacements: Record<string, unknown> = {}, transaction?: unknown): Promise<T[]> =>
  (await sequelize.query(sql, { replacements, ...(transaction ? { transaction: transaction as never } : {}) }))[0] as T[];

export async function listDue(limit = PASS_LIMIT): Promise<DueRow[]> {
  return rows<DueRow>(`SELECT i.id FROM placement_interviews i LEFT JOIN interview_replays r ON r.interview_id = i.id
    WHERE ${CONSENTED} AND ${DUE} ORDER BY i.starts_at, i.id LIMIT ${Math.max(1, Math.min(limit, PASS_LIMIT))}`);
}

interface LockedRow { id: string; enrollment_id: string; room_provider_id: string; starts_at: Date | string; full_name: string | null }

/** The consent rule again under the interview row lock (taken first), then one claim. null = not this pass. */
export async function claim(interviewId: string): Promise<Claimed | null> {
  return sequelize.transaction(async (t) => {
    const [r] = await rows<LockedRow>(`SELECT i.id, i.enrollment_id, i.room_provider_id, i.starts_at, e.full_name
      FROM placement_interviews i JOIN enrollments e ON e.id = i.enrollment_id WHERE i.id = :id AND ${CONSENTED} FOR UPDATE OF i`, { id: interviewId }, t);
    if (!r) return null;
    const [won] = await rows<{ attempts: number }>(`INSERT INTO interview_replays AS r (interview_id, enrollment_id, meeting_id, status, attempts, last_attempt_at)
      VALUES (:id, :e, :m, 'waiting', 1, NOW())
      ON CONFLICT (interview_id) DO UPDATE SET attempts = r.attempts + 1, last_attempt_at = NOW(), updated_at = NOW()
        WHERE ${DUE.replace('r.id IS NULL OR ', '')}
      RETURNING attempts`, { id: r.id, e: r.enrollment_id, m: r.room_provider_id }, t);
    if (!won) return null;
    return { interviewId: String(r.id), enrollmentId: String(r.enrollment_id), meetingId: String(r.room_provider_id), startsAt: new Date(r.starts_at),
      fullName: r.full_name, attempt: Number(won.attempts) };
  });
}

/** true = this attempt finished the row. */
export async function finish(c: Claimed, f: Finish): Promise<boolean> {
  const done = await rows<{ id: string }>(`UPDATE interview_replays SET status = :status, reason = :reason, turns = CAST(:turns AS jsonb),
      scores = CAST(:scores AS jsonb), recording = CAST(:rec AS jsonb), updated_at = NOW()
    WHERE interview_id = :id AND status = 'waiting' AND attempts = :a RETURNING id`, {
    id: c.interviewId, a: c.attempt, status: f.status, reason: f.reason ? f.reason.slice(0, 200) : null, turns: JSON.stringify(f.questions),
    scores: JSON.stringify(f.score === null ? {} : { score: f.score }), rec: f.recording ? JSON.stringify(f.recording) : null,
  });
  return done.length > 0;
}

/** Still waiting on Zoom: keep the claimed recording location if one was found (the next attempt may find the transcript). */
export async function keepWaiting(c: Claimed, recording: StoredRecording | null): Promise<void> {
  await rows(`UPDATE interview_replays SET recording = COALESCE(CAST(:rec AS jsonb), recording), updated_at = NOW()
    WHERE interview_id = :id AND status = 'waiting' AND attempts = :a`, { id: c.interviewId, a: c.attempt, rec: recording ? JSON.stringify(recording) : null });
}

export interface ReplayRow {
  id: string; enrollment_id: string; state: string; company: string | null; position: string | null; starts_at: Date | string | null; minutes: number | null;
  recording_consent: string | null; rec_current: boolean; consented: boolean;
  r_status: ReplayStatus | null; r_reason: string | null; r_has_recording: boolean | null;
}
const VIEW_COLS = `i.id, i.enrollment_id, i.state, i.company, i.position, i.starts_at, i.minutes, i.recording_consent,
  (i.recording_meeting_id IS NOT NULL AND i.recording_meeting_id = i.room_provider_id) AS rec_current, (${CONSENTED}) AS consented,
  r.status AS r_status, r.reason AS r_reason, (r.recording IS NOT NULL) AS r_has_recording`;

/** The candidate's own interview with its replay summary AND feedback (turns, scores). undefined = not theirs / none. */
export async function candidateReplayRow(enrollmentId: string, interviewId: string): Promise<(ReplayRow & { turns: unknown; scores: unknown }) | undefined> {
  return (await rows<ReplayRow & { turns: unknown; scores: unknown }>(`SELECT ${VIEW_COLS}, r.turns, r.scores FROM placement_interviews i
    LEFT JOIN interview_replays r ON r.interview_id = i.id WHERE i.id = :id AND i.enrollment_id = :e`, { id: interviewId, e: enrollmentId }))[0];
}

/** The employer's view of the same row: the summary ONLY (the statement does not select turns or scores). */
export async function employerReplayRow(interviewId: string): Promise<ReplayRow | undefined> {
  return (await rows<ReplayRow>(`SELECT ${VIEW_COLS} FROM placement_interviews i LEFT JOIN interview_replays r ON r.interview_id = i.id
    WHERE i.id = :id`, { id: interviewId }))[0];
}

/** Where Zoom keeps a FINISHED replay's recording (server side only). null = none. */
export async function storedRecording(interviewId: string): Promise<StoredRecording | null> {
  const [r] = await rows<{ recording: StoredRecording | null }>(`SELECT r.recording FROM interview_replays r JOIN placement_interviews i ON i.id = r.interview_id
    WHERE r.interview_id = :id AND r.status IN ('scored','no_score') AND ${CONSENTED}`, { id: interviewId });
  return r?.recording && typeof r.recording.downloadUrl === 'string' ? r.recording : null;
}
