/**
 * autoManifestGenerator — assemble a draft BuildManifest from whatever
 * signals we can scrape:
 *
 *   - parsed validation report (filesCreated, filesModified, etc.)
 *   - git diff (--name-status)
 *   - task context (task_id, bp_id, project_id)
 *
 * The generated manifest is a DRAFT — caller can post it directly via the
 * existing `POST /telemetry` endpoint, or surface to the user for review.
 *
 * Goal (Phase 4 §5): reduce dependence on humans remembering to emit
 * manifests. Auto-fill 80% of the fields; let the user fill the rest.
 */
import { analyzeDiff, parseGitDiffNameStatus, type DiffFile } from './gitDiffTelemetryAnalyzer';

export interface AutoManifestInput {
  readonly task_id: string;
  readonly bp_id: string | null;
  readonly project_id: string;
  /** Pre-parsed diff or `git diff --name-status` stdout. */
  readonly diff?: ReadonlyArray<DiffFile>;
  readonly diff_stdout?: string;
  /** Optional fields parsed from a free-form validation report. */
  readonly parsed_validation_report?: {
    filesCreated?: string[];
    filesModified?: string[];
    routes?: Array<{ method?: string; path?: string }>;
    database?: Array<{ table?: string; operation?: string; details?: string }>;
    status?: string;
  };
  readonly execution_timestamp?: string;
}

export interface AutoManifestDraft {
  readonly manifest: any;          // shape conforms to BuildManifestSchema, untyped here so callers can add their own fields
  readonly source_summary: {
    readonly diff_files_used: number;
    readonly validation_report_used: boolean;
  };
}

export function generateManifestDraft(input: AutoManifestInput): AutoManifestDraft {
  // 1. Resolve the diff source.
  let diffFiles: DiffFile[] = [];
  if (input.diff && input.diff.length > 0) diffFiles = [...input.diff];
  else if (input.diff_stdout) diffFiles = parseGitDiffNameStatus(input.diff_stdout);

  // Merge in files declared in a validation report (treat as 'added' if not
  // already present, to match the report's intent).
  if (input.parsed_validation_report) {
    const known = new Set(diffFiles.map(d => d.path));
    for (const f of input.parsed_validation_report.filesCreated || []) {
      if (!known.has(f)) diffFiles.push({ path: f, status: 'added' });
    }
    for (const f of input.parsed_validation_report.filesModified || []) {
      if (!known.has(f)) diffFiles.push({ path: f, status: 'modified' });
    }
  }

  const analysis = analyzeDiff(diffFiles);

  // 2. APIs — prefer validation report's parsed routes (more reliable),
  // fall back to inferred from file names.
  const apis_added: any[] = [];
  if (input.parsed_validation_report?.routes && input.parsed_validation_report.routes.length > 0) {
    for (const r of input.parsed_validation_report.routes) {
      if (!r.method || !r.path) continue;
      apis_added.push({ method: r.method.toUpperCase(), path: r.path });
    }
  } else {
    apis_added.push(...analysis.inferred_apis_added);
  }

  // 3. Database — prefer validation report's parsed entries.
  const database_changes: any[] = [];
  if (input.parsed_validation_report?.database && input.parsed_validation_report.database.length > 0) {
    for (const d of input.parsed_validation_report.database) {
      if (!d.table || !d.operation) continue;
      database_changes.push({
        table: d.table,
        operation: d.operation,
        details: d.details ?? undefined,
      });
    }
  } else {
    database_changes.push(...analysis.inferred_database_changes);
  }

  // 4. Validation results — synthesize from the report's status if present.
  const validation_results: any[] = [];
  if (input.parsed_validation_report?.status) {
    const s = input.parsed_validation_report.status.toUpperCase();
    if (/COMPLETE|PASS|SUCCESS/.test(s) && !/INCOMPLETE|PARTIAL|FAIL/.test(s)) {
      validation_results.push({ check: 'manual', status: 'pass', details: input.parsed_validation_report.status });
    } else if (/FAIL|ERROR/.test(s)) {
      validation_results.push({ check: 'manual', status: 'fail', details: input.parsed_validation_report.status });
    } else {
      validation_results.push({ check: 'manual', status: 'skipped', details: input.parsed_validation_report.status });
    }
  }

  const manifest = {
    manifest_version: '1.0',
    telemetry_version: '1.0',
    task_id: input.task_id,
    bp_id: input.bp_id ?? null,
    project_id: input.project_id,
    execution_timestamp: input.execution_timestamp ?? new Date().toISOString(),

    files_created: analysis.files_created,
    files_modified: analysis.files_modified,
    files_deleted: analysis.files_deleted,

    database_changes,
    apis_added,
    apis_modified: [],
    frontend_routes_added: analysis.inferred_frontend_routes_added,
    ui_components_added: analysis.inferred_ui_components_added,
    ui_components_modified: [],
    tests_added: analysis.inferred_tests_added,
    tests_modified: [],
    validation_results,
    dependencies_added: [],
    packages_added: [],
    system_impacts: [],
  };

  return {
    manifest,
    source_summary: {
      diff_files_used: diffFiles.length,
      validation_report_used: !!input.parsed_validation_report,
    },
  };
}

/**
 * Suggest what telemetry fields are still missing on a draft manifest, given
 * the task type. Returns human-readable strings the UI can display.
 *
 * Phase 4 §14: manifest repair suggestions.
 */
export function suggestRepairs(draft: any, taskType: string): string[] {
  const out: string[] = [];
  const noFiles = !draft.files_created?.length && !draft.files_modified?.length && !draft.files_deleted?.length;
  if (noFiles) out.push('No file changes detected. Confirm the build actually wrote source files; if so, list them under files_created or files_modified.');
  const noValidation = !draft.validation_results?.length;
  if (noValidation) out.push('No validation_results entries. Add at least one { check: "tsc"|"jest"|... , status: "pass"|"fail" } so the engine knows the build was checked.');
  if (taskType === 'database' && !draft.database_changes?.length) {
    out.push('Task is a database task but no database_changes were declared. Add the table + operation that this task touched.');
  }
  if (taskType === 'frontend' && !draft.frontend_routes_added?.length && !draft.ui_components_added?.length) {
    out.push('Task is a frontend task but no UI changes were declared. Add either frontend_routes_added or ui_components_added.');
  }
  if (taskType === 'backend' && !draft.apis_added?.length && !draft.apis_modified?.length && !draft.database_changes?.length) {
    out.push('Task is a backend task but neither APIs nor DB changes were declared. Add apis_added or database_changes (most backend builds emit at least one).');
  }
  if (taskType === 'testing' && !draft.tests_added?.length && !draft.tests_modified?.length) {
    out.push('Task is a testing task but no tests were declared. Add tests_added entries pointing at the test files.');
  }
  return out;
}
