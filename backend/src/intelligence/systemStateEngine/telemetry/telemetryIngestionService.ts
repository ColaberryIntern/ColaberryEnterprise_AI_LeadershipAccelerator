/**
 * telemetryIngestionService — top-level entry for build manifests.
 *
 *   POST /api/portal/project/telemetry  →  ingest(rawPayload)
 *
 * Pipeline:
 *   1. shape validation (Zod)
 *   2. cross-ref validation (DB existence)
 *   3. INSERT into build_manifests
 *   4. fire-and-forget refreshSystemState
 *
 * Returns either { ok: true, manifest_id } or { ok: false, errors }.
 *
 * Contract: BUILD_MANIFEST_CONTRACT.md §6 (Lifecycle)
 */
import { validateManifestShape, validateManifestRefs, type ValidationError } from './manifestValidator';
import { refreshSystemState } from '../refreshTriggers';

export type IngestOutcome =
  | { ok: true; manifest_id: string; project_id: string }
  | { ok: false; errors: ReadonlyArray<ValidationError>; status: 400 | 404 };

export async function ingest(rawPayload: unknown): Promise<IngestOutcome> {
  // 1. Shape (cheap, no DB)
  const shape = validateManifestShape(rawPayload);
  if (!shape.ok) return { ok: false, errors: shape.errors, status: 400 };

  // 2. Refs (DB-backed)
  const refs = await validateManifestRefs(shape.value);
  if (!refs.ok) {
    const has404 = refs.errors.some(e => e.code === 'unknown_project' || e.code === 'unknown_bp');
    return { ok: false, errors: refs.errors, status: has404 ? 404 : 400 };
  }

  // 3. INSERT
  const m = refs.value;
  const { default: BuildManifest } = await import('../../../models/BuildManifest');
  const row = await BuildManifest.create({
    manifest_version: m.manifest_version,
    telemetry_version: m.telemetry_version,
    task_id: m.task_id,
    bp_id: m.bp_id ?? null,
    project_id: m.project_id,
    execution_timestamp: new Date(m.execution_timestamp),
    files_created: m.files_created,
    files_modified: m.files_modified,
    files_deleted: m.files_deleted,
    database_changes: m.database_changes,
    apis_added: m.apis_added,
    apis_modified: m.apis_modified,
    frontend_routes_added: m.frontend_routes_added,
    ui_components_added: m.ui_components_added,
    ui_components_modified: m.ui_components_modified,
    tests_added: m.tests_added,
    tests_modified: m.tests_modified,
    validation_results: m.validation_results,
    dependencies_added: m.dependencies_added,
    packages_added: m.packages_added,
    system_impacts: m.system_impacts,
    decision_trace: m.decision_trace ?? null,
  } as any);

  // 4. fire-and-forget refresh — never blocks the request
  try {
    refreshSystemState(m.project_id, 'manifest_ingested' as any);
  } catch { /* fire-and-forget */ }

  return { ok: true, manifest_id: (row as any).id, project_id: m.project_id };
}

/** Read manifests for a project. Optional bp filter, optional `since` cutoff. */
export async function loadManifestsForProject(
  projectId: string,
  opts: { bpId?: string; sinceMs?: number; limit?: number } = {},
): Promise<Array<any>> {
  const { default: BuildManifest } = await import('../../../models/BuildManifest');
  const where: any = { project_id: projectId };
  if (opts.bpId) where.bp_id = opts.bpId;
  if (opts.sinceMs) {
    const { Op } = await import('sequelize');
    where.execution_timestamp = { [Op.gte]: new Date(Date.now() - opts.sinceMs) };
  }
  const rows = await BuildManifest.findAll({
    where,
    order: [['execution_timestamp', 'DESC']],
    limit: opts.limit ?? 100,
  });
  return rows.map((r: any) => ({
    id: r.id,
    manifest_version: r.manifest_version,
    telemetry_version: r.telemetry_version,
    task_id: r.task_id,
    bp_id: r.bp_id,
    project_id: r.project_id,
    execution_timestamp: new Date(r.execution_timestamp).toISOString(),
    files_created: r.files_created || [],
    files_modified: r.files_modified || [],
    files_deleted: r.files_deleted || [],
    database_changes: r.database_changes || [],
    apis_added: r.apis_added || [],
    apis_modified: r.apis_modified || [],
    frontend_routes_added: r.frontend_routes_added || [],
    ui_components_added: r.ui_components_added || [],
    ui_components_modified: r.ui_components_modified || [],
    tests_added: r.tests_added || [],
    tests_modified: r.tests_modified || [],
    validation_results: r.validation_results || [],
    dependencies_added: r.dependencies_added || [],
    packages_added: r.packages_added || [],
    system_impacts: r.system_impacts || [],
    decision_trace: r.decision_trace,
  }));
}
