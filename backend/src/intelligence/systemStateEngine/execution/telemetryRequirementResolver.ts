/**
 * telemetryRequirementResolver — what telemetry MUST be present for a build
 * to count as complete, indexed by task type.
 *
 * Phase 4: turns Phase 3's "manifests are recommended" into "manifests are
 * required for DoD." A build whose manifest fails this checklist is rejected.
 *
 * Pure: no I/O. Tested directly.
 */
import type { AuthoritativeTaskType } from '../types/systemState.types';

export type TelemetryRequirementKind =
  | 'files_changed'
  | 'apis_declared'
  | 'frontend_routes_declared'
  | 'ui_components_declared'
  | 'database_changes_declared'
  | 'tests_added'
  | 'validation_results';

export interface TelemetryRequirement {
  readonly kind: TelemetryRequirementKind;
  readonly severity: 'required' | 'recommended';
  readonly rationale: string;
}

/**
 * Per-task-type checklist. `required` items must be present (or the build
 * is rejected); `recommended` items raise warnings.
 */
const REQUIREMENTS: Record<AuthoritativeTaskType, ReadonlyArray<TelemetryRequirement>> = {
  foundation: [
    { kind: 'files_changed',        severity: 'required',    rationale: 'foundation tasks always touch the repo' },
    { kind: 'tests_added',          severity: 'recommended', rationale: 'kickoff should land at least one smoke test' },
    { kind: 'validation_results',   severity: 'required',    rationale: 'foundation must report tsc + build status' },
  ],
  backend: [
    { kind: 'files_changed',        severity: 'required',    rationale: 'backend builds change source files' },
    { kind: 'apis_declared',        severity: 'recommended', rationale: 'most backend work exposes or modifies APIs' },
    { kind: 'tests_added',          severity: 'required',    rationale: 'backend logic must ship with tests' },
    { kind: 'validation_results',   severity: 'required',    rationale: 'tsc + jest must report' },
  ],
  frontend: [
    { kind: 'files_changed',                severity: 'required',    rationale: 'frontend builds change UI files' },
    { kind: 'frontend_routes_declared',     severity: 'recommended', rationale: 'declare new routes in the manifest' },
    { kind: 'ui_components_declared',       severity: 'recommended', rationale: 'declare new components in the manifest' },
    { kind: 'validation_results',           severity: 'required',    rationale: 'tsc + build must report' },
  ],
  database: [
    { kind: 'database_changes_declared', severity: 'required',    rationale: 'DB tasks must declare table/column ops' },
    { kind: 'files_changed',             severity: 'required',    rationale: 'migrations or models must change' },
    { kind: 'validation_results',        severity: 'required',    rationale: 'migration must run and report' },
  ],
  validation: [
    { kind: 'validation_results',   severity: 'required',    rationale: 'the entire purpose of the task is to produce evidence' },
  ],
  testing: [
    { kind: 'tests_added',          severity: 'required',    rationale: 'testing tasks must add tests' },
    { kind: 'validation_results',   severity: 'required',    rationale: 'jest/playwright must report pass/fail' },
  ],
  intelligence: [
    { kind: 'files_changed',        severity: 'required',    rationale: 'agent/intelligence tasks change source files' },
    { kind: 'tests_added',          severity: 'required',    rationale: 'intelligence logic ships with tests' },
    { kind: 'validation_results',   severity: 'required',    rationale: 'tsc + jest must report' },
  ],
  ui_review: [
    { kind: 'ui_components_declared', severity: 'recommended', rationale: 'visual reviews target specific components' },
    { kind: 'validation_results',     severity: 'recommended', rationale: 'declare which checks ran (tsc, accessibility scan)' },
  ],
  optimization: [
    { kind: 'files_changed',        severity: 'required',    rationale: 'optimization tasks must change at least one file' },
    { kind: 'validation_results',   severity: 'required',    rationale: 'must show the optimization didn\'t regress tests' },
  ],
};

/** Returns the full checklist for a task type. */
export function requirementsFor(taskType: AuthoritativeTaskType): ReadonlyArray<TelemetryRequirement> {
  return REQUIREMENTS[taskType] ?? [];
}

/** Convenience: just the required-severity items. */
export function requiredRequirementsFor(taskType: AuthoritativeTaskType): ReadonlyArray<TelemetryRequirement> {
  return requirementsFor(taskType).filter(r => r.severity === 'required');
}
