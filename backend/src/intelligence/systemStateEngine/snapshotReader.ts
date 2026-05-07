/**
 * snapshotReader — fast read path for the most recent persisted state.
 *
 * Used by:
 *   - Dashboards (reading instead of recomputing on every page load)
 *   - Analytics surfaces
 *   - Anywhere the cost of recomputing > acceptable response time
 *
 * Pairs with the engine's own write path (buildAuthoritativeState
 * persists snapshots when persist=true).
 *
 * Caching strategy:
 *   - Request-scoped memo via WeakMap on a per-request token
 *   - Cross-request cache via the snapshot table (immutable history)
 */
import type { AuthoritativeSystemState } from './types/systemState.types';

export interface SnapshotMetadata {
  readonly id: string;
  readonly project_id: string;
  readonly generated_at: string;
  readonly age_ms: number;
}

export interface SnapshotReadResult {
  readonly state: AuthoritativeSystemState;
  readonly metadata: SnapshotMetadata;
  readonly is_stale: boolean;       // true if older than STALE_THRESHOLD_MS
}

const STALE_THRESHOLD_MS = 5 * 60 * 1000;   // 5 minutes — anything older is stale

/**
 * Read the most recent snapshot for a project. Returns null if none exists.
 */
export async function getLatestSystemSnapshot(projectId: string): Promise<SnapshotReadResult | null> {
  const { default: SystemStateSnapshot } = await import('../../models/SystemStateSnapshot');
  const row = await SystemStateSnapshot.findOne({
    where: { project_id: projectId },
    order: [['generated_at', 'DESC']],
  });
  if (!row) return null;

  const r = row as any;
  const generated_at = new Date(r.generated_at).toISOString();
  const age_ms = Date.now() - new Date(r.generated_at).getTime();

  const state: AuthoritativeSystemState = {
    project_id: r.project_id,
    generated_at,
    scores: {
      project_id: r.project_id,
      readiness: r.readiness_score,
      coverage: r.coverage_score,
      maturity: r.maturity_score,
      health: r.health_score,
      sync_health: r.sync_health_score,
      backend: r.backend_score,
      frontend: r.frontend_score,
      intelligence: r.intelligence_score,
      observability: r.observability_score,
      per_capability: [],   // not denormalized — would need separate column
    },
    queue: r.authoritative_queue || [],
    contradictions: r.contradiction_flags || [],
    graph: r.state_graph || { nodes: [], edges: [] },
    next_task: (r.authoritative_queue || []).find((t: any) => t.id === r.next_task_id) || null,
    next_bp_id: r.next_bp_id || null,
    sync_health: {
      score: r.sync_health_score,
      // Snapshot rows don't denormalize per-dimension scores (a separate
      // table would be needed). When rendering from a snapshot, we surface
      // only the aggregate score and zero out individual dimensions; consumers
      // that need dimensions should call /telemetry/health (which forces a
      // rebuild via readOrRebuild and returns live values).
      dimensions: {
        telemetry_freshness: 0, contradictory_calculations: 0, orphan_bps: 0,
        orphan_routes: 0, undocumented_apis: 0, missing_manifests: 0,
        validation_drift: 0, queue_inconsistency: 0,
        frontend_backend_mismatch: 0, missing_dependency_references: 0,
        // Phase 3 telemetry dimensions
        manifest_freshness: 0, missing_build_manifests: 0,
        conflicting_manifests: 0, undocumented_db_changes: 0,
        ui_drift: 0, graph_drift: 0, missing_validation_telemetry: 0,
        // Phase 5 UX dimensions
        ux_debt_health: 0, workflow_friction_health: 0,
      },
      contradiction_count: (r.contradiction_flags || []).length,
    },
  };

  return {
    state,
    metadata: {
      id: r.id,
      project_id: r.project_id,
      generated_at,
      age_ms,
    },
    is_stale: age_ms > STALE_THRESHOLD_MS,
  };
}

/**
 * Read snapshot OR rebuild if stale. The default fast path for most
 * dashboard reads. Rebuilding triggers persist=true, so the next reader
 * picks up the fresh snapshot.
 */
export async function readOrRebuild(projectId: string): Promise<AuthoritativeSystemState> {
  const cached = await getLatestSystemSnapshot(projectId);
  if (cached && !cached.is_stale) return cached.state;

  // Stale or missing — rebuild
  const { buildAuthoritativeState } = await import('./systemStateEngine');
  return buildAuthoritativeState(projectId, { persist: true });
}

// ---------------------------------------------------------------------------
// Request-scoped memoization
// ---------------------------------------------------------------------------

/**
 * Within a single Express request, multiple endpoints may need the
 * authoritative state. Memoize so we don't run the engine 3-5 times
 * per request.
 */
const REQUEST_CACHE = new WeakMap<object, Map<string, AuthoritativeSystemState>>();

export async function memoizedReadOrRebuild(
  reqToken: object,
  projectId: string,
): Promise<AuthoritativeSystemState> {
  let perReq = REQUEST_CACHE.get(reqToken);
  if (!perReq) {
    perReq = new Map();
    REQUEST_CACHE.set(reqToken, perReq);
  }
  const cached = perReq.get(projectId);
  if (cached) return cached;

  const state = await readOrRebuild(projectId);
  perReq.set(projectId, state);
  return state;
}
