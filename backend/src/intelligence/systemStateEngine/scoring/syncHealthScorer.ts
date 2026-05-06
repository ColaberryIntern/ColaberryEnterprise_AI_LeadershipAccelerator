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

export interface SyncHealthInput {
  readonly project: EngineProjectInput;
  readonly capabilities: ReadonlyArray<EngineCapabilityInput>;
  readonly contradictions: ReadonlyArray<ContradictionFlag>;
  readonly lastSyncAt?: Date | null;
  readonly latestCommitSha?: string | null;
}

export function scoreSyncHealth(input: SyncHealthInput): SyncHealthResult {
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

function clamp(n: number): Score0to100 {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
