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

import { presentationTypeLabel } from './takePresentationType';

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
  /**
   * The poster. Same ticket, same audience rule — a still of a private rehearsal
   * is the learner's face, so it is not served on a looser rule than the footage.
   * The card tolerates a 404 here: a camera-off recording has no frame worth
   * showing, and a missing picture must never break a working demo.
   */
  thumbnailUrl: string;
  durationSeconds: number | null;
  viewCount: number;
  viewLabel: string;
  /**
   * What kind of presentation this is, so a viewer can tell a 90-second project
   * introduction from a full showcase before pressing play.
   *
   * READ LIVE from the recording rather than frozen into the post at publish
   * time: the type describes the video, the video has not changed, and a learner
   * who reclassifies a take should see the feed agree with them.
   */
  presentationType: string | null;
  presentationTypeLabel: string | null;
}

/**
 * For each demo post this viewer can watch, the URL that plays it.
 *
 * Posts the viewer may NOT watch are simply absent from the result rather than
 * present with a null url — the card then renders as an ordinary post, and the
 * page never has to decide what a half-resolved demo looks like.
 */
/**
 * For each demo post this viewer can watch, the URL that plays it.
 *
 * TAKES POST IDS, NOT POST OBJECTS, and reads the ref from the database itself.
 * The first version read `ritual_meta` off the objects the feed had already built
 * — and `toFeedItem` constructs an explicit DTO that does not carry it, so every
 * demo resolved to nothing and the card never rendered, with no error anywhere.
 * Depending on a caller's shape for a field it had every right not to expose was
 * the mistake; the ref lives in `community_posts`, so this reads it from there.
 *
 * Posts the viewer may NOT watch are simply absent from the result rather than
 * present with a null url — the card then renders as an ordinary post, and the
 * page never has to decide what a half-resolved demo looks like.
 */
export async function resolveDemoPlayback(
  viewerEnrollmentId: string,
  postIds: string[],
): Promise<Record<string, DemoPlayback>> {
  const ids = (postIds || []).map(String).filter((id) => UUID.test(id));
  if (ids.length === 0) return {};

  // ONE QUERY for the whole page. A feed of twenty demos must not become twenty
  // round trips, and the audience predicate is the same for all of them.
  //
  // The ref is matched by STRING rather than cast to a uuid: a legacy row holding
  // `recording:<attempt_id>` is syntactically valid and casts fine, so a cast would
  // not protect anything, while a malformed ref would abort the whole query.
  // Matching against `r.id::text` simply finds nothing, which is the right answer.
  const sequelize = await db();
  const [rows] = await sequelize.query(
    `SELECT p.id                AS post_id,
            r.id                AS recording_id,
            r.duration_seconds,
            r.presentation_type,
            asg.template_slug,
            asg.project_id,
            asg.story_id,
            asg.enrollment_id   AS owner_enrollment_id,
            asg.cohort_id,
            s.id                AS showcase_id,
            s.audience,
            s.content_hash,
            s.draft_json->>'current_content_hash' AS current_content_hash,
            s.author_approved_at, s.staff_approved_at, s.published_at, s.withdrawn_at
       FROM community_posts         p
       JOIN presentation_recordings r
              ON p.ritual_meta->>'recording_ref' = 'recording:' || r.id::text
             AND r.ingest_status = 'ingested'
       JOIN presentation_attempts    a   ON a.id = r.attempt_id
       JOIN presentation_assignments asg ON asg.id = a.assignment_id
       JOIN presentation_showcases   s   ON s.recording_id = r.id AND s.withdrawn_at IS NULL
      WHERE p.id IN (:ids)`,
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
  // Counted on the RECORDINGS the query actually found, not on the post ids.
  const counts = await viewCounts(rows.map((r) => String(r.recording_id)));
  const { createRecordingTicket } = await import('./recordingTicket');

  const out: Record<string, DemoPlayback> = {};
  for (const r of rows) {
    const postId = String(r.post_id);
    const recordingId = String(r.recording_id);

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
    // ONE ticket and ONE base for both urls: minted twice they could differ in
    // expiry, and a poster that outlives its player is a broken-looking card.
    const base = `/api/portal/projects/${encodeURIComponent(String(r.project_id))}`
      + `/tasks/${encodeURIComponent(String(r.story_id))}`
      + `/recordings/${encodeURIComponent(recordingId)}`;
    const ticket = encodeURIComponent(createRecordingTicket(recordingId, viewerEnrollmentId));

    out[postId] = {
      postId,
      recordingId,
      playbackUrl: `${base}/file?t=${ticket}`,
      thumbnailUrl: `${base}/thumbnail?t=${ticket}`,
      durationSeconds: r.duration_seconds === null || r.duration_seconds === undefined
        ? null
        : Number(r.duration_seconds),
      viewCount: n,
      viewLabel: describeViews(n),
      // The take's own classification, falling back to the task's, exactly as the
      // Practice panel resolves it — one rule, so the badge and the chooser agree.
      presentationType: r.presentation_type || r.template_slug || null,
      presentationTypeLabel: presentationTypeLabel(r.presentation_type || r.template_slug),
    };
  }
  return out;
}
