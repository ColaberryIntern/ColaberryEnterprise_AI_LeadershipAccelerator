import { Enrollment, Cohort, StudentNavigationEvent } from '../models';
import { isNonPayingCohortName } from './subscriptionService';
import { readBatchMonth } from './cohortBatchMonth';

/**
 * portalEnrollmentService — the student-facing "pick your class date" flow
 * behind the Settings → Enrollment tab.
 *
 * Enrolling is SEPARATE from paying: selecting a cohort reserves the student's
 * place and costs nothing; payment on the
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
  /**
   * DATEONLY 'YYYY-MM-DD'. READ `batch_month` BEFORE SHOWING THIS TO A STUDENT:
   * for a batch row this is the ORIENTATION, not the day class starts.
   */
  start_date: string;
  /**
   * 'YYYY-MM' when this row is a monthly batch, null for a legacy fixed-start
   * cohort. See cohortBatchMonth for what the distinction means; the short
   * version is that it decides whether `start_date` may be labelled as a start
   * date at all.
   */
  batch_month: string | null;
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

/**
 * One cohort as the dropdown sees it.
 *
 * Exported so the mapping can be tested without a database — the `batch_month`
 * lift is the part that stops this dropdown advertising an orientation as a
 * class start date, and it is worth a test that does not need Postgres running.
 */
export const toOption = (c: any): EnrollmentCohortOption => ({
  id: c.id,
  name: c.name,
  start_date: String(c.start_date).slice(0, 10),
  batch_month: readBatchMonth(c?.settings_json),
  core_day: c.core_day ?? null,
  core_time: c.core_time ?? null,
  seats_left: typeof c.max_seats === 'number' && typeof c.seats_taken === 'number'
    ? Math.max(0, c.max_seats - c.seats_taken)
    : null,
});

/** True when the cohort is a real paid class students can enroll into — not the
 *  Explorer/prospect/demo bucket, and not a private business/owner workspace
 *  (cohort_type='business', which is invisible to students). */
const isRealClassCohort = (c: any | null): boolean =>
  !!c && !isNonPayingCohortName(c.name) && String(c.cohort_type ?? '').toLowerCase() !== 'business';

/**
 * ONLY PAID PEOPLE ARE IN A COHORT (Ali, 2026-11-22).
 *
 * Until this change, "Reserve my spot" wrote `enrollments.cohort_id` for an unpaid
 * Explorer, which moved them into the class. Measured on prod 2026-11-22: Cohort -
 * November 2026 showed 85 active enrollments, of which 28 had paid. 57 had not, and
 * 40 of those 57 had never even started a checkout. Every cohort count, roster and
 * class email read them as students.
 *
 * An unpaid pick is now recorded as a `class_seat_reserved` row in
 * `student_navigation_events` and the enrollment stays where it is (the Explorer
 * bucket). That row is two things at once, deliberately:
 *   - the record of which date they picked, which this view reads back so the tab
 *     still shows "your spot is reserved"; and
 *   - a tier-4 buying-intent signal that `explorerSignalReader` scores, so Explorer
 *     Growth and Maya see it.
 *
 * Nothing is lost by not writing `cohort_id` early: payment places the member by the
 * month they paid in (`resolvePaidBatchPlacement`, C10.13), which never read the
 * pre-payment pick anyway.
 *
 * Written through the model directly, NOT `recordLearnerSignal`: that writer is dark
 * behind the `signalIngest` flag and dedupes on a 60s window, and the reservation is
 * the system of record for the pick, so it cannot be dropped by a flag. The signal's
 * source is `portal_enrollment`, not `student_navigation_events`, which keeps it out
 * of `writableSignals()` and therefore out of the public signal route - a browser
 * cannot forge a reservation.
 */
export const SEAT_RESERVED_EVENT = 'class_seat_reserved';
export const SEAT_RESERVED_PAGE = 'settings/enrollment';

/** The cohort id of the learner's most recent unpaid reservation, or null. */
async function latestReservedCohortId(enrollmentId: string): Promise<string | null> {
  const row = (await StudentNavigationEvent.findOne({
    where: { enrollment_id: enrollmentId, event_type: SEAT_RESERVED_EVENT },
    order: [['created_at', 'DESC']],
    attributes: ['metadata'],
  })) as { metadata: Record<string, unknown> | null } | null;
  const id = row?.metadata?.cohort_id;
  return typeof id === 'string' && id ? id : null;
}

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
  const paid = enrollment.payment_status === 'paid';
  let enrolledCohort = isRealClassCohort(current) ? current : null;
  // Unpaid and not in a class: show the date they reserved, if any (see SEAT_RESERVED_EVENT).
  if (!enrolledCohort && !paid) {
    const reservedId = await latestReservedCohortId(enrollmentId);
    const reserved = reservedId ? await Cohort.findByPk(reservedId) : null;
    if (isRealClassCohort(reserved)) enrolledCohort = reserved;
  }

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
 *
 * Unpaid: records a reservation and leaves `cohort_id` alone (see
 * SEAT_RESERVED_EVENT). Paid but still in the Explorer bucket: moved, as before.
 * Idempotent both ways: re-picking the current cohort or the current reservation
 * writes nothing.
 */
export async function selectCohort(enrollmentId: string, cohortId: string, now: Date = new Date()): Promise<SelectCohortResult> {
  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) return { ok: false, reason: 'enrollment_not_found' };

  // Idempotent: re-enrolling in the current cohort succeeds without a write.
  if (enrollment.cohort_id === cohortId) {
    const view = await getEnrollmentView(enrollmentId, now);
    return { ok: true, changed: false, view: view! };
  }
  const paid = enrollment.payment_status === 'paid';
  if (!paid && (await latestReservedCohortId(enrollmentId)) === cohortId) {
    const view = await getEnrollmentView(enrollmentId, now);
    return { ok: true, changed: false, view: view! };
  }

  const currentCohort = enrollment.cohort_id ? await Cohort.findByPk(enrollment.cohort_id) : null;
  if (paid && isRealClassCohort(currentCohort)) {
    return { ok: false, reason: 'locked_after_payment' };
  }

  const cohort = await Cohort.findByPk(cohortId);
  if (!cohort) return { ok: false, reason: 'cohort_not_found' };
  if ((cohort as any).status !== 'open') return { ok: false, reason: 'cohort_closed' };
  if (!isRealClassCohort(cohort)) return { ok: false, reason: 'cohort_not_selectable' };
  const today = now.toISOString().slice(0, 10);
  if (String((cohort as any).start_date).slice(0, 10) < today) return { ok: false, reason: 'cohort_started' };

  if (!paid) {
    await StudentNavigationEvent.create({
      enrollment_id: enrollmentId,
      event_type: SEAT_RESERVED_EVENT,
      page: SEAT_RESERVED_PAGE,
      metadata: { cohort_id: cohortId, cohort_name: (cohort as any).name ?? null },
    } as any);
    const view = await getEnrollmentView(enrollmentId, now);
    return { ok: true, changed: true, view: view! };
  }

  await enrollment.update({ cohort_id: cohortId });

  // They are a student now — Reese's student intro fires here rather than
  // waiting for their next login, so the greeting arrives while joining the
  // class is still the thing they just did. Fire-and-forget and idempotent:
  // the login path evaluates the same state as a backstop, which is what
  // covers students enrolled by an admin or a payment webhook instead of by
  // this route.
  void (async () => {
    try {
      const { maybeSendWelcomes } = await import('./reese/reeseWelcomeService');
      await maybeSendWelcomes(enrollmentId);
    } catch { /* never allowed to affect cohort selection */ }
  })();

  const view = await getEnrollmentView(enrollmentId, now);
  return { ok: true, changed: true, view: view! };
}
