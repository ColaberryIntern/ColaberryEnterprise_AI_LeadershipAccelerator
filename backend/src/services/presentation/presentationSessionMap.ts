import PresentationAssignment from '../../models/PresentationAssignment';
import PresentationAttempt from '../../models/PresentationAttempt';
import RoomBooking from '../../models/RoomBooking';

/**
 * Pointing a whole cohort's demo-prep task at one live session.
 *
 * WHY PLAN AND COMMIT ARE TWO FUNCTIONS RATHER THAN ONE `dryRun` FLAG.
 * `planSessionMap` contains no write statement of any kind — no create, no update.
 * A function with no writes in it cannot write however it is called, whereas a flag
 * threaded through a function that also writes is one forgotten `if` away from
 * rebinding forty students' demo slots. A test asserts the model mutators are never
 * touched during a plan. This mirrors `internshipConversionService`, which draws the
 * same line for the same reason.
 *
 * WHY COMMIT RE-READS EVERYTHING THE PLAN ALREADY SAW. The plan is handed back to
 * the caller and comes in again as input, which makes it untrusted data on the way
 * back — a forged row naming another cohort's assignment would otherwise be mapped
 * without question. Commit therefore re-verifies every row's cohort and story
 * against the database and skips anything that no longer matches. The plan decides
 * WHAT to consider, never WHETHER it is allowed.
 *
 * NOTHING HERE COMPLETES A TASK, and nothing here awards points. Mapping a student
 * to a room says where they will present, not that they presented.
 */

export type MapOutcome =
  | 'will_map'
  | 'already_mapped'
  | 'will_remap'
  | 'blocked_no_booking';

export interface SessionMapRow {
  assignmentId: string;
  projectId: string;
  storyId: string;
  cohortId: string | null;
  attemptId: string | null;
  currentBookingId: string | null;
  outcome: MapOutcome;
  /** What committing would actually do. Plain sentences, for a human to read. */
  actions: string[];
  blocked_reason: string | null;
}

export interface SessionMapPlan {
  dry_run: true;
  generated_at: string;
  booking_exists: boolean;
  bookingId: string;
  cohortId: string;
  storyId: string;
  rows: SessionMapRow[];
  summary: Record<MapOutcome, number>;
}

export interface SessionMapReport {
  dry_run: false;
  committed_at: string;
  rows: Array<{ assignmentId: string; outcome: 'mapped' | 'skipped' | 'failed'; detail: string }>;
  summary: { mapped: number; skipped: number; failed: number };
}

const EMPTY_SUMMARY = (): Record<MapOutcome, number> => ({
  will_map: 0,
  already_mapped: 0,
  will_remap: 0,
  blocked_no_booking: 0,
});

/** The attempt already bound to this booking, if there is one. */
function boundAttempt(attempts: PresentationAttempt[], bookingId: string): PresentationAttempt | undefined {
  return attempts.find((a) => a.booking_id && String(a.booking_id) === String(bookingId));
}

/** A cohort_live attempt with no room yet — rebind it rather than minting another. */
function adoptableAttempt(attempts: PresentationAttempt[]): PresentationAttempt | undefined {
  return attempts.find((a) => a.mode === 'cohort_live' && !a.booking_id);
}

/** A cohort_live attempt already pointed somewhere else. */
function attemptInAnotherRoom(attempts: PresentationAttempt[]): PresentationAttempt | undefined {
  return attempts.find((a) => a.mode === 'cohort_live' && Boolean(a.booking_id));
}

const nextAttemptNo = (attempts: PresentationAttempt[]): number =>
  attempts.reduce((m, x) => Math.max(m, x.attempt_no), 0) + 1;

/**
 * THE DRY RUN. Pure read: this function contains no write statement.
 */
export async function planSessionMap(params: {
  cohortId: string;
  storyId: string;
  bookingId: string;
  nowMs?: number;
}): Promise<SessionMapPlan> {
  const { cohortId, storyId, bookingId } = params;
  const generated_at = new Date(params.nowMs ?? Date.now()).toISOString();

  const booking = await RoomBooking.findByPk(bookingId);
  const summary = EMPTY_SUMMARY();

  const assignments = await PresentationAssignment.findAll({
    where: { cohort_id: cohortId, story_id: storyId },
  });

  // One query for every attempt in the cohort, not one per student: a 40-student
  // cohort would otherwise cost 41 round trips just to render a preview.
  const ids = assignments.map((a) => String(a.id));
  const allAttempts = ids.length
    ? await PresentationAttempt.findAll({ where: { assignment_id: ids } })
    : [];
  const byAssignment = new Map<string, PresentationAttempt[]>();
  for (const at of allAttempts) {
    const k = String(at.assignment_id);
    byAssignment.set(k, [...(byAssignment.get(k) || []), at]);
  }

  const rows: SessionMapRow[] = [];
  for (const a of assignments) {
    const attempts = byAssignment.get(String(a.id)) || [];
    const base = {
      assignmentId: String(a.id),
      projectId: String(a.project_id),
      storyId: a.story_id,
      cohortId: a.cohort_id ? String(a.cohort_id) : null,
    };

    // A missing booking blocks every row for the same reason. The rows are still
    // listed rather than returning an empty plan, which would read as "nothing to do".
    if (!booking) {
      rows.push({
        ...base, attemptId: null, currentBookingId: null,
        outcome: 'blocked_no_booking', actions: [],
        blocked_reason: 'No room booking with that id exists.',
      });
      summary.blocked_no_booking += 1;
      continue;
    }

    const already = boundAttempt(attempts, bookingId);
    if (already) {
      rows.push({
        ...base, attemptId: String(already.id), currentBookingId: bookingId,
        outcome: 'already_mapped',
        actions: ['Nothing — this student is already pointed at this session.'],
        blocked_reason: null,
      });
      summary.already_mapped += 1;
      continue;
    }

    const adoptable = adoptableAttempt(attempts);
    if (adoptable) {
      rows.push({
        ...base, attemptId: String(adoptable.id), currentBookingId: null,
        outcome: 'will_map',
        actions: [`Point existing attempt ${adoptable.attempt_no} at this session.`],
        blocked_reason: null,
      });
      summary.will_map += 1;
      continue;
    }

    const elsewhere = attemptInAnotherRoom(attempts);
    if (elsewhere) {
      rows.push({
        ...base, attemptId: String(elsewhere.id), currentBookingId: String(elsewhere.booking_id),
        outcome: 'will_remap',
        actions: [
          `Move attempt ${elsewhere.attempt_no} off its current session onto this one.`,
          'Any recording already attached to that attempt stays attached to it.',
        ],
        blocked_reason: null,
      });
      summary.will_remap += 1;
      continue;
    }

    rows.push({
      ...base, attemptId: null, currentBookingId: null,
      outcome: 'will_map',
      actions: [`Create cohort_live attempt ${nextAttemptNo(attempts)} on this session.`],
      blocked_reason: null,
    });
    summary.will_map += 1;
  }

  return {
    dry_run: true, generated_at, booking_exists: Boolean(booking),
    bookingId, cohortId, storyId, rows, summary,
  };
}

/** Postgres raises 23505 when the `(assignment_id, attempt_no)` unique index rejects. */
function isUniqueViolation(e: unknown): boolean {
  return (e as { parent?: { code?: string } })?.parent?.code === '23505';
}

/**
 * THE ONLY WRITER. Takes a plan and re-verifies every row before touching it.
 */
export async function commitSessionMap(params: {
  plan: SessionMapPlan;
  actorId: string;
  nowMs?: number;
}): Promise<SessionMapReport> {
  const { plan } = params;
  const committed_at = new Date(params.nowMs ?? Date.now()).toISOString();
  const rows: SessionMapReport['rows'] = [];
  let mapped = 0;
  let skipped = 0;
  let failed = 0;

  const booking = await RoomBooking.findByPk(plan.bookingId);
  if (!booking) {
    return {
      dry_run: false,
      committed_at,
      rows: plan.rows.map((r) => ({
        assignmentId: r.assignmentId,
        outcome: 'skipped' as const,
        detail: 'That room booking no longer exists.',
      })),
      summary: { mapped: 0, skipped: plan.rows.length, failed: 0 },
    };
  }

  for (const r of plan.rows) {
    try {
      // Re-verification, not a convenience re-read: the plan arrived from outside.
      const a = await PresentationAssignment.findByPk(r.assignmentId);
      if (!a || String(a.cohort_id) !== String(plan.cohortId) || a.story_id !== plan.storyId) {
        rows.push({
          assignmentId: r.assignmentId,
          outcome: 'skipped',
          detail: 'Assignment no longer matches this cohort and task.',
        });
        skipped += 1;
        continue;
      }

      const attempts = await PresentationAttempt.findAll({ where: { assignment_id: a.id } });
      if (boundAttempt(attempts, plan.bookingId)) {
        rows.push({ assignmentId: r.assignmentId, outcome: 'skipped', detail: 'Already pointed at this session.' });
        skipped += 1;
        continue;
      }

      const existing = adoptableAttempt(attempts) || attemptInAnotherRoom(attempts);
      if (existing) {
        await existing.update({ booking_id: plan.bookingId, room_id: booking.room_id });
        rows.push({
          assignmentId: r.assignmentId,
          outcome: 'mapped',
          detail: `Attempt ${existing.attempt_no} now points at this session.`,
        });
        mapped += 1;
        continue;
      }

      const created = await PresentationAttempt.create({
        assignment_id: String(a.id),
        attempt_no: nextAttemptNo(attempts),
        mode: 'cohort_live',
        booking_id: plan.bookingId,
        room_id: booking.room_id,
        attempt_state: 'scheduled',
      });
      rows.push({
        assignmentId: r.assignmentId,
        outcome: 'mapped',
        detail: `Created attempt ${created.attempt_no} on this session.`,
      });
      mapped += 1;
    } catch (e) {
      // A racing commit took the attempt number. That is the unique index doing its
      // job, not something to report to an instructor as a failure.
      if (isUniqueViolation(e)) {
        rows.push({
          assignmentId: r.assignmentId,
          outcome: 'skipped',
          detail: 'A concurrent map already created this attempt.',
        });
        skipped += 1;
      } else {
        rows.push({
          assignmentId: r.assignmentId,
          outcome: 'failed',
          detail: (e as Error)?.message || 'Unknown error',
        });
        failed += 1;
      }
    }
  }

  return { dry_run: false, committed_at, rows, summary: { mapped, skipped, failed } };
}
