import { getOwnedProjectTree } from '../projects/projectReadService';
import PresentationAssignment from '../../models/PresentationAssignment';
import PresentationAttempt from '../../models/PresentationAttempt';
import RoomBooking from '../../models/RoomBooking';
import { reserveSlot, releaseSlot } from './presentationCapacityService';
import { toSessionView, SessionView } from './presentationSessionService';

/**
 * Starting a practice run: one attempt, one reserved slot, one room.
 *
 * This is the first caller of `reserveSlot`. Until now the exclusion constraint
 * `presentation_slot_no_overlap` was enforced in the database and reachable by
 * nothing, which protects no one.
 *
 * ORDER MATTERS, AND SO DOES UNDOING IT. The sequence is: reserve the slot, create
 * the room, then record the room on the attempt. If the room fails to create, the
 * reservation is RELEASED — otherwise the single Zoom host stays blocked for half an
 * hour for a meeting that never existed, and the next student is told a truthful-
 * looking "that time is taken" about a ghost.
 *
 * WHY PRACTICE ROOMS ARE EXPLICITLY PRIVATE. `roomBookingService.createBooking`
 * spins up a new room when given no `room_id`, and its privacy default is PUBLIC, in
 * the `demos_events` category. A rehearsal is the one thing in this feature a student
 * is most entitled to keep to themselves; shipping the default would publish every
 * first attempt to the community. Privacy is passed explicitly here and a test
 * asserts it, so the default can never drift back in.
 *
 * NOTHING HERE COMPLETES A TASK, and nothing here awards points. Booking a rehearsal
 * is not evidence of having presented.
 */

export type PracticeMode = 'practice_solo' | 'practice_peer';

export interface StartPracticeInput {
  enrollmentId: string;
  cohortId?: string | null;
  isStaff?: boolean;
  projectId: string;
  storyId: string;
  startAt: Date;
  endAt: Date;
  mode?: PracticeMode;
  /** Ask for a fresh take instead of resuming the one already open. */
  newAttempt?: boolean;
}

export type StartPracticeResult =
  | { ok: true; created: boolean; session: SessionView }
  | { ok: false; reason: 'not_found' }
  | {
      ok: false;
      reason: 'slot_unavailable';
      why: 'taken' | 'class_window' | 'in_the_past';
      nextAvailable: string | null;
      message: string;
    };

/** Attempt states that mean "this take has not happened yet". */
const RESUMABLE = new Set(['draft', 'scheduled']);

/** Postgres raises 23505 when a unique index rejects an insert. */
function isUniqueViolation(e: unknown): boolean {
  return (e as { parent?: { code?: string } })?.parent?.code === '23505';
}

/**
 * Allocate the attempt row, or hand back the one a double-click just made.
 *
 * Two clicks a few milliseconds apart both compute the same next attempt number and
 * both insert. `presentation_attempts_unique_try` lets exactly one through; the loser
 * reads back the winner's row rather than retrying with a higher number, which is
 * what keeps a double-click from producing two rehearsals.
 */
async function allocateAttempt(
  assignmentId: string,
  mode: PracticeMode,
  wantNew: boolean,
): Promise<{ attempt: PresentationAttempt; created: boolean }> {
  const existing = await PresentationAttempt.findAll({
    where: { assignment_id: assignmentId },
    order: [['attempt_no', 'DESC']],
  });

  if (!wantNew) {
    const open = existing.find((a) => RESUMABLE.has(a.attempt_state || 'draft') && !a.ended_at);
    if (open) return { attempt: open, created: false };
  }

  const nextNo = existing.reduce((m, x) => Math.max(m, x.attempt_no), 0) + 1;
  try {
    const attempt = await PresentationAttempt.create({
      assignment_id: assignmentId,
      attempt_no: nextNo,
      mode,
      attempt_state: 'draft',
    });
    return { attempt, created: true };
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const won = await PresentationAttempt.findOne({
      where: { assignment_id: assignmentId, attempt_no: nextNo },
    });
    // The index said someone else inserted this exact row; it is there to read.
    if (!won) throw e;
    return { attempt: won, created: false };
  }
}

/** The booking for a practice attempt. Private by default, never public. */
async function bookPracticeRoom(
  input: StartPracticeInput,
  attempt: PresentationAttempt,
  projectName: string,
): Promise<RoomBooking> {
  const { createBooking } = await import('../communityRooms/roomBookingService');
  const ctx = {
    enrollmentId: input.enrollmentId,
    cohortId: input.cohortId ?? null,
    isAdmin: input.isStaff === true,
  };
  // Derived from the attempt, so a retried request reuses the same booking rather
  // than minting a second room on a single-host Zoom account.
  const idempotency_key = `presentation-attempt-${String(attempt.id)}`;
  try {
    return await createBooking(ctx, {
      title: `Practice: ${projectName}`,
      variant: 'demo',
      // EXPLICIT. The service default is 'public'; a rehearsal must not be.
      privacy: 'private',
      start_at: input.startAt,
      end_at: input.endAt,
      timezone: 'America/Chicago',
      related_project_id: input.projectId,
      idempotency_key,
    });
  } catch (e) {
    // createBooking dedupes with findOne-then-create, which is not atomic. Under a
    // real race the partial unique index rejects the insert; the winner's row is
    // then the correct answer, not an error.
    if (!isUniqueViolation(e)) throw e;
    const won = await RoomBooking.findOne({ where: { idempotency_key } });
    if (!won) throw e;
    return won;
  }
}

/**
 * Reserve the host, book the room, and attach it to the attempt.
 *
 * Returns the refusal verbatim when the slot is unavailable, including the truthful
 * next-available time, so the student is told when they CAN practise rather than
 * only that they cannot now.
 */
export async function startPracticeAttempt(input: StartPracticeInput): Promise<StartPracticeResult> {
  const mode: PracticeMode = input.mode || 'practice_solo';

  const tree = await getOwnedProjectTree(input.enrollmentId, input.projectId);
  if (!tree) return { ok: false, reason: 'not_found' };

  const assignment = await PresentationAssignment.findOne({
    where: { project_id: input.projectId, story_id: input.storyId },
  });
  if (!assignment) return { ok: false, reason: 'not_found' };

  const { attempt, created } = await allocateAttempt(String(assignment.id), mode, input.newAttempt === true);

  // Already booked — a repeat click on a take that has a room is a no-op, not a
  // second reservation.
  if (attempt.booking_id) {
    const existingBooking = await RoomBooking.findByPk(String(attempt.booking_id));
    return { ok: true, created: false, session: toSessionView(attempt, existingBooking) };
  }

  const slot = await reserveSlot({
    enrollmentId: input.enrollmentId,
    startAt: input.startAt,
    endAt: input.endAt,
    mode,
    attemptId: String(attempt.id),
    assignmentId: String(assignment.id),
  });
  if (!slot.ok) {
    return {
      ok: false,
      reason: 'slot_unavailable',
      why: slot.reason,
      nextAvailable: slot.nextAvailable ? slot.nextAvailable.toISOString() : null,
      message: slot.message,
    };
  }

  try {
    const booking = await bookPracticeRoom(input, attempt, tree.name || 'your project');
    await attempt.update({
      booking_id: String(booking.id),
      room_id: booking.room_id ? String(booking.room_id) : null,
      attempt_state: 'scheduled',
    });
    return { ok: true, created, session: toSessionView(attempt, booking) };
  } catch (e) {
    // THE COMPENSATING ACTION. Without this the host is held for a meeting that was
    // never created, and every other student is told that time is taken.
    await releaseSlot(slot.reservationId, 'booking_failed');
    throw e;
  }
}

/**
 * Give the slot back. Used when a student abandons a take before it starts.
 *
 * The attempt row is NOT deleted — its number stays spent, so a later take is
 * genuinely a later take and any evidence already attached to it survives.
 */
export async function abandonPracticeAttempt(
  enrollmentId: string,
  projectId: string,
  attemptId: string,
  reservationId: string | null,
): Promise<{ ok: boolean }> {
  const tree = await getOwnedProjectTree(enrollmentId, projectId);
  if (!tree) return { ok: false };
  const attempt = await PresentationAttempt.findByPk(attemptId);
  if (!attempt) return { ok: false };
  if (reservationId) await releaseSlot(reservationId, 'abandoned_by_student');
  await attempt.update({ attempt_state: 'draft', booking_id: null, room_id: null });
  return { ok: true };
}
