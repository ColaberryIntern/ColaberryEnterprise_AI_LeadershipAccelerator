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

  // 4. link manifest APIs to matching requirements — best-effort, never
  //    blocks the ingest result. Conservative substring match against
  //    requirement_text for now (see linkApisToRequirements docstring).
  try {
    await linkApisToRequirements(m);
  } catch (e: any) {
    console.error('[telemetryIngestion] linker failed (non-fatal):', e?.message || e);
  }

  // 5. fire-and-forget refresh — never blocks the request
  try {
    refreshSystemState(m.project_id, 'manifest_ingested' as any);
  } catch { /* fire-and-forget */ }

  return { ok: true, manifest_id: (row as any).id, project_id: m.project_id };
}

// ---------------------------------------------------------------------------
// Manifest → requirement linker
// ---------------------------------------------------------------------------

interface ApiEntry { method?: string; path?: string; handler_file?: string }
type LinkableManifest = { project_id: string; apis_added?: ApiEntry[]; apis_modified?: ApiEntry[] };

/**
 * Best-effort auto-link of manifest API entries to RequirementsMap rows
 * whose `requirement_text` references the same API path. Walks both
 * `apis_added` and `apis_modified`. For each matched requirement, appends
 * the manifest's `handler_file` to `github_file_paths` (deduped) and
 * advances `status` from 'unmatched' to 'matched' when applicable.
 *
 * Matching is conservative: substring on requirement_text against the
 * exact API path, scoped to the manifest's `project_id`. False-positive
 * surface is small because requirement_text strings that include "/api/x"
 * are almost always referencing that exact endpoint in this codebase.
 *
 * Does NOT set `source_artifact_id` — that's a FK to artifact_definitions
 * and creating an ArtifactDefinition row is a separate concern (could be
 * a follow-up sprint). Today the github_file_paths field is the
 * machine-readable link the rest of the engine consumes.
 *
 * Idempotent: re-posting the same manifest leaves
 * github_file_paths unchanged after the first append. Status only
 * advances forward (unmatched → matched), never regresses.
 *
 * Returns the count of requirements updated. Never throws on a failed
 * lookup — surfaces errors via the caller's try/catch wrapper.
 *
 * Added 2026-05-17 to fix product finding #2 from the REQ-027 real-
 * operational-verification sprint: manifests were being ingested cleanly
 * but the requirement layer was never updated, so the verification
 * surface remained blind to the work declared in telemetry.
 */
export async function linkApisToRequirements(m: LinkableManifest): Promise<number> {
  const allApis = [...(m.apis_added || []), ...(m.apis_modified || [])];
  if (allApis.length === 0) return 0;

  const { default: RequirementsMap } = await import('../../../models/RequirementsMap');
  const { Op } = await import('sequelize');

  // Pull all requirement rows for this project once — the candidate set
  // for any single project is small (low hundreds) so an in-memory match
  // is cheaper than N separate path-scoped LIKE queries.
  const reqs = await RequirementsMap.findAll({
    where: { project_id: m.project_id, is_active: { [Op.ne]: false } },
  });
  if (reqs.length === 0) return 0;

  let updatedCount = 0;
  for (const api of allApis) {
    if (!api?.path || !api?.handler_file) continue;
    for (const req of reqs) {
      const text = (req as any).requirement_text || '';
      if (!text.includes(api.path)) continue;
      const existing: string[] = Array.isArray((req as any).github_file_paths)
        ? (req as any).github_file_paths
        : [];
      const dirty: string[] = [];
      if (!existing.includes(api.handler_file)) {
        (req as any).github_file_paths = [...existing, api.handler_file];
        dirty.push('github_file_paths');
      }
      if ((req as any).status === 'unmatched') {
        (req as any).status = 'matched';
        dirty.push('status');
      }
      if (dirty.length > 0) {
        await (req as any).save();
        updatedCount += 1;
        console.log(`[telemetryIngestion] linked ${api.method} ${api.path} → ${(req as any).requirement_key} (${dirty.join('+')})`);
      }
    }
  }
  return updatedCount;
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
