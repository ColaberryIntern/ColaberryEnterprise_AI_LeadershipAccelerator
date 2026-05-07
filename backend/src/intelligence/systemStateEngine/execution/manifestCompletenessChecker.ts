/**
 * manifestCompletenessChecker — given a manifest + the task it claims to have
 * completed, decide whether the manifest is rich enough to count as DoD.
 *
 * Output: a deterministic completeness score (0-100) and a structured list of
 * what's missing or warning-worthy. The buildCompletionValidator turns a
 * non-perfect score into a TelemetryValidationError when severity warrants.
 *
 * Phase 4 §3.
 */
import type { BuildManifest } from '../telemetry/buildManifestSchema';
import type { AuthoritativeTaskType } from '../types/systemState.types';
import { requirementsFor, type TelemetryRequirement, type TelemetryRequirementKind } from './telemetryRequirementResolver';

export interface CompletenessIssue {
  readonly kind: TelemetryRequirementKind | 'empty_manifest' | 'no_changes' | 'no_validation_evidence';
  readonly severity: 'required' | 'recommended';
  readonly rationale: string;
  readonly remedy: string;
}

export interface CompletenessReport {
  readonly task_type: AuthoritativeTaskType;
  readonly score: number;          // 0-100
  readonly missing_requirements: ReadonlyArray<CompletenessIssue>;   // severity = 'required'
  readonly warnings: ReadonlyArray<CompletenessIssue>;               // severity = 'recommended'
  readonly blocking: boolean;      // any required item missing
}

/**
 * Pure check. Returns deterministic output for a (task_type, manifest) pair.
 */
export function checkManifestCompleteness(
  taskType: AuthoritativeTaskType,
  manifest: BuildManifest,
): CompletenessReport {
  const checklist = requirementsFor(taskType);

  const missing: CompletenessIssue[] = [];
  const warnings: CompletenessIssue[] = [];

  for (const req of checklist) {
    const present = isRequirementPresent(req.kind, manifest);
    if (present) continue;
    const issue: CompletenessIssue = {
      kind: req.kind,
      severity: req.severity,
      rationale: req.rationale,
      remedy: remedyFor(req),
    };
    if (req.severity === 'required') missing.push(issue);
    else warnings.push(issue);
  }

  // Universal sanity checks (apply regardless of task type)
  const totalChanges =
    (manifest.files_created || []).length +
    (manifest.files_modified || []).length +
    (manifest.files_deleted || []).length +
    (manifest.apis_added || []).length +
    (manifest.apis_modified || []).length +
    (manifest.frontend_routes_added || []).length +
    (manifest.ui_components_added || []).length +
    (manifest.ui_components_modified || []).length +
    (manifest.database_changes || []).length +
    (manifest.tests_added || []).length +
    (manifest.tests_modified || []).length;

  if (totalChanges === 0) {
    missing.push({
      kind: 'empty_manifest',
      severity: 'required',
      rationale: 'A manifest with zero recorded changes does not represent a build operation',
      remedy: 'Re-emit the manifest with the actual files / APIs / DB changes that this task produced',
    });
  }

  // Score: every required miss costs 25; every recommended warning costs 8.
  // Floor at 0.
  const requiredMisses = missing.length;
  const warningMisses = warnings.length;
  let score = 100 - (requiredMisses * 25) - (warningMisses * 8);
  if (score < 0) score = 0;

  return {
    task_type: taskType,
    score,
    missing_requirements: missing,
    warnings,
    blocking: missing.length > 0,
  };
}

function isRequirementPresent(kind: TelemetryRequirementKind, m: BuildManifest): boolean {
  switch (kind) {
    case 'files_changed':
      return (m.files_created?.length || 0) + (m.files_modified?.length || 0) + (m.files_deleted?.length || 0) > 0;
    case 'apis_declared':
      return (m.apis_added?.length || 0) + (m.apis_modified?.length || 0) > 0;
    case 'frontend_routes_declared':
      return (m.frontend_routes_added?.length || 0) > 0;
    case 'ui_components_declared':
      return (m.ui_components_added?.length || 0) + (m.ui_components_modified?.length || 0) > 0;
    case 'database_changes_declared':
      return (m.database_changes?.length || 0) > 0;
    case 'tests_added':
      return (m.tests_added?.length || 0) + (m.tests_modified?.length || 0) > 0;
    case 'validation_results':
      return (m.validation_results?.length || 0) > 0;
  }
}

function remedyFor(req: TelemetryRequirement): string {
  switch (req.kind) {
    case 'files_changed':
      return 'Add the changed file paths to manifest.files_created / files_modified / files_deleted';
    case 'apis_declared':
      return 'Add { method, path, handler_file } entries to manifest.apis_added';
    case 'frontend_routes_declared':
      return 'Add { route, component_file } entries to manifest.frontend_routes_added';
    case 'ui_components_declared':
      return 'Add { name, file, category } entries to manifest.ui_components_added';
    case 'database_changes_declared':
      return 'Add { table, operation, details } entries to manifest.database_changes';
    case 'tests_added':
      return 'Add { file, type, coverage_target } entries to manifest.tests_added';
    case 'validation_results':
      return 'Add at least one { check, status } entry to manifest.validation_results (tsc, jest, build, etc.)';
  }
}
