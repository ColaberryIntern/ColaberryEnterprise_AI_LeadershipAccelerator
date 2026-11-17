/**
 * PROJECT THE ARTIFACT TYPE CATALOG INTO `artifact_definitions` (phase A0).
 *
 * The catalog's source of truth is `services/artifacts/storyArtifactTypes.json`. This script
 * projects it into one row per type for the day a consumer has to resolve a type from the
 * database rather than from the file. Nothing needs those rows today, which is why this ships
 * able to show you exactly what it would write and unable to write it.
 *
 * ## IT REFUSES TO WRITE, AND THE REFUSAL IS NOT A COMMENT
 *
 * Twelve call sites read `artifact_definitions` with no `where` clause at all, and eight more
 * pass a `where` that cannot be read from the source. Every one of them treats a row there as a
 * curriculum artifact a student owes. The inventory, with line numbers, is in the header of
 * `services/artifacts/storyArtifactTypes.ts`, and is derived from the source by the test named
 * below rather than kept by hand. Inserting eleven rows today would make every active student
 * appear to be missing eleven artifacts, drop every completion percentage the platform reports,
 * and move a count on the health report with no visible cause.
 *
 * So the production path is latched shut by `CURRICULUM_READERS_SCOPED`. That constant is not a
 * flag a future session can flip to get past this: `services/artifacts/__tests__/
 * artifactDefinitionReaderScope.test.ts` re-derives the answer from the source tree on every run
 * and fails if the constant and the tree disagree in either direction. The only way to open the
 * latch is to actually scope those readers to exclude `artifact_role = 'catalog_type'`.
 *
 * ## WHAT IT WRITES WHEN IT IS EVENTUALLY ALLOWED TO
 *
 * One row per catalog type, carrying `artifact_role = 'catalog_type'` as the discriminator the
 * scoped readers exclude, with `requires_github_validation` and `requires_screenshot` taken from
 * the catalog rather than invented. Idempotent on (name, artifact_role): a second run over the
 * same catalog inserts nothing, and a changed catalog updates the row in place. It never deletes
 * a row it did not create, and it never touches a row with any other `artifact_role`, so the 146
 * curriculum definitions are out of its reach by construction.
 *
 * Usage:
 *   npx ts-node src/scripts/seedStoryArtifactTypes.ts                     dry run, prints the rows
 *   npx ts-node src/scripts/seedStoryArtifactTypes.ts --confirm-production write (latch permitting)
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import {
  CATALOG_ARTIFACT_ROLE,
  CURRICULUM_READERS_SCOPED,
  ARTIFACT_CATALOG_VERSION,
  StoryArtifactType,
  artifactTypes,
} from '../services/artifacts/storyArtifactTypes';

export type SeedOutcome = 'inserted' | 'updated' | 'unchanged' | 'refused_latched';

export interface SeedRow {
  type: string;
  name: string;
  outcome: SeedOutcome;
  id: string | null;
}

export interface SeedReport {
  dryRun: boolean;
  latched: boolean;
  catalogVersion: number;
  rows: SeedRow[];
  /** Re-counted from the table after the run, never derived from `rows`. */
  catalogRowsAfter: number | null;
}

/** The row shape this script projects. Kept narrow on purpose: it sets nothing it cannot justify. */
function projectedRow(t: StoryArtifactType) {
  return {
    name: t.name,
    description: `Artifact type "${t.type}" from the story artifact catalog. Handed over via: `
      + `${t.handed_over}.`,
    artifact_type: t.type,
    file_types: JSON.stringify(t.file_types),
    requires_github_validation: t.requires_github_validation,
    requires_screenshot: t.requires_screenshot,
    evaluation_criteria: t.evaluation_criteria,
    artifact_role: CATALOG_ARTIFACT_ROLE,
    sort_order: t.sort_order,
  };
}

async function countCatalogRows(): Promise<number> {
  const rows = await sequelize.query<{ n: string }>(
    'SELECT count(*)::text AS n FROM artifact_definitions WHERE artifact_role = :role',
    { type: QueryTypes.SELECT, replacements: { role: CATALOG_ARTIFACT_ROLE } },
  );
  return Number(rows[0]?.n ?? 0);
}

export async function seedStoryArtifactTypes(
  opts: { dryRun?: boolean } = {},
): Promise<SeedReport> {
  const dryRun = opts.dryRun !== false; // DRY RUN IS THE DEFAULT
  const types = artifactTypes();
  const rows: SeedRow[] = [];

  // The latch. Checked before anything is read, so a latched run cannot even be mistaken for a
  // partial one.
  if (!dryRun && !CURRICULUM_READERS_SCOPED) {
    return {
      dryRun: false,
      latched: true,
      catalogVersion: ARTIFACT_CATALOG_VERSION,
      rows: types.map((t) => ({ type: t.type, name: t.name, outcome: 'refused_latched' as const, id: null })),
      catalogRowsAfter: null,
    };
  }

  for (const t of types) {
    const p = projectedRow(t);
    const existing = await sequelize.query<{ id: string; evaluation_criteria: string | null; sort_order: number | null; requires_github_validation: boolean }>(
      `SELECT id, evaluation_criteria, sort_order, requires_github_validation
         FROM artifact_definitions
        WHERE artifact_type = :type AND artifact_role = :role
        LIMIT 1`,
      { type: QueryTypes.SELECT, replacements: { type: t.type, role: CATALOG_ARTIFACT_ROLE } },
    );

    if (!existing.length) {
      if (dryRun) {
        rows.push({ type: t.type, name: t.name, outcome: 'inserted', id: null });
        continue;
      }
      const inserted = await sequelize.query<{ id: string }>(
        `INSERT INTO artifact_definitions
           (name, description, artifact_type, file_types, requires_github_validation,
            requires_screenshot, evaluation_criteria, artifact_role, sort_order)
         VALUES (:name, :description, :artifact_type, CAST(:file_types AS jsonb),
                 :requires_github_validation, :requires_screenshot, :evaluation_criteria,
                 :artifact_role, :sort_order)
         RETURNING id`,
        { type: QueryTypes.SELECT, replacements: p },
      );
      rows.push({ type: t.type, name: t.name, outcome: 'inserted', id: inserted[0]?.id ?? null });
      continue;
    }

    const current = existing[0];
    const same = current.evaluation_criteria === p.evaluation_criteria
      && Number(current.sort_order) === p.sort_order
      && current.requires_github_validation === p.requires_github_validation;
    if (same) {
      rows.push({ type: t.type, name: t.name, outcome: 'unchanged', id: current.id });
      continue;
    }
    if (dryRun) {
      rows.push({ type: t.type, name: t.name, outcome: 'updated', id: current.id });
      continue;
    }
    // Scoped to this row's id AND to the catalog role: a curriculum definition is unreachable.
    await sequelize.query(
      `UPDATE artifact_definitions
          SET name = :name, description = :description,
              file_types = CAST(:file_types AS jsonb),
              requires_github_validation = :requires_github_validation,
              requires_screenshot = :requires_screenshot,
              evaluation_criteria = :evaluation_criteria,
              sort_order = :sort_order
        WHERE id = :id AND artifact_role = :artifact_role`,
      { replacements: { ...p, id: current.id } },
    );
    rows.push({ type: t.type, name: t.name, outcome: 'updated', id: current.id });
  }

  return {
    dryRun,
    latched: false,
    catalogVersion: ARTIFACT_CATALOG_VERSION,
    rows,
    // Re-counted from the table, not computed from `rows`. On a dry run this is the count
    // BEFORE any write, which is the honest answer: nothing was written.
    catalogRowsAfter: await countCatalogRows(),
  };
}

export async function main(argv: ReadonlyArray<string>): Promise<void> {
  const dryRun = !argv.includes('--confirm-production');
  const report = await seedStoryArtifactTypes({ dryRun });

  console.log(`catalog version ${report.catalogVersion}, ${report.rows.length} type(s)`);
  if (report.latched) {
    console.error('REFUSED: the artifact_definitions readers that would pick up a catalog row '
      + '(twelve with no where clause, eight opaque) have not been scoped, '
      + 'so inserting catalog rows would make every active student appear to owe eleven artifacts. '
      + 'See the header of services/artifacts/storyArtifactTypes.ts for the inventory, and '
      + 'services/artifacts/__tests__/artifactDefinitionReaderScope.test.ts for whether the work '
      + 'is done.');
    process.exitCode = 3;
    return;
  }
  for (const r of report.rows) {
    console.log(`  ${r.outcome.padEnd(9)} ${r.type}${r.id ? `  id=${r.id}` : ''}`);
  }
  console.log(`${report.dryRun ? 'DRY RUN. Nothing was written.' : 'WROTE.'} `
    + `catalog rows in artifact_definitions now: ${report.catalogRowsAfter}`);
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then(() => sequelize.close())
    .catch(async (e) => {
      console.error('FAILED:', e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
      try { await sequelize.close(); } catch { /* already closed */ }
    });
}
