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
  | { ok: true; reservationId: string; startAt: Date; endAt: Date; hostEmail: string | null }
  | { ok: false; reason: 'taken' | 'class_window' | 'in_the_past'; nextAvailable: Date | null; message: string };

/** Lazy, for the same reason as db() — the registry touches the ORM too. */
async function allocatableHosts(): Promise<string[]> {
  const { allocatableHostEmails } = await import('../zoom/zoomHostRegistry');
  return allocatableHostEmails('practice');
}

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

/**
 * The stretches where EVERY host is busy at once.
 *
 * With one host this is just "any held slot", which is what the single-host version
 * computed. With several, one student's rehearsal no longer blocks the next — only a
 * moment where all `capacity` hosts overlap does. A sweep line over the interval
 * endpoints, rather than per-minute sampling, so the answer does not depend on a
 * granularity nobody chose.
 */
export function saturatedIntervals(
  held: Array<{ start: Date; end: Date }>,
  capacity: number,
): Array<{ start: Date; end: Date }> {
  const events: Array<{ t: number; d: number }> = [];
  for (const h of held) {
    events.push({ t: h.start.getTime(), d: 1 });
    events.push({ t: h.end.getTime(), d: -1 });
  }
  // Ends before starts at the same instant: a slot ending at 19:30 does not keep a
  // host busy for one starting at 19:30. The range is half-open for the same reason.
  events.sort((a, b) => a.t - b.t || a.d - b.d);

  const out: Array<{ start: Date; end: Date }> = [];
  let open = 0;
  let since: number | null = null;
  for (const e of events) {
    const before = open;
    open += e.d;
    if (before < capacity && open >= capacity) since = e.t;
    else if (before >= capacity && open < capacity && since !== null) {
      out.push({ start: new Date(since), end: new Date(e.t) });
      since = null;
    }
  }
  return out;
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

  // How many rehearsals can genuinely run at once. No registered hosts means the
  // configured default and nothing else — capacity one, exactly as before.
  const hosts = await allocatableHosts();
  const capacity = Math.max(1, hosts.length);

  const classes = await collidingClassWindows(from, horizonEnd);
  const blocks = [
    ...saturatedIntervals(held.map((h) => ({ start: new Date(h.s), end: new Date(h.e) })), capacity),
    // A class takes the whole platform regardless of host count: the cohort is in it.
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

  // ALLOCATION IS "TRY IT AND LET THE CONSTRAINT ANSWER", not "find a free host
  // then take it". Querying for a free host and inserting afterwards is a
  // read-then-write: two students reading the same instant both see the same host
  // free and both take it. Attempting the insert per host makes Postgres the
  // arbiter, which is the only participant that can decide atomically.
  //
  // An empty registry yields [''] — the single pseudo-host every pre-existing row
  // uses — so with nothing registered this behaves exactly as it did before.
  const hosts = await allocatableHosts();
  const candidates = hosts.length ? hosts : [''];

  let sawConflict = false;
  for (const host of candidates) {
    try {
      const [rows] = await sequelize.query(
        `INSERT INTO presentation_slot_reservations
           (enrollment_id, attempt_id, assignment_id, slot, mode, state, host_email)
         VALUES (:eid, :aid, :asg, tstzrange(:s, :e, '[)'), :mode, 'held', :host)
         RETURNING id`,
        {
          replacements: {
            eid: req.enrollmentId,
            aid: req.attemptId ?? null,
            asg: req.assignmentId ?? null,
            s: startAt,
            e: endAt,
            mode: req.mode || 'practice_solo',
            host,
          },
        },
      ) as [Array<{ id: string }>, unknown];
      return { ok: true, reservationId: rows[0].id, startAt, endAt, hostEmail: host || null };
    } catch (err: any) {
      // 23P01 = exclusion_violation: this host is busy then. Expected, not an error
      // — try the next one before concluding anything.
      const code = err?.parent?.code || err?.original?.code;
      const isConflict = code === '23P01' || /presentation_slot_no_overlap/.test(String(err?.message));
      if (!isConflict) throw err;
      sawConflict = true;
    }
  }

  // Every host was busy. Only now is the answer "taken", and it still has to offer
  // a real alternative rather than a dead end.
  if (sawConflict) {
    const next = await nextAvailableFrom(endAt, durationMinutes);
    return {
      ok: false, reason: 'taken', nextAvailable: next,
      message: next
        ? 'Every practice room is busy then. The next free time is shown below.'
        : 'Every practice room is busy then, and nothing is free in the next two days.',
    };
  }
  // Unreachable: the loop either returns, throws, or records a conflict.
  throw Object.assign(new Error('slot reservation reached no outcome'), { error_class: 'InvariantViolation' });
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
