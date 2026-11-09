/**
 * cancelScheduledMessage — the single way a scheduled message is cancelled, paused or
 * superseded, and the reason it is impossible to do so without saying why.
 *
 * WHY THIS EXISTS. Measured in production over the 30 days to 2026-10-29: of the messages
 * cancelled in that window, 21,480 carried a reason and 13,643 carried none. A cancellation
 * with no reason is indistinguishable from a cancellation nobody chose, so nobody could tell
 * a deliberate suppression from a bug. The reason was not missing because the column was
 * missing — it was missing because 21 of the 27 call sites that cancel a row simply did not
 * write one, while 6 did.
 *
 * The fix is not "remember to add a reason". That is what was already being relied on. The
 * fix is to make the reason a REQUIRED PARAMETER of the only function that performs the
 * write, so forgetting it is a compile error rather than a silent data gap, and to back that
 * with a guard test that fails if a direct `status: 'cancelled'` write reappears anywhere
 * outside this module (see __tests__/cancellationReasonCoverage.test.ts).
 *
 * WHICH METADATA KEY, AND WHY IT MATTERS. The reason is written to `metadata.blocked_reason`.
 * That key is not a new invention and the choice is not cosmetic: it is the key the existing
 * readers already treat as the contract —
 *   - growthJourney/execution/reconcileExecutions.ts:70 reads it, and substitutes the literal
 *     string 'unknown' when it is absent. Those 13,643 rows are exactly what surfaces
 *     downstream as `blocked_reason: 'unknown'`.
 *   - growthJourney/health/journeyHealth.ts:163,250 buckets on it.
 * One previous writer (unsubscribeEnforcementService) used `cancelled_reason` instead, a key
 * nothing in the codebase reads, so its reason was recorded and still invisible. This module
 * writes `blocked_reason` for every path, which is what makes the reason actually arrive.
 *
 * THE JSONB MERGE IS NOT OPTIONAL. `metadata` is a JSONB column holding unrelated keys set
 * elsewhere (`cohort_start_date`, `quality_gate`, `approved_by`, …). Passing a plain object
 * to Sequelize's `update` REPLACES the whole column, which is what
 * unsubscribeEnforcementService.cancelPendingActions did — it destroyed every other key on
 * every row it touched. Every write here goes through a `COALESCE(metadata,'{}'::jsonb) || …`
 * literal instead, so existing keys survive. That is a bug fix carried by this refactor, not
 * a behaviour change requested by the ticket.
 *
 * IDEMPOTENCY. Both helpers are safe to re-run: they filter on the source statuses they are
 * allowed to move out of, so a row already `cancelled` is not re-cancelled and its original
 * reason and timestamp are preserved rather than overwritten by a later sweep.
 *
 * FAILURE PATH. These are thin wrappers over a single UPDATE. A database error propagates to
 * the caller unchanged and deliberately: every current call site either runs inside the
 * scheduler's per-action try/catch or inside a transaction, and swallowing the error here
 * would turn "this row was not cancelled" into "this row looks cancelled", which is the
 * failure mode this module exists to remove. There is no retry here; the scheduler re-reads
 * pending rows on its next tick, so an UPDATE that failed is simply attempted again.
 */
import { Op, WhereOptions } from 'sequelize';
// FROM THE MODELS INDEX, NOT models/ScheduledEmail DIRECTLY, and this is load-bearing. Every
// service that calls this helper imports its models from '../models', and their suites mock
// that module. A direct import of the model file is a DIFFERENT module to jest, so those mocks
// would not cover this helper and the real model would try to open a socket — which is exactly
// what happened: unsubscribeEnforcement.test.ts failed with SequelizeConnectionRefusedError on
// the first run after the refactor. Matching the call sites' import path keeps every existing
// mock working, and the index is the right layer for a service-tier helper anyway.
import { ScheduledEmail } from '../../models';

/**
 * The machine-readable reason vocabulary.
 *
 * "Machine-readable" is the ticket's word and it means a stable token that a query can GROUP
 * BY, not a sentence. Prose belongs in the log line next to the call, never here.
 *
 * The templated members carry a sub-reason decided at runtime by another gate; they keep the
 * prefix so the token is still groupable after the colon. `campaign_${string}` covers the
 * existing `campaign_archived` / `campaign_paused` / `campaign_completed` / `campaign_draft`
 * family that the scheduler composes from a campaign's own status, and
 * `communicationSafetyService` composes the `brand_*`, `lead_*`, `consent_*` and
 * `journey_hold:*` families the same way.
 */
export type CancellationReason =
  // Scheduler guards
  | 'enrollment_already_paid'
  | 'cohort_already_started'
  // Campaign lifecycle
  | 'campaign_archived'
  | 'campaign_paused'
  | 'campaign_completed'
  | 'lead_removed_from_campaign'
  // Sequence lifecycle
  | 'sequence_deleted'
  | 'sequence_reenrolled'
  | 'sequence_cancelled_for_lead'
  // Strategy-prep supersession
  | 'superseded_by_strategy_prep'
  | 'prep_window_passed'
  | 'prep_nudge_cancelled'
  // Consent and identity
  | 'lead_opted_out'
  | 'sms_stop_keyword'
  | 'converted_to_student'
  | 'hot_lead_escalation'
  // Scheduler housekeeping
  | 'auto_expired_stale'
  // Agent and draft lifecycle
  | 'test_action_not_retried'
  | 'test_harness_cleanup'
  | 'draft_superseded'
  | 'agent_draft_discarded'
  // Composed by a gate that owns its own sub-reason
  | `lead_not_sendable:${string}`
  | `campaign_${string}`
  | `brand_${string}`
  | `consent_${string}`
  | `journey_hold:${string}`
  | `test_action_${string}`;

/** Statuses a row may legitimately be moved OUT of by a cancellation. */
const CANCELLABLE_STATUSES = ['pending', 'processing', 'paused', 'agent_draft', 'explorer_draft'];

/**
 * Every status that is not a completed send and not already cancelled.
 *
 * This exists to preserve one caller's wider predicate verbatim. `archiveCampaign` cancelled
 * `status NOT IN ('sent','cancelled')`, which also sweeps up `failed` and the three terminal
 * draft states — broader than {@link CANCELLABLE_STATUSES}. Narrowing it while adding reasons
 * would be a silent behaviour change smuggled in under a logging ticket, so the set is named
 * and passed explicitly instead.
 *
 * The vocabulary is the one documented on the model's `status` column
 * (models/ScheduledEmail.ts:147-148). An enumerated list is used rather than a NOT IN so the
 * helper's single `status IN (…)` filter stays the only status predicate in the module.
 */
export const NOT_SENT_OR_CANCELLED_STATUSES = [
  'pending',
  'processing',
  'failed',
  'paused',
  'agent_draft',
  'explorer_draft',
  'explorer_draft_rejected',
  'explorer_draft_superseded',
];

/**
 * `config/database` is required LAZILY, not imported at the top, and this is not a style
 * choice.
 *
 * That module does `new Sequelize(env.databaseUrl)` at module scope. Any suite that mocks
 * `config/env` with only the fields it cares about leaves `databaseUrl` undefined, and the
 * constructor then throws `The "url" argument must be of type string` AT IMPORT TIME — before
 * a single test runs, reported as "Test suite failed to run" with no test names. Two suites
 * died exactly that way on the first run after this refactor (portalLoginUrl,
 * acceleratorService.liveOccurrence), because a top-level import here propagates to every
 * service that calls this helper and to every suite that imports one of them.
 *
 * Deferring it means module load touches nothing, and the instance is built only when a
 * cancellation is actually performed. It is the same eager-construction-at-import mechanism
 * documented in src/__tests__/testSupport/configMocks.ts, met from the other side.
 */
function getSequelize() {
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
  return require('../../config/database').sequelize;
}

/**
 * The JSONB merge expression. Built as a literal because the whole point is to preserve the
 * other keys on the column, which a plain object cannot do.
 *
 * The reason is passed through `sequelize.escape` rather than interpolated. It arrives from a
 * closed union so it is not attacker-controlled today, but the templated members accept a
 * runtime substring from other gates, and a value that is "trusted by construction" is one
 * refactor away from not being. Escaping costs nothing.
 */
function metadataMerge(reason: string, extraKeys?: Record<string, unknown>) {
  const sequelize = getSequelize();
  const pairs: string[] = [
    `'blocked_reason', ${sequelize.escape(reason)}`,
    `'cancelled_at', NOW()`,
  ];
  for (const [k, v] of Object.entries(extraKeys ?? {})) {
    // Keys are developer-authored literals at the call sites; values may be runtime data.
    pairs.push(`${sequelize.escape(k)}, ${sequelize.escape(v === undefined ? null : (v as any))}`);
  }
  return sequelize.literal(
    `COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(${pairs.join(', ')})`
  );
}

/**
 * Cancel ONE scheduled message, recording why.
 *
 * Takes the loaded instance because every current caller already has one, and re-fetching it
 * would widen the race the scheduler's lease is there to close.
 *
 * @param action The ScheduledEmail row to cancel.
 * @param reason A token from {@link CancellationReason}. Not optional, by design.
 * @param extraKeys Additional metadata keys to record alongside the reason (e.g. the
 *   address a test-mode block refused), merged into the column rather than replacing it.
 * @param opts.statuses Override which source statuses may be cancelled. The retry agents
 *   cancel rows sitting in `failed`, which is deliberately NOT in the default set — a
 *   cancellation is normally a decision about something still pending, and letting `failed`
 *   in by default would let any sweep relabel send failures as deliberate suppressions.
 *   Those callers pass `['failed']`; without it the update would match nothing and the row
 *   would be picked up by the retry loop again on the next pass.
 * @returns true if a row was changed, false if it was already in a terminal state.
 */
export async function cancelScheduledMessage(
  action: ScheduledEmail,
  reason: CancellationReason,
  extraKeys?: Record<string, unknown>,
  opts?: { statuses?: string[] }
): Promise<boolean> {
  const [count] = await ScheduledEmail.update(
    { status: 'cancelled', metadata: metadataMerge(reason, extraKeys) } as any,
    {
      where: {
        id: (action as any).id,
        status: { [Op.in]: opts?.statuses ?? CANCELLABLE_STATUSES },
      },
    }
  );
  return count > 0;
}

/**
 * Cancel EVERY scheduled message matching a where clause, recording why.
 *
 * The caller supplies its own `where` unchanged, so the population each site cancels is
 * exactly what it cancelled before this module existed; only the reason is added. A status
 * filter is intersected in so the call cannot resurrect or relabel an already-terminal row.
 *
 * @param where The caller's own selection (campaign, lead, sequence, …).
 * @param reason A token from {@link CancellationReason}.
 * @param opts.statuses Override which source statuses may be cancelled. Defaults to the
 *   non-terminal set; pass explicitly only when a caller legitimately needs a narrower one.
 * @param opts.transaction Pass the caller's transaction so the cancel commits with it.
 * @returns the number of rows changed.
 */
export async function cancelScheduledMessagesWhere(
  where: WhereOptions,
  reason: CancellationReason,
  opts?: { statuses?: string[]; transaction?: any; extraKeys?: Record<string, unknown> }
): Promise<number> {
  const statuses = opts?.statuses ?? CANCELLABLE_STATUSES;
  const [count] = await ScheduledEmail.update(
    { status: 'cancelled', metadata: metadataMerge(reason, opts?.extraKeys) } as any,
    {
      where: { ...(where as any), status: { [Op.in]: statuses } },
      ...(opts?.transaction ? { transaction: opts.transaction } : {}),
    }
  );
  return count;
}

/**
 * Pause every scheduled message matching a where clause, recording why.
 *
 * Pausing is a block with an intent to resume, so it is a separate function rather than a
 * flag on the cancel one: a paused row is still cancellable later, and conflating the two
 * would let a resume path silently revive something that was genuinely cancelled. Only
 * `pending` rows pause, because a row mid-send cannot be un-sent.
 */
export async function pauseScheduledMessagesWhere(
  where: WhereOptions,
  reason: CancellationReason,
  opts?: { transaction?: any }
): Promise<number> {
  const [count] = await ScheduledEmail.update(
    { status: 'paused', metadata: metadataMerge(reason) } as any,
    {
      where: { ...(where as any), status: 'pending' },
      ...(opts?.transaction ? { transaction: opts.transaction } : {}),
    }
  );
  return count;
}
