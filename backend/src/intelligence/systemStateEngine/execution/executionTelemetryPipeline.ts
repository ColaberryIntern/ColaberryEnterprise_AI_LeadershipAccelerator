/**
 * executionTelemetryPipeline — the top-level orchestrator that runs after
 * a build attempts to declare itself complete.
 *
 *   ingest manifest  →
 *   check completeness for the task type  →
 *   reject if blocking, accept otherwise  →
 *   await synchronized state rebuild  →
 *   return the new state + the report
 *
 * Used by:
 *   POST /api/portal/project/build-session/:id/complete
 *
 * Phase 4 §1.
 */
import type { AuthoritativeSystemState, AuthoritativeTaskType } from '../types/systemState.types';
import type { BuildManifest } from '../telemetry/buildManifestSchema';
import { ingest as ingestManifest } from '../telemetry/telemetryIngestionService';
import { assertBuildComplete, type BuildCompletionResult } from './buildCompletionValidator';
import { syncProjectState } from './executionStateSynchronizer';

export interface PipelineInput {
  readonly manifest: BuildManifest;
  readonly task_type: AuthoritativeTaskType;
  /** When false, completeness gate is informational only (warnings, not 422). */
  readonly enforce_completeness?: boolean;
}

export type PipelineOutcome =
  | {
      readonly ok: true;
      readonly manifest_id: string;
      readonly project_id: string;
      readonly completion: BuildCompletionResult;
      readonly state: AuthoritativeSystemState;
      readonly state_elapsed_ms: number;
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly error: string;
      readonly details?: unknown;
    };

export async function runExecutionPipeline(input: PipelineInput): Promise<PipelineOutcome> {
  const enforce = input.enforce_completeness !== false;

  // 1. Completeness check FIRST — cheap, deterministic, no DB write happens
  // if the manifest is too thin to count.
  let completion: BuildCompletionResult;
  try {
    completion = assertBuildComplete(
      { task_type: input.task_type, manifest: input.manifest },
      { strict: enforce },
    );
  } catch (err: any) {
    // TelemetryValidationError carries a CompletenessReport on .report
    return {
      ok: false,
      status: 422,
      error: 'telemetry_validation_failed',
      details: err.report ?? null,
    };
  }

  // 2. Ingest the manifest. Reuses Phase 3 validator for shape + secret + ref.
  const ingestion = await ingestManifest(input.manifest);
  if (!ingestion.ok) {
    return {
      ok: false,
      status: ingestion.status,
      error: 'manifest_ingestion_failed',
      details: ingestion.errors,
    };
  }

  // 3. Force a synchronized state rebuild and return the new state.
  const sync = await syncProjectState(ingestion.project_id);

  return {
    ok: true,
    manifest_id: ingestion.manifest_id,
    project_id: ingestion.project_id,
    completion,
    state: sync.state,
    state_elapsed_ms: sync.elapsed_ms,
  };
}
