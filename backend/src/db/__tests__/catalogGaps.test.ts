/**
 * `catalogGaps` — an absent table must report itself, not N phantom missing columns.
 *
 * THE DEFECT THIS PINS. `REQUIRED_COLUMNS` names two tables that `REQUIRED_TABLES` does not:
 * `student_tasks` and `github_connections`. They belong to other schema modules, so this file
 * asserts their COLUMNS without owning their existence.
 *
 * When such a table was absent ENTIRELY, the old loop emitted one `column:` line per required
 * column and never said the table was gone — six symptoms for `student_tasks`, one for
 * `github_connections`, and no cause anywhere in the output. On a pristine database that IS the
 * whole output, and it sends the reader hunting a skipped ALTER that never had a table to run
 * against.
 *
 * Measured 2026-10-17: there is no `CREATE TABLE IF NOT EXISTS github_connections` anywhere in
 * `backend/src`, and none for `projects` either — `ensureCaseStudySchema.ts:24` already records
 * that. The `ensure*` modules EVOLVE tables; they do not bootstrap them. So the fix is not to
 * add a CREATE (its foreign keys name two parents that are equally absent) but to name the cause
 * once instead of restating its symptoms.
 *
 * The database is mocked at module load, same convention as the peer `ensure*Schema` tests: this
 * is a pure-logic test and must not need a live catalog.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import {
  catalogGaps,
  REQUIRED_TABLES,
  REQUIRED_INDEXES,
  REQUIRED_COLUMNS,
} from '../ensureSbpSchema';

/** Every table `REQUIRED_COLUMNS` mentions. */
const COLUMN_TABLES = [...new Set(REQUIRED_COLUMNS.map((c) => c.split('.')[0]))];

/** A catalog in which nothing is missing. Each test takes something away from this. */
const complete = () => ({
  tables: [...REQUIRED_TABLES] as string[],
  indexes: [...REQUIRED_INDEXES] as string[],
  columns: [...REQUIRED_COLUMNS] as string[],
  columnTables: [...COLUMN_TABLES],
});

describe('catalogGaps', () => {
  it('reports nothing when the catalog is complete', () => {
    // The negative control. Without it, a function that returned [] unconditionally would pass
    // every other test in this file.
    expect(catalogGaps(complete())).toEqual([]);
  });

  it('reports a missing required TABLE', () => {
    const found = complete();
    found.tables = found.tables.filter((t) => t !== 'build_plans');
    expect(catalogGaps(found)).toContain('table:build_plans');
  });

  it('reports a missing required INDEX', () => {
    const found = complete();
    const dropped = found.indexes[0];
    found.indexes = found.indexes.slice(1);
    expect(catalogGaps(found)).toContain(`index:${dropped}`);
  });

  it('reports a missing COLUMN when its table exists', () => {
    const found = complete();
    found.columns = found.columns.filter((c) => c !== 'build_plans.truth_revision');
    const gaps = catalogGaps(found);
    expect(gaps).toContain('column:build_plans.truth_revision');
    // And it must NOT claim the table is gone: the table is right there.
    expect(gaps).not.toContain('table:build_plans');
  });
});

describe('an ABSENT table named only by REQUIRED_COLUMNS', () => {
  /** Remove a table entirely: it exists in neither the table list nor the column readings. */
  const withoutTable = (table: string) => {
    const found = complete();
    found.columnTables = found.columnTables.filter((t) => t !== table);
    found.columns = found.columns.filter((c) => !c.startsWith(`${table}.`));
    return found;
  };

  it('github_connections: names the TABLE, and not its column', () => {
    const gaps = catalogGaps(withoutTable('github_connections'));
    expect(gaps).toContain('table:github_connections');
    expect(gaps).not.toContain('column:github_connections.webhook_secret');
  });

  it('student_tasks: collapses SIX column lines into one table line', () => {
    const required = REQUIRED_COLUMNS.filter((c) => c.startsWith('student_tasks.'));
    // Guard the premise. If the constant changes, this test should say so rather than quietly
    // asserting a collapse of nothing.
    expect(required.length).toBeGreaterThanOrEqual(5);

    const gaps = catalogGaps(withoutTable('student_tasks'));
    expect(gaps).toContain('table:student_tasks');
    expect(gaps.filter((g) => g.startsWith('column:student_tasks.'))).toEqual([]);
  });

  it('names each absent table exactly once', () => {
    const found = complete();
    found.columnTables = [];
    found.columns = [];
    const gaps = catalogGaps(found);
    for (const t of COLUMN_TABLES) {
      const line = `table:${t}`;
      // `build_intake` and `build_plans` are in REQUIRED_TABLES too; they must not be listed
      // twice just because REQUIRED_COLUMNS also mentions them.
      expect(gaps.filter((g) => g === line).length).toBeLessThanOrEqual(1);
    }
  });

  it('does not double-report a table that REQUIRED_TABLES already covers', () => {
    const found = complete();
    found.tables = found.tables.filter((t) => t !== 'build_intake');
    found.columnTables = found.columnTables.filter((t) => t !== 'build_intake');
    found.columns = found.columns.filter((c) => !c.startsWith('build_intake.'));
    const gaps = catalogGaps(found);
    expect(gaps.filter((g) => g === 'table:build_intake')).toHaveLength(1);
  });

  it('is deterministic, so a boot log diff is readable', () => {
    const a = catalogGaps(withoutTable('student_tasks'));
    const b = catalogGaps(withoutTable('student_tasks'));
    expect(a).toEqual(b);
  });
});
