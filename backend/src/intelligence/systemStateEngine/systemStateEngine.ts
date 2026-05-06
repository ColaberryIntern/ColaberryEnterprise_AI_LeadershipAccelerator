/**
 * SystemStateEngine — single authoritative orchestrator.
 *
 * Public API:
 *   buildAuthoritativeState(projectId)            — runs the full pipeline
 *   buildAuthoritativeStateFromInputs(inputs)     — pure, for tests
 *
 * Pipeline:
 *   1. Load project + caps + repo tree (DB reads)
 *   2. Score each cap (readiness, coverage, maturity, health)
 *   3. Build authoritative task queue (with dependency resolution + priority ranking)
 *   4. Detect contradictions
 *   5. Score project-wide sync health
 *   6. Build state graph
 *   7. Aggregate project-level scores from per-cap scores
 *   8. Persist snapshot (best-effort)
 *   9. Return full AuthoritativeSystemState
 */
import type {
  AuthoritativeSystemState,
  CapabilityScores,
  ContradictionFlag,
  EngineCapabilityInput,
  EngineProjectInput,
  ProjectScores,
  Score0to100,
} from './types/systemState.types';
import { scoreReadiness } from './scoring/readinessScorer';
import { scoreCoverage } from './scoring/coverageScorer';
import { scoreMaturity } from './scoring/maturityScorer';
import { scoreHealth } from './scoring/healthScorer';
import { scoreSyncHealth } from './scoring/syncHealthScorer';
import { buildAuthoritativeQueue } from './queue/authoritativeTaskQueue';
import { cyclesToContradictions } from './queue/dependencyResolver';
import { detectContradictions } from './telemetry/contradictionDetector';
import { buildStateGraph } from './telemetry/stateGraphBuilder';
import { buildSnapshot, persistSnapshot } from './telemetry/stateSnapshotBuilder';

// ---------------------------------------------------------------------------
// Pure entry point — for tests + composition
// ---------------------------------------------------------------------------

export interface PureBuildInput {
  readonly project: EngineProjectInput;
  readonly capabilities: ReadonlyArray<EngineCapabilityInput>;
  readonly lastSyncAt?: Date | null;
  readonly latestCommitSha?: string | null;
}

export function buildAuthoritativeStateFromInputs(input: PureBuildInput): AuthoritativeSystemState {
  const generated_at = new Date().toISOString();

  // 1. Per-cap scoring
  const capability_scores: CapabilityScores[] = input.capabilities.map(cap => {
    const readiness = scoreReadiness(cap);
    const coverage = scoreCoverage(cap);
    const maturity = scoreMaturity(cap);
    const health = scoreHealth(cap, input.project.repo_file_tree);
    return {
      capability_id: cap.id,
      readiness: readiness.final,
      coverage: coverage.value,
      maturity: maturity.score,
      maturity_level: maturity.level,
      health: health.score,
      sync_health: 0,    // placeholder; sync_health is project-level
    };
  });

  // 2. Queue
  const queueResult = buildAuthoritativeQueue({
    project: input.project,
    capabilities: input.capabilities,
    capability_scores,
  });
  const tasks = queueResult.tasks;
  const cycleContradictions = cyclesToContradictions(queueResult.cycles, input.project.id);

  // 3. Contradictions
  const detectedContradictions = detectContradictions({
    project: input.project,
    capabilities: input.capabilities,
    capability_scores,
    tasks,
  });
  const allContradictions = [...detectedContradictions, ...cycleContradictions];

  // 4. Sync health (project-wide)
  const syncHealth = scoreSyncHealth({
    project: input.project,
    capabilities: input.capabilities,
    contradictions: allContradictions,
    lastSyncAt: input.lastSyncAt,
    latestCommitSha: input.latestCommitSha,
  });

  // 5. State graph
  const graph = buildStateGraph({
    project: input.project,
    capabilities: input.capabilities,
    tasks,
  });

  // 6. Project scores (aggregations)
  const scores = aggregateProjectScores(input.project.id, input.capabilities, capability_scores, syncHealth.score);

  // 7. Pick next task / next BP
  const next_task = tasks.find(t => t.state === 'ready' || t.state === 'in_progress') || tasks[0] || null;
  const next_bp_id = next_task?.bp_id || null;

  return Object.freeze({
    project_id: input.project.id,
    generated_at,
    scores,
    queue: tasks,
    contradictions: Object.freeze(allContradictions),
    graph,
    next_task: next_task,
    next_bp_id,
    sync_health: syncHealth,
  });
}

// ---------------------------------------------------------------------------
// DB-backed entry point
// ---------------------------------------------------------------------------

export interface BuildOptions {
  readonly persist?: boolean;     // default true
}

export async function buildAuthoritativeState(
  projectId: string,
  options: BuildOptions = {},
): Promise<AuthoritativeSystemState> {
  const { persist = true } = options;

  const inputs = await loadEngineInputs(projectId);
  const state = buildAuthoritativeStateFromInputs(inputs);

  if (persist) {
    const snapshot = buildSnapshot(state);
    await persistSnapshot(snapshot);
  }

  return state;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function aggregateProjectScores(
  projectId: string,
  caps: ReadonlyArray<EngineCapabilityInput>,
  capScores: ReadonlyArray<CapabilityScores>,
  syncHealthScore: Score0to100,
): ProjectScores {
  if (capScores.length === 0) {
    return Object.freeze({
      project_id: projectId,
      readiness: 0,
      coverage: 0,
      maturity: 0,
      health: 0,
      sync_health: syncHealthScore,
      backend: 0,
      frontend: 0,
      intelligence: 0,
      observability: 0,
      per_capability: Object.freeze([]),
    });
  }

  const avg = (arr: ReadonlyArray<number>): number =>
    Math.round(arr.reduce((s, n) => s + n, 0) / arr.length);

  const readiness = avg(capScores.map(s => s.readiness));
  const coverage = avg(capScores.map(s => s.coverage));
  const maturity = avg(capScores.map(s => s.maturity));
  const health = avg(capScores.map(s => s.health));

  // Layer-specific aggregates: avg readiness across caps that have that layer
  const backendCaps = caps.filter(c => (c.linked_backend_services || []).length > 0);
  const frontendCaps = caps.filter(c => (c.linked_frontend_components || []).length > 0 || !!c.frontend_route);
  const agentCaps = caps.filter(c => (c.linked_agents || []).length > 0);

  const backend = backendCaps.length
    ? avg(backendCaps.map(c => capScores.find(s => s.capability_id === c.id)?.readiness || 0))
    : 0;
  const frontend = frontendCaps.length
    ? avg(frontendCaps.map(c => capScores.find(s => s.capability_id === c.id)?.readiness || 0))
    : 0;
  const intelligence = agentCaps.length
    ? avg(agentCaps.map(c => capScores.find(s => s.capability_id === c.id)?.readiness || 0))
    : 0;
  const observability = avg(capScores.map(s => s.health));   // proxy until we surface observability separately

  return Object.freeze({
    project_id: projectId,
    readiness,
    coverage,
    maturity,
    health,
    sync_health: syncHealthScore,
    backend,
    frontend,
    intelligence,
    observability,
    per_capability: Object.freeze(capScores),
  });
}

// ---------------------------------------------------------------------------
// DB loaders
// ---------------------------------------------------------------------------

/**
 * Loads the inputs the pure engine needs from the DB. Wraps the existing
 * Capability hierarchy + GitHub connection + project state. This is the
 * ONLY function in the engine that touches DB models.
 */
async function loadEngineInputs(projectId: string): Promise<PureBuildInput> {
  const { Project, Capability, RequirementsMap } = await import('../../models');
  const project = await Project.findByPk(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  // Pull the GitHub connection / file tree via the enrollment_id
  const enrollmentId = (project as any).enrollment_id as string;
  let repoFileTree: string[] = [];
  let lastSyncAt: Date | null = null;
  let latestCommitSha: string | null = null;
  try {
    const { getConnection } = await import('../../services/githubService');
    const conn = await getConnection(enrollmentId);
    if (conn?.file_tree_json?.tree) {
      repoFileTree = conn.file_tree_json.tree
        .filter((t: any) => t.type === 'blob')
        .map((t: any) => t.path);
    }
    lastSyncAt = (conn as any)?.last_sync_at || null;
    // latest commit sha is read from setup_status if available (kickoff_commit)
    const ss = (project as any).setup_status || {};
    latestCommitSha = ss.kickoff_commit || null;
  } catch { /* repo data is optional */ }

  // Load capabilities
  const caps = await Capability.findAll({ where: { project_id: projectId } });

  // For each cap, count requirements
  const reqs = await RequirementsMap.findAll({
    where: { project_id: projectId },
    attributes: ['capability_id', 'status'],
  });
  const reqsByCap = new Map<string, { total: number; matched: number; verified: number }>();
  for (const cap of caps) {
    reqsByCap.set((cap as any).id, { total: 0, matched: 0, verified: 0 });
  }
  for (const req of reqs) {
    const r = req as any;
    if (!r.capability_id) continue;
    const counts = reqsByCap.get(r.capability_id);
    if (!counts) continue;
    counts.total++;
    if (r.status === 'matched' || r.status === 'verified' || r.status === 'auto_verified') counts.matched++;
    if (r.status === 'verified' || r.status === 'auto_verified') counts.verified++;
  }

  const capabilities: EngineCapabilityInput[] = caps.map(cap => {
    const c = cap as any;
    const counts = reqsByCap.get(c.id) || { total: 0, matched: 0, verified: 0 };
    return {
      id: c.id,
      project_id: projectId,
      name: c.name,
      description: c.description,
      source: c.source || 'unknown',
      user_status: c.user_status || 'in_progress',
      applicability_status: c.applicability_status || 'active',
      frontend_route: c.frontend_route,
      is_page_bp: c.source === 'frontend_page',
      mode_override: c.mode_override,
      last_execution: c.last_execution,
      linked_backend_services: c.linked_backend_services || [],
      linked_frontend_components: c.linked_frontend_components || [],
      linked_agents: c.linked_agents || [],
      ui_element_map: c.ui_element_map,
      total_requirements: counts.total,
      matched_requirements: counts.matched,
      verified_requirements: counts.verified,
    };
  });

  return {
    project: {
      id: projectId,
      target_mode: (project as any).target_mode || 'production',
      setup_status: (project as any).setup_status || {},
      capabilities,
      repo_file_tree: repoFileTree,
      latest_commit_sha: latestCommitSha,
    },
    capabilities,
    lastSyncAt,
    latestCommitSha,
  };
}
