/**
 * syncHealthScorer — telemetry & consistency score for the project's
 * portal-state vs repo-state alignment.
 *
 * Lower score = state is drifting from reality. Used to surface
 * "your portal is out of sync with your repo" warnings.
 *
 * Dimensions (each 0-100, where 100 = perfectly in-sync):
 *   telemetry_freshness               — last successful repo sync recency
 *   contradictory_calculations        — count of contradiction flags
 *   orphan_bps                        — BPs with no files AND no requirements
 *   orphan_routes                     — routes in repo not connected to any BP
 *   undocumented_apis                 — backend routes without type/spec definitions
 *   missing_manifests                 — package.json / requirements.txt absent
 *   validation_drift                  — last validation report's commitSha != HEAD
 *   queue_inconsistency               — engine queue order disagrees with caches
 *   frontend_backend_mismatch         — cap claims frontend complete but backend missing
 *   missing_dependency_references     — dependency BPs that don't exist
 *
 * Final score = arithmetic mean of dimensions.
 */
import type {
  ContradictionFlag,
  EngineCapabilityInput,
  EngineProjectInput,
  Score0to100,
  SyncHealthDimensions,
  SyncHealthResult,
} from '../types/systemState.types';

/**
 * Phase 3: optional telemetry-aware inputs. When provided, the scorer fills
 * the new dimensions; when absent, those dimensions default to a neutral
 * 100 (no penalty), which preserves backward compatibility for callers that
 * don't yet pass telemetry data.
 */
export interface TelemetrySyncInputs {
  readonly manifest_freshness?: Score0to100;
  readonly bps_with_manifest?: number;       // count
  readonly bps_total?: number;               // count
  readonly conflict_count?: number;          // resolver conflicts
  readonly undocumented_db_changes?: number; // count
  readonly ui_drift_count?: number;          // count
  readonly graph_drift_count?: number;       // count
  readonly manifests_without_validation?: number; // count
  readonly recent_manifests_count?: number;
  // Phase 5: UX-derived health inputs
  readonly ux_debt_total?: number;          // 0-100 (debt) — health = 100 - this
  readonly workflow_friction_score?: number; // 0-100 (friction) — health = 100 - this
}

export interface SyncHealthInput {
  readonly project: EngineProjectInput;
  readonly capabilities: ReadonlyArray<EngineCapabilityInput>;
  readonly contradictions: ReadonlyArray<ContradictionFlag>;
  readonly lastSyncAt?: Date | null;
  readonly latestCommitSha?: string | null;
  readonly telemetry?: TelemetrySyncInputs;
}

export function scoreSyncHealth(input: SyncHealthInput): SyncHealthResult {
  const t = input.telemetry || {};
  const dimensions: SyncHealthDimensions = {
    telemetry_freshness: scoreTelemetryFreshness(input.lastSyncAt),
    contradictory_calculations: scoreContradictions(input.contradictions),
    orphan_bps: scoreOrphanBPs(input.capabilities),
    orphan_routes: scoreOrphanRoutes(input.capabilities, input.project.repo_file_tree),
    undocumented_apis: scoreUndocumentedAPIs(input.project.repo_file_tree),
    missing_manifests: scoreMissingManifests(input.project.repo_file_tree),
    validation_drift: scoreValidationDrift(input.capabilities, input.latestCommitSha),
    queue_inconsistency: scoreQueueInconsistency(input.contradictions),
    frontend_backend_mismatch: scoreFrontendBackendMismatch(input.capabilities),
    missing_dependency_references: scoreMissingDependencies(input.capabilities, input.contradictions),

    // Phase 3 telemetry dimensions
    manifest_freshness: typeof t.manifest_freshness === 'number' ? clamp(t.manifest_freshness) : 100,
    missing_build_manifests: scoreMissingBuildManifests(t.bps_with_manifest, t.bps_total),
    conflicting_manifests: scoreConflictingManifests(t.conflict_count),
    undocumented_db_changes: scoreUndocumentedDbChanges(t.undocumented_db_changes),
    ui_drift: scoreUiDrift(t.ui_drift_count),
    graph_drift: scoreGraphDrift(t.graph_drift_count),
    missing_validation_telemetry: scoreMissingValidationTelemetry(t.manifests_without_validation, t.recent_manifests_count),

    // Phase 5: UX dimensions
    ux_debt_health: typeof t.ux_debt_total === 'number' ? clamp(100 - t.ux_debt_total) : 100,
    workflow_friction_health: typeof t.workflow_friction_score === 'number' ? clamp(100 - t.workflow_friction_score) : 100,
  };

  const score = Math.round(
    Object.values(dimensions).reduce((sum, v) => sum + v, 0) / Object.keys(dimensions).length
  );

  return {
    score: clamp(score),
    dimensions,
    contradiction_count: input.contradictions.length,
  };
}

// ---------------------------------------------------------------------------
// Per-dimension scorers
// ---------------------------------------------------------------------------

function scoreTelemetryFreshness(lastSyncAt?: Date | null): Score0to100 {
  if (!lastSyncAt) return 0;
  const ageMs = Date.now() - lastSyncAt.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  // 100 if synced in last hour. Linear decay to 0 at 7 days.
  if (ageHours <= 1) return 100;
  if (ageHours >= 24 * 7) return 0;
  return clamp(100 - (ageHours / (24 * 7)) * 100);
}

function scoreContradictions(contradictions: ReadonlyArray<ContradictionFlag>): Score0to100 {
  if (contradictions.length === 0) return 100;
  // -10 per error, -3 per warning, -1 per info. Floor at 0.
  let penalty = 0;
  for (const c of contradictions) {
    if (c.severity === 'error') penalty += 10;
    else if (c.severity === 'warning') penalty += 3;
    else penalty += 1;
  }
  return clamp(100 - penalty);
}

function scoreOrphanBPs(caps: ReadonlyArray<EngineCapabilityInput>): Score0to100 {
  if (caps.length === 0) return 100;
  const orphans = caps.filter(c => {
    const hasFiles = (c.linked_backend_services || []).length
      + (c.linked_frontend_components || []).length
      + (c.linked_agents || []).length > 0;
    const hasReqs = c.total_requirements > 0;
    return !hasFiles && !hasReqs && c.applicability_status === 'active';
  });
  const ratio = orphans.length / caps.length;
  return clamp(100 - ratio * 100);
}

function scoreOrphanRoutes(
  caps: ReadonlyArray<EngineCapabilityInput>,
  repoFileTree: ReadonlyArray<string>,
): Score0to100 {
  // Heuristic: count files under frontend/src/pages/ that aren't linked to any cap.
  const allLinked = new Set<string>();
  for (const c of caps) {
    for (const f of c.linked_frontend_components || []) allLinked.add(f);
    if (c.frontend_route) allLinked.add(c.frontend_route);
  }

  const pageFiles = repoFileTree.filter(f =>
    /(^|\/)pages\/.*\.(tsx?|jsx?)$/i.test(f) && !/test|spec|index/i.test(f)
  );
  if (pageFiles.length === 0) return 100;

  const unlinked = pageFiles.filter(f => !allLinked.has(f));
  const ratio = unlinked.length / pageFiles.length;
  return clamp(100 - ratio * 100);
}

function scoreUndocumentedAPIs(repoFileTree: ReadonlyArray<string>): Score0to100 {
  // Heuristic: routes/*.ts files vs OpenAPI specs / JSDoc presence.
  // We can't check JSDoc without reading file content; so just check
  // whether the repo has OpenAPI / route documentation patterns.
  const routeFiles = repoFileTree.filter(f =>
    /(^|\/)routes?\/.*\.(t|j)s$/i.test(f) && !/test|spec|index/i.test(f)
  );
  if (routeFiles.length === 0) return 100;

  const hasOpenapi = repoFileTree.some(f => /openapi|swagger\.(json|yaml|yml)/i.test(f));
  const hasReadmeRoutes = repoFileTree.some(f => /(api|routes?)\/README/i.test(f));
  if (hasOpenapi || hasReadmeRoutes) return 80;
  // Without docs at all, return a moderate score (this isn't always a project-fatal issue)
  return 50;
}

function scoreMissingManifests(repoFileTree: ReadonlyArray<string>): Score0to100 {
  const hasNodeManifest = repoFileTree.some(f => f === 'package.json' || f.endsWith('/package.json'));
  const hasPyManifest = repoFileTree.some(f => /requirements\.txt|pyproject\.toml/.test(f));
  if (hasNodeManifest || hasPyManifest) return 100;
  return 0;
}

function scoreValidationDrift(
  caps: ReadonlyArray<EngineCapabilityInput>,
  latestCommitSha?: string | null,
): Score0to100 {
  if (!latestCommitSha) return 100;   // can't measure drift without a HEAD reference
  const capsWithReports = caps.filter(c => {
    const vr = c.last_execution?.validation_report as any;
    return vr && typeof vr.commitSha === 'string';
  });
  if (capsWithReports.length === 0) return 100;

  const drifted = capsWithReports.filter(c => {
    const vr = c.last_execution?.validation_report as any;
    return vr.commitSha && !latestCommitSha.startsWith(String(vr.commitSha).substring(0, 7))
      && !String(vr.commitSha).startsWith(latestCommitSha.substring(0, 7));
  });
  const ratio = drifted.length / capsWithReports.length;
  return clamp(100 - ratio * 50);   // drift is concerning but not fatal — cap penalty at 50
}

function scoreQueueInconsistency(contradictions: ReadonlyArray<ContradictionFlag>): Score0to100 {
  const queueIssues = contradictions.filter(c => c.kind === 'queue_ordering_inconsistency').length;
  if (queueIssues === 0) return 100;
  return clamp(100 - queueIssues * 20);
}

function scoreFrontendBackendMismatch(caps: ReadonlyArray<EngineCapabilityInput>): Score0to100 {
  const mismatches = caps.filter(c => {
    const hasFE = (c.linked_frontend_components || []).length > 0 || !!c.frontend_route;
    const hasBE = (c.linked_backend_services || []).length > 0;
    // Page BPs are allowed to be frontend-only.
    if (c.is_page_bp) return false;
    // Mismatch: frontend exists but no backend AND coverage > 70 (claims complete)
    if (hasFE && !hasBE && c.total_requirements > 0) {
      const coverage = c.matched_requirements / c.total_requirements;
      return coverage > 0.7;
    }
    return false;
  });
  if (caps.length === 0) return 100;
  return clamp(100 - (mismatches.length / caps.length) * 100);
}

function scoreMissingDependencies(
  _caps: ReadonlyArray<EngineCapabilityInput>,
  contradictions: ReadonlyArray<ContradictionFlag>,
): Score0to100 {
  // Until BPs declare explicit dependencies in the data model, this is
  // driven purely by the contradiction detector's missing-reference flags.
  const missing = contradictions.filter(c => c.kind === 'missing_bp_reference').length;
  if (missing === 0) return 100;
  return clamp(100 - missing * 15);
}

// ---------------------------------------------------------------------------
// Phase 3 telemetry-dimension scorers
// ---------------------------------------------------------------------------

function scoreMissingBuildManifests(bpsWithManifest?: number, bpsTotal?: number): Score0to100 {
  if (bpsTotal === undefined || bpsWithManifest === undefined) return 100;
  if (bpsTotal === 0) return 100;
  const ratio = Math.min(1, bpsWithManifest / bpsTotal);
  return clamp(ratio * 100);
}

function scoreConflictingManifests(count?: number): Score0to100 {
  if (count === undefined) return 100;
  if (count === 0) return 100;
  return clamp(100 - count * 8);
}

function scoreUndocumentedDbChanges(count?: number): Score0to100 {
  if (count === undefined) return 100;
  if (count === 0) return 100;
  return clamp(100 - count * 5);
}

function scoreUiDrift(count?: number): Score0to100 {
  if (count === undefined) return 100;
  if (count === 0) return 100;
  return clamp(100 - count * 6);
}

function scoreGraphDrift(count?: number): Score0to100 {
  if (count === undefined) return 100;
  if (count === 0) return 100;
  return clamp(100 - count * 7);
}

function scoreMissingValidationTelemetry(missing?: number, total?: number): Score0to100 {
  if (missing === undefined || total === undefined) return 100;
  if (total === 0) return 100;
  const ratio = Math.min(1, missing / total);
  return clamp(100 - ratio * 100);
}

function clamp(n: number): Score0to100 {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
