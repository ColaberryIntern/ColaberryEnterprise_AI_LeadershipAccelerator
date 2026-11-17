/**
 * govDemoVideos - the assigned intern's recorded demo videos (Presentation Studio ingested takes), surfaced in the
 * gov cockpit's Build artifacts section.
 *
 * Ali, 17 Nov 2026: an intern records her demos in-app ("Record Your Working-System Demo" and the other
 * Presentation Studio takes), and the admin cockpit should show those videos in Build artifacts, so any demo she
 * records "always ends up in this path". This resolves the contract's assigned intern and lists ALL her ingested
 * takes, newest first.
 *
 * Playback reuses the existing admin video route: GET /api/internship-video/:id/file is authorized ONLY by a
 * signed, recording-bound STAFF ticket (routes/internVideoStreamRoutes.ts). We mint that ticket here from the
 * admin's own identity, so the <video src> plays without a session. No secret is returned; the ticket is short-lived.
 *
 * Scope/security: ADMIN-ONLY (the caller passes the admin's identity). Recordings are scoped strictly to the
 * resolved enrollment; the owner is resolved through the gov project's own `solution_build` track -> student
 * project -> enrollment. A take recorded against any of the intern's projects surfaces here, which is what "always
 * end up in this path" asks for.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { createStaffRecordingTicket } from '../presentation/recordingTicket';
import { typeLabelOf, VIEWER_TICKET_TTL_SECONDS } from '../internship/internVideoViewer';

export interface GovContractOwner { enrollmentId: string; name: string | null }

/** The gov contract's assigned intern (the `solution_build` track's student project owner). Null when none linked. */
export async function resolveGovContractOwner(deliveryProjectId: string): Promise<GovContractOwner | null> {
  const rows = await sequelize.query<{ enrollment_id: string | null; name: string | null }>(
    `SELECT p.enrollment_id,
            COALESCE(NULLIF(TRIM(e.full_name), ''), e.email) AS name
       FROM contract_tracks ct
       JOIN projects p ON p.id = ct.solution_student_project_id
       JOIN enrollments e ON e.id = p.enrollment_id
      WHERE ct.delivery_project_id = :dp AND ct.track_type = 'solution_build'
        AND ct.solution_student_project_id IS NOT NULL
      LIMIT 1`,
    { replacements: { dp: deliveryProjectId }, type: QueryTypes.SELECT },
  );
  const r = rows[0];
  if (!r || !r.enrollment_id) return null;
  return { enrollmentId: String(r.enrollment_id), name: r.name ? String(r.name) : null };
}

/** One recorded demo video (a Presentation Studio ingested take), shaped for the gov cockpit's Build artifacts.
 *  fileUrl/thumbnailUrl are ticketed, same-origin paths usable directly as <video src> / poster. No identity beyond
 *  the ticket, which is recording-bound and short-lived. */
export interface GovDemoVideo {
  recordingId: string;
  typeLabel: string;
  storyId: string | null;
  durationSeconds: number | null;
  recordedAt: string;
  fileUrl: string;
  thumbnailUrl: string;
}

interface VideoRow {
  recording_id: string; story_id: string | null; presentation_type: string | null; template_slug: string | null;
  duration_seconds: number | null; created_at: string | Date;
}

/**
 * Every ingested demo take by this enrollment, newest first, ticketed for the admin video route. The ticket is
 * minted per recording from the admin's identity and bound to that one recording.
 */
export async function listGovDemoVideos(enrollmentId: string, staffIdentity: string): Promise<GovDemoVideo[]> {
  const rows = await sequelize.query<VideoRow>(
    `SELECT r.id AS recording_id, asg.story_id, r.presentation_type, asg.template_slug,
            r.duration_seconds, r.created_at
       FROM presentation_recordings r
       JOIN presentation_attempts a ON a.id = r.attempt_id
       JOIN presentation_assignments asg ON asg.id = a.assignment_id
      WHERE asg.enrollment_id = :eid AND r.ingest_status = 'ingested'
      ORDER BY r.created_at DESC
      LIMIT 50`,
    { replacements: { eid: enrollmentId }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => {
    const rid = String(r.recording_id);
    const t = encodeURIComponent(createStaffRecordingTicket(rid, staffIdentity, VIEWER_TICKET_TTL_SECONDS));
    const base = `/api/internship-video/${encodeURIComponent(rid)}`;
    const typeId = r.presentation_type || r.template_slug || null;
    return {
      recordingId: rid,
      typeLabel: typeLabelOf(typeId),
      storyId: r.story_id ? String(r.story_id) : null,
      durationSeconds: r.duration_seconds === null || r.duration_seconds === undefined ? null : Number(r.duration_seconds),
      recordedAt: new Date(r.created_at).toISOString(),
      fileUrl: `${base}/file?t=${t}`,
      thumbnailUrl: `${base}/thumbnail?t=${t}`,
    };
  });
}
