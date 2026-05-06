/**
 * priorityRanker — produces calculated_rank for each task.
 *
 * Lower rank = earlier in the queue. The output's ordering is what the
 * UI reads. This is the SINGLE place rank is computed.
 *
 * Inputs per task (each 0-100):
 *   priority_score, blocking_score, dependency_score,
 *   maturity_gain, readiness_gain, confidence_score, execution_cost
 *
 * Formula:
 *   composite = priority_score * 0.30
 *             + blocking_score * 0.25
 *             + maturity_gain * 0.15
 *             + readiness_gain * 0.15
 *             + dependency_score * 0.10
 *             + confidence_score * 0.05
 *             - execution_cost * 0.20      ← cost subtracted from value
 *
 *   Then bonus modifiers:
 *     +25 if state === 'ready'
 *     -100 if state === 'blocked' or 'failed'    (sinks blocked tasks)
 *     -50 if state === 'in_progress'             (resume current work first)
 *
 *   calculated_rank = -composite (so lower rank = higher priority)
 */
import type { AuthoritativeTask } from '../types/systemState.types';

export function rankTasks(tasks: ReadonlyArray<AuthoritativeTask>): ReadonlyArray<AuthoritativeTask> {
  const ranked = tasks.map(task => {
    const composite = computeComposite(task);
    const adjusted = applyStateAdjustments(composite, task);
    const calculated_rank = -adjusted;   // higher composite → lower (= better) rank

    return { ...task, calculated_rank };
  });

  return Object.freeze(
    [...ranked].sort((a, b) => a.calculated_rank - b.calculated_rank)
  );
}

function computeComposite(task: AuthoritativeTask): number {
  return task.priority_score * 0.30
    + task.blocking_score * 0.25
    + task.maturity_gain * 0.15
    + task.readiness_gain * 0.15
    + task.dependency_score * 0.10
    + task.confidence_score * 0.05
    - task.execution_cost * 0.20;
}

function applyStateAdjustments(composite: number, task: AuthoritativeTask): number {
  switch (task.state) {
    case 'ready': return composite + 25;
    case 'in_progress': return composite + 50;     // user is mid-flight; prioritize finishing
    case 'blocked':
    case 'failed': return composite - 100;
    default: return composite;
  }
}
