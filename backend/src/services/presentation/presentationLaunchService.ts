import { getOwnedProjectTree } from '../projects/projectReadService';
import PresentationAssignment from '../../models/PresentationAssignment';
import PresentationAttempt from '../../models/PresentationAttempt';
import RoomBooking from '../../models/RoomBooking';

/**
 * Handing a student the link, at the moment they ask for it.
 *
 * THE LINK IS NEVER IN A PAGE PAYLOAD. Every read route returns `meetingReady`
 * only. The URL is issued here, by a POST, and `roomBookingService.joinBooking`
 * re-checks the caller's room entitlement on that call — so a revoked permission
 * takes effect immediately instead of at the next page load.
 *
 * THE PROVIDER'S HOST URL IS NEVER INVOLVED. Zoom returns a second, privileged link
 * alongside the join link, which starts the meeting AS THE HOST: mute anyone, remove
 * anyone, end it for everybody. This backend never fetches or stores it anywhere, and
 * `presentationLaunchGuard.test.ts` enforces that by scanning product source for its
 * field name. That guard is why this comment describes the field instead of naming
 * it — the literal string belongs only in the test that forbids it.
 *
 * THE ATTENDANCE AWARD IS SUPPRESSED FOR ROOMS THE STUDENT MINTS THEMSELVES.
 * `joinBooking` pays 5 points and 5 community XP for showing up, idempotent per
 * BOOKING. That is right for a session someone else scheduled and wrong for a solo
 * rehearsal a learner can create on demand — otherwise "book, join, repeat" is a
 * points faucet. Only `cohort_live`, which an instructor schedules, still earns it.
 *
 * NOTHING HERE COMPLETES A TASK. Joining a room is not evidence of presenting.
 */

export interface LaunchInput {
  enrollmentId: string;
  cohortId?: string | null;
  isStaff?: boolean;
  projectId: string;
  storyId: string;
  attemptId: string;
}

/** What the get-ready screen must tell a student BEFORE they are in the room. */
export interface LaunchBrief {
  /** Plain words, not a privacy enum: "only you" / "your cohort" / "anyone". */
  whoCanSee: string;
  /** True when the provider starts recording without anyone pressing anything. */
  recordingAutomatic: boolean;
  recordingPolicy: string;
}

export type LaunchResult =
  | { ok: true; joinUrl: string; attemptId: string; brief: LaunchBrief }
  | { ok: false; reason: 'not_found' | 'not_booked' | 'not_ready' | 'not_authorized' };

function briefFor(booking: RoomBooking): LaunchBrief {
  const privacy = String(booking.privacy || 'public');
  const whoCanSee =
    privacy === 'private' ? 'Only you. This is a private rehearsal room.'
      : privacy === 'cohort' ? 'Your cohort can see this session.'
        : privacy === 'invite_only' ? 'Only people invited to this room.'
          : 'Anyone in the community can see this session.';
  const policy = String(booking.recording_policy || 'ask');
  return { whoCanSee, recordingAutomatic: policy === 'always', recordingPolicy: policy };
}

/**
 * Resolve the attempt, prove it is this learner's, and issue the join URL.
 *
 * The attempt is re-read and matched back to the assignment rather than trusted
 * from the request: an attempt id is guessable, and ownership of the PROJECT does
 * not by itself prove ownership of an arbitrary attempt row.
 */
export async function launchAttempt(input: LaunchInput): Promise<LaunchResult> {
  const tree = await getOwnedProjectTree(input.enrollmentId, input.projectId);
  if (!tree) return { ok: false, reason: 'not_found' };

  const assignment = await PresentationAssignment.findOne({
    where: { project_id: input.projectId, story_id: input.storyId },
  });
  if (!assignment) return { ok: false, reason: 'not_found' };

  const attempt = await PresentationAttempt.findByPk(input.attemptId);
  // A foreign attempt is reported as not_found, never as forbidden, so probing
  // attempt ids tells an attacker nothing about which ones exist.
  if (!attempt || String(attempt.assignment_id) !== String(assignment.id)) {
    return { ok: false, reason: 'not_found' };
  }
  if (!attempt.booking_id) return { ok: false, reason: 'not_booked' };

  const booking = await RoomBooking.findByPk(String(attempt.booking_id));
  if (!booking) return { ok: false, reason: 'not_booked' };

  const { joinBooking } = await import('../communityRooms/roomBookingService');
  try {
    const { join_url } = await joinBooking(
      { enrollmentId: input.enrollmentId, cohortId: input.cohortId ?? null, isAdmin: input.isStaff === true },
      String(attempt.booking_id),
      // Only an instructor-scheduled session pays the attendance award.
      { recognize: attempt.mode === 'cohort_live' },
    );
    // The outbox provisions the link asynchronously; "not yet" is a real state and
    // a truthful answer, not an error to dress up.
    if (!join_url) return { ok: false, reason: 'not_ready' };

    await attempt.update({ join_intent_at: attempt.join_intent_at || new Date() });
    return { ok: true, joinUrl: join_url, attemptId: String(attempt.id), brief: briefFor(booking) };
  } catch (e) {
    if ((e as { status?: number })?.status === 403) return { ok: false, reason: 'not_authorized' };
    throw e;
  }
}
