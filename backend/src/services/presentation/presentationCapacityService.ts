import { classInstant } from '../centralDate';

/**
 * Who gets the practice slot, and what the student who missed it is told.
 *
 * CAPACITY IS ONE, AND THAT IS A MEASURED FALLBACK, NOT A GUESS. Every meeting is
 * created under a single `ZOOM_HOST_EMAIL`, and the Zoom app's scopes do not include
 * `user:read`, so the licence count cannot be read (`GET /users/me` -> 400, code 4711).
 * Serialising is the conservative direction: the cost of being wrong is a student
 * waiting, where the optimistic guess costs a student their rehearsal.
 *
 * TWO THINGS A PRACTICE SLOT MUST NOT COLLIDE WITH:
 *   1. another held practice slot — enforced by the database's exclusion constraint,
 *      not by a check in this file, so two simultaneous clicks cannot both win;
 *   2. a scheduled CLASS — those already own the host, and a student rehearsing over
 *      the top of Build Day takes the room out from under the cohort.
 *
 * A refusal always carries a real next-available time. "Unavailable" with no
 * alternative is how a student concludes the feature is broken and emails a human.
 */

const SLOT_MINUTES_DEFAULT = 30;
/** Classes own the host for their whole window plus a margin either side. */
const CLASS_GUARD_MINUTES = 15;

export interface SlotRequest {
  enrollmentId: string;
  startAt: Date;
  endAt: Date;
  mode?: 'practice_solo' | 'practice_peer' | 'cohort_live';
  attemptId?: string | null;
  assignmentId?: string | null;
}

export type SlotResult =
  | { ok: true; reservationId: string; startAt: Date; endAt: Date }
  | { ok: false; reason: 'taken' | 'class_window' | 'in_the_past'; nextAvailable: Date | null; message: string };

/** Lazy so importing this module never constructs the ORM. */
async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60000);

/**
 * Class windows that would collide, as real instants.
 *
 * `classInstant` rather than `new Date(date + 'T' + time)` deliberately — the naive
 * parse is off by the UTC offset and has caused a P0 on this exact data before.
 */
export async function collidingClassWindows(startAt: Date, endAt: Date): Promise<Array<{ start: Date; end: Date; title: string }>> {
  const { default: LiveSession } = await import('../../models/LiveSession');
  const { Op } = await import('sequelize');
  // Day-level prefilter in SQL, exact instant comparison in JS — the stored columns are
  // a Central date plus a wall-clock time, not an instant, so they cannot be compared
  // to a timestamptz in the query without reintroducing the offset bug.
  const dayBefore = new Date(startAt.getTime() - 86400000).toISOString().slice(0, 10);
  const dayAfter = new Date(endAt.getTime() + 86400000).toISOString().slice(0, 10);
  const rows: any[] = await LiveSession.findAll({
    where: { session_date: { [Op.between]: [dayBefore, dayAfter] } },
  } as any);

  const hits: Array<{ start: Date; end: Date; title: string }> = [];
  for (const s of rows) {
    if (!s.session_date || !s.start_time) continue;
    const cStart = addMinutes(classInstant(String(s.session_date), String(s.start_time)), -CLASS_GUARD_MINUTES);
    const cEnd = addMinutes(
      s.end_time ? classInstant(String(s.session_date), String(s.end_time)) : addMinutes(cStart, 120),
      CLASS_GUARD_MINUTES,
    );
    if (startAt < cEnd && cStart < endAt) {
      hits.push({ start: cStart, end: cEnd, title: String(s.title || 'a scheduled class') });
    }
  }
  return hits;
}

/** The earliest free start time at or after `from`, or null if none within the horizon. */
export async function nextAvailableFrom(from: Date, durationMinutes: number, horizonHours = 48): Promise<Date | null> {
  const sequelize = await db();
  const horizonEnd = new Date(from.getTime() + horizonHours * 3600000);

  const [held] = await sequelize.query(
    `SELECT lower(slot) AS s, upper(slot) AS e
       FROM presentation_slot_reservations
      WHERE state = 'held' AND upper(slot) > :from AND lower(slot) < :horizon
      ORDER BY lower(slot) ASC`,
    { replacements: { from, horizon: horizonEnd } },
  ) as [Array<{ s: string; e: string }>, unknown];

  const classes = await collidingClassWindows(from, horizonEnd);
  const blocks = [
    ...held.map((h) => ({ start: new Date(h.s), end: new Date(h.e) })),
    ...classes.map((c) => ({ start: c.start, end: c.end })),
  ].sort((a, b) => a.start.getTime() - b.start.getTime());

  let cursor = from;
  for (const b of blocks) {
    if (addMinutes(cursor, durationMinutes) <= b.start) return cursor;   // gap is wide enough
    if (b.end > cursor) cursor = b.end;
  }
  return cursor <= horizonEnd ? cursor : null;
}

export async function reserveSlot(req: SlotRequest): Promise<SlotResult> {
  const { startAt, endAt } = req;
  const durationMinutes = Math.max(1, Math.round((endAt.getTime() - startAt.getTime()) / 60000)) || SLOT_MINUTES_DEFAULT;

  if (endAt <= new Date()) {
    return {
      ok: false, reason: 'in_the_past', nextAvailable: null,
      message: 'That time has already passed. Pick a time in the future.',
    };
  }

  // Classes are checked BEFORE the insert because the exclusion constraint knows only
  // about other reservations — a class is not a row in this table.
  const classHits = await collidingClassWindows(startAt, endAt);
  if (classHits.length) {
    const next = await nextAvailableFrom(classHits[0].end, durationMinutes);
    return {
      ok: false, reason: 'class_window', nextAvailable: next,
      message: `That overlaps ${classHits[0].title}. The room is in use for the whole class.`,
    };
  }

  const sequelize = await db();
  try {
    const [rows] = await sequelize.query(
      `INSERT INTO presentation_slot_reservations
         (enrollment_id, attempt_id, assignment_id, slot, mode, state)
       VALUES (:eid, :aid, :asg, tstzrange(:s, :e, '[)'), :mode, 'held')
       RETURNING id`,
      {
        replacements: {
          eid: req.enrollmentId,
          aid: req.attemptId ?? null,
          asg: req.assignmentId ?? null,
          s: startAt,
          e: endAt,
          mode: req.mode || 'practice_solo',
        },
      },
    ) as [Array<{ id: string }>, unknown];
    return { ok: true, reservationId: rows[0].id, startAt, endAt };
  } catch (err: any) {
    // 23P01 = exclusion_violation. Someone else holds an overlapping slot. This is the
    // normal, expected outcome of two students wanting the same time — not an error to
    // log loudly, and it must produce a usable alternative rather than a dead end.
    const code = err?.parent?.code || err?.original?.code;
    if (code === '23P01' || /presentation_slot_no_overlap/.test(String(err?.message))) {
      const next = await nextAvailableFrom(endAt, durationMinutes);
      return {
        ok: false, reason: 'taken', nextAvailable: next,
        message: next
          ? 'Someone else just took that slot. The next free time is shown below.'
          : 'Someone else just took that slot, and nothing is free in the next two days.',
      };
    }
    throw err;
  }
}

/**
 * Releases a reservation so the slot frees immediately.
 *
 * The row is UPDATED, not deleted — the exclusion constraint is partial on
 * `state = 'held'`, so flipping the state is enough to free the time while keeping a
 * record of who held it and why it went.
 */
export async function releaseSlot(reservationId: string, reason: string): Promise<boolean> {
  const sequelize = await db();
  const [rows] = await sequelize.query(
    `UPDATE presentation_slot_reservations
        SET state = 'released', released_at = NOW(), released_reason = :reason, updated_at = NOW()
      WHERE id = :id AND state = 'held'
      RETURNING id`,
    { replacements: { id: reservationId, reason: String(reason).slice(0, 300) } },
  ) as [Array<{ id: string }>, unknown];
  return (rows?.length || 0) > 0;
}
