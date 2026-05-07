/**
 * visualTelemetrySynchronizer — pulls visual review state for a project and
 * computes the inputs the engine needs:
 *
 *   - UXDebtScore (from open critiques)
 *   - WorkflowFrictionReport (from declared UI map pages)
 *   - synthetic ui_review tasks (from visualPriorityRanker)
 *
 * Phase 5 §1, plumbed into `loadEngineInputs` later.
 */
import { scoreUXDebt, type UXDebtScore } from './uxDebtScorer';
import { analyzeWorkflowFriction, type WorkflowFrictionReport } from './workflowFrictionAnalyzer';
import { rankVisualPriorityTasks } from './visualPriorityRanker';
import type { AuthoritativeTask } from '../types/systemState.types';

export interface VisualTelemetryBundle {
  readonly ux_debt: UXDebtScore;
  readonly workflow_friction: WorkflowFrictionReport;
  readonly visual_tasks: ReadonlyArray<AuthoritativeTask>;
  readonly open_critique_count: number;
  readonly resolved_critique_count: number;
}

export async function loadVisualTelemetry(projectId: string): Promise<VisualTelemetryBundle> {
  let openCritiques: any[] = [];
  let decisions: any[] = [];
  try {
    const [{ default: VisualCritiqueItem }, { default: VisualChangeDecision }] = await Promise.all([
      import('../../../models/VisualCritiqueItem'),
      import('../../../models/VisualChangeDecision'),
    ]);
    [openCritiques, decisions] = await Promise.all([
      VisualCritiqueItem.findAll({ where: { project_id: projectId } }),
      VisualChangeDecision.findAll({ where: { project_id: projectId } }),
    ]);
  } catch (err: any) {
    // Tables may not yet exist in this environment — return zero state.
    console.warn('[visualTelemetrySynchronizer] degraded (tables missing?):', err?.message);
    return {
      ux_debt: scoreUXDebt([]),
      workflow_friction: analyzeWorkflowFriction([]),
      visual_tasks: [],
      open_critique_count: 0,
      resolved_critique_count: 0,
    };
  }

  const acceptedCritiqueIds = new Set<string>();
  for (const d of decisions) {
    const r = d as any;
    if (r.verdict === 'accepted' && r.critique_id) acceptedCritiqueIds.add(r.critique_id);
  }

  const snapshots = openCritiques.map((c: any) => ({
    id: c.id,
    kind: c.kind,
    severity: c.severity,
    resolved: acceptedCritiqueIds.has(c.id),
  }));

  const ux_debt = scoreUXDebt(snapshots);

  // Workflow friction: read latest UI map for the project.
  let pages: any[] = [];
  try {
    const { buildUIMapForProject } = await import('../telemetry/uiSynchronizer');
    const map = await buildUIMapForProject(projectId);
    pages = (map.pages || []).map((p: any) => ({
      route: p.route,
      category: p.category,
      actions: p.actions || [],
      critical_workflows: p.critical_workflows,
      accessibility_warnings: p.accessibility_warnings,
      ux_debt: p.ux_debt,
    }));
  } catch { /* ok */ }
  const workflow_friction = analyzeWorkflowFriction(pages);

  // Visual priority tasks
  const highestFrictionRoute =
    workflow_friction.findings.length > 0
      ? [...workflow_friction.findings].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0].route
      : null;

  const visual_tasks = rankVisualPriorityTasks({
    project_id: projectId,
    ux_debt,
    workflow_friction,
    highest_friction_route: highestFrictionRoute,
    hot_route_bp_id: null,
  });

  return {
    ux_debt,
    workflow_friction,
    visual_tasks,
    open_critique_count: snapshots.filter(s => !s.resolved).length,
    resolved_critique_count: snapshots.filter(s => s.resolved).length,
  };
}

function severityRank(s: string): number {
  if (s === 'high') return 3;
  if (s === 'medium') return 2;
  return 1;
}
