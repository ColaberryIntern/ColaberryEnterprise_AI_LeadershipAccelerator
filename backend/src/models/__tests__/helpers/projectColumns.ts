import fs from 'fs';
import path from 'path';

/**
 * Enumerate every column of `projects`, for the sentinel sweeps that prove no project data
 * reaches a demo.
 *
 * ## Why this is shared rather than copied
 *
 * Two sweeps need this list: the WRITE-boundary one in `connectedDemoStore.test.ts` and the
 * RESPONSE-boundary one in `demoRoutes.test.ts`. They each had their own copy of the parse, and
 * when a verifier found the first copy was missing six real columns, the second copy kept the
 * bug. One function, so a fix lands in both.
 *
 * ## Why it reads TWO sources
 *
 * A column can reach the `projects` table by two routes, and reading only one misses the other:
 *
 *   - declared on the Sequelize model in `Project.init(...)`
 *   - added by DDL in a `db/ensure*Schema.ts` and never declared on the model
 *
 * `external_owner`, `external_url`, `evidence_provenance` and `external_verified` arrive the
 * second way, courtesy of `ensurePresentationStudioSchema.ts`. A model-only parse never seeded
 * them. That is the same shape as the defect the Connected Demo work itself hit, where three
 * columns existed in the database and were invisible to everything reading the model.
 *
 * `created_at` and `updated_at` are added by hand: Sequelize manages them without declaring them
 * as attributes, so neither source names them.
 */

/** Keys inside `Project.init(...)` that are options, not columns. Named, so the filter is visible. */
const NOT_COLUMNS = new Set(['hooks', 'indexes', 'scopes', 'defaultScope', 'validate']);

export interface ProjectColumnSources {
  fromModel: string[];
  fromDdl: string[];
  all: string[];
}

export function projectColumnSources(modelsDir: string, dbDir: string): ProjectColumnSources {
  const modelSrc = fs.readFileSync(path.join(modelsDir, 'Project.ts'), 'utf8');
  const initAt = modelSrc.indexOf('Project.init(');
  if (initAt < 0) throw new Error('projectColumnSources: Project.init( not found in Project.ts');

  const fromModel = [...modelSrc.slice(initAt).matchAll(/^ {4}([a-z_]+): \{/gm)]
    .map((m) => m[1])
    .filter((n) => !NOT_COLUMNS.has(n));

  const fromDdl = fs
    .readdirSync(dbDir)
    .filter((f) => f.startsWith('ensure') && f.endsWith('.ts'))
    .flatMap((f) =>
      [
        ...fs
          .readFileSync(path.join(dbDir, f), 'utf8')
          .matchAll(/ALTER\s+TABLE\s+projects\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+([a-z_]+)/gi),
      ].map((m) => m[1]),
    );

  const all = [...new Set([...fromModel, ...fromDdl, 'created_at', 'updated_at'])].sort();
  return { fromModel, fromDdl, all };
}

/**
 * The list, with the guards that stop a silently broken parse from seeding nothing.
 *
 * Each guard names a column that arrives by a DIFFERENT route, so a break in either source is
 * visible rather than averaged away by the other.
 */
export function projectColumns(
  modelsDir: string,
  dbDir: string,
  expect_: (actual: unknown) => { toContain(v: unknown): void; toBeGreaterThan(n: number): void },
): string[] {
  const sources = projectColumnSources(modelsDir, dbDir);
  expect_(sources.all.length).toBeGreaterThan(20);
  expect_(sources.fromModel.length).toBeGreaterThan(20);
  expect_(sources.fromDdl.length).toBeGreaterThan(0);
  expect_(sources.all).toContain('organization_name'); // model
  expect_(sources.all).toContain('demo_spec'); // model and DDL
  expect_(sources.all).toContain('external_owner'); // DDL only: the case that was being missed
  expect_(sources.all).toContain('created_at'); // neither source names it
  return sources.all;
}
