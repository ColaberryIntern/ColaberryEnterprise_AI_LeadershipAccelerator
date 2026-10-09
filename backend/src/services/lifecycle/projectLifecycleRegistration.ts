import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

/**
 * Register a lifecycle for every delivery project that gets created — from the MODEL, not from
 * the services that call it.
 *
 * ## Why a model hook and not a service wrapper
 *
 * Acceptance ID LC-01 requires that every new-project entry route or job registers exactly one
 * lifecycle. The discovery record for this programme proposed wrapping three "natural
 * chokepoints" instead. Measured at `509335f5`, that set covers 6 of the 7 creation sites read
 * as categories and 5 of 7 as actually enumerated — and the site it missed,
 * `services/factory/govDeliveryProject.ts`, was added three days after the inventory was taken
 * and is LIVE in production. A hand-maintained list of call sites was wrong within a week.
 *
 * This repository has already paid for that lesson once, on a different table.
 * `services/workLedger/ticketCreationLedgerHook.ts` records it: three confirmed ticket-creation
 * paths called `Ticket.create()` directly, bypassing the single service that emitted the ledger
 * row, and ~90% of 16,070 production tickets ended up with no ledger event. The fix there was an
 * `afterCreate` hook on the model, because a model hook cannot be bypassed by someone adding
 * another service wrapper. That argument transfers here and is why this file exists.
 *
 * ## WHAT DOES NOT TRANSFER FROM THAT PRECEDENT — read this before changing anything below
 *
 * The ticket hook is safe to fail silently. This one is not, and the difference is measurable:
 *
 *   - `services/ticketService.ts` contains the word "transaction" ZERO times. Tickets are created
 *     on an autocommitting connection, so its hook can write on any connection and still see its
 *     parent row.
 *   - Both live delivery-project creations happen INSIDE an explicit transaction —
 *     `govDeliveryProject.ts:126` opens `sequelize.transaction` and creates at `:134`;
 *     `leadConversion.ts:175` creates with `{ transaction: tx }`.
 *   - `project_lifecycle_states.delivery_project_id` is a real FK to `delivery_projects(id)`.
 *
 * So a hook copying the ticket precedent — writing outside the transaction, swallowing its own
 * errors — could not see the uncommitted parent row, would trip the FK, and would swallow that
 * failure. The result is a created project with no lifecycle: exactly the hole LC-01 exists to
 * close, arriving through the one path its evidence was least likely to check. Two consequences
 * follow, and both are deliberate:
 *
 * 1. **This hook joins the create's transaction.** Sequelize passes the originating options as
 *    the hook's second argument (`node_modules/sequelize/lib/model.js:2547` —
 *    `runHooks(`after${hook}`, result, options)`), so `options.transaction` is forwarded below.
 * 2. **This hook does NOT catch its own errors.** Joining the transaction means a failure here
 *    aborts the create, which is the correct outcome: a delivery project that cannot be
 *    registered must not exist. This is the OPPOSITE of the ticket hook's contract, where a lost
 *    ledger event is cosmetic. Do not "harden" this by adding a try/catch — that would restore
 *    the silent-unregistered-project failure this whole file is built to prevent.
 *
 * ## Why ON CONFLICT DO NOTHING is required, not stylistic
 *
 * `manifestWriter.ts` records the reason: "a unique violation inside a transaction poisons it,
 * and Sequelize reports every integrity violation as the same 'Validation error' regardless of
 * which constraint fired." Because this hook now runs inside the caller's transaction, catching a
 * duplicate is not an option — the transaction is already unusable by then. And a duplicate is
 * not an error here: gov re-approval is idempotent by deterministic slug and re-runs
 * `ensureGovTwoTrackProject` on every approval, so a conflict means "already registered", which
 * is success. Without `ON CONFLICT DO NOTHING`, consequence 2 above would turn every gov
 * re-approval into a failed approval.
 *
 * Idempotency is enforced by the database, not by this code: `uq_lifecycle_delivery_project` is a
 * partial unique index on `delivery_project_id` (`db/ensureProjectLifecycleSchema.ts:97`), shipped
 * and verified in production at 10/10 indexes. The conflict target below names that index's
 * predicate so inference resolves to it.
 *
 * ## Failure-First Design
 *
 * 1. What happens if this fails? The surrounding create is rolled back and the caller sees the
 *    error. For the gov approval path that surfaces as the route's existing non-fatal
 *    `projectWarning` (`routes/admin/govQualificationRoutes.ts:719-734`), which is best-effort by
 *    design — so an aborted create degrades to "approved, project will be retried" rather than a
 *    failed approval. That wrapper was read as a hazard while this hook was being designed; under
 *    this contract it is the right backstop.
 * 2. Retry? None here. `ensureGovTwoTrackProject` is idempotent and the caller retries.
 * 3. Recovery if exhausted? `unregisteredDeliveryProjectsSince()` below is the detector. Run it
 *    against production to get a count rather than inferring from logs.
 * 4. Handled vs not handled: this closes every path that goes through `DeliveryProject.create()`,
 *    `findOrCreate()` or an instance `.save()`. It does NOT fire for `bulkCreate` without
 *    `individualHooks: true` (`model.js:1568`), for `upsert`, for raw SQL, or when a caller passes
 *    `hooks: false` (`model.js:2546` guards the whole invocation on it). All four were swept to
 *    ZERO occurrences on this table at `509335f5`, and the test suite carries a tripwire that
 *    fails by name if any of them appears, so the gap is monitored rather than merely disclosed.
 *
 * STUDENT PROJECTS ARE NOT REGISTERED HERE, and that is not an oversight. `project_lifecycle_states
 * .tenant_id` is `NOT NULL REFERENCES tenants(id)`, and `models/Project.ts` has no tenant column —
 * nor do `Enrollment`, `Cohort`, `ProgramBlueprint`, `PlatformIdentity`, `UserCurriculumProfile` or
 * `AdminUser`. There is no row-derivable tenant for a student project and a model hook has no
 * request context to resolve one from. That was escalated to the DRI, who chose to add `tenant_id`
 * to `projects` and backfill it; until that lands, `Project` is deliberately unwired. See
 * `docs/project-lifecycle/` and the run's P6-T1b.
 */

/**
 * When registration went live. A `delivery_projects` row created after this with no lifecycle row
 * proves a bypass — the detector for the residual gap in item 4 above, copied from
 * `TICKET_LEDGER_HOOK_LIVE_SINCE`'s role in the ticket precedent. A disclosed gap with no detector
 * is just a sentence.
 */
export const LIFECYCLE_REGISTRATION_LIVE_SINCE = new Date('2026-10-09T00:00:00.000Z');

/** The stage every project starts in. Matches the column default and `lifecycleStages`. */
const INITIAL_STAGE = 'discovery';

function log(fields: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level: fields.outcome === 'failure' ? 'error' : 'info',
    service: 'backend', ...fields,
  }));
}

/**
 * The shape this hook needs off the instance. Declared rather than importing `DeliveryProject`,
 * because the model imports this module to wire the hook and importing it back would be circular
 * — the same reason `capeSkillMappingHook` uses a dynamic import in the TimelineCard precedent.
 */
interface RegistrableDeliveryProject {
  id: string;
  tenant_id: string;
}

/** Options Sequelize hands an `afterCreate` hook, narrowed to what is used. */
interface HookOptions {
  transaction?: unknown;
  /**
   * Optional provenance. A model hook cannot know which service called it, so `entry_point`
   * records the mechanism by default and only names a caller when one chooses to say. Guessing
   * the caller from the row's shape would be fabricated provenance.
   */
  lifecycleEntryPoint?: string;
}

/**
 * `DeliveryProject` model `afterCreate` hook. A named, exported function rather than an inline
 * closure so it can be tested directly and so the wiring in `models/DeliveryProject.ts` reads as
 * a reference to a documented contract.
 *
 * Throws on failure. See consequence 2 in the header before changing that.
 */
export async function deliveryProjectLifecycleHook(
  instance: RegistrableDeliveryProject,
  options?: HookOptions,
): Promise<void> {
  const entryPoint = options?.lifecycleEntryPoint ?? 'delivery_project.afterCreate';

  const inserted = await sequelize.query<{ id: string }>(
    `INSERT INTO project_lifecycle_states
       (tenant_id, delivery_project_id, stage, entry_point)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (delivery_project_id) WHERE delivery_project_id IS NOT NULL DO NOTHING
     RETURNING id`,
    {
      bind: [instance.tenant_id, instance.id, INITIAL_STAGE, entryPoint],
      type: QueryTypes.SELECT,
      transaction: (options?.transaction ?? undefined) as never,
    },
  );

  log({
    event: 'project_lifecycle_registered',
    outcome: 'success',
    delivery_project_id: instance.id,
    tenant_id: instance.tenant_id,
    entry_point: entryPoint,
    // false means the row already had a lifecycle, which is a replay, not a problem.
    created: Boolean(inserted[0]?.id),
  });
}

/**
 * Every `delivery_projects` row created since registration went live that has NO lifecycle row.
 *
 * This is the measurement for the residual gap, and the LC-01 production evidence. It is
 * path-agnostic on purpose: it asks the question LC-01 actually poses — "is there a project
 * without a lifecycle?" — rather than checking the paths someone remembered to instrument. A new
 * bypass shows up here without this query being changed.
 *
 * Returns rows, not a count, so an operator can see WHICH projects are unregistered. An empty
 * array is the healthy answer.
 */
export async function unregisteredDeliveryProjectsSince(
  since: Date = LIFECYCLE_REGISTRATION_LIVE_SINCE,
): Promise<Array<{ id: string; tenant_id: string; created_at: Date }>> {
  return sequelize.query<{ id: string; tenant_id: string; created_at: Date }>(
    `SELECT dp.id, dp.tenant_id, dp.created_at
       FROM delivery_projects dp
       LEFT JOIN project_lifecycle_states pls ON pls.delivery_project_id = dp.id
      WHERE dp.created_at >= $1
        AND pls.id IS NULL
      ORDER BY dp.created_at`,
    { bind: [since], type: QueryTypes.SELECT },
  );
}
