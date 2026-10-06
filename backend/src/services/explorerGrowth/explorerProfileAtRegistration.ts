import { resolveExplorerLead } from './explorerIdentityBridge';

/**
 * Phase 2 T205 — give an Explorer their journey profile AT REGISTRATION.
 *
 * WHY THIS EXISTS. `ExplorerJourneyProfile.create` appeared in exactly one place in
 * the tree — inside `resolveExplorerLead` — and the only non-dry-run caller of that was
 * `repairAllExplorerBridges`, the nightly reconciliation. (`growthJourney/
 * subjectResolver` calls it with `{ dryRun: true }` and creates nothing.) So **no
 * registration path created a profile at all**: a new Explorer had no journey identity
 * until a nightly job happened to run, which is a gap of up to a day on the exact
 * journey this phase ships. Reconciliation is supposed to be recovery, not the only
 * way the record ever comes into existence.
 *
 * There are three registration paths and they must behave identically, which is why
 * this is one function and not three copies of a try/catch:
 *   1. `freeSignupService`            — the portal free signup
 *   2. `enrollmentService`            — the `/enroll` page (createExplorerEnrollment)
 *   3. `openHouseCreditService`       — the $50 Open House seat deposit
 *
 * FAILURE-FIRST, and the decision that matters most here: **a bridge failure must never
 * fail a registration.** Someone signing up is the event we care about; their profile row
 * is bookkeeping we can rebuild. So every error is caught, logged by class, and
 * swallowed — and the nightly repair is deliberately retained as the recovery path for
 * exactly the rows this call misses. That is the one case where reconciliation is still
 * doing its original job.
 *
 * IDEMPOTENT by construction, not by a new mechanism: `resolveExplorerLead` upserts
 * (`findByPk` then `update`, else `create`), so calling it at registration and again
 * overnight produces one row, and a second signup for the same person produces no second
 * profile. CLAUDE.md treats a non-idempotent side effect as a production defect, so it
 * matters that this adds no new idempotency surface to get wrong.
 *
 * ORDERING on the portal path: the bridge resolves `lead_id` by normalized email, so it
 * must run AFTER lead capture. Called before, it would store `lead_id: null` and leave
 * the link to be acquired overnight — which is the behaviour this task exists to remove.
 *
 * SENDS NOTHING. `explorerIdentityBridge` imports only `sequelize`, the models,
 * `pickBestEnrollment` and `redactForLogs`; it has no mailer, queue, dialler or HTTP
 * surface anywhere in the file. That is asserted in this module's suite rather than
 * asserted here in prose.
 */
export type ExplorerProfileEntryPoint =
  | 'portal_free_signup'
  | 'enroll_explorer'
  | 'open_house_deposit';

/**
 * Create or refresh the Explorer journey profile for a just-registered enrollment.
 *
 * @returns true when a profile now exists AND is linked to a lead; false when the
 *          profile was written without a lead link, or when the attempt failed. The
 *          caller is never expected to act on this — it exists so tests and the
 *          operator view can tell "bridged" from "deferred to the nightly repair".
 */
export async function bridgeExplorerProfileAtRegistration(
  enrollmentId: string,
  entryPoint: ExplorerProfileEntryPoint,
): Promise<boolean> {
  try {
    const result = await resolveExplorerLead(enrollmentId);
    return result.resolved;
  } catch (error) {
    // Logged by error CLASS so the failure is triageable, and with the enrollment id
    // rather than the email — ids never carry PII and this line must never print an
    // address. No `redactForLogs` on the envelope: it is applied to payloads, never to
    // whole log lines, because it mangles a fraction of UUIDs.
    console.error('[explorerProfile] bridge at registration failed', {
      error_class: error instanceof Error ? error.constructor.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      enrollment_id: enrollmentId,
      entry_point: entryPoint,
      recovery: 'repairAllExplorerBridges will pick this row up on its next run',
    });
    return false;
  }
}
