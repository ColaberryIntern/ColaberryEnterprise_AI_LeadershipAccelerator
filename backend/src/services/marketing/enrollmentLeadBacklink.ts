/**
 * R21 — THE OTHER HALF OF THE LINK: fill an enrollment's `lead_id` when the LEAD arrives second.
 *
 * ── WHY THIS EXISTS, MEASURED RATHER THAN GUESSED ────────────────────────────────────
 *
 * R18 put a `beforeCreate` hook on `Enrollment` that resolves the lead for that email. It is
 * correct and production proved it fires. It is also, on its own, not enough.
 *
 * Measured over the six enrollments created in the hours after the R18 deploy (2026-11-18):
 *
 *     11-18 02:36  mclark@tech-niforce.com      NULL   lead created 02:36:02   lead came SECOND
 *     11-18 02:48  madisonolisa@gmail.com       NULL   lead created 02:48:52   lead came SECOND
 *     11-18 03:23  eftyrealty@gmail.com         NULL   lead created 03:23:07   lead came SECOND
 *     11-18 04:09  willrdelgado@gmail.com       NULL   lead created 04:09:44   lead came SECOND
 *     11-18 04:14  majekodunmivictoria@gmail     112   lead existed since Mar  LINKED
 *     11-18 04:24  markwins16@yahoo.com         NULL   lead created 04:24:47   lead came SECOND
 *
 * One linked, five not. In a brand-new signup the enrollment row is INSERTed before the lead
 * row, usually inside the same second, so at `beforeCreate` there is genuinely no lead to find
 * and the hook correctly links nothing. The enrollment-side hook therefore catches people who
 * were ALREADY leads and misses every genuinely new signup — which is precisely the ad-campaign
 * population the channel panel (R19) exists to measure. The backfill repaired history; without
 * this, the future keeps leaking at about five in six.
 *
 * ── A HOOK ON THE MODEL, FOR THE SAME REASON R18 USED ONE ────────────────────────────
 *
 * Many paths create a lead: `alumniDataService`, `apolloService`, `csvImportService`, the
 * landing-page signup and more. Editing the ones that exist today links those and misses the
 * next one, which is exactly how `utm_content` was lost before.
 *
 * ── IT RESOLVES, IT DOES NOT ASSUME ──────────────────────────────────────────────────
 *
 * The obvious implementation is "stamp the new lead's id onto the matching enrollments". That
 * would be a SECOND opinion about which lead a member came from, and it would disagree with the
 * first: `pickLeadForEnrollment` picks the OLDEST lead for that email, and the lead that
 * triggered this hook is by definition the newest. Where an older lead already exists, blindly
 * using the new one would re-attribute the member to whichever list imported their address most
 * recently — the exact failure R18's rule was written to prevent, arriving through the back
 * door. So this calls `resolveLeadIdForEmail`, the same function the enrollment-side hook uses,
 * and in the common case (no earlier lead) that returns the new lead anyway.
 *
 * ── IT MUST NEVER COST A SIGNUP ──────────────────────────────────────────────────────
 *
 * Every failure is swallowed and logged. A missing link is a reporting gap that the next lead
 * for that email, or a re-run of the backfill, will repair. A thrown error inside `afterCreate`
 * would roll back the lead insert, which loses the signup itself. Those two outcomes are not
 * close, so this one is deliberately silent on failure.
 */
import { fn, col, where as sqWhere, Op } from 'sequelize';
import { normalizeEmailForLink } from './enrollmentLeadLink';
import { resolveLeadIdForEmail } from './enrollmentLeadResolver';

/** What this hook needs off a `Lead` instance. Declared, not imported, so `Lead` can import
 *  this module without a cycle — the same reason `LinkableEnrollment` is declared in
 *  `enrollmentLeadResolver.ts`. */
export interface BacklinkableLead {
  id?: number;
  email?: string | null;
}

/** Options Sequelize passes a hook. Only the transaction matters here. */
export interface BacklinkOptions {
  transaction?: unknown;
}

function log(entry: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'backend',
    ...entry,
  }));
}

/**
 * Link every enrollment for this email that is still unlinked. Returns how many rows were
 * updated, which is what the tests assert on and what the log line reports.
 *
 * Scoped to `lead_id IS NULL` so it can never move an existing link. That, plus resolving
 * through the oldest-lead rule, makes it idempotent: running it again finds nothing to do.
 */
export async function backlinkEnrollmentsForLead(
  lead: BacklinkableLead,
  options: BacklinkOptions = {},
): Promise<number> {
  const normalized = normalizeEmailForLink(lead?.email);
  if (normalized === null) return 0;

  const leadId = await resolveLeadIdForEmail(normalized);
  if (leadId === null) return 0;

  const { Enrollment } = await import('../../models');
  const [affected] = await Enrollment.update(
    { lead_id: leadId },
    {
      where: {
        lead_id: { [Op.is]: null },
        // Both sides normalized, matching `resolveLeadIdForEmail`. Neither column is stored
        // consistently, so a raw comparison would miss the rows this exists to catch.
        [Op.and]: [sqWhere(fn('lower', fn('btrim', col('email'))), normalized)],
      },
      // Joins the lead's own transaction when there is one, so the update sees the lead row
      // and commits or rolls back with it rather than racing it.
      ...(options.transaction ? { transaction: options.transaction as never } : {}),
    } as never,
  );
  return Number(affected) || 0;
}

/**
 * `Lead.afterCreate`. AFTER, not BEFORE: the lead needs an id before anything can point at it.
 */
export async function leadEnrollmentBacklinkHook(
  instance: BacklinkableLead,
  options: BacklinkOptions = {},
): Promise<void> {
  try {
    const linked = await backlinkEnrollmentsForLead(instance, options);
    if (linked > 0) {
      log({
        event: 'enrollment_lead_backlinked',
        outcome: 'success',
        context: {
          lead_id: instance?.id ?? null,
          enrollments_linked: linked,
          entry_point: 'lead.afterCreate',
        },
      });
    }
  } catch (err: unknown) {
    const e = err as { message?: string; constructor?: { name?: string } };
    // Swallowed on purpose. See the header: a lost link is a reporting gap, a thrown hook is a
    // lost signup.
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'enrollment_lead_backlink_failed',
      outcome: 'partial',
      error_class: e?.constructor?.name || 'UnknownError',
      context: { lead_id: instance?.id ?? null, message: e?.message?.split('\n')[0] },
    }));
  }
}
