import { getOwnedProjectTree } from '../projects/projectReadService';
import PresentationAssignment from '../../models/PresentationAssignment';
import RoomBooking from '../../models/RoomBooking';
import type { RoomAccessContext } from '../communityRooms/roomEntitlementService';

/**
 * The demo-day running order: who presents when.
 *
 * TWO AUDIENCES, TWO DIFFERENT ANSWERS, AND THEY ARE SEPARATE FUNCTIONS.
 *
 * A learner gets `mySlot` — their own position and time, plus how many presenters
 * there are so "4 of 11" means something. They never receive another learner's
 * row. That is not a UI decision to be re-made in a component; the service simply
 * does not return the data.
 *
 * Staff get `runningOrder`, gated on `canModerate`. Everything about who may see
 * the full list is decided here, once.
 *
 * WHY AN ID IN THE REQUEST CAN NEVER BUY MODERATOR RIGHTS. `canModerate` is
 * answered from `ctx.enrollmentId` — which comes from the verified token — and the
 * membership row loaded FOR that enrollment. The booking id in the URL selects
 * WHICH room is being asked about; it is never evidence about who is asking.
 * Swapping it changes the question, not the questioner.
 *
 * NOTHING HERE COMPLETES A TASK. A slot is a place in the order. Holding one is not
 * presenting, and presenting is vouched for by staff.
 */

/** Lazy so importing this module never constructs the ORM. */
async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

export interface MySlotView {
  position: number;
  totalPresenters: number;
  role: string;
  state: string;
  startsAt: string | null;
  durationSeconds: number | null;
  /** Present so the UI can link to the session; never a join URL. */
  bookingId: string;
}

export type MySlotResult =
  | { ok: true; slot: MySlotView | null }
  | { ok: false; reason: 'not_found' };

export interface RunningOrderRow {
  position: number;
  assignmentId: string;
  enrollmentId: string | null;
  role: string;
  state: string;
  startsAt: string | null;
  durationSeconds: number | null;
}

export type RunningOrderResult =
  | { ok: true; bookingId: string; rows: RunningOrderRow[] }
  | { ok: false; reason: 'not_found' | 'not_authorized' };

/**
 * The caller's own slot, and nothing about anybody else's.
 *
 * Ownership is proved the same way every other read on this surface proves it, and
 * a miss is `not_found` rather than `forbidden` so probing project ids reveals
 * nothing.
 */
export async function mySlot(
  enrollmentId: string,
  projectId: string,
  storyId: string,
): Promise<MySlotResult> {
  const tree = await getOwnedProjectTree(enrollmentId, projectId);
  if (!tree) return { ok: false, reason: 'not_found' };

  const assignment = await PresentationAssignment.findOne({
    where: { project_id: projectId, story_id: storyId },
  });
  if (!assignment) return { ok: false, reason: 'not_found' };

  const sequelize = await db();
  const [rows] = await sequelize.query(
    `SELECT booking_id, position, role, state, starts_at, duration_seconds
       FROM presentation_presenter_slots
      WHERE assignment_id = :aid AND state <> 'cancelled'
      ORDER BY position ASC
      LIMIT 1`,
    { replacements: { aid: String(assignment.id) } },
  ) as [Array<Record<string, any>>, unknown];

  const row = rows?.[0];
  // No slot is a 200 with null: the learner's task exists, demo day just has not
  // been scheduled for them yet.
  if (!row) return { ok: true, slot: null };

  // A COUNT, not the rows. The learner needs "4 of 11" to be meaningful; they do
  // not need to know who the other ten are.
  const [countRows] = await sequelize.query(
    `SELECT COUNT(*)::int AS n
       FROM presentation_presenter_slots
      WHERE booking_id = :bid AND state <> 'cancelled' AND role = 'presenter'`,
    { replacements: { bid: String(row.booking_id) } },
  ) as [Array<{ n: number }>, unknown];

  return {
    ok: true,
    slot: {
      position: Number(row.position),
      totalPresenters: Number(countRows?.[0]?.n ?? 0),
      role: String(row.role || 'presenter'),
      state: String(row.state || 'scheduled'),
      startsAt: row.starts_at ? new Date(row.starts_at).toISOString() : null,
      durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
      bookingId: String(row.booking_id),
    },
  };
}

/**
 * The whole order. Moderators and staff only.
 *
 * The authorization answer comes from the caller's own membership of the room the
 * booking belongs to, never from anything in the request body.
 */
export async function runningOrder(
  ctx: RoomAccessContext,
  bookingId: string,
): Promise<RunningOrderResult> {
  const booking = await RoomBooking.findByPk(bookingId);
  if (!booking) return { ok: false, reason: 'not_found' };

  const { canModerate } = await import('../communityRooms/roomEntitlementService');
  const { default: RoomMembership } = await import('../../models/RoomMembership');
  // Loaded FOR ctx.enrollmentId — the token's subject. This is the line that makes
  // an id swap useless: the membership consulted is always the caller's own.
  const membership = await RoomMembership.findOne({
    where: { room_id: booking.room_id, enrollment_id: ctx.enrollmentId },
  });
  if (!canModerate(ctx, membership)) return { ok: false, reason: 'not_authorized' };

  const sequelize = await db();
  const [rows] = await sequelize.query(
    `SELECT position, assignment_id, enrollment_id, role, state, starts_at, duration_seconds
       FROM presentation_presenter_slots
      WHERE booking_id = :bid AND state <> 'cancelled'
      ORDER BY position ASC`,
    { replacements: { bid: bookingId } },
  ) as [Array<Record<string, any>>, unknown];

  return {
    ok: true,
    bookingId,
    rows: (rows || []).map((r) => ({
      position: Number(r.position),
      assignmentId: String(r.assignment_id),
      enrollmentId: r.enrollment_id ? String(r.enrollment_id) : null,
      role: String(r.role || 'presenter'),
      state: String(r.state || 'scheduled'),
      startsAt: r.starts_at ? new Date(r.starts_at).toISOString() : null,
      durationSeconds: r.duration_seconds === null ? null : Number(r.duration_seconds),
    })),
  };
}
