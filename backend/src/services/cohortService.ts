import { Cohort, Enrollment, AccountCredit, LiveSession, ProgramBlueprint } from '../models';
import { UpdateCohortInput, CreateCohortInput, ScheduleDayInput } from '../schemas/cohortSchema';
import { AppError } from '../utils/AppError';
import { Op, fn, col } from 'sequelize';

const SESSION_DEFAULT_DURATION_MIN = 90; // matches the existing "Add Session" form's own 10:00->11:30 default
const DEFAULT_PROGRAM_WEEKS = 12; // matches sessionGenerationService.ts's own constant of the same name

function addMinutes(time24: string, minutes: number): string {
  const [h, m] = time24.split(':').map(Number);
  const total = ((h * 60 + m + minutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function formatTimeLabel(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}:00 ${period}` : `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

export interface DerivedSchedule {
  schedule: {
    recurring_days: string[];
    core_days: string[];
    day_times: Record<string, { start_time: string; end_time: string }>;
    start_time: string;
    end_time: string;
    total_sessions: number;
  };
  core_day: string;
  core_time: string;
  optional_lab_day: string | null;
}

/**
 * Turns the new multi-day/per-day-time picker's input into (a) the
 * settings_json.schedule shape sessionGenerationService.ts actually consumes for
 * real session generation, and (b) the legacy core_day/core_time/optional_lab_day
 * fields every other consumer (enrollment emails, the AI voice script, the public
 * "next cohort" widget, AdminCohortDetailPage) still reads directly — derived from
 * the FIRST and SECOND day in picker order, same convention SessionControlTab.tsx's
 * own handleCohortSave already uses. A 3rd+ day has no legacy-field slot; that's an
 * existing limitation of those two fields, not something this introduces.
 */
export function deriveScheduleFromDays(days: ScheduleDayInput[], existingTotalSessions?: number): DerivedSchedule {
  if (!days.length) {
    throw new AppError('schedule_days must include at least one day', 400);
  }
  const day_times: Record<string, { start_time: string; end_time: string }> = {};
  for (const d of days) {
    day_times[d.day] = { start_time: d.time, end_time: addMinutes(d.time, SESSION_DEFAULT_DURATION_MIN) };
  }
  const recurring_days = days.map((d) => d.day);
  const [first, second] = days;
  const firstTime = day_times[first.day];
  return {
    schedule: {
      recurring_days,
      core_days: recurring_days,
      day_times,
      start_time: firstTime.start_time,
      end_time: firstTime.end_time,
      total_sessions: existingTotalSessions ?? recurring_days.length * DEFAULT_PROGRAM_WEEKS,
    },
    core_day: first.day,
    core_time: `${formatTimeLabel(firstTime.start_time)} - ${formatTimeLabel(firstTime.end_time)}`,
    optional_lab_day: second ? second.day : null,
  };
}

/** Shallow-merges settings_json at the `schedule` level: explicit keys the caller
 *  sends override, keys the caller doesn't send (e.g. skipped_dates, day_times set
 *  by a different admin surface) survive instead of being silently dropped by a
 *  blind column overwrite. */
export function mergeSettingsJson(
  existing: Record<string, any> | null | undefined,
  incoming: Record<string, any> | null | undefined
): Record<string, any> {
  const existingSchedule = existing?.schedule || {};
  const incomingSchedule = incoming?.schedule || {};
  return {
    ...(existing || {}),
    ...(incoming || {}),
    schedule: { ...existingSchedule, ...incomingSchedule },
  };
}

/** Builds the actual DB write patch for create/update: resolves schedule_days (if
 *  present) into the legacy flat fields + settings_json.schedule, then merges with
 *  whatever settings_json already exists on the row (update only — create has no
 *  prior row to merge against). */
function buildScheduleAwarePatch(
  data: Record<string, any>,
  existingSettingsJson?: Record<string, any> | null
): Record<string, any> {
  const { schedule_days, settings_json, ...rest } = data;
  const patch: Record<string, any> = { ...rest };

  let finalSettingsJson: Record<string, any> | undefined = settings_json;
  if (schedule_days?.length) {
    const existingSchedule = (existingSettingsJson || {}).schedule || {};
    const derived = deriveScheduleFromDays(schedule_days, existingSchedule.total_sessions);
    finalSettingsJson = {
      ...(settings_json || {}),
      schedule: { ...(settings_json?.schedule || {}), ...derived.schedule },
    };
    patch.core_day = derived.core_day;
    patch.core_time = derived.core_time;
    patch.optional_lab_day = derived.optional_lab_day;
  }

  if (finalSettingsJson) {
    patch.settings_json = existingSettingsJson !== undefined
      ? mergeSettingsJson(existingSettingsJson, finalSettingsJson)
      : finalSettingsJson;
  }

  return patch;
}

export async function listOpenCohorts() {
  return Cohort.findAll({
    where: {
      status: 'open',
      // Private business/owner workspaces (cohort_type='business') are never shown
      // in the public/student cohort list.
      cohort_type: { [Op.ne]: 'business' },
    },
    // `cohort_type` is part of the public contract: callers use it to keep the
    // remaining internal lanes (explorer prospect cohort, corporate sponsor
    // cohorts, demo rows) out of public cohort pickers. The `business` exclusion
    // above only covers private owner workspaces.
    attributes: ['id', 'name', 'start_date', 'core_day', 'core_time', 'optional_lab_day', 'max_seats', 'seats_taken', 'cohort_type'],
    order: [['start_date', 'ASC']],
  });
}

/**
 * Real, live headcount per cohort — COUNT(*) of active enrollments, regardless of
 * `enrollment_type`. `Cohort.seats_taken` is deliberately NOT this number: it's a
 * paid-capacity counter that enrollmentService intentionally skips for Explorer
 * signups (they have no seat limit), so any UI that reused `seats_taken` to mean
 * "how many people are enrolled" always read 0 for the Explorer cohort no matter
 * how many prospects actually signed up. This is the correct source for that.
 */
async function getEnrolledCountsByCohort(): Promise<Map<string, number>> {
  const rows = (await Enrollment.findAll({
    attributes: ['cohort_id', [fn('COUNT', col('id')), 'count']],
    where: { status: 'active', cohort_id: { [Op.ne]: null } } as any,
    group: ['cohort_id'],
    raw: true,
  })) as unknown as Array<{ cohort_id: string; count: string }>;

  const byCohort = new Map<string, number>();
  for (const row of rows) {
    byCohort.set(row.cohort_id, Number(row.count));
  }
  return byCohort;
}

export async function listAllCohorts() {
  const [cohorts, enrolledCounts] = await Promise.all([
    Cohort.findAll({
      order: [['start_date', 'DESC']],
      // Surfaces the parent Course name alongside each Cohort so the admin UI can
      // show the Course -> Cohort hierarchy explicitly instead of leaving
      // program_id as an opaque id (see AdminAcceleratorPage's course/cohort
      // breadcrumb). A cohort with no program_id (e.g. the Explorer cohort) simply
      // has a null `program` — the UI renders "No parent course set" for that case.
      include: [{ model: ProgramBlueprint, as: 'program', attributes: ['id', 'name'] }],
    }),
    getEnrolledCountsByCohort(),
  ]);
  return cohorts.map((c) => ({
    ...c.toJSON(),
    enrolled_count: enrolledCounts.get(c.id) || 0,
  }));
}

export async function createCohort(data: CreateCohortInput) {
  return Cohort.create({
    seats_taken: 0,
    status: 'open',
    ...buildScheduleAwarePatch(data as unknown as Record<string, any>),
  } as any);
}

export interface CohortDependents {
  enrollmentCount: number;
  /** Non-withdrawn enrollments with a real recorded payment — the signal that
   *  blocks a default (non-forced) delete, since cascading would destroy a real
   *  student's record, not a test/internal fixture. */
  unsafeEnrollmentCount: number;
  liveSessionCount: number;
}

export async function getCohortDependents(cohortId: string): Promise<CohortDependents> {
  const [enrollments, liveSessionCount] = await Promise.all([
    Enrollment.findAll({
      where: { cohort_id: cohortId },
      attributes: ['id', 'status', 'amount_paid'],
    }),
    LiveSession.count({ where: { cohort_id: cohortId } }),
  ]);
  const unsafeEnrollmentCount = enrollments.filter(
    (e) => e.status !== 'withdrawn' && Number(e.amount_paid) > 0
  ).length;
  return { enrollmentCount: enrollments.length, unsafeEnrollmentCount, liveSessionCount };
}

export type DeleteCohortResult =
  | { deleted: true; cohortId: string; dependents: CohortDependents }
  | { deleted: false; blocked: true; dependents: CohortDependents };

/**
 * Deletes a cohort. The DB FK (`enrollments_cohort_id_fkey` etc.) is
 * ON DELETE CASCADE, so this also removes every dependent enrollment/session row —
 * irreversible. Refuses by default (returns `blocked: true` rather than throwing,
 * so the controller can surface the dependent counts to the caller) whenever the
 * cohort has a non-withdrawn enrollment with a real recorded payment, or any live
 * session, unless the caller explicitly passes `force: true`.
 */
export async function deleteCohort(
  id: string,
  opts: { force?: boolean } = {}
): Promise<DeleteCohortResult> {
  const cohort = await Cohort.findByPk(id);
  if (!cohort) throw new AppError('Cohort not found', 404);

  const dependents = await getCohortDependents(id);
  const blocked = dependents.unsafeEnrollmentCount > 0 || dependents.liveSessionCount > 0;
  if (blocked && !opts.force) {
    return { deleted: false, blocked: true, dependents };
  }

  await cohort.destroy();
  return { deleted: true, cohortId: id, dependents };
}

/**
 * Pure placement logic: which open cohort a new Explorer (Open House signup) is
 * filed under. Picks the SOONEST upcoming open cohort — the open cohort whose
 * start_date is today or later, earliest first — so prospects land in the next
 * real intake rather than the farthest-out cohort. Fallbacks, in order:
 *   1. soonest open cohort with start_date >= today
 *   2. if every open cohort has already started, the most-recently-started open one
 *   3. if no cohort is open at all, the most recently created cohort
 * Pure + I/O-free so it is unit-testable; `now` is injected by the caller.
 */
export function selectNextOpenCohort<
  T extends { status: string; start_date: string; created_at?: Date | string | null }
>(cohorts: T[], now: Date): T | null {
  const today = now.toISOString().slice(0, 10);
  const open = cohorts.filter((c) => c.status === 'open');

  const upcoming = open
    .filter((c) => String(c.start_date) >= today)
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
  if (upcoming.length) return upcoming[0];

  const started = [...open].sort((a, b) =>
    String(b.start_date).localeCompare(String(a.start_date))
  );
  if (started.length) return started[0];

  const byCreated = [...cohorts].sort(
    (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
  );
  return byCreated[0] ?? null;
}

/**
 * Has this cohort's live class actually started yet? Used by the payment-paywall
 * predicates (contentEntitlement.hasFullCurriculumAccess, requireBuildEntitlement
 * .isBuildEntitled) so a paid enrollment only unlocks full access once its cohort's
 * start_date arrives, not the instant payment clears (Ali decision, BC #10160497402,
 * relayed 2026-08-04: "full Classroom access should unlock when the student's class
 * actually starts, not immediately on payment").
 *
 * Missing cohort or missing start_date fails OPEN (returns true / "started") —
 * consistent with every other predicate in this codebase: a data anomaly must
 * never wrongly lock out a possibly-paying student.
 */
export function hasCohortStarted(cohort: { start_date?: string | Date | null } | null | undefined): boolean {
  if (!cohort?.start_date) return true;
  return new Date(cohort.start_date) <= new Date();
}

export async function getLatestOpenCohort(): Promise<Cohort | null> {
  // Placement for new Explorers (Open House signups). Historically this picked
  // the open cohort with the LATEST start_date, which filed every new signup
  // into the farthest-out cohort (e.g. a November cohort instead of the imminent
  // July one). It now picks the SOONEST upcoming open cohort. See selectNextOpenCohort.
  // DEPRECATED for Explorer placement — start_date-based selection routed prospects
  // into whichever cohort started soonest, including a demo cohort. Explorers are
  // now filed into the dedicated Explorer cohort via getOrCreateExplorerCohort().
  const cohorts = await Cohort.findAll();
  return selectNextOpenCohort(cohorts, new Date());
}

// The single standing cohort that holds every free "Explorer" (Open House /
// training.colaberry.com) signup. Its name.
const EXPLORER_COHORT_NAME = process.env.EXPLORER_COHORT_NAME || 'Explorer — Prospects';

/**
 * Find (or lazily create once) the dedicated Explorer cohort. Identified by
 * cohort_type='explorer' so placement is DETERMINISTIC and never depends on
 * start_date — the previous getLatestOpenCohort() logic filed prospects into
 * whichever open cohort started soonest, which dumped real signups into a demo
 * cohort. This is the "free class of its own": portal access, no paid seat, and
 * excluded from paid metrics (enrollments there carry enrollment_type='explorer').
 * seats_taken is never touched here. Reuses the OLDEST explorer cohort if several
 * ever exist, so the bucket is stable.
 */
export async function getOrCreateExplorerCohort(): Promise<Cohort> {
  const existing = await Cohort.findOne({
    where: { cohort_type: 'explorer' },
    order: [['created_at', 'ASC']],
  });
  if (existing) return existing;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return Cohort.create({
    name: EXPLORER_COHORT_NAME,
    description:
      'Standing container for training.colaberry.com / Open House prospects (Explorer tier). ' +
      'Not a paid cohort; excluded from paid seat counts and revenue reporting.',
    start_date: today,
    core_day: 'Self-paced',
    core_time: 'Anytime',
    max_seats: 100000,
    seats_taken: 0,
    status: 'open',
    cohort_type: 'explorer',
  } as any);
}

export async function getCohortDetail(id: string) {
  const cohort = await Cohort.findByPk(id, {
    include: [
      { model: Enrollment, as: 'enrollments' },
      { model: ProgramBlueprint, as: 'program', attributes: ['id', 'name'] },
    ],
  });
  if (!cohort) throw new AppError('Cohort not found', 404);
  return cohort;
}

export async function updateCohort(id: string, data: UpdateCohortInput) {
  const cohort = await Cohort.findByPk(id);
  if (!cohort) throw new AppError('Cohort not found', 404);
  const patch = buildScheduleAwarePatch(data as unknown as Record<string, any>, (cohort as any).settings_json);
  await cohort.update(patch);
  return cohort;
}

export async function getDashboardStats() {
  const cohorts = await Cohort.findAll();
  // Explorers (Open House visitors) are not paying students — exclude them from
  // enrollment/pipeline counts so they never skew the dashboard.
  const notExplorer = { enrollment_type: { [Op.ne]: 'explorer' } };
  const totalEnrollments = await Enrollment.count({ where: notExplorer as any });
  const paidEnrollments = await Enrollment.count({
    where: { payment_status: 'paid', ...notExplorer } as any,
  });
  const pendingInvoice = await Enrollment.count({
    where: { payment_status: ['pending', 'pending_invoice'] as any, ...notExplorer } as any,
  });

  const openCohorts = cohorts.filter((c) => c.status === 'open');
  const totalSeatsRemaining = openCohorts.reduce(
    (sum, c) => sum + (c.max_seats - c.seats_taken),
    0
  );
  const upcomingCohorts = cohorts.filter(
    (c) => c.status === 'open' && new Date(c.start_date) > new Date()
  ).length;

  // Revenue = real cash collected through PaySimple, from TWO sources so a payer
  // who made more than one payment is fully (and separately) counted:
  //  1. Membership/direct payments — SUM(enrollments.amount_paid) over paid rows
  //     (set by markEnrollmentPaid / subscription activateByRef).
  //  2. Open House "$50 hold-your-spot" DEPOSITS — recorded as account_credits by
  //     openHouseCreditService (the payer stays an Explorer; the deposit is NOT a
  //     membership payment). Count deposits still 'available'; an 'applied' one is
  //     already folded into the membership charge, so this can't double-count.
  // Replaces the old count * $4,500 estimate.
  // status: 'active' excludes withdrawn duplicate rows (see
  // duplicateAccountSweepService) — a merged-away loser row keeps its
  // amount_paid/payment_status='paid' for history, so without this filter the
  // same real dollar gets counted twice (confirmed live: Martin Mungai and
  // Ikenna Nzeribe's $1,788 each, 2026-07-31).
  const membershipRevenue =
    (await Enrollment.sum('amount_paid', { where: { payment_status: 'paid', status: 'active' } as any })) || 0;
  const depositCents =
    (await AccountCredit.sum('amount_cents', { where: { status: 'available' } as any })) || 0;
  const collectedRevenue = membershipRevenue + depositCents / 100;

  return {
    totalRevenue: collectedRevenue,
    totalEnrollments,
    paidEnrollments,
    pendingInvoice,
    seatsRemaining: totalSeatsRemaining,
    upcomingCohorts,
  };
}
