import { getOwnedProjectTree } from '../projects/projectReadService';
import PresentationAssignment from '../../models/PresentationAssignment';
import PresentationAttempt from '../../models/PresentationAttempt';
import RoomBooking from '../../models/RoomBooking';
import type { PresentationAttemptMode } from '../../models/PresentationAttempt';

/**
 * Which room a learner's demo actually happens in.
 *
 * WHY THE BOOKING HANGS OFF THE ATTEMPT, NOT THE ASSIGNMENT. An assignment is "this
 * student must present PREP-3". A student may rehearse it four times and present it
 * once, each in a different room, and the recording of take three has to stay
 * attached to take three. Hanging one `booking_id` off the assignment would make the
 * fourth rehearsal overwrite the first three. `presentation_attempts.booking_id`
 * already exists and is indexed for exactly this, so this module adds no schema.
 *
 * WHY NO JOIN URL IS RETURNED HERE. `roomBookingService.joinBooking` re-checks the
 * caller's entitlement on every single call and is the only sanctioned way to hand
 * out a join link. If this read-path DTO carried the URL, entitlement would be
 * evaluated once at page load and the link would stay valid in the payload after
 * access was revoked. So the DTO carries `meetingReady` — whether a meeting exists —
 * and the student fetches the URL at launch. The provider's privileged host/start
 * URL is never projected anywhere in this file.
 *
 * NOTHING HERE COMPLETES A TASK, and nothing here awards points.
 */

/** A room/session as a learner may see it. Deliberately has no URL field. */
export interface SessionView {
  attemptId: string;
  attemptNo: number;
  mode: PresentationAttemptMode;
  attemptState: string;
  recordingState: string;
  bookingId: string | null;
  roomId: string | null;
  title: string | null;
  /** ISO-8601, or null while the booking is still being scheduled. */
  startAt: string | null;
  endAt: string | null;
  timezone: string | null;
  /** The booking lifecycle column is `state`, not `status`. */
  bookingState: string | null;
  /**
   * True once the outbox worker has provisioned a meeting. `createBooking` returns
   * BEFORE the link exists, so a UI that assumes a fresh booking is joinable will
   * show a dead button for a few seconds. This flag is what it should gate on.
   */
  meetingReady: boolean;
  recordingPolicy: string | null;
}

export type SessionResult =
  | { ok: true; session: SessionView | null }
  | { ok: false; reason: 'not_found' };

/**
 * `null` means "your assignment, but nothing is booked yet" — a 200 with no session.
 * `not_found` means "not yours, or no such thing", and the two are deliberately
 * indistinguishable to the caller so probing project ids reveals nothing.
 */
export function toSessionView(
  attempt: PresentationAttempt,
  booking: RoomBooking | null,
): SessionView {
  return {
    attemptId: String(attempt.id),
    attemptNo: attempt.attempt_no,
    mode: (attempt.mode || 'practice_solo') as PresentationAttemptMode,
    attemptState: attempt.attempt_state || 'draft',
    recordingState: attempt.recording_state || 'expected',
    bookingId: attempt.booking_id ? String(attempt.booking_id) : null,
    roomId: attempt.room_id ? String(attempt.room_id) : null,
    title: booking?.title ?? null,
    startAt: booking?.start_at ? new Date(booking.start_at).toISOString() : null,
    endAt: booking?.end_at ? new Date(booking.end_at).toISOString() : null,
    timezone: booking?.timezone ?? null,
    bookingState: booking?.state ?? null,
    // Presence of a link, never the link itself.
    meetingReady: Boolean(booking?.meeting_link),
    recordingPolicy: booking?.recording_policy ?? null,
  };
}

/** The assignment row for a task the caller demonstrably owns, or null. */
async function ownedAssignment(
  enrollmentId: string,
  projectId: string,
  storyId: string,
): Promise<PresentationAssignment | null> {
  // Ownership first, every time, through the same helper the rest of the projects
  // surface uses. Checking the assignment row's own columns instead would trust a
  // table this module also writes.
  const tree = await getOwnedProjectTree(enrollmentId, projectId);
  if (!tree) return null;
  return PresentationAssignment.findOne({ where: { project_id: projectId, story_id: storyId } });
}

/**
 * The session a learner should be looking at for one demo-prep task.
 *
 * "One assignment resolves to one room/session" is resolved as the HIGHEST attempt
 * number that actually carries a booking — not the newest row by timestamp. Attempt
 * numbers are allocated against a unique `(assignment_id, attempt_no)` index, so they
 * are a total order even when two rows are written in the same millisecond, which
 * `created_at` is not.
 */
export async function resolveSessionForAssignment(
  enrollmentId: string,
  projectId: string,
  storyId: string,
): Promise<SessionResult> {
  const assignment = await ownedAssignment(enrollmentId, projectId, storyId);
  if (!assignment) return { ok: false, reason: 'not_found' };

  const attempts = await PresentationAttempt.findAll({
    where: { assignment_id: assignment.id },
    order: [['attempt_no', 'DESC']],
  });
  const booked = attempts.find((a) => a.booking_id);
  if (!booked) return { ok: true, session: null };

  const booking = await RoomBooking.findByPk(String(booked.booking_id));

  // A booking that names a DIFFERENT project is an inconsistency, not something to
  // render. Showing it would leak another project's room title and timing into this
  // student's page. A cohort booking legitimately names no project at all, so only a
  // mismatch is rejected — an absent `related_project_id` is fine.
  if (booking && booking.related_project_id && String(booking.related_project_id) !== String(projectId)) {
    return { ok: true, session: toSessionView(booked, null) };
  }

  return { ok: true, session: toSessionView(booked, booking) };
}

/**
 * Every attempt for the task, newest first — the Practice stage's history list.
 *
 * Bookings are fetched in ONE query rather than per attempt: a student with eight
 * rehearsals would otherwise cost nine round trips to render one panel.
 */
export async function listSessionsForAssignment(
  enrollmentId: string,
  projectId: string,
  storyId: string,
): Promise<{ ok: true; sessions: SessionView[] } | { ok: false; reason: 'not_found' }> {
  const assignment = await ownedAssignment(enrollmentId, projectId, storyId);
  if (!assignment) return { ok: false, reason: 'not_found' };

  const attempts = await PresentationAttempt.findAll({
    where: { assignment_id: assignment.id },
    order: [['attempt_no', 'DESC']],
  });
  if (attempts.length === 0) return { ok: true, sessions: [] };

  const ids = Array.from(new Set(attempts.map((a) => a.booking_id).filter(Boolean))) as string[];
  const bookings = ids.length ? await RoomBooking.findAll({ where: { id: ids } }) : [];
  const byId = new Map(bookings.map((b) => [String(b.id), b]));

  return {
    ok: true,
    sessions: attempts.map((a) => {
      const b = a.booking_id ? byId.get(String(a.booking_id)) ?? null : null;
      // Same cross-project guard as the single resolve above.
      const safe = b && b.related_project_id && String(b.related_project_id) !== String(projectId) ? null : b;
      return toSessionView(a, safe);
    }),
  };
}
