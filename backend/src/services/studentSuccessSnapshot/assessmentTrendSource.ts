import AssessmentAttempt from '../../models/AssessmentAttempt';
import { rollupAssessments } from '../learnerContextFormat';
import { computeTrendDirection } from '../acceleratorService';
import { AssessmentTrendValue, SnapshotField } from './types';

/**
 * Reuses two already-real, already-tested pure functions rather than
 * re-deriving them: rollupAssessments() (learnerContextFormat.ts, the same
 * aggregate every mentor prompt already renders) for counts/avg/weak-areas,
 * and computeTrendDirection() (acceleratorService.ts, the same trend
 * classifier readiness-score reporting already uses) for direction —
 * avoiding a second, drifting trend algorithm.
 */
export async function getAssessmentTrendField(enrollmentId: string): Promise<SnapshotField<AssessmentTrendValue>> {
  const attempts = await AssessmentAttempt.findAll({
    where: { enrollment_id: enrollmentId },
    attributes: ['id', 'kind', 'score', 'passed', 'competency_scores', 'submitted_at'],
    order: [['submitted_at', 'ASC']],
    limit: 200,
  });

  const rollup = rollupAssessments(attempts.map((a: any) => ({ kind: a.kind, score: a.score, passed: a.passed, competency_scores: a.competency_scores })));
  const evalScoreSeries = attempts.filter((a: any) => a.kind === 'evaluation').map((a: any) => (a.score || 0) * 100);
  const trend = computeTrendDirection(evalScoreSeries);

  return {
    value: {
      evalsTaken: rollup.evals_taken,
      evalsPassed: rollup.evals_passed,
      avgEvalPct: rollup.avg_eval_pct,
      weakCompetencies: rollup.weak_competencies,
      trend,
    },
    status: 'known',
    sourceSystem: 'assessment_attempts',
    sourceRecordIds: attempts.map((a: any) => a.id),
    observedAt: new Date(),
    freshnessPolicy: 'real-time-on-submission',
    reliabilityState: 'healthy',
  };
}
