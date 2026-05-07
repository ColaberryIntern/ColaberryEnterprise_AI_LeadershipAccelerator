/**
 * BuildManifest — TypeScript types + Zod runtime schema.
 *
 * Mirrors /system/intelligence/manifests/build_manifest.schema.json.
 * Imported by:
 *   - backend/src/intelligence/systemStateEngine/telemetry/manifestValidator.ts (validates POST /telemetry payloads)
 *   - any tool emitting a manifest (Claude Code, CI, manual)
 */
import { z } from 'zod';

// Repo-relative POSIX path. No leading slash, no `..`.
const RepoPath = z.string().min(1).regex(/^(?!\/)(?!.*\.\.\/)[A-Za-z0-9._\-/]+$/, {
  message: 'must be a repo-relative POSIX path (no leading /, no ..)',
});

const DatabaseChange = z.object({
  table: z.string().min(1),
  schema: z.string().optional(),
  operation: z.enum([
    'create_table', 'drop_table', 'add_column', 'drop_column', 'alter_column',
    'add_index', 'drop_index', 'add_fk', 'drop_fk', 'data_migration',
  ]),
  details: z.string().optional(),
}).strict();

const ApiEntry = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  path: z.string().min(1),
  handler_file: RepoPath.optional(),
  auth: z.enum(['public', 'session', 'admin', 'participant', 'machine']).optional(),
}).strict();

const FrontendRouteEntry = z.object({
  route: z.string().min(1),
  component_file: RepoPath.optional(),
  is_public: z.boolean().optional(),
}).strict();

const UIComponentEntry = z.object({
  name: z.string().min(1),
  file: RepoPath,
  category: z.enum(['page', 'widget', 'form', 'modal', 'layout']).optional(),
}).strict();

const TestEntry = z.object({
  file: RepoPath,
  type: z.enum(['unit', 'integration', 'e2e', 'smoke']),
  coverage_target: z.string().optional(),
}).strict();

const ValidationResultEntry = z.object({
  check: z.enum(['tsc', 'jest', 'playwright', 'build', 'lint', 'manual']),
  status: z.enum(['pass', 'fail', 'skipped']),
  details: z.string().optional(),
  evidence_file: z.string().nullable().optional(),
}).strict();

const DependencyEntry = z.object({
  name: z.string().min(1),
  version: z.string(),
  scope: z.enum(['runtime', 'dev', 'peer']).optional(),
}).strict();

const SystemImpact = z.object({
  kind: z.enum([
    'increases_readiness', 'increases_coverage', 'increases_maturity',
    'blocks_dependency', 'resolves_contradiction', 'introduces_contradiction',
  ]),
  target_id: z.string().optional(),
  delta: z.number().optional(),
}).strict();

export const BuildManifestSchema = z.object({
  manifest_version: z.literal('1.0'),
  telemetry_version: z.literal('1.0'),

  task_id: z.string().uuid(),
  bp_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid(),

  execution_timestamp: z.string().datetime(),

  files_created: z.array(RepoPath).default([]),
  files_modified: z.array(RepoPath).default([]),
  files_deleted: z.array(RepoPath).default([]),

  database_changes: z.array(DatabaseChange).default([]),
  apis_added: z.array(ApiEntry).default([]),
  apis_modified: z.array(ApiEntry).default([]),
  frontend_routes_added: z.array(FrontendRouteEntry).default([]),

  ui_components_added: z.array(UIComponentEntry).default([]),
  ui_components_modified: z.array(UIComponentEntry).default([]),

  tests_added: z.array(TestEntry).default([]),
  tests_modified: z.array(TestEntry).default([]),

  validation_results: z.array(ValidationResultEntry).default([]),

  dependencies_added: z.array(DependencyEntry).default([]),
  packages_added: z.array(DependencyEntry).default([]),

  system_impacts: z.array(SystemImpact).default([]),

  decision_trace: z.record(z.string(), z.unknown()).optional(),
}).strict();

export type BuildManifest = z.infer<typeof BuildManifestSchema>;

// Common pattern detectors used by manifestValidator to reject obvious secrets
// (we never want secrets in manifests — see BUILD_MANIFEST_CONTRACT.md §9).
export const SECRET_PATTERNS: ReadonlyArray<{ name: string; rx: RegExp }> = [
  { name: 'aws_access_key', rx: /AKIA[0-9A-Z]{16}/ },
  { name: 'github_pat', rx: /ghp_[A-Za-z0-9]{30,}/ },
  { name: 'github_oauth', rx: /gho_[A-Za-z0-9]{30,}/ },
  { name: 'openai_key', rx: /sk-[A-Za-z0-9]{20,}/ },
  { name: 'jwt', rx: /eyJ[A-Za-z0-9_=-]+\.eyJ[A-Za-z0-9_=-]+\.[A-Za-z0-9._=-]+/ },
  { name: 'private_key_block', rx: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];
