import { fn, col, where as sqWhere } from 'sequelize';
import { normalizeEmailForLink, pickLeadForEnrollment, type LinkableLead } from './enrollmentLeadLink';

/**
 * THE I/O HALF OF R18's ENROLLMENT -> LEAD LINK.
 *
 * `enrollmentLeadLink.ts` holds every judgement and is tested without a database. This module
 * does the read and the model hook, and holds none of its own: same split as
 * `campaignAttributionService` / `attributionModels`.
 */

/** What the hook needs off an `Enrollment` instance. Declared, not imported, so the model can
 *  import this module without a cycle — the same reason `RegistrableStudentProject` is declared
 *  in `projectLifecycleRegistration.ts` rather than importing `Project`. */
export interface LinkableEnrollment {
  id?: string;
  email?: string | null;
  lead_id?: number | null;
  set?: (key: string, value: unknown) => void;
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
 * The `leads.id` for an email, or `null` when there is no lead to link.
 *
 * The comparison is `lower(btrim(email))` on BOTH sides, because neither column is stored
 * consistently (see `normalizeEmailForLink`). That makes the predicate non-sargable and the
 * `leads` index on email unusable — accepted deliberately: this runs once per enrollment INSERT,
 * a few dozen times a month, against 25,567 rows. A functional index exists to be added if that
 * ever stops being true, and adding one now would be an index nothing has asked for.
 *
 * `attributes` is narrowed to the two columns the decision reads. `leads` has 67 columns and the
 * hook needs two of them.
 *
 * Never throws. A failed read returns `null` and is logged: attribution rides on top of an
 * enrollment that must be created either way, so losing the link must not cost the enrollment.
 * That is the same contract `utmBackfill`'s caller keeps on the lead side.
 */
export async function resolveLeadIdForEmail(email: unknown): Promise<number | null> {
  const normalized = normalizeEmailForLink(email);
  if (normalized === null) return null;

  try {
    const { Lead } = await import('../../models');
    const rows = await Lead.findAll({
      where: sqWhere(fn('lower', fn('btrim', col('email'))), normalized),
      attributes: ['id', 'created_at'],
    });
    return pickLeadForEnrollment(rows as unknown as LinkableLead[]);
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'enrollment_lead_link_lookup_failed',
      outcome: 'partial',
      error_class: err?.constructor?.name || 'UnknownError',
      context: { message: err?.message?.split('\n')[0] },
    }));
    return null;
  }
}

/**
 * `Enrollment` model `beforeCreate` hook: stamp the lead this enrollment came from.
 *
 * ── WHY A HOOK AND NOT A CALL AT EACH SIGNUP ─────────────────────────────────────────
 *
 * There are seven places that create an `Enrollment`: four in `enrollmentService`
 * (`createPendingEnrollment`, `createInvoiceEnrollment`, `createManualEnrollment`, the open-house
 * explorer path), plus `freeAccountRegistration`, `openHouseCreditService` and
 * `sponsorController`. Every one of them is a real acquisition path, and the free-registration
 * path is specifically where the live Meta campaign lands. Editing seven call sites links the
 * seven that exist today and silently misses the eighth, which is the failure mode this chain
 * already had once: `utmBackfill`'s header records `utm_content` reaching the session "and
 * stopping there" because one copy did not know about a column.
 *
 * So the invariant lives at the single point every path goes through, as `Project.ts` already
 * does for tenant attribution (`beforeCreate: studentProjectTenantHook`). Running BEFORE the
 * insert means the row is correct when it lands rather than corrected by a second write, which
 * also avoids the race `utmBackfill` explicitly cannot close from the patching side.
 *
 * A caller that supplied a `lead_id` is never overridden: an explicit link is a decision, and
 * resolution is only the fallback for the paths that have none.
 *
 * Never throws, and never blocks the insert. An unresolvable lead leaves `lead_id` NULL, which
 * reads as "not linked" everywhere — the state 100 of production's 1,436 enrollment emails will
 * stay in permanently, because they have no `leads` row at all.
 */
export async function enrollmentLeadLinkHook(instance: LinkableEnrollment): Promise<void> {
  if (instance?.lead_id !== undefined && instance?.lead_id !== null) return;

  const leadId = await resolveLeadIdForEmail(instance?.email);
  if (leadId === null) return;

  // `set` when Sequelize gave us an instance, direct assignment when a test passed a plain
  // object. Both are real callers and neither should need to know about the other.
  if (typeof instance.set === 'function') instance.set('lead_id', leadId);
  else instance.lead_id = leadId;

  log({
    event: 'enrollment_lead_linked',
    outcome: 'success',
    context: { enrollment_id: instance.id ?? null, lead_id: leadId, entry_point: 'enrollment.beforeCreate' },
  });
}
