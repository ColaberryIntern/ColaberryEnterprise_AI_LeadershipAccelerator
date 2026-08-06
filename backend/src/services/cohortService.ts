import { Cohort, Enrollment, AccountCredit } from '../models';
import { UpdateCohortInput } from '../schemas/cohortSchema';
import { AppError } from '../utils/AppError';
import { Op } from 'sequelize';

export async function listOpenCohorts() {
  return Cohort.findAll({
    where: {
      status: 'open',
      // Private business/owner workspaces (cohort_type='business') are never shown
      // in the public/student cohort list.
      cohort_type: { [Op.ne]: 'business' },
    },
    attributes: ['id', 'name', 'start_date', 'core_day', 'core_time', 'optional_lab_day', 'max_seats', 'seats_taken'],
    order: [['start_date', 'ASC']],
  });
}

export async function listAllCohorts() {
  return Cohort.findAll({
    order: [['start_date', 'DESC']],
  });
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
    include: [{ model: Enrollment, as: 'enrollments' }],
  });
  if (!cohort) throw new AppError('Cohort not found', 404);
  return cohort;
}

export async function updateCohort(id: string, data: UpdateCohortInput) {
  const cohort = await Cohort.findByPk(id);
  if (!cohort) throw new AppError('Cohort not found', 404);
  await cohort.update(data);
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
  const membershipRevenue =
    (await Enrollment.sum('amount_paid', { where: { payment_status: 'paid' } as any })) || 0;
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
