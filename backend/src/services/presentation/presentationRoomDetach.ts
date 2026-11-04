/**
 * Detaching practice attempts from a room that is about to be destroyed.
 *
 * `deleteRoom` hard-deletes a room's bookings. `presentation_attempts.booking_id` is a
 * bare column with no foreign key and no cascade, so without this the attempt keeps
 * pointing at a row that no longer exists, and the reservation that blocked the host's
 * time stays `held` for a rehearsal that can never happen.
 *
 * Measured in production on 2026-11-04, before this existed: two attempts pointed at
 * deleted bookings, and all seven slot reservations ever created were still `held` with
 * `released_at` null — the release path had never run once.
 *
 * The readers heal a dangling reference on their own now, so this is not the only thing
 * standing between a student and a second rehearsal. It is what stops the rows lying in
 * the first place, and what gives the host's time back.
 */
import { Op } from 'sequelize';
import PresentationAttempt from '../../models/PresentationAttempt';
import { releaseSlotsForAttempt } from './presentationCapacityService';

export interface DetachResult {
  /** Attempts whose booking and room references were cleared. */
  attempts: number;
  /** Slot reservations moved from `held` to `released`. */
  slots: number;
}

/**
 * Clears every practice attempt tied to this room, and releases the slots they held.
 *
 * Matches on the room AND on the ids of the bookings about to be destroyed, because an
 * attempt may carry one reference without the other.
 */
export async function detachAttemptsForRoom(
  roomId: string,
  bookingIds: string[],
  reason: string,
): Promise<DetachResult> {
  const matchers: Array<Record<string, unknown>> = [{ room_id: roomId }];
  if (bookingIds.length > 0) matchers.push({ booking_id: { [Op.in]: bookingIds } });

  const attempts = await PresentationAttempt.findAll({ where: { [Op.or]: matchers } });
  if (attempts.length === 0) return { attempts: 0, slots: 0 };

  let slots = 0;
  for (const attempt of attempts) {
    // Released BEFORE the reference is cleared: releasing keys on attempt_id, which
    // survives either way, but doing it in this order means a failure half way leaves
    // the attempt still pointing at its slot rather than orphaning it silently.
    slots += await releaseSlotsForAttempt(String(attempt.id), reason);
    await attempt.update({ booking_id: null, room_id: null });
  }

  return { attempts: attempts.length, slots };
}
