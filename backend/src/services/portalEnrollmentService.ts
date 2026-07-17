import { Enrollment, Cohort } from '../models';
import { isNonPayingCohortName } from './subscriptionService';

/**
 * portalEnrollmentService — the student-facing "pick your class date" flow
 * behind the Settings → Enrollment tab.
 *
 * Enrolling is SEPARATE from paying: selecting a cohort reserves the student's
 * place (sets enrollment.cohort_id) and costs nothing; payment on the
 * Subscription tab locks the seat and converts the Explorer to a member
 * (subscriptionService.activateByRef). Billing is anchored to the class start
 * date there, so enrolling + paying early never shortens the first period.
 *
 * Failure design: every operation is a single-row UPDATE (no partial states);
 * a failed select leaves the previous cohort selection intact and is safe to
 * retry. Re-selecting the same cohort is a no-op (idempotent). Seat counts are
 * NOT touched here — seats are managed at payment/admin level, matching the
 * Explorer-signup convention.
 */

export interface EnrollmentCohortOption {
  id: string;
  name: string;
  start_date: string;          // DATEONLY 'YYYY-MM-DD'
  core_day: string | null;
  core_time: string | null;
  seats_left: number | null;
}

export interface PortalEnrollmentView {
  /** not_enrolled = no real class date picked yet (Explorer bucket doesn't count) */
  status: 'not_enrolled' | 'enrolled' | 'enrolled_paid';
  enrolled_cohort: EnrollmentCohortOption | null;
  /** Upcoming open paid cohorts, soonest first — the dropdown options. */
  cohorts: EnrollmentCohortOption[];
  /** Preselect: the student's cohort if set, else the soonest upcoming (e.g. July 23). */
  default_cohort_id: string | null;
  paid: boolean;
}

export type SelectCohortReason =
  | 'enrollment_not_found' | 'cohort_not_found' | 'cohort_closed'
  | 'cohort_not_selectable' | 'cohort_started' | 'locked_after_payment';

export type SelectCohortResult =
  | { ok: true; changed: boolean; view: PortalEnrollmentView }
  | { ok: false; reason: SelectCohortReason };

const toOption = (c: any): EnrollmentCohortOption => ({
  id: c.id,
  name: c.name,
  start_date: String(c.start_date).slice(0, 10),
  core_day: c.core_day ?? null,
  core_time: c.core_time ?? null,
  seats_left: typeof c.max_seats === 'number' && typeof c.seats_taken === 'number'
    ? Math.max(0, c.max_seats - c.seats_taken)
    : null,
});

/** True when the cohort is a real paid class (not the Explorer/prospect/demo bucket). */
const isRealClassCohort = (c: any | null): boolean => !!c && !isNonPayingCohortName(c.name);

/** Upcoming selectable cohorts: open, real paid classes, starting today or later. */
async function listSelectableCohorts(now: Date): Promise<any[]> {
  const today = now.toISOString().slice(0, 10);
  const open = (await Cohort.findAll({ where: { status: 'open' }, order: [['start_date', 'ASC']] })) || [];
  return open.filter((c: any) => isRealClassCohort(c) && String(c.start_date).slice(0, 10) >= today);
}

export async function getEnrollmentView(enrollmentId: string, now: Date = new Date()): Promise<PortalEnrollmentView | null> {
  const enrollment = await Enrollment.findByPk(enrollmentId, {
    attributes: ['id', 'cohort_id', 'payment_status', 'enrollment_type'],
  });
  if (!enrollment) return null;

  const current = enrollment.cohort_id ? await Cohort.findByPk(enrollment.cohort_id) : null;
  const enrolledCohort = isRealClassCohort(current) ? current : null;
  const paid = enrollment.payment_status === 'paid';

  const selectable = await listSelectableCohorts(now);
  // The student's own cohort always shows in the list, even once it has started.
  const options = selectable.map(toOption);
  if (enrolledCohort && !options.some((o) => o.id === (enrolledCohort as any).id)) {
    options.unshift(toOption(enrolledCohort));
  }

  return {
    status: enrolledCohort ? (paid ? 'enrolled_paid' : 'enrolled') : 'not_enrolled',
    enrolled_cohort: enrolledCohort ? toOption(enrolledCohort) : null,
    cohorts: options,
    default_cohort_id: enrolledCohort ? (enrolledCohort as any).id : (options[0]?.id ?? null),
    paid,
  };
}

/**
 * Reserve a place in a cohort (the "Enroll" action). Validates the target is a
 * real, open, upcoming paid cohort. Once the student has PAID, the class date
 * is locked (changing a paid seat is a support/admin action, not self-serve).
 */
export async function selectCohort(enrollmentId: string, cohortId: string, now: Date = new Date()): Promise<SelectCohortResult> {
  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) return { ok: false, reason: 'enrollment_not_found' };

  // Idempotent: re-enrolling in the current cohort succeeds without a write.
  if (enrollment.cohort_id === cohortId) {
    const view = await getEnrollmentView(enrollmentId, now);
    return { ok: true, changed: false, view: view! };
  }

  const currentCohort = enrollment.cohort_id ? await Cohort.findByPk(enrollment.cohort_id) : null;
  if (enrollment.payment_status === 'paid' && isRealClassCohort(currentCohort)) {
    return { ok: false, reason: 'locked_after_payment' };
  }

  const cohort = await Cohort.findByPk(cohortId);
  if (!cohort) return { ok: false, reason: 'cohort_not_found' };
  if ((cohort as any).status !== 'open') return { ok: false, reason: 'cohort_closed' };
  if (!isRealClassCohort(cohort)) return { ok: false, reason: 'cohort_not_selectable' };
  const today = now.toISOString().slice(0, 10);
  if (String((cohort as any).start_date).slice(0, 10) < today) return { ok: false, reason: 'cohort_started' };

  await enrollment.update({ cohort_id: cohortId });
  const view = await getEnrollmentView(enrollmentId, now);
  return { ok: true, changed: true, view: view! };
}
