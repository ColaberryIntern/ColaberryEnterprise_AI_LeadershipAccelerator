/**
 * milestoneSweep — re-evaluate every student's rank in one pass. The nightly
 * safety net behind the event triggers (card completion, story verification,
 * certification approval), and the body of the admin "recompute" button.
 *
 * WHY A SWEEP EXISTS AT ALL. Each trigger evaluates one student at one moment.
 * A milestone can become true without any trigger firing for that student —
 * a curriculum week that was authored late and back-published, a plan whose
 * last story verified on a push that failed before the evaluator ran, an
 * approval whose promotion call hit a transient error. The sweep is what makes
 * "if it is true, the ladder reflects it" hold by the next morning rather than
 * "when the student next happens to complete a card".
 *
 * Idempotent: everything it calls latches or re-affirms. Bounded: sequential,
 * one student at a time, with a per-student try/catch so one bad row cannot
 * stop the pass; there is no retry inside the pass, the next night is the
 * retry. Emits one structured line per pass and one per promotion.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { env } from '../../config/env';
import { evaluateForEnrollment } from './promotionService';

export interface SweepSummary {
  evaluated: number;
  promoted: number;
  failed: number;
  duration_ms: number;
  ladder: 'milestone' | 'legacy';
}

function log(event: string, outcome: 'success' | 'failure' | 'partial', context: Record<string, unknown>, level: 'info' | 'warn' | 'error' = 'info'): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level, service: 'progression-sweep', event, outcome, context,
  }));
}

/**
 * Everyone the ladder could move: every enrollment that has ever been scored
 * (`student_level`) plus every enrollment with a published plan or any card
 * completion, so a student whose first evaluation never ran is not skipped.
 */
async function candidateEnrollmentIds(): Promise<string[]> {
  const rows = await sequelize.query<{ enrollment_id: string }>(
    `SELECT enrollment_id FROM student_level
      UNION
     SELECT DISTINCT enrollment_id FROM timeline_card_progress WHERE status = 'completed'
      UNION
     SELECT DISTINCT p.enrollment_id FROM projects p
       JOIN build_plans b ON b.project_id = p.id AND b.status = 'published'`,
    { type: QueryTypes.SELECT },
  );
  return rows.map((r) => r.enrollment_id).filter(Boolean);
}

export async function recomputeAllMilestonePromotions(opts: { triggeredBy: string } = { triggeredBy: 'scheduler' }): Promise<SweepSummary> {
  const started = Date.now();
  const ladder = env.milestoneLadderEnabled ? 'milestone' : 'legacy';
  const ids = await candidateEnrollmentIds();
  let promoted = 0;
  let failed = 0;
  for (const enrollmentId of ids) {
    try {
      const out = await evaluateForEnrollment(enrollmentId);
      if (out.promoted) {
        promoted += 1;
        log('progression_sweep_promoted', 'success', { enrollment_id: enrollmentId, level: out.level, rank: out.rank, ladder });
      }
    } catch (err: any) {
      failed += 1;
      log('progression_sweep_student_failed', 'failure', {
        enrollment_id: enrollmentId, error_class: err?.name || 'Error', message: err?.message,
      }, 'warn');
    }
  }
  const summary: SweepSummary = { evaluated: ids.length, promoted, failed, duration_ms: Date.now() - started, ladder };
  log('progression_sweep_completed', failed ? 'partial' : 'success', { ...summary, triggered_by: opts.triggeredBy });
  return summary;
}
