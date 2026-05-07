/**
 * buildCompletionValidator — gates the "build is complete" assertion behind
 * telemetry quality.
 *
 * A build is NOT complete unless:
 *   1. A BuildManifest exists for the task.
 *   2. Manifest passes shape validation (already enforced by ingestion).
 *   3. Manifest passes the completeness checklist for the task's type.
 *   4. No `required` items are missing (warnings allowed).
 *
 * Phase 4 §4.
 */
import type { BuildManifest } from '../telemetry/buildManifestSchema';
import type { AuthoritativeTaskType } from '../types/systemState.types';
import { checkManifestCompleteness, type CompletenessReport } from './manifestCompletenessChecker';

/**
 * Thrown to the request boundary when a build's telemetry is too thin to
 * count as complete. Status 422 (semantic rejection).
 */
export class TelemetryValidationError extends Error {
  readonly statusCode: number = 422;
  readonly code: string = 'telemetry_validation_failed';
  readonly report: CompletenessReport;

  constructor(report: CompletenessReport, message?: string) {
    super(message ?? 'Build telemetry incomplete — required telemetry missing');
    this.name = 'TelemetryValidationError';
    this.report = report;
  }
}

export interface BuildCompletionAssertion {
  readonly task_type: AuthoritativeTaskType;
  readonly manifest: BuildManifest;
}

export interface BuildCompletionResult {
  readonly accepted: boolean;
  readonly score: number;
  readonly report: CompletenessReport;
}

/**
 * Pure validator. Returns acceptance + report, or throws TelemetryValidationError
 * when blocking.
 *
 * Use { strict: false } to get a non-throwing variant — useful for endpoints
 * that want to surface incomplete telemetry as a soft warning.
 */
export function assertBuildComplete(
  input: BuildCompletionAssertion,
  opts: { strict?: boolean } = {},
): BuildCompletionResult {
  const { strict = true } = opts;
  const report = checkManifestCompleteness(input.task_type, input.manifest);

  if (report.blocking && strict) {
    throw new TelemetryValidationError(report);
  }
  return {
    accepted: !report.blocking,
    score: report.score,
    report,
  };
}
