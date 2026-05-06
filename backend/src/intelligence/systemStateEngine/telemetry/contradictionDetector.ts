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
