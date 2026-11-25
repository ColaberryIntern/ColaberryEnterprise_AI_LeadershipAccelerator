import { resolveExplorerBrandContext } from '../explorerIdentity';

/**
 * Give a just-registered Explorer their BRAND RELATIONSHIP, at registration.
 *
 * ─── THE DEFECT THIS CLOSES ─────────────────────────────────────────────────
 *
 * Measured on production 2026-11-24: 1,247 `explorer_journey_profiles`, of which
 * **26 had no `lead_tenant_contexts` row at all**. Every one of the 26 was
 * created on 2026-11-23 or 2026-11-24, which is to say: every Explorer
 * registered since the one-off backfill ran, and none before it. 25 of the 26
 * came in through the `open_house` door, 1 through `ccpp_winback`. All 26 had a
 * `lead_id`, so this was never an unlinkable profile - the row simply was not
 * being written.
 *
 * The backfill fixed HISTORY and nothing else. Of the three registration doors,
 * only `freeSignupService` wrote this row itself, which is why all 561
 * `free_signup` profiles have one and the 530 `open_house` profiles that have
 * one got it from the backfill rather than from the door. At roughly 12 new
 * Explorers a day, the gap reopens as fast as it was closed.
 *
 * ─── WHY HERE, AND NOT IN THE THREE DOORS ───────────────────────────────────
 *
 * `bridgeExplorerProfileAtRegistration` is the one choke point all three doors
 * already call, and the brand relationship belongs at the same moment as the
 * profile for the same reason the profile belongs at registration: a record
 * created by a nightly repair is a record that does not exist for a day.
 *
 * Writing it in each door instead would be three copies to keep in step, and
 * would still miss the next door somebody adds. It would also mean editing
 * `enrollmentService.ts`, which is 580 lines and therefore over CLAUDE.md's
 * 500-line hard ceiling: the rule says split before adding, and a 3-line fix is
 * a bad reason to move a function that sends welcome email.
 *
 * ─── IT CANNOT CHANGE WHO MAY BE CONTACTED. THIS IS THE LOAD-BEARING CLAIM ──
 *
 * `consentContact` is `false`, always, and that makes this write SEND-NEUTRAL
 * rather than merely cautious. `brandPreferenceGate` resolves a lead's context
 * and then returns:
 *
 *     context.consent_contact ? allowed:'relationship_consent'
 *                             : blocked:'no_consent'
 *
 * and with no context at all it returns `blocked:'no_relationship'`. So a row
 * with consent false and no row are the SAME ANSWER to the only question that
 * gate asks: both block. Adding these rows moves nobody from blocked to
 * allowed.
 *
 * It cannot downgrade anybody either. `ensureLeadTenantContext` only ever grants
 * consent on an existing row (`if (input.consentContact && !existing.consent_contact)`),
 * so passing false adds nothing to the patch. That makes this safe to call on
 * the portal path too, where `freeSignupService` may already have recorded a
 * real, affirmative consent moments earlier, in either order.
 *
 * Consent is therefore left to the doors that actually showed somebody a
 * checkbox and can say what it said. Inheriting it here would be, in the words
 * of `leadContextService`, "a CAN-SPAM problem wearing a data-model costume".
 *
 * ─── FAILURE-FIRST ──────────────────────────────────────────────────────────
 *
 * A relationship failure must never fail a registration, for the same reason the
 * profile bridge swallows its own errors: the signup is the event we care about
 * and this row is bookkeeping we can rebuild. So every path returns an outcome
 * and nothing throws. The outcome is returned rather than logged-and-dropped so
 * the caller's tests can assert on it.
 *
 * Unresolvable brand is a REPORTED outcome, not a silent one, and not a default:
 * guessing a tenant would put a row under a tenant nobody can authorize later.
 */
export type ExplorerBrandRelationshipOutcome =
  /** The row did not exist and now does. */
  | 'created'
  /** The row was already there. Idempotent re-run, or the portal door got there first. */
  | 'existed'
  /** Explorer's brand could not be resolved, so nothing was written. */
  | 'skipped_unresolved_brand'
  /** The write was attempted and threw. Logged by error class. */
  | 'failed';

export async function ensureExplorerBrandRelationship(
  leadId: number,
  entryPoint: string,
): Promise<ExplorerBrandRelationshipOutcome> {
  try {
    const context = await resolveExplorerBrandContext();
    if (!context) return 'skipped_unresolved_brand';

    // Imported lazily, matching the convention the registration doors already use
    // for their own cross-module writes, so this module stays cheap to import
    // from a path that may not need it.
    const { ensureLeadTenantContext } = await import('../../modules/tenancy/leadContextService');

    const result = await ensureLeadTenantContext({
      leadId,
      tenantId: context.tenantId,
      brandId: context.brandId,
      // 'learner' is what every Explorer door creates, and it is the value
      // `freeSignupService` already passes, so the rows this writes are the same
      // shape as the 561 that path has produced.
      relationshipType: 'learner',
      // See the header. False is the whole safety argument, not a placeholder.
      consentContact: false,
      consentSource: null,
      attribution: {},
    });

    return result.created ? 'created' : 'existed';
  } catch (error) {
    // By error CLASS, with the lead id and never the address: ids carry no PII.
    console.error('[explorerBrandRelationship] write failed', {
      error_class: error instanceof Error ? error.constructor.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      lead_id: leadId,
      entry_point: entryPoint,
      impact: 'this Explorer is absent from brand-scoped reads until the next backfill',
    });
    return 'failed';
  }
}
