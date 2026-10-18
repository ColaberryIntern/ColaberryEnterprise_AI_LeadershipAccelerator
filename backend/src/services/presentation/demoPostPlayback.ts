/**
 * TURNING A demo_video POST INTO SOMETHING A PEER CAN ACTUALLY PLAY.
 *
 * Publishing a demo already produced a `community_posts` row with
 * `category: 'demo_video'` and a recording ref in `ritual_meta`. Nothing read that
 * ref, so the cohort got a text post: the author was told their demo was shared,
 * and not one person could press play. Every other piece was in place — the
 * audience rule, the signed ticket, Range support — and the last few inches were
 * missing.
 *
 * THE REF NAMES THE RECORDING, NEVER A FILE. Community media is served by
 * `res.sendFile` with no auth and capped at 8 MB; putting a rehearsal there would
 * publish it on an unauthenticated path. The ref resolves to the ticketed playback
 * route instead, which re-checks the audience on every request.
 *
 * THE AUDIENCE IS CHECKED HERE, PER VIEWER, not baked into the post. Two people
 * scrolling the same feed can legitimately get different answers — the author, a
 * cohort-mate and a stranger are three different cases — so a URL is minted only
 * for the viewer asking, and a viewer who may not watch simply gets none.
 */

async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `recording:<uuid>` — anything else is from before per-recording keying, or junk. */
export function recordingIdFromRef(ref: unknown): string | null {
  if (typeof ref !== 'string') return null;
  const m = /^recording:([0-9a-f-]{36})$/i.exec(ref.trim());
  return m && UUID.test(m[1]) ? m[1] : null;
}

export interface DemoPlayback {
  postId: string;
  recordingId: string;
  /** Carries its own signed ticket: a <video> cannot send a bearer. */
  playbackUrl: string;
  durationSeconds: number | null;
  viewCount: number;
  viewLabel: string;
}

/**
 * For each demo post this viewer can watch, the URL that plays it.
 *
 * Posts the viewer may NOT watch are simply absent from the result rather than
 * present with a null url — the card then renders as an ordinary post, and the
 * page never has to decide what a half-resolved demo looks like.
 */
export async function resolveDemoPlayback(
  viewerEnrollmentId: string,
  posts: Array<{ id: string; ritual_meta?: Record<string, unknown> | null }>,
): Promise<Record<string, DemoPlayback>> {
  const wanted: Array<{ postId: string; recordingId: string }> = [];
  for (const p of posts || []) {
    const rid = recordingIdFromRef((p.ritual_meta || {})['recording_ref']);
    if (rid) wanted.push({ postId: String(p.id), recordingId: rid });
  }
  if (wanted.length === 0) return {};

  // ONE QUERY for the whole page. A feed of twenty demos must not become twenty
  // round trips, and the audience predicate is the same for all of them.
  const sequelize = await db();
  const ids = Array.from(new Set(wanted.map((w) => w.recordingId)));
  const [rows] = await sequelize.query(
    `SELECT r.id                AS recording_id,
            r.duration_seconds,
            asg.project_id,
            asg.story_id,
            asg.enrollment_id   AS owner_enrollment_id,
            asg.cohort_id,
            s.id                AS showcase_id,
            s.audience,
            s.content_hash,
            s.draft_json->>'current_content_hash' AS current_content_hash,
            s.author_approved_at, s.staff_approved_at, s.published_at, s.withdrawn_at
       FROM presentation_recordings  r
       JOIN presentation_attempts    a   ON a.id = r.attempt_id
       JOIN presentation_assignments asg ON asg.id = a.assignment_id
       JOIN presentation_showcases   s   ON s.recording_id = r.id AND s.withdrawn_at IS NULL
      WHERE r.id IN (:ids) AND r.ingest_status = 'ingested'`,
    { replacements: { ids } },
  ) as [Array<Record<string, any>>, unknown];

  if (!rows?.length) return {};

  // The viewer's cohort is read FRESH rather than taken from a session claim: a
  // learner removed from a cohort must stop seeing its demos immediately.
  const { default: Enrollment } = await import('../../models/Enrollment');
  const viewer = await Enrollment.findByPk(viewerEnrollmentId);
  if (!viewer) return {};

  const { canView } = await import('./showcaseAccess');
  const { viewCounts, describeViews } = await import('./recordingViews');
  const counts = await viewCounts(ids);
  const { createRecordingTicket } = await import('./recordingTicket');

  const byRecording = new Map<string, Record<string, any>>();
  for (const r of rows) byRecording.set(String(r.recording_id), r);

  const out: Record<string, DemoPlayback> = {};
  for (const { postId, recordingId } of wanted) {
    const r = byRecording.get(recordingId);
    if (!r) continue;

    // ONE policy, not two: `canView` already grants the owner and staff, so a
    // separate owner short-circuit here would be a second copy of an access rule
    // that drifts until the quieter one is wrong.
    const allowed = canView(
      {
        id: String(r.showcase_id),
        ownerEnrollmentId: String(r.owner_enrollment_id),
        cohortId: r.cohort_id ? String(r.cohort_id) : null,
        audience: r.audience,
        contentHash: r.content_hash,
        currentContentHash: r.current_content_hash,
        authorApprovedAt: r.author_approved_at,
        staffApprovedAt: r.staff_approved_at,
        publishedAt: r.published_at,
        withdrawnAt: r.withdrawn_at,
      },
      {
        enrollmentId: viewerEnrollmentId,
        cohortId: (viewer as any).cohort_id ? String((viewer as any).cohort_id) : null,
        isStaff: false,
      },
      'media',
    );
    // Absent, not null: a viewer who may not watch gets an ordinary post.
    if (!allowed) continue;

    const n = counts[recordingId] ?? 0;
    out[postId] = {
      postId,
      recordingId,
      playbackUrl: `/api/portal/projects/${encodeURIComponent(String(r.project_id))}`
        + `/tasks/${encodeURIComponent(String(r.story_id))}`
        + `/recordings/${encodeURIComponent(recordingId)}/file`
        + `?t=${encodeURIComponent(createRecordingTicket(recordingId, viewerEnrollmentId))}`,
      durationSeconds: r.duration_seconds === null || r.duration_seconds === undefined
        ? null
        : Number(r.duration_seconds),
      viewCount: n,
      viewLabel: describeViews(n),
    };
  }
  return out;
}
