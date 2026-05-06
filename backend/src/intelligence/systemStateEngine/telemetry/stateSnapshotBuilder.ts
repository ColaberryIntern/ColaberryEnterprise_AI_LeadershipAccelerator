/**
 * stateSnapshotBuilder — converts the engine's in-memory output into
 * a SystemStateSnapshot row ready for persistence.
 *
 * Pure function: given AuthoritativeSystemState in, produces the JSONB-
 * serializable snapshot object out.
 */
import type {
  AuthoritativeSystemState,
  ContradictionFlag,
} from '../types/systemState.types';

export interface SnapshotPayload {
  project_id: string;
  generated_at: Date;
  readiness_score: number;
  coverage_score: number;
  maturity_score: number;
  health_score: number;
  sync_health_score: number;
  backend_score: number;
  frontend_score: number;
  intelligence_score: number;
  observability_score: number;
  next_task_id: string | null;
  next_bp_id: string | null;
  contradiction_flags: ContradictionFlag[];
  blocking_issues: ContradictionFlag[];
  authoritative_queue: any[];        // typed AuthoritativeTask[] but JSONB-stored as plain object
  state_graph: any;                  // typed StateGraph
}

export function buildSnapshot(state: AuthoritativeSystemState): SnapshotPayload {
  const blockingIssues = state.contradictions.filter(c => c.severity === 'error');

  return {
    project_id: state.project_id,
    generated_at: new Date(state.generated_at),
    readiness_score: state.scores.readiness,
    coverage_score: state.scores.coverage,
    maturity_score: state.scores.maturity,
    health_score: state.scores.health,
    sync_health_score: state.scores.sync_health,
    backend_score: state.scores.backend,
    frontend_score: state.scores.frontend,
    intelligence_score: state.scores.intelligence,
    observability_score: state.scores.observability,
    next_task_id: state.next_task?.id || null,
    next_bp_id: state.next_bp_id,
    contradiction_flags: [...state.contradictions],
    blocking_issues: blockingIssues,
    authoritative_queue: state.queue.map(t => ({ ...t })),
    state_graph: { nodes: [...state.graph.nodes], edges: [...state.graph.edges] },
  };
}

/**
 * Persist a snapshot using the SystemStateSnapshot model. Best-effort —
 * never throws (callers shouldn't fail because telemetry persistence
 * failed). Logs warnings on errors.
 */
export async function persistSnapshot(payload: SnapshotPayload): Promise<string | null> {
  try {
    const { default: SystemStateSnapshot } = await import('../../../models/SystemStateSnapshot');
    const row = await SystemStateSnapshot.create(payload as any);
    return (row as any).id;
  } catch (err: any) {
    console.warn('[SystemStateEngine] snapshot persistence failed:', err?.message);
    return null;
  }
}
