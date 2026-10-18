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
 */

async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

export interface PendingShowcase {
  showcaseId: string;
  attemptId: string;
  /** The blurb the cohort would read. The reviewer is approving this too. */
  summary: string | null;
  requestedAt: string | null;
  learnerName: string | null;
  learnerEmail: string | null;
  cohortId: string | null;
  cohortName: string | null;
  projectId: string | null;
  storyId: string | null;
  /** Ingested takes on the attempt, so a reviewer can see there is something to watch. */
  recordingCount: number;
  durationSeconds: number | null;
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
export async function listPendingShowcases(limit = 100): Promise<PendingShowcase[]> {
  const sequelize = await db();
  const [rows] = await sequelize.query(
    `SELECT s.id                               AS showcase_id,
            s.attempt_id,
            s.draft_json->>'summary'           AS summary,
            s.draft_json->>'current_content_hash' AS current_content_hash,
            s.content_hash,
            s.author_approved_at,
            asg.project_id,
            asg.story_id,
            asg.cohort_id,
            e.full_name                        AS learner_name,
            e.email                            AS learner_email,
            c.name                             AS cohort_name,
            COUNT(r.id)                        AS recording_count,
            MAX(r.duration_seconds)            AS duration_seconds
       FROM presentation_showcases   s
       JOIN presentation_attempts    a   ON a.id = s.attempt_id
       JOIN presentation_assignments asg ON asg.id = a.assignment_id
       JOIN enrollments              e   ON e.id = asg.enrollment_id
       LEFT JOIN cohorts             c   ON c.id = asg.cohort_id
       LEFT JOIN presentation_recordings r
              ON r.attempt_id = a.id AND r.ingest_status = 'ingested'
      WHERE s.author_approved_at IS NOT NULL
        AND s.staff_approved_at  IS NULL
        AND s.published_at       IS NULL
        AND s.withdrawn_at       IS NULL
      GROUP BY s.id, asg.project_id, asg.story_id, asg.cohort_id,
               e.full_name, e.email, c.name
      ORDER BY s.author_approved_at ASC
      LIMIT :limit`,
    { replacements: { limit } },
  ) as [Array<Record<string, any>>, unknown];

  return (rows || []).map((r) => ({
    showcaseId: String(r.showcase_id),
    attemptId: String(r.attempt_id),
    summary: r.summary ?? null,
    requestedAt: r.author_approved_at ? new Date(r.author_approved_at).toISOString() : null,
    learnerName: r.learner_name ?? null,
    learnerEmail: r.learner_email ?? null,
    cohortId: r.cohort_id ? String(r.cohort_id) : null,
    cohortName: r.cohort_name ?? null,
    projectId: r.project_id ? String(r.project_id) : null,
    storyId: r.story_id ?? null,
    recordingCount: Number(r.recording_count) || 0,
    durationSeconds: r.duration_seconds === null || r.duration_seconds === undefined
      ? null
      : Number(r.duration_seconds),
    // Both present and different. A missing hash is not evidence of a change, and
    // calling it stale would make every row shout.
    stale: Boolean(r.content_hash && r.current_content_hash && r.content_hash !== r.current_content_hash),
  }));
}
