import Enrollment from '../../models/Enrollment';
import Cohort from '../../models/Cohort';
import { isStaffEnrollment } from '../access/staffAccess';
import { activeCompEnrollmentIds } from '../subscriptionService';
import type { ResolveDeps } from './broadcastEntitlement';

/**
 * The real loaders behind `resolveBroadcastAccess`.
 *
 * WHY THIS DID NOT EXIST UNTIL NOW, which is the whole point of the file. P2-04 shipped
 * `resolveBroadcastAccess` — the I/O wrapper, fail-closed and DI'd — and P2-06 then wired the
 * controller to the PURE `decideBroadcastAccess` instead, passing `null, null, null` for the
 * paid-access facts. So `hasFullCurriculumAccess` was being asked "is this person entitled?"
 * with no enrollment, no cohort and no role info, and answered no for everybody. Every paying
 * student was treated as unpaid: `paid` occurrences returned `requires_payment`, and `preview`
 * occurrences handed a full-access viewer the 15-minute window.
 *
 * Both of that commit's stubs failed in the DENY direction, so nothing leaked — but a paywall
 * that refuses the people who paid is as broken as one that admits the people who did not, and
 * it is the kind of broken that looks like the feature simply not working.
 *
 * The queries mirror `contentEntitlement.resolveContentPageAccess` attribute for attribute, so
 * the two surfaces cannot disagree about what "has paid" means. The difference is the failure
 * direction, and it is deliberate: that one fails OPEN because locking a student out of
 * curriculum they own is the worse error; `resolveBroadcastAccess` fails CLOSED, because
 * watched content cannot be un-watched.
 */

/** Loads the viewer's paid-access facts once. Reuse it across occurrences; do not re-query per row. */
export const broadcastAccessDeps: ResolveDeps = {
  loadEnrollment: (enrollmentId: string) => Enrollment.findByPk(enrollmentId, {
    attributes: ['id', 'payment_status', 'cohort_id', 'access_starts_at'],
  }) as ReturnType<ResolveDeps['loadEnrollment']>,

  loadCohort: (cohortId: string | null) => (cohortId
    ? Cohort.findByPk(cohortId, { attributes: ['id', 'cohort_type'] })
    : Promise.resolve(null)) as ReturnType<ResolveDeps['loadCohort']>,

  loadRoleInfo: async (enrollmentId: string) => {
    // isStaffEnrollment fails safe to false internally; a comp-lookup rejection propagates
    // and resolveBroadcastAccess turns it into a denial, which is the direction we want.
    const [isStaff, compIds] = await Promise.all([
      isStaffEnrollment(enrollmentId),
      activeCompEnrollmentIds([enrollmentId]),
    ]);
    return { isStaff, hasActiveComp: compIds.has(enrollmentId) };
  },

  cohortIdOf: (enrollment: unknown) =>
    (enrollment as { cohort_id?: string | null } | null)?.cohort_id ?? null,
};

/**
 * The same facts, loaded ONCE for a viewer who is about to be judged against several
 * occurrences. The discovery endpoint needs this: calling `resolveBroadcastAccess` per row
 * would re-read the enrollment, the cohort and the comp list for every broadcast on screen.
 */
export interface ViewerAccessFacts {
  enrollment: Awaited<ReturnType<ResolveDeps['loadEnrollment']>>;
  cohort: Awaited<ReturnType<ResolveDeps['loadCohort']>>;
  roleInfo: Awaited<ReturnType<ResolveDeps['loadRoleInfo']>>;
}

export async function loadViewerAccessFacts(
  enrollmentId: string,
  deps: ResolveDeps = broadcastAccessDeps,
): Promise<ViewerAccessFacts> {
  const enrollment = await deps.loadEnrollment(enrollmentId);
  const cohort = await deps.loadCohort(deps.cohortIdOf(enrollment));
  const roleInfo = await deps.loadRoleInfo(enrollmentId);
  return { enrollment, cohort, roleInfo };
}
