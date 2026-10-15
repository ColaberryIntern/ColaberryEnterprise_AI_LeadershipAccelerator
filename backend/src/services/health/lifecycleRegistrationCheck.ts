import type { HealthCheck } from '../systemHealthService';

/**
 * LC-01 integrity: has anything created a project WITHOUT registering a lifecycle?
 *
 * ## Why this check exists at all
 *
 * `unregisteredDeliveryProjectsSince` and `unregisteredStudentProjectsSince` were written as the
 * detectors for exactly this, and until 2026-10-14 they were called from TESTS ONLY. A detector
 * with no production caller cannot detect anything - it is a control that proves it works and
 * then never runs. This programme has already shipped one of those, and a verifier found it.
 *
 * ## Why it lives on the health report rather than in a new job
 *
 * This surface is already read by a human and already aggregates nine other checks. A new
 * scheduled job would be a second place to look, and the thing most likely to go unnoticed is the
 * thing nobody has a habit of opening.
 *
 * ## Why WARNING and never CRITICAL
 *
 * `runFullSystemHealthCheck` derives `overall_status` from the severities its checks push, and
 * `critical` makes `/health/full` answer 503 - which pages people and trips uptime monitors. A
 * governance gap is serious and is not an outage: taking the health endpoint down over an
 * unregistered project would be the wrong lever, and would train people to ignore the page.
 *
 * The detectors take a `since` date and default to the day each hook went live, so rows that
 * predate the hook are correctly NOT reported - they are the known legacy cohort, not bypasses.
 * That default is itself a tested control (`registrationCutoff.test.ts`): moving it to the epoch
 * would report all 66 legacy rows here as LC-01 violations and send an operator to investigate a
 * breach that never happened.
 *
 * ## WHY THIS FILE EXISTS, rather than the function sitting in `systemHealthService.ts`
 *
 * It was in `systemHealthService.ts`, and adding it took that file to 565 lines - over
 * CLAUDE.md's 500-line hard ceiling. CI caught it, by the test that exists precisely because an
 * earlier split happened for the same reason (`systemHealth.journey.test.ts` asserts the ceiling
 * and the wiring together). The rule is that the next change to an over-ceiling file splits it
 * before adding new code, and three checks had already been extracted to this directory
 * (`sequenceProgressionCheck`, `campaignHealthCheck`, `growthJourneyCheck`). Following the
 * established pattern is cheaper than arguing for the exception.
 */
export async function checkLifecycleRegistration(checks: HealthCheck[]): Promise<void> {
  try {
    const {
      unregisteredDeliveryProjectsSince, unregisteredStudentProjectsSince,
    } = await import('../lifecycle/projectLifecycleRegistration');

    const [delivery, student] = await Promise.all([
      unregisteredDeliveryProjectsSince(),
      unregisteredStudentProjectsSince(),
    ]);
    const total = delivery.length + student.length;

    if (total === 0) {
      checks.push({
        name: 'lifecycle_registration',
        severity: 'ok',
        detail: 'Every project created since the registration hooks went live holds a lifecycle record.',
        metric: 0,
      });
      return;
    }

    // Named, not counted. A bare number sends an operator to a query; the ids send them to the row.
    const ids = [...delivery, ...student].slice(0, 5).map((r) => r.id).join(', ');
    checks.push({
      name: 'lifecycle_registration',
      severity: 'warning',
      detail: `${total} project(s) created since the hooks went live have NO lifecycle record `
        + `(${delivery.length} delivery, ${student.length} student). This is an LC-01 bypass: `
        + `something created a project outside the models the hooks sit on. First ids: ${ids}.`,
      metric: total,
    });
  } catch (err: any) {
    // Fail LOUD, not silent. A check that cannot run must not read as a clean result - that is the
    // exact 'absence reported as a pass' failure this whole programme exists to prevent.
    checks.push({
      name: 'lifecycle_registration',
      severity: 'warning',
      detail: `Could not determine lifecycle registration integrity: ${err.message}. `
        + 'This is NOT a pass - the check did not run.',
    });
  }
}
