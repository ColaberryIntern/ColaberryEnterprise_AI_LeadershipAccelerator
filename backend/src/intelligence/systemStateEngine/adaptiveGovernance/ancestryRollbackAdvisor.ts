/**
 * ancestryRollbackAdvisor — Phase 17. Operator-assisted ancestry
 * rollback planner.
 *
 * Architectural commitment (per the Phase 17 stress-test):
 *   - The engine BUILDS A PLAN.
 *   - The OPERATOR EXECUTES.
 *   - The system MUST NOT autonomously walk ancestry chains backward.
 *
 * Inputs: Phase 16 lineage graph + propagation profile + Phase 15
 * containment snapshot + Phase 17 forecasting bounds.
 *
 * Output: AncestryRollbackPlan — ordered chain of steps with per-step
 * forecast confidence bounds, blast estimate, propagation consequences,
 * and the operator-runnable API path. The dashboard presents the
 * chain with "execute next step" / "execute all" actions.
 */

import type {
  OperationalLineageGraph, LineageNode, ContradictionPropagationProfile,
} from '../causality/causalityTypes';
import { ancestorsOf, descendantsOf } from '../causality/mutationLineageGraph';
import type {
  AncestryRollbackPlan, AncestryRollbackStep, ForecastConfidenceBounds,
} from './adaptiveGovernanceTypes';

const MAX_PLAN_STEPS = 5;
const PACING_MS = 60_000;     // suggested 60s gap between operator-executed steps

export interface BuildAncestryPlanInput {
  readonly graph: OperationalLineageGraph;
  readonly target_mutation_id: string;
  readonly propagation: ContradictionPropagationProfile | null;
}

export function buildAncestryRollbackPlan(input: BuildAncestryPlanInput): AncestryRollbackPlan {
  const ancestry = ancestorsOf(input.graph, input.target_mutation_id);
  const target = input.graph.nodes.find(n => n.node_id === input.target_mutation_id) ?? null;

  const ordered: LineageNode[] = [];
  // We rollback the LEAF first, then walk back to the deepest ancestor —
  // safest order because each step verifies before going deeper.
  if (target) ordered.push(target);
  ordered.push(...ancestry);
  const truncated = ordered.length > MAX_PLAN_STEPS;
  const steps_input = ordered.slice(0, MAX_PLAN_STEPS);

  const steps: AncestryRollbackStep[] = steps_input.map((node, idx) => buildStep(node, idx, input));
  const total_estimated_blast = steps.reduce((s, x) => s + x.blast_score, 0);

  return {
    project_id: input.graph.project_id,
    target_mutation_id: input.target_mutation_id,
    steps,
    total_estimated_blast,
    recommended_pacing_ms: PACING_MS,
    operator_action_required: 'approve_chain | execute_step',
    truncated,
    built_at: new Date().toISOString(),
  };
}

function buildStep(node: LineageNode, idx: number, input: BuildAncestryPlanInput): AncestryRollbackStep {
  const blast_score = readBlastScore(node);
  const propagation_consequences: string[] = [];

  const descendants = descendantsOf(input.graph, node.node_id);
  if (descendants.length > 0) {
    propagation_consequences.push(`Rolling back this node will impact ${descendants.length} descendant node(s).`);
  }
  if (input.propagation) {
    const subj = node.subject_id ?? '';
    const hotspot = subj ? input.propagation.hotspots.find(h => h.subject_id === subj) : undefined;
    if (hotspot && hotspot.count > 0) {
      propagation_consequences.push(`Subject ${subj} is a contradiction hotspot (${hotspot.count} flags, worst: ${hotspot.worst_severity}).`);
    }
  }

  // Forecast bounds for THIS step. Single-step forecast is bounded by
  // the blast score itself (higher blast = wider confidence range).
  const bounds: ForecastConfidenceBounds = {
    low: Math.max(0, blast_score - 15),
    high: Math.min(100, blast_score + 15),
    confidence_range: 30,
    uncertainty_drivers: ['per_step_heuristic_only', 'no_executed_history'],
  };

  // Trust recovery estimate: deeper steps recover more trust per step
  // (each step forms part of the chain), capped at 100.
  const trust_recovery_estimate = Math.max(20, Math.min(100, 30 + idx * 12 + (descendants.length * 2)));

  const command = node.kind === 'mutation'
    ? `POST /api/portal/project/governance/mutation/${node.node_id}/rollback`
    : node.kind === 'stabilization'
    ? `(no rollback target — node is already a stabilization step)`
    : `(no direct rollback target for ${node.kind})`;

  return {
    index: idx,
    target_node_id: node.node_id,
    node_kind: nodeKindForStep(node.kind),
    mutation_intent: ((node.payload as any)?.mutation_class ?? null) as any,
    forecast: bounds,
    blast_score,
    trust_recovery_estimate,
    propagation_consequences,
    rollback_command: command,
  };
}

function nodeKindForStep(kind: LineageNode['kind']): AncestryRollbackStep['node_kind'] {
  if (kind === 'mutation' || kind === 'rollback' || kind === 'governance_decision' || kind === 'stabilization') return kind;
  return 'mutation';     // contradictions / remediations don't have direct rollback paths in v1
}

function readBlastScore(node: LineageNode): number {
  const payload = node.payload as any;
  const direct = payload?.blast_radius?.score;
  if (typeof direct === 'number') return direct;
  // Default blast for non-mutation nodes derived from severity.
  switch (node.severity) {
    case 'error': return 60;
    case 'warning': return 35;
    case 'info': return 15;
  }
}

export const _MAX_PLAN_STEPS_FOR_TESTS = MAX_PLAN_STEPS;
export const _PACING_MS_FOR_TESTS = PACING_MS;
