/**
 * visualPriorityRanker — turns a UX debt score + open critiques into
 * synthetic `ui_review` queue items the engine can rank alongside backend /
 * frontend / database tasks.
 *
 * Pure: takes the debt score + per-page friction, returns AuthoritativeTask[].
 *
 * Phase 5 §10. Visual issues become real queue items.
 */
import type { AuthoritativeTask } from '../types/systemState.types';
import type { UXDebtScore } from './uxDebtScorer';
import { dominantDebtDimension } from './uxDebtScorer';
import type { WorkflowFrictionReport } from './workflowFrictionAnalyzer';

export interface VisualPriorityInput {
  readonly project_id: string;
  readonly ux_debt: UXDebtScore;
  readonly workflow_friction?: WorkflowFrictionReport;
  /** Per-route friction-finding count, so we can target the worst page. */
  readonly highest_friction_route?: string | null;
  /** A representative bp_id when known (frontend page BP). */
  readonly hot_route_bp_id?: string | null;
}

export function rankVisualPriorityTasks(input: VisualPriorityInput): AuthoritativeTask[] {
  const out: AuthoritativeTask[] = [];

  // Floor: don't emit any task when debt is below 20.
  if (input.ux_debt.total_debt < 20) return out;

  const dim = dominantDebtDimension(input.ux_debt);
  const dimReadable = dim.replace(/_/g, ' ').replace(/ debt$/, '');

  const priority_score = input.ux_debt.total_debt;
  // Blocking: UX debt rarely blocks per se, but high accessibility debt
  // gates enterprise rollouts.
  const blocking_score = input.ux_debt.accessibility_debt >= 40 ? 50 : 20;
  const dependency_score = 30;
  const maturity_gain = 30;
  const readiness_gain = Math.round(input.ux_debt.total_debt / 4);
  const confidence_score = 70;
  const execution_cost = 40;

  const composite =
    priority_score * 0.30 +
    blocking_score * 0.25 +
    maturity_gain * 0.15 +
    readiness_gain * 0.15 +
    dependency_score * 0.10 +
    confidence_score * 0.05 -
    execution_cost * 0.20;

  const reasoning: string[] = [
    `Open UX debt total: ${input.ux_debt.total_debt} (out of 100).`,
    `Dominant debt dimension: ${dimReadable} (${input.ux_debt[dim]}/100).`,
  ];
  if (input.workflow_friction && input.workflow_friction.findings.length > 0) {
    reasoning.push(`${input.workflow_friction.findings.length} workflow friction findings detected.`);
  }
  if (input.highest_friction_route) {
    reasoning.push(`Hot route: ${input.highest_friction_route}.`);
  }

  const task: AuthoritativeTask = Object.freeze({
    id: `ui-review:${input.project_id}:dominant`,
    project_id: input.project_id,
    bp_id: input.hot_route_bp_id ?? undefined,
    title: `Reduce ${dimReadable} debt`,
    description:
      `Address the highest-impact UX debt dimension. Run a visual review session, generate accepted-suggestion prompt, implement, validate.`,
    type: 'ui_review',
    priority_score,
    blocking_score,
    dependency_score,
    maturity_gain,
    readiness_gain,
    confidence_score,
    execution_cost,
    dependencies: Object.freeze([]),
    calculated_rank: -composite,
    state: 'ready',
    reasoning: Object.freeze(reasoning),
    decision_trace: undefined,    // synthetic: produce_decision_trace at engine integration if needed
  });

  out.push(task);

  // If accessibility debt alone is severe, emit a dedicated higher-priority
  // task — accessibility is non-negotiable for enterprise sales.
  if (input.ux_debt.accessibility_debt >= 60) {
    const acc_priority = input.ux_debt.accessibility_debt;
    const acc_blocking = 70;
    const acc_composite =
      acc_priority * 0.30 +
      acc_blocking * 0.25 +
      maturity_gain * 0.15 +
      readiness_gain * 0.15 +
      dependency_score * 0.10 +
      confidence_score * 0.05 -
      execution_cost * 0.20;
    out.push(Object.freeze({
      id: `ui-review:${input.project_id}:accessibility`,
      project_id: input.project_id,
      bp_id: input.hot_route_bp_id ?? undefined,
      title: `Resolve accessibility blockers (${input.ux_debt.accessibility_debt}/100)`,
      description: 'Run an axe-core pass and the visual review session\'s accessibility template. WCAG 2.1 AA compliance is required for enterprise rollout.',
      type: 'ui_review',
      priority_score: acc_priority,
      blocking_score: acc_blocking,
      dependency_score,
      maturity_gain,
      readiness_gain,
      confidence_score: 85,
      execution_cost,
      dependencies: Object.freeze([]),
      calculated_rank: -acc_composite,
      state: 'ready',
      reasoning: Object.freeze([
        `Accessibility debt at ${input.ux_debt.accessibility_debt}/100 — gates enterprise sales.`,
        'WCAG 2.1 AA compliance is non-negotiable.',
      ]),
      decision_trace: undefined,
    }));
  }

  return out;
}
