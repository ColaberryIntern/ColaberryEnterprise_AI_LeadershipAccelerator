/**
 * internVideoViewer - one intern demo video (a Presentation Studio recording), shaped for the
 * admin video viewer, plus that intern's other takes for the playlist.
 *
 * Ali, 10 Nov 2026: "allow me to click and open up the video in the platform just as I open an
 * artifact with the word or pdf or excel viewer. I should also have a video viewer where I can
 * see/watch/interact with that artifact."
 *
 * Scope: only recordings of ACTIVE interns (the same roster predicate as the artifact viewer), and
 * only `ingested` ones. Anything else is null, which the route turns into 404.
 *
 * Playback: a <video src> cannot send the admin Authorization header, so the bytes are served
 * against a signed, recording-bound STAFF ticket (services/presentation/recordingTicket.ts), minted
 * here only after the caller passed the internship section gate. The ticket outlives one viewing
 * session (VIEWER_TICKET_TTL_SECONDS) so seeking deep into a long take still works.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { templateById } from '../presentation';
import { createStaffRecordingTicket } from '../presentation/recordingTicket';

export const VIEWER_TICKET_TTL_SECONDS = 4 * 60 * 60;
const BASE = '/api/internship-video';

export interface InternVideoTake {
  recordingId: string;
  typeId: string | null;
  typeLabel: string;
  storyId: string | null;
  durationSeconds: number | null;
  recordedAt: string;
  attemptNo: number | null;
  mode: string | null;
  isFinalTake: boolean;
}
export interface InternVideoView extends InternVideoTake {
  intern: string;
  enrollmentId: string;
  projectName: string | null;
  hasAudio: boolean | null;
  hasSharedScreen: boolean | null;
  /** Ticketed URLs for the <video> and its poster. */
  fileUrl: string;
  thumbnailUrl: string;
  /** Every ingested take by this intern, newest first (includes this one). */
  takes: InternVideoTake[];
}

interface Row {
  recording_id: string; enrollment_id: string; intern: string; project_name: string | null; story_id: string | null;
  presentation_type: string | null; template_slug: string | null; duration_seconds: number | null; created_at: string | Date;
  attempt_no: number | null; mode: string | null; is_final_take: boolean | null; has_audio: boolean | null; has_shared_screen: boolean | null;
}

const ACTIVE_INTERN = `EXISTS (SELECT 1 FROM cohort_memberships cm JOIN cohorts c ON c.id = cm.cohort_id
                       WHERE cm.enrollment_id = asg.enrollment_id AND cm.membership_type = 'internship'
                         AND cm.status = 'active' AND c.cohort_type = 'ai_internship')`;
const SELECT = `
  SELECT r.id AS recording_id, asg.enrollment_id, COALESCE(NULLIF(TRIM(e.full_name), ''), e.email) AS intern, p.name AS project_name,
         asg.story_id, r.presentation_type, asg.template_slug, r.duration_seconds, r.created_at, a.attempt_no, a.mode,
         a.is_final_take, r.has_audio, r.has_shared_screen
    FROM presentation_recordings r
    JOIN presentation_attempts a ON a.id = r.attempt_id
    JOIN presentation_assignments asg ON asg.id = a.assignment_id
    JOIN enrollments e ON e.id = asg.enrollment_id
    LEFT JOIN projects p ON p.id = asg.project_id
   WHERE r.ingest_status = 'ingested' AND ${ACTIVE_INTERN}`;

export const typeLabelOf = (typeId: string | null): string => (typeId ? templateById(typeId)?.label ?? typeId.replace(/_/g, ' ') : 'Presentation');

export function shapeTake(r: Row): InternVideoTake {
  const typeId = r.presentation_type || r.template_slug || null;
  return {
    recordingId: r.recording_id, typeId, typeLabel: typeLabelOf(typeId), storyId: r.story_id,
    durationSeconds: r.duration_seconds === null || r.duration_seconds === undefined ? null : Number(r.duration_seconds),
    recordedAt: new Date(r.created_at).toISOString(), attemptNo: r.attempt_no, mode: r.mode, isFinalTake: !!r.is_final_take,
  };
}

export async function getInternVideo(recordingId: string, staffIdentity: string): Promise<InternVideoView | null> {
  const rows = await sequelize.query<Row>(`${SELECT} AND r.id = :id LIMIT 1`, { replacements: { id: recordingId }, type: QueryTypes.SELECT });
  const r = rows[0];
  if (!r) return null;
  const takes = await sequelize.query<Row>(`${SELECT} AND asg.enrollment_id = :e ORDER BY r.created_at DESC`, { replacements: { e: r.enrollment_id }, type: QueryTypes.SELECT });
  const t = encodeURIComponent(createStaffRecordingTicket(r.recording_id, staffIdentity, VIEWER_TICKET_TTL_SECONDS));
  const base = `${BASE}/${encodeURIComponent(r.recording_id)}`;
  return {
    ...shapeTake(r), intern: r.intern, enrollmentId: r.enrollment_id, projectName: r.project_name,
    hasAudio: r.has_audio, hasSharedScreen: r.has_shared_screen,
    fileUrl: `${base}/file?t=${t}`, thumbnailUrl: `${base}/thumbnail?t=${t}`,
    takes: takes.map(shapeTake),
  };
}
