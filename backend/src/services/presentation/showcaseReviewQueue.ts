/**
 * WHAT IS WAITING FOR A STAFF DECISION.
 *
 * `approveAndPublish` could approve a showcase by id since Phase 6, and nothing
 * could tell a staff member WHICH ids were waiting. An approval queue you cannot
 * enumerate is one nobody works: a student asks to share, and their request sits
 * where no screen shows it until somebody happens to query the database.
 *
 * PENDING MEANS: the author has asked, no staff member has agreed, and it has not
 * been taken back down. Not published and not withdrawn are both part of the
 * definition — a withdrawn request is history, and re-offering it for approval
 * would publish something the learner has already changed their mind about.
 *
 * THE SUMMARY COMES ALONG, because the decision is about the words as much as the
 * video. A reviewer approving on a filename is not reviewing.
 *
 * SO DOES A PLAYABLE URL, added 2026-10-23 along with the route and the screen
 * that finally call this. The first version of this file shipped on 2026-10-18
 * with no caller, no route and no tests: the queue existed as a function nobody
 * invoked, which is the same dead end it was written to fix. It also predated the
 * re-keying of showcases onto `recording_id`, so it could say "3 takes on this
 * attempt" but not WHICH take was being published — and a reviewer who cannot
 * name the video cannot approve it.
 */

import { templateById } from '.';
import { createStaffRecordingTicket } from './recordingTicket';

async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

/** Long enough to watch a full rehearsal before deciding, rather than the 10 a learner gets. */
const REVIEW_TICKET_TTL_SECONDS = 1800;

export interface PendingShowcase {
  showcaseId: string;
  attemptId: string;
  /**
   * The ONE take being published. Showcases were re-keyed from the attempt to the
   * recording on 2026-10-18 — a learner sharing their third take must not also
   * publish the first two — so the reviewer is deciding about this recording, not
   * about the attempt it belongs to.
   */
  recordingId: string | null;
  /** The blurb the cohort would read. The reviewer is approving this too. */
  summary: string | null;
  requestedAt: string | null;
  learnerName: string | null;
  learnerEmail: string | null;
  cohortId: string | null;
  cohortName: string | null;
  projectId: string | null;
  storyId: string | null;
  /** What kind of presentation, resolved the same way the learner's grid resolves it. */
  typeId: string | null;
  typeLabel: string | null;
  /** Ingested takes on the attempt, so a reviewer can see there is something to watch. */
  recordingCount: number;
  durationSeconds: number | null;
  /**
   * Signed, staff-scoped and short-lived, so the reviewer can WATCH the thing they
   * are vouching for. Null when the showcase names no recording — which is itself
   * worth showing rather than hiding, because it cannot be approved sight unseen.
   */
  playbackUrl: string | null;
  thumbnailUrl: string | null;
  /**
   * True when the take has changed since the author asked. The approval would be
   * for footage nobody reviewed, so the queue says so rather than letting a
   * reviewer vouch for something they have not seen.
   */
  stale: boolean;
}

/**
 * Everything awaiting a decision, oldest request first.
 *
 * OLDEST FIRST on purpose: a review queue sorted newest-first starves the requests
 * that have waited longest, which are precisely the ones a student has given up on.
 */
export async function listPendingShowcases(
  staffIdentity: string,
  limit = 100,
): Promise<PendingShowcase[]> {
  const sequelize = await db();
  const [rows] = await sequelize.query(
    `SELECT s.id                               AS showcase_id,
            s.attempt_id,
            s.recording_id,
            s.draft_json->>'summary'           AS summary,
            s.draft_json->>'current_content_hash' AS current_content_hash,
            s.content_hash,
            s.author_approved_at,
            asg.project_id,
            asg.story_id,
            asg.cohort_id,
            asg.template_slug,
            e.full_name                        AS learner_name,
            e.email                            AS learner_email,
            c.name                             AS cohort_name,
            -- The take being published, which the showcase names directly.
            shown.presentation_type            AS shown_type,
            shown.duration_seconds             AS shown_duration,
            COUNT(r.id)                        AS recording_count
       FROM presentation_showcases   s
       JOIN presentation_attempts    a   ON a.id = s.attempt_id
       JOIN presentation_assignments asg ON asg.id = a.assignment_id
       JOIN enrollments              e   ON e.id = asg.enrollment_id
       LEFT JOIN cohorts             c   ON c.id = asg.cohort_id
       LEFT JOIN presentation_recordings shown ON shown.id = s.recording_id
       LEFT JOIN presentation_recordings r
              ON r.attempt_id = a.id AND r.ingest_status = 'ingested'
      WHERE s.author_approved_at IS NOT NULL
        AND s.staff_approved_at  IS NULL
        AND s.published_at       IS NULL
        AND s.withdrawn_at       IS NULL
      GROUP BY s.id, asg.project_id, asg.story_id, asg.cohort_id, asg.template_slug,
               e.full_name, e.email, c.name, shown.presentation_type, shown.duration_seconds
      ORDER BY s.author_approved_at ASC
      LIMIT :limit`,
    { replacements: { limit } },
  ) as [Array<Record<string, any>>, unknown];

  return (rows || []).map((r) => {
    const recordingId = r.recording_id ? String(r.recording_id) : null;
    // A take with no classification of its own inherits the task's, exactly as the
    // portfolio grid resolves it. One rule, so the reviewer and the learner are
    // told the same thing about the same video.
    const typeId = r.shown_type || r.template_slug || null;

    let playbackUrl: string | null = null;
    let thumbnailUrl: string | null = null;
    if (recordingId) {
      const t = encodeURIComponent(
        createStaffRecordingTicket(recordingId, staffIdentity, REVIEW_TICKET_TTL_SECONDS),
      );
      const base = `/api/admin/presentation/recordings/${encodeURIComponent(recordingId)}`;
      playbackUrl = `${base}/file?t=${t}`;
      thumbnailUrl = `${base}/thumbnail?t=${t}`;
    }

    return {
      showcaseId: String(r.showcase_id),
      attemptId: String(r.attempt_id),
      recordingId,
      summary: r.summary ?? null,
      requestedAt: r.author_approved_at ? new Date(r.author_approved_at).toISOString() : null,
      learnerName: r.learner_name ?? null,
      learnerEmail: r.learner_email ?? null,
      cohortId: r.cohort_id ? String(r.cohort_id) : null,
      cohortName: r.cohort_name ?? null,
      projectId: r.project_id ? String(r.project_id) : null,
      storyId: r.story_id ?? null,
      typeId,
      typeLabel: typeId ? (templateById(typeId)?.label ?? typeId) : null,
      recordingCount: Number(r.recording_count) || 0,
      durationSeconds: r.shown_duration === null || r.shown_duration === undefined
        ? null
        : Number(r.shown_duration),
      playbackUrl,
      thumbnailUrl,
      // Both present and different. A missing hash is not evidence of a change, and
      // calling it stale would make every row shout.
      stale: Boolean(r.content_hash && r.current_content_hash && r.content_hash !== r.current_content_hash),
    };
  });
}
