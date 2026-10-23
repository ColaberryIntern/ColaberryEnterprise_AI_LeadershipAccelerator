/**
 * Measure readiness when a build event happens, and advance the hop if the pipeline performed
 * the work that hop is made of.
 *
 * Design: `readiness-and-approval-separation.md` §9 step 2. This is the piece that makes the
 * rest fire — until now the computation, the table and the advancer all existed with no caller.
 *
 * ## Best-effort, like every other observer in this repo
 *
 * A measurement must never break the build it observes. Everything below is inside one catch,
 * the failure is logged with a stable `error_class`, and the caller gets a result object rather
 * than an exception. `roomOutboxService` and `recordPlaybackBeat` take the same posture, and the
 * broadcast one taught this programme why the MESSAGE has to be logged and not only the class:
 * a write path that said `SequelizeDatabaseError` and nothing else stayed dead for nine days.
 *
 * ## It runs AFTER the transaction, deliberately
 *
 * `publishPlan` does its work inside `sequelize.transaction` with the project's rows locked.
 * Measuring inside that would read uncommitted evidence and hold locks while doing it, so the
 * call site is after the publish returns. The cost is a window where a crash loses the
 * measurement; that is the right trade, because the measurement is reconstructible from the
 * evidence and a held lock is not free.
 *
 * ## One event, one act, one hop
 *
 * It does not cascade. A single build event is the pipeline claiming it performed ONE act, so it
 * attempts at most one hop. Walking several hops from one event would mean claiming work that
 * event did not do, which is the whole thing `lifecycleAutoAdvance` exists to prevent.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { readLifecycleEvidence, type LifecycleRow } from './lifecycleEvidence';
import { nextHopReadiness } from './lifecycleReadiness';
import { recordReadiness } from './lifecycleReadinessStore';
import { autoAdvance } from './lifecycleAutoAdvance';
import { isLifecycleStage, type LifecycleStage } from './lifecycleStages';

export interface ReadinessHookResult {
  /** A readiness row was written, or one with the same evidence already existed. */
  measured: boolean;
  /** The stage moved. False whenever no act was reported, or the hop is a human one. */
  advanced: boolean;
  /** Short, stable, for the log and for tests. */
  outcome:
    | 'measured'
    | 'measured_and_advanced'
    | 'no_lifecycle'
    | 'end_of_chain'
    | 'unknown_stage'
    | 'failed';
}

const log = (event: string, outcome: string, context: Record<string, unknown>): void => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'lifecycle-readiness',
    event,
    outcome,
    ...context,
  }));
};

/**
 * Measure, record, and optionally advance, for one student project.
 *
 * `performedAct` is the work permission the pipeline exercised. Omit it and this only measures —
 * which is the common case and the useful one: it is what lets a surface say "three projects are
 * waiting for your `requirement.approve`" instead of nobody knowing.
 */
export async function measureReadinessOnBuildEvent(input: {
  studentProjectId: string;
  event: string;
  performedAct?: string | null;
}): Promise<ReadinessHookResult> {
  const { studentProjectId, event } = input;

  try {
    const rows = await sequelize.query<LifecycleRow>(
      `SELECT id, tenant_id, student_project_id, delivery_project_id, stage, condition,
              condition_reason
         FROM project_lifecycle_states
        WHERE student_project_id = :projectId`,
      { replacements: { projectId: studentProjectId }, type: QueryTypes.SELECT },
    );
    const row = rows[0];

    if (!row) {
      // Expected for the projects that predate the registration hook, and not an error: they
      // are untouched and nothing blocks them. Logged so the population stays visible.
      log('lifecycle_readiness_skipped', 'partial', {
        event, student_project_id: studentProjectId, reason: 'no_lifecycle',
      });
      return { measured: false, advanced: false, outcome: 'no_lifecycle' };
    }

    if (!isLifecycleStage(row.stage)) {
      log('lifecycle_readiness_skipped', 'failure', {
        event,
        student_project_id: studentProjectId,
        reason: 'unknown_stage',
        stage: row.stage,
        error_class: 'ContractViolation',
      });
      return { measured: false, advanced: false, outcome: 'unknown_stage' };
    }

    const stage = row.stage as LifecycleStage;
    const evidence = await readLifecycleEvidence(row);
    const readiness = nextHopReadiness(stage, evidence);

    if (!readiness) {
      log('lifecycle_readiness_measured', 'success', {
        event, student_project_id: studentProjectId, stage, reason: 'end_of_chain',
      });
      return { measured: false, advanced: false, outcome: 'end_of_chain' };
    }

    await recordReadiness({
      tenantId: row.tenant_id,
      lifecycleStateId: row.id,
      readiness,
      performedAct: input.performedAct ?? null,
    });

    let advanced = false;
    if (input.performedAct) {
      const decision = await autoAdvance({
        lifecycleStateId: row.id,
        from: stage,
        performedAct: input.performedAct,
        readiness,
      });
      advanced = decision.allowed;

      if (!advanced) {
        // A refusal here is the normal case, not a fault: most hops are human. Logged at info
        // with its reason so "why did this not move" is answerable without a debugger.
        log('lifecycle_readiness_not_advanced', 'partial', {
          event,
          student_project_id: studentProjectId,
          from: stage,
          to: readiness.targetStage,
          refusal: decision.refusal,
          performed_act: input.performedAct,
        });
      }
    }

    log('lifecycle_readiness_measured', 'success', {
      event,
      student_project_id: studentProjectId,
      stage,
      target_stage: readiness.targetStage,
      satisfied: readiness.satisfied,
      blocking: readiness.blocking.length,
      advanced,
    });

    return {
      measured: true,
      advanced,
      outcome: advanced ? 'measured_and_advanced' : 'measured',
    };
  } catch (err) {
    // Swallowed on purpose, with the MESSAGE — see the header.
    log('lifecycle_readiness_failed', 'failure', {
      event,
      student_project_id: studentProjectId,
      error_class: (err as Error)?.name ?? 'UnexpectedError',
      error_message: (err as Error)?.message ?? String(err),
    });
    return { measured: false, advanced: false, outcome: 'failed' };
  }
}
