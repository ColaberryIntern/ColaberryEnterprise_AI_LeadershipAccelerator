/**
 * gitDiffTelemetryAnalyzer — turn a list of changed files (from `git diff`,
 * a validation report's parsed file list, or a manual paste) into the
 * structured fields a BuildManifest needs.
 *
 * No git invocation in V1 — caller passes the paths. Keeps this pure +
 * testable. A wrapper that calls `git diff --name-status HEAD~1` lives in
 * autoManifestGenerator.
 *
 * Phase 4 §6.
 */

export type DiffStatus = 'added' | 'modified' | 'deleted';

export interface DiffFile {
  readonly path: string;
  readonly status: DiffStatus;
}

export interface DiffAnalysis {
  readonly files_created: string[];
  readonly files_modified: string[];
  readonly files_deleted: string[];
  readonly inferred_apis_added: Array<{ method: string; path: string; handler_file: string }>;
  readonly inferred_frontend_routes_added: Array<{ route: string; component_file: string }>;
  readonly inferred_ui_components_added: Array<{ name: string; file: string; category: 'page' | 'widget' }>;
  readonly inferred_database_changes: Array<{ table: string; operation: string; details: string }>;
  readonly inferred_tests_added: Array<{ file: string; type: 'unit' | 'integration' | 'e2e' }>;
}

const ROUTE_FILE_RX = /backend\/src\/routes\/([^/]+)\.ts$/;
const FRONTEND_PAGE_RX = /frontend\/src\/pages\/(.+)\.(tsx|jsx)$/;
const FRONTEND_COMPONENT_RX = /frontend\/src\/components\/(.+)\.(tsx|jsx)$/;
const SEED_FILE_RX = /backend\/src\/seeds\/([^/]+)\.(ts|js)$/;
const MIGRATION_FILE_RX = /backend\/src\/(migrations|migrations\/[^/]+)\.(ts|js|sql)$/;
const TEST_FILE_RX = /(__tests__|\.test|\.spec)\.(ts|tsx|js|jsx)$/;
const E2E_TEST_RX = /tests\/(systemV2|e2e)\//;

/**
 * Pure: compute structured manifest fields from changed files.
 */
export function analyzeDiff(files: ReadonlyArray<DiffFile>): DiffAnalysis {
  const files_created: string[] = [];
  const files_modified: string[] = [];
  const files_deleted: string[] = [];

  const inferred_apis_added: DiffAnalysis['inferred_apis_added'] = [];
  const inferred_frontend_routes_added: DiffAnalysis['inferred_frontend_routes_added'] = [];
  const inferred_ui_components_added: DiffAnalysis['inferred_ui_components_added'] = [];
  const inferred_database_changes: DiffAnalysis['inferred_database_changes'] = [];
  const inferred_tests_added: DiffAnalysis['inferred_tests_added'] = [];

  for (const f of files) {
    if (f.status === 'added') files_created.push(f.path);
    else if (f.status === 'modified') files_modified.push(f.path);
    else files_deleted.push(f.path);

    // Inference only runs for files that exist post-build (added or modified).
    if (f.status === 'deleted') continue;

    // Backend routes file → infer APIs (we don't parse handlers, so we emit
    // a single placeholder entry tagged with the route file). Phase 5 can
    // parse the file content for actual method+path tuples.
    if (ROUTE_FILE_RX.test(f.path)) {
      // We can't know exact method/path without reading the file. Emit a
      // sentinel so the manifest has SOME api signal — caller can refine.
      inferred_apis_added.push({
        method: 'GET',
        path: '/api/' + ROUTE_FILE_RX.exec(f.path)![1].replace(/Routes?$/, '').toLowerCase(),
        handler_file: f.path,
      });
    }

    const pageM = FRONTEND_PAGE_RX.exec(f.path);
    if (pageM) {
      // Page file → frontend route (route is the page's path-hierarchical name)
      const routePart = pageM[1].replace(/Page$/i, '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
      inferred_frontend_routes_added.push({
        route: '/' + routePart.replace(/^\//, ''),
        component_file: f.path,
      });
      const componentName = pageM[1].split('/').pop() || 'Page';
      inferred_ui_components_added.push({
        name: componentName,
        file: f.path,
        category: 'page',
      });
      continue;
    }

    const compM = FRONTEND_COMPONENT_RX.exec(f.path);
    if (compM) {
      const componentName = compM[1].split('/').pop() || 'Component';
      inferred_ui_components_added.push({
        name: componentName,
        file: f.path,
        category: 'widget',
      });
    }

    const seedM = SEED_FILE_RX.exec(f.path);
    if (seedM) {
      inferred_database_changes.push({
        table: seedM[1].replace(/^seed/, '').toLowerCase(),
        operation: 'data_migration',
        details: `seeded via ${f.path}`,
      });
    }

    if (MIGRATION_FILE_RX.test(f.path)) {
      inferred_database_changes.push({
        table: 'migration',
        operation: 'data_migration',
        details: `applied via ${f.path}`,
      });
    }

    if (TEST_FILE_RX.test(f.path)) {
      const testType = E2E_TEST_RX.test(f.path)
        ? 'e2e'
        : f.path.includes('integration')
          ? 'integration'
          : 'unit';
      inferred_tests_added.push({ file: f.path, type: testType });
    }
  }

  return {
    files_created,
    files_modified,
    files_deleted,
    inferred_apis_added,
    inferred_frontend_routes_added,
    inferred_ui_components_added,
    inferred_database_changes,
    inferred_tests_added,
  };
}

/**
 * Helper: parse `git diff --name-status` output into DiffFile[].
 *
 * Format per line: `STATUS\tPATH` where STATUS is one of A, M, D (or others
 * like R for rename — V1 ignores those).
 */
export function parseGitDiffNameStatus(stdout: string): DiffFile[] {
  const out: DiffFile[] = [];
  const lines = stdout.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const code = parts[0].toUpperCase();
    const path = parts.slice(1).join(' ');
    if (code === 'A') out.push({ path, status: 'added' });
    else if (code === 'M') out.push({ path, status: 'modified' });
    else if (code === 'D') out.push({ path, status: 'deleted' });
    // R (rename), C (copy) ignored — they imply both added + deleted, but the
    // payoff for handling them isn't worth the schema complexity in V1.
  }
  return out;
}
