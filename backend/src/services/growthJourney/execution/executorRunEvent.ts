import { emitAiEvent } from '../../aiEventService';
import { EXECUTOR_AGENT_NAME } from './proposalFiler';
import type { ExecutorSummary } from './runExecutor';

/**
 * One `ai_events` row per RUN (Phase 6, T609), so the alerting has an honest denominator.
 *
 * ─── ONE EVENT PER RUN THAT RAN, AND NONE FOR A RUN THAT DID NOT ────────────
 *
 * Emitted from the single place every executing run reaches, beside the closing
 * log, so a run cannot produce two events or none. The early return above -
 * the flags are off, `status: 'skipped'` - deliberately emits NOTHING: a skipped
 * run did not execute, and counting it `success` would pad the denominator with
 * runs that never did any work, which is the opposite of what this event is for.
 * Today every run is skipped, so this table stays empty until Ali enables the
 * capability. That is the intended reading of an empty table, not a missing emit.
 *
 * ─── failure MEANS "A STAGE BROKE", WHICH IS WHAT `stage_errors` RECORDS ────
 *
 * `stage()` catches per stage and pushes to `s.stage_errors` rather than
 * throwing, so a run with a broken stage still completes and still returns a
 * summary. The event's outcome is therefore derived from that array, not from a
 * caught exception. `AiEventOutcome` has no `partial` member - the sibling log
 * line's vocabulary is wider than the column's - so a partial run is a
 * `failure` here: something did not happen that should have.
 *
 * ─── NO REDACTION, BECAUSE THERE IS NOTHING REDACTABLE ──────────────────────
 *
 * The plan asked for `redactForLogs` on the metadata. `redactForLogs` takes a
 * STRING, and running it over a serialised object is the "redact the envelope"
 * mistake: it mangles roughly one UUID in fifty, and `correlation_id` is a UUID.
 * So instead the metadata is built to contain nothing that could need redacting
 * - counts, stage names from a closed union, and error classes from
 * `classifyError` - and that is asserted by its own test rather than left to
 * this comment.
 *
 * ─── WHY THIS IS ITS OWN FILE, AND WHY THE IMPORT POINTS AT proposalFiler ───
 *
 * `runExecutor.test.ts` pins `runExecutor.ts` under 300 lines - it is meant to
 * stay a thin orchestrator, and the plan's "<= 295" was that pin restated.
 * Writing the emit inline took it to 346 and the guard failed, correctly. So the
 * emit lives here and `runExecutor` gains one import and one call.
 *
 * That makes the direction of the remaining import load-bearing. `ExecutorSummary`
 * comes from `runExecutor` as `import type`, which is erased, so there is no
 * runtime edge back. The agent name comes from `proposalFiler`, which imports
 * nothing of `runExecutor`. `runExecutor` also exports an `EXECUTOR_AGENT`
 * constant with the identical string, and using THAT would have closed a real
 * require cycle: this module would have been reading a value from the module
 * that imports it. It works today only because the read happens inside an async
 * function long after both modules have initialised, which is exactly the kind
 * of accident that stops working when someone hoists it. `proposalFiler` is also
 * the honest home for the name - it is the identity every journey proposal is
 * filed under.
 *
 * ─── AND ONE DETAIL THE PLAN'S CALL WOULD HAVE GOT WRONG ────────────────────
 *
 * `s.reconcile` is `ReconcileSummary | null` - null whenever the reconcile stage
 * threw - so `scanned` is read through `?? 0` rather than assuming a stage that
 * may well be the one that failed produced a summary.
 */
export async function emitRunEvent(s: ExecutorSummary, correlation_id: string, duration_ms: number): Promise<void> {
  const failed = s.stage_errors.length > 0;
  await emitAiEvent({
    event_type: 'growth_journey.executor_run',
    outcome: failed ? 'failure' : 'success',
    agent_id: EXECUTOR_AGENT_NAME,
    trace_id: correlation_id,
    duration_ms,
    error_class: failed ? s.stage_errors[0].error_class : null,
    metadata: {
      programs: s.plan.programs,
      planned: s.plan.planned,
      enrolled: s.execute.enrolled,
      reconciled: s.reconcile?.scanned ?? 0,
      stages_failed: s.stage_errors.map((e) => e.stage),
      error_classes: s.stage_errors.map((e) => e.error_class),
    },
  });
}
