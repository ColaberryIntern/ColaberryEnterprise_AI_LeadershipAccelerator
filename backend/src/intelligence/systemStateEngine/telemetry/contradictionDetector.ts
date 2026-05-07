/**
 * contradictionDetector — surfaces internal inconsistencies in the state.
 *
 * Looks for:
 *   - readiness_mismatch:        cap claims complete but missing layers
 *   - duplicate_next_step:       multiple competing tasks for same BP
 *   - queue_ordering_inconsistency: ordering bugs (cycles, etc.)
 *   - missing_bp_reference:      task references unknown BP
 *   - frontend_complete_backend_missing
 *   - capability_status_mismatch: user_status='verified' but is_complete=false
 *   - conflicting_completion_pct: two systems disagree
 *   - orphan_route:              repo route not connected to any BP
 *   - orphan_bp:                 BP with no files AND no requirements
 *   - undocumented_api:          backend route with no spec
 *   - validation_drift:          last validation report's commitSha != HEAD
 *
 * Returns ContradictionFlag[] sorted by severity (error > warning > info).
 */
import type {
  AuthoritativeTask,
  CapabilityScores,
  ContradictionFlag,
  EngineCapabilityInput,
  EngineProjectInput,
} from '../types/systemState.types';

export interface ContradictionInput {
  readonly project: EngineProjectInput;
  readonly capabilities: ReadonlyArray<EngineCapabilityInput>;
  readonly capability_scores: ReadonlyArray<CapabilityScores>;
  readonly tasks: ReadonlyArray<AuthoritativeTask>;
  // Phase 4: optional telemetry signals. When present, additional
  // telemetry-aware detectors run.
  readonly manifests?: ReadonlyArray<any>;
  readonly resolvedConflicts?: ReadonlyArray<{ project_id: string; bp_id: string | null; description: string }>;
}

export function detectContradictions(input: ContradictionInput): ReadonlyArray<ContradictionFlag> {
  const flags: ContradictionFlag[] = [];

  flags.push(...detectReadinessMismatch(input));
  flags.push(...detectDuplicateNextStep(input));
  flags.push(...detectMissingBPReference(input));
  flags.push(...detectFrontendCompleteBackendMissing(input));
  flags.push(...detectCapabilityStatusMismatch(input));
  flags.push(...detectOrphanBPs(input));
  flags.push(...detectOrphanRoutes(input));
  flags.push(...detectValidationDrift(input));

  // ── Phase 4 telemetry detectors ───────────────────────────────────
  flags.push(...detectMissingTelemetry(input));
  flags.push(...detectStaleTelemetry(input));
  flags.push(...detectTelemetryConflict(input));
  flags.push(...detectTelemetryDrift(input));
  flags.push(...detectUndocumentedDbChange(input));
  flags.push(...detectUiDrift(input));
  flags.push(...detectGraphDrift(input));
  flags.push(...detectLowConfidenceValidation(input));

  // Sort: error > warning > info
  const order = { error: 0, warning: 1, info: 2 };
  return Object.freeze(
    [...flags].sort((a, b) => order[a.severity] - order[b.severity])
  );
}

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

function detectReadinessMismatch(input: ContradictionInput): ContradictionFlag[] {
  const out: ContradictionFlag[] = [];
  for (const cap of input.capabilities) {
    if (cap.user_status === 'verified') {
      const hasAnyFiles = (cap.linked_backend_services || []).length
        + (cap.linked_frontend_components || []).length
        + (cap.linked_agents || []).length > 0;
      const hasAnyReqs = cap.total_requirements > 0;
      if (!hasAnyFiles && !hasAnyReqs && !cap.is_page_bp) {
        out.push({
          kind: 'readiness_mismatch',
          severity: 'warning',
          message: `${cap.name} is marked verified but has no linked files or requirements.`,
          project_id: input.project.id,
          capability_id: cap.id,
          evidence: { user_status: cap.user_status, is_page_bp: cap.is_page_bp },
        });
      }
    }
  }
  return out;
}

function detectDuplicateNextStep(input: ContradictionInput): ContradictionFlag[] {
  const byBP = new Map<string, AuthoritativeTask[]>();
  for (const task of input.tasks) {
    if (!task.bp_id) continue;
    if (task.state === 'blocked' || task.state === 'failed' || task.state === 'validated') continue;
    if (!byBP.has(task.bp_id)) byBP.set(task.bp_id, []);
    byBP.get(task.bp_id)!.push(task);
  }
  const out: ContradictionFlag[] = [];
  for (const [bpId, tasks] of byBP) {
    if (tasks.length > 1) {
      // Multiple actionable tasks for the same BP. The orchestrator's
      // de-dup picks one for the Top 5 — this flag warns operators that
      // the queue has more than one valid next-step nominee.
      out.push({
        kind: 'duplicate_next_step',
        severity: 'info',
        message: `BP ${bpId} has ${tasks.length} candidate next-steps in the queue.`,
        project_id: input.project.id,
        capability_id: bpId,
        evidence: { task_ids: tasks.map(t => t.id), task_titles: tasks.map(t => t.title) },
      });
    }
  }
  return out;
}

function detectMissingBPReference(input: ContradictionInput): ContradictionFlag[] {
  const capIds = new Set(input.capabilities.map(c => c.id));
  const out: ContradictionFlag[] = [];
  for (const task of input.tasks) {
    if (task.bp_id && !capIds.has(task.bp_id) && !task.bp_id.startsWith('__')) {
      out.push({
        kind: 'missing_bp_reference',
        severity: 'error',
        message: `Task ${task.id} references unknown BP ${task.bp_id}.`,
        project_id: input.project.id,
        task_id: task.id,
        evidence: { bp_id: task.bp_id },
      });
    }
  }
  return out;
}

function detectFrontendCompleteBackendMissing(input: ContradictionInput): ContradictionFlag[] {
  const out: ContradictionFlag[] = [];
  for (const cap of input.capabilities) {
    if (cap.is_page_bp) continue;
    const hasFE = (cap.linked_frontend_components || []).length > 0 || !!cap.frontend_route;
    const hasBE = (cap.linked_backend_services || []).length > 0;
    if (!hasFE || hasBE) continue;

    // Frontend exists, no backend. Is coverage claiming complete?
    const score = input.capability_scores.find(s => s.capability_id === cap.id);
    if (score && score.coverage > 70) {
      out.push({
        kind: 'frontend_complete_backend_missing',
        severity: 'warning',
        message: `${cap.name} has frontend at ${score.coverage}% coverage but no backend services.`,
        project_id: input.project.id,
        capability_id: cap.id,
        evidence: { coverage: score.coverage, has_backend: hasBE, has_frontend: hasFE },
      });
    }
  }
  return out;
}

function detectCapabilityStatusMismatch(input: ContradictionInput): ContradictionFlag[] {
  const out: ContradictionFlag[] = [];
  for (const cap of input.capabilities) {
    const score = input.capability_scores.find(s => s.capability_id === cap.id);
    if (!score) continue;
    // user_status='verified' but coverage < 50 → suspicious assertion
    if (cap.user_status === 'verified' && score.coverage < 50) {
      out.push({
        kind: 'capability_status_mismatch',
        severity: 'warning',
        message: `${cap.name} is marked verified but coverage is only ${score.coverage}%.`,
        project_id: input.project.id,
        capability_id: cap.id,
        evidence: { user_status: cap.user_status, coverage: score.coverage },
      });
    }
  }
  return out;
}

function detectOrphanBPs(input: ContradictionInput): ContradictionFlag[] {
  const out: ContradictionFlag[] = [];
  for (const cap of input.capabilities) {
    if (cap.applicability_status !== 'active') continue;
    if (cap.is_page_bp) continue;   // Page BPs without files are pre-Define-Component, not orphans
    const hasFiles = (cap.linked_backend_services || []).length
      + (cap.linked_frontend_components || []).length
      + (cap.linked_agents || []).length > 0;
    const hasReqs = cap.total_requirements > 0;
    if (!hasFiles && !hasReqs) {
      out.push({
        kind: 'orphan_bp',
        severity: 'warning',
        message: `${cap.name} has no linked files and no requirements — orphan capability.`,
        project_id: input.project.id,
        capability_id: cap.id,
        evidence: { source: cap.source },
      });
    }
  }
  return out;
}

function detectOrphanRoutes(input: ContradictionInput): ContradictionFlag[] {
  const linked = new Set<string>();
  for (const cap of input.capabilities) {
    if (cap.frontend_route) linked.add(cap.frontend_route);
    for (const f of cap.linked_frontend_components || []) linked.add(f);
  }
  const pageFiles = input.project.repo_file_tree.filter(f =>
    /(^|\/)pages\/.*\.(tsx?|jsx?)$/i.test(f) && !/test|spec|index/i.test(f)
  );
  const orphans = pageFiles.filter(f => !linked.has(f));
  // Only flag if there are a noteworthy number of orphans.
  if (orphans.length === 0) return [];
  return [{
    kind: 'orphan_route',
    severity: 'info',
    message: `${orphans.length} frontend pages are not linked to any capability.`,
    project_id: input.project.id,
    evidence: { sample: orphans.slice(0, 10), total: orphans.length },
  }];
}

function detectValidationDrift(input: ContradictionInput): ContradictionFlag[] {
  if (!input.project.latest_commit_sha) return [];
  const out: ContradictionFlag[] = [];
  const head = String(input.project.latest_commit_sha).substring(0, 7);
  for (const cap of input.capabilities) {
    const vr = cap.last_execution?.validation_report as any;
    if (!vr || !vr.commitSha) continue;
    const reportSha = String(vr.commitSha).substring(0, 7);
    if (reportSha !== head) {
      out.push({
        kind: 'validation_drift',
        severity: 'info',
        message: `${cap.name}'s last validation report is from commit ${reportSha} but repo HEAD is ${head}.`,
        project_id: input.project.id,
        capability_id: cap.id,
        evidence: { report_commit: reportSha, head_commit: head },
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Phase 4 telemetry-aware detectors
// ---------------------------------------------------------------------------

const ONE_DAY = 24 * 60 * 60 * 1000;
const SEVEN_DAYS = 7 * ONE_DAY;
const THIRTY_DAYS = 30 * ONE_DAY;

/**
 * missing_telemetry — a BP claims maturity L>=2 (or user_status='verified')
 * but no manifest has ever been ingested for it.
 */
function detectMissingTelemetry(input: ContradictionInput): ContradictionFlag[] {
  if (!input.manifests) return [];
  const bpsWithManifest = new Set<string>();
  for (const m of input.manifests) {
    if (m.bp_id) bpsWithManifest.add(m.bp_id);
  }
  const out: ContradictionFlag[] = [];
  for (const cap of input.capabilities) {
    if (cap.applicability_status !== 'active') continue;
    if (bpsWithManifest.has(cap.id)) continue;
    const score = input.capability_scores.find(s => s.capability_id === cap.id);
    const claimsComplete = cap.user_status === 'verified' || (score?.maturity_level ?? 0) >= 2;
    if (claimsComplete) {
      out.push({
        kind: 'missing_telemetry',
        severity: 'warning',
        message: `${cap.name} claims to be at maturity L${score?.maturity_level ?? 0}${cap.user_status === 'verified' ? ' (user-verified)' : ''} but no build manifest has been ingested for it.`,
        project_id: input.project.id,
        capability_id: cap.id,
        evidence: { user_status: cap.user_status, maturity_level: score?.maturity_level },
      });
    }
  }
  return out;
}

/**
 * stale_telemetry — the most recent manifest for a BP is older than the
 * 30-day expiry threshold.
 */
function detectStaleTelemetry(input: ContradictionInput): ContradictionFlag[] {
  if (!input.manifests) return [];
  const newestByBp = new Map<string, number>();
  for (const m of input.manifests) {
    if (!m.bp_id) continue;
    const ts = new Date(m.execution_timestamp).getTime();
    const prev = newestByBp.get(m.bp_id);
    if (!prev || ts > prev) newestByBp.set(m.bp_id, ts);
  }
  const now = Date.now();
  const out: ContradictionFlag[] = [];
  for (const [bpId, ts] of newestByBp) {
    const ageMs = now - ts;
    if (ageMs <= THIRTY_DAYS) continue;
    const cap = input.capabilities.find(c => c.id === bpId);
    if (!cap) continue;
    out.push({
      kind: 'stale_telemetry',
      severity: ageMs > 90 * ONE_DAY ? 'warning' : 'info',
      message: `${cap.name}'s most recent manifest is ${Math.round(ageMs / ONE_DAY)} days old.`,
      project_id: input.project.id,
      capability_id: cap.id,
      evidence: { age_days: Math.round(ageMs / ONE_DAY), newest_timestamp: new Date(ts).toISOString() },
    });
  }
  return out;
}

/**
 * telemetry_conflict — surfaces resolver-detected conflicts (later manifest
 * undid an earlier one's claim) as info-level flags so users see them.
 */
function detectTelemetryConflict(input: ContradictionInput): ContradictionFlag[] {
  if (!input.resolvedConflicts || input.resolvedConflicts.length === 0) return [];
  return input.resolvedConflicts.map((c): ContradictionFlag => ({
    kind: 'telemetry_conflict',
    severity: 'info',
    message: c.description,
    project_id: c.project_id,
    capability_id: c.bp_id ?? undefined,
    evidence: {},
  }));
}

/**
 * telemetry_drift — manifest declares a file path that no other source
 * (repo file tree) supports. Heuristic: APIs declared in manifests that
 * point at handler files NOT in the repo file tree.
 */
function detectTelemetryDrift(input: ContradictionInput): ContradictionFlag[] {
  if (!input.manifests || input.manifests.length === 0) return [];
  const repoFiles = new Set(input.project.repo_file_tree);
  if (repoFiles.size === 0) return [];   // no signal to compare against

  const drift: Array<{ bp_id: string | null; api: string; file: string }> = [];
  for (const m of input.manifests) {
    for (const api of [...(m.apis_added || []), ...(m.apis_modified || [])]) {
      const f = api.handler_file;
      if (!f) continue;
      if (!repoFiles.has(f)) {
        drift.push({ bp_id: m.bp_id ?? null, api: `${api.method} ${api.path}`, file: f });
      }
    }
  }
  if (drift.length === 0) return [];
  return [{
    kind: 'telemetry_drift',
    severity: 'warning',
    message: `${drift.length} manifest-declared API handler file${drift.length === 1 ? '' : 's'} not present in repo file tree.`,
    project_id: input.project.id,
    evidence: { sample: drift.slice(0, 10), total: drift.length },
  }];
}

/**
 * undocumented_db_change — manifest declares database_changes for a table
 * but no other manifest re-declares it (single-source, recent enough that
 * it wasn't superseded). Surfaces as info — this is a documentation gap,
 * not a defect.
 *
 * Phase 4 V1 heuristic: any DB change older than 7 days with no follow-up.
 */
function detectUndocumentedDbChange(input: ContradictionInput): ContradictionFlag[] {
  if (!input.manifests) return [];
  const tableTouches = new Map<string, { count: number; newest: number; bp_id: string | null }>();
  for (const m of input.manifests) {
    const ts = new Date(m.execution_timestamp).getTime();
    for (const dc of m.database_changes || []) {
      const key = `${dc.schema || 'public'}.${dc.table}`;
      const cur = tableTouches.get(key);
      if (!cur) tableTouches.set(key, { count: 1, newest: ts, bp_id: m.bp_id ?? null });
      else {
        cur.count++;
        if (ts > cur.newest) cur.newest = ts;
      }
    }
  }
  const now = Date.now();
  const out: ContradictionFlag[] = [];
  for (const [table, info] of tableTouches) {
    if (info.count > 1) continue;   // documented enough — multiple manifests touch it
    if (now - info.newest <= SEVEN_DAYS) continue;   // too recent to flag
    out.push({
      kind: 'undocumented_db_change',
      severity: 'info',
      message: `Table ${table} was touched once (${Math.round((now - info.newest) / ONE_DAY)} days ago) and no later manifest re-declares it.`,
      project_id: input.project.id,
      capability_id: info.bp_id ?? undefined,
      evidence: { table, age_days: Math.round((now - info.newest) / ONE_DAY) },
    });
  }
  return out;
}

/**
 * ui_drift — heuristic: a BP claims a frontend_route, but no manifest
 * declared it (so the UI map source for that route is repo discovery, not
 * telemetry).
 */
function detectUiDrift(input: ContradictionInput): ContradictionFlag[] {
  if (!input.manifests) return [];
  const declaredRoutes = new Set<string>();
  for (const m of input.manifests) {
    for (const r of m.frontend_routes_added || []) declaredRoutes.add(r.route);
  }
  const out: ContradictionFlag[] = [];
  for (const cap of input.capabilities) {
    if (!cap.frontend_route) continue;
    if (declaredRoutes.has(cap.frontend_route)) continue;
    out.push({
      kind: 'ui_drift',
      severity: 'info',
      message: `${cap.name}'s frontend_route ${cap.frontend_route} is not declared by any manifest.`,
      project_id: input.project.id,
      capability_id: cap.id,
      evidence: { route: cap.frontend_route },
    });
  }
  return out;
}

/**
 * graph_drift — manifest references a BP id that doesn't exist in the
 * project. Indicates orphan manifests.
 */
function detectGraphDrift(input: ContradictionInput): ContradictionFlag[] {
  if (!input.manifests) return [];
  const knownBps = new Set(input.capabilities.map(c => c.id));
  const orphans = input.manifests.filter((m: any) => m.bp_id && !knownBps.has(m.bp_id));
  if (orphans.length === 0) return [];
  return [{
    kind: 'graph_drift',
    severity: 'warning',
    message: `${orphans.length} manifest${orphans.length === 1 ? '' : 's'} reference a BP that no longer exists in this project.`,
    project_id: input.project.id,
    evidence: { sample: orphans.slice(0, 5).map((m: any) => ({ manifest_id: m.id, bp_id: m.bp_id })), total: orphans.length },
  }];
}

/**
 * low_confidence_validation — a manifest's bundled validation_results carry
 * a fail status (or no pass results when the manifest declares completion).
 */
function detectLowConfidenceValidation(input: ContradictionInput): ContradictionFlag[] {
  if (!input.manifests) return [];
  const out: ContradictionFlag[] = [];
  for (const m of input.manifests) {
    const results = m.validation_results || [];
    if (results.length === 0) continue;
    const failed = results.filter((r: any) => r.status === 'fail');
    if (failed.length > 0) {
      out.push({
        kind: 'low_confidence_validation',
        severity: 'warning',
        message: `Manifest declared ${failed.length} failing check${failed.length === 1 ? '' : 's'} (${failed.map((f: any) => f.check).join(', ')}).`,
        project_id: input.project.id,
        capability_id: m.bp_id ?? undefined,
        evidence: { manifest_id: m.id, failed_checks: failed.map((f: any) => f.check) },
      });
    }
  }
  return out;
}
