/**
 * telemetryConflictResolver — detects + resolves contradictions across
 * multiple manifests for the same (project_id, bp_id).
 *
 * Resolution rule (BUILD_MANIFEST_CONTRACT.md §7):
 *   later timestamp wins; earlier conflicting state surfaces as info-level
 *   `telemetry_conflict` contradiction.
 *
 * Contract: BUILD_MANIFEST_CONTRACT.md §7 (Conflict resolution)
 */
import type { BuildManifest } from './buildManifestSchema';

export interface ManifestConflict {
  readonly project_id: string;
  readonly bp_id: string | null;
  readonly file: string;
  readonly description: string;
  readonly winner_manifest_id: string;
  readonly loser_manifest_ids: ReadonlyArray<string>;
}

export interface ResolvedManifestState {
  /** Files that exist (created and not later deleted). */
  readonly files: ReadonlySet<string>;
  /** APIs declared (post-conflict). */
  readonly apis: ReadonlySet<string>;       // "METHOD /path"
  /** Frontend routes declared. */
  readonly frontend_routes: ReadonlySet<string>;
  /** UI components declared. */
  readonly ui_components: ReadonlySet<string>;  // by name
  /** Test files declared. */
  readonly tests: ReadonlySet<string>;
  /** Conflicts surfaced (info-level only). */
  readonly conflicts: ReadonlyArray<ManifestConflict>;
}

/**
 * Pure resolver. Takes manifests in any order; returns the deterministic
 * resolved state plus a conflict list.
 *
 * Note: each manifest carries an `id` (DB row id). Tests can pass a synthetic
 * id that's not a UUID — that's fine, we treat it as opaque.
 */
export function resolveManifests(
  manifests: ReadonlyArray<BuildManifest & { id: string }>,
): ResolvedManifestState {
  // Sort ascending by execution_timestamp so later wins.
  const sorted = [...manifests].sort((a, b) =>
    new Date(a.execution_timestamp).getTime() - new Date(b.execution_timestamp).getTime()
  );

  const files = new Set<string>();
  const apis = new Set<string>();
  const frontend_routes = new Set<string>();
  const ui_components = new Set<string>();
  const tests = new Set<string>();

  // Track who first declared each artifact, for conflict reporting.
  const fileOrigins = new Map<string, string>();   // path -> manifest id
  // Track files that have been deleted at least once (so re-creation is detected
  // even after fileOrigins is cleared).
  const deletedFiles = new Map<string, string>();  // path -> deleter manifest id
  const conflicts: ManifestConflict[] = [];

  for (const m of sorted) {
    // files_created: add
    for (const f of m.files_created || []) {
      if (files.has(f)) {
        // already created — silent dedupe
      } else if (deletedFiles.has(f)) {
        // re-creation after deletion: surface conflict
        const earlierLoser = deletedFiles.get(f)!;
        conflicts.push({
          project_id: m.project_id,
          bp_id: m.bp_id ?? null,
          file: f,
          description: `File ${f} re-created after earlier deletion`,
          winner_manifest_id: m.id,
          loser_manifest_ids: [earlierLoser],
        });
      }
      files.add(f);
      fileOrigins.set(f, m.id);
    }

    for (const f of m.files_modified || []) {
      // modify implies the file should exist; if it doesn't, surface conflict
      if (!files.has(f)) {
        conflicts.push({
          project_id: m.project_id,
          bp_id: m.bp_id ?? null,
          file: f,
          description: `File ${f} modified but no earlier manifest declared its creation`,
          winner_manifest_id: m.id,
          loser_manifest_ids: [],
        });
      }
      files.add(f);
      fileOrigins.set(f, m.id);
    }

    for (const f of m.files_deleted || []) {
      if (!files.has(f)) {
        conflicts.push({
          project_id: m.project_id,
          bp_id: m.bp_id ?? null,
          file: f,
          description: `File ${f} deleted but never declared as created in earlier manifests`,
          winner_manifest_id: m.id,
          loser_manifest_ids: [],
        });
      }
      files.delete(f);
      fileOrigins.delete(f);
      deletedFiles.set(f, m.id);
    }

    for (const a of m.apis_added || []) apis.add(`${a.method} ${a.path}`);
    for (const a of m.apis_modified || []) apis.add(`${a.method} ${a.path}`);
    for (const r of m.frontend_routes_added || []) frontend_routes.add(r.route);
    for (const c of m.ui_components_added || []) ui_components.add(c.name);
    for (const c of m.ui_components_modified || []) ui_components.add(c.name);
    for (const t of m.tests_added || []) tests.add(t.file);
    for (const t of m.tests_modified || []) tests.add(t.file);
  }

  return Object.freeze({
    files, apis, frontend_routes, ui_components, tests,
    conflicts: Object.freeze(conflicts),
  });
}
