import { getOwnedProjectTree } from '../projects/projectReadService';
import PresentationAssignment from '../../models/PresentationAssignment';

/**
 * Where a student's demo sits inside a cohort recording.
 *
 * WHY THIS IS A RANGE AND NOT A FILE. Demo day produces one unbroken recording of
 * eleven presenters. Handing a student that file and calling it "your demo" is
 * false twice over: most of it is other people, and some of those people did not
 * agree to appear on their task. So the recording belongs to the session, and each
 * presenter gets a time range into it.
 *
 * THE RANGE IS AN ESTIMATE AND SAYS SO. It is derived from the SCHEDULED slot, not
 * from anything measured in the video. Presenters start late, run over, and swap
 * order on the day. A range presented as fact would send a reviewer to the wrong
 * ninety seconds and make them doubt the recording rather than the timestamp. Every
 * value this returns is marked `estimated: true` with the basis that produced it.
 *
 * CLIPPING IS NOT AVAILABLE, AND THAT IS STATED RATHER THAN IMPLIED. There is no
 * video-cutting pipeline in this platform, so no per-student file exists or can be
 * produced today. `clipAvailable: false` is returned explicitly so a caller cannot
 * mistake "no clip URL yet" for "still processing".
 */

/** Lazy so importing this module never constructs the ORM. */
async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

export interface SegmentView {
  recordingId: string;
  occurrenceUuid: string;
  /** Seconds from the start of the recording. */
  startOffsetSeconds: number;
  endOffsetSeconds: number;
  /** ALWAYS true today: the range comes from the schedule, not from the video. */
  estimated: true;
  basis: 'scheduled_slot';
  /** ALWAYS false today: this platform has no clipping pipeline. */
  clipAvailable: false;
  /** Why no clip, in words a student can read. */
  clipNote: string;
  /** True when the recording covers other presenters as well. */
  sharedWithOthers: boolean;
}

export type SegmentResult =
  | { ok: true; segment: SegmentView | null }
  | { ok: false; reason: 'not_found' };

const CLIP_NOTE =
  'This is one recording of the whole session. We can point you at your minutes in it, '
  + 'but we cannot cut it into a separate clip yet.';

/**
 * The student's own segment, or null when there is nothing to point at.
 *
 * Ownership is proved the same way every other read on this surface proves it, and
 * a miss is `not_found` rather than `forbidden`.
 */
export async function segmentForAttempt(
  enrollmentId: string,
  projectId: string,
  storyId: string,
): Promise<SegmentResult> {
  const tree = await getOwnedProjectTree(enrollmentId, projectId);
  if (!tree) return { ok: false, reason: 'not_found' };

  const assignment = await PresentationAssignment.findOne({
    where: { project_id: projectId, story_id: storyId },
  });
  if (!assignment) return { ok: false, reason: 'not_found' };

  const sequelize = await db();

  // The learner's slot, and the session recording that covers it. Joined on the
  // BOOKING rather than on the attempt, because a session recording deliberately
  // belongs to no single attempt.
  const [rows] = await sequelize.query(
    `SELECT r.id            AS recording_id,
            r.occurrence_uuid,
            r.starts_at     AS rec_starts_at,
            r.ends_at       AS rec_ends_at,
            s.starts_at     AS slot_starts_at,
            s.duration_seconds,
            (SELECT COUNT(*) FROM presentation_presenter_slots x
              WHERE x.booking_id = s.booking_id AND x.state <> 'cancelled') AS presenter_count
       FROM presentation_presenter_slots s
       JOIN presentation_attempts a
         ON a.assignment_id = s.assignment_id AND a.booking_id = s.booking_id
       JOIN presentation_recordings r
         ON r.occurrence_uuid = a.occurrence_uuid
      WHERE s.assignment_id = :aid
        AND s.state <> 'cancelled'
        AND r.ingest_status NOT IN ('missing', 'failed')
      ORDER BY r.part_no ASC
      LIMIT 1`,
    { replacements: { aid: String(assignment.id) } },
  ) as [Array<Record<string, any>>, unknown];

  const row = rows?.[0];
  if (!row) return { ok: true, segment: null };

  // Without both anchors there is no honest offset to give. Returning 0 would be a
  // number that looks measured and is not.
  if (!row.rec_starts_at || !row.slot_starts_at) return { ok: true, segment: null };

  const recStart = new Date(row.rec_starts_at).getTime();
  const slotStart = new Date(row.slot_starts_at).getTime();
  const durationSeconds = Number(row.duration_seconds ?? 600);

  // A slot that begins before the recording did clamps to 0 rather than going
  // negative: the presenter cannot be at minute -3 of a video.
  const startOffsetSeconds = Math.max(0, Math.round((slotStart - recStart) / 1000));

  return {
    ok: true,
    segment: {
      recordingId: String(row.recording_id),
      occurrenceUuid: String(row.occurrence_uuid),
      startOffsetSeconds,
      endOffsetSeconds: startOffsetSeconds + Math.max(1, durationSeconds),
      estimated: true,
      basis: 'scheduled_slot',
      clipAvailable: false,
      clipNote: CLIP_NOTE,
      sharedWithOthers: Number(row.presenter_count ?? 1) > 1,
    },
  };
}
