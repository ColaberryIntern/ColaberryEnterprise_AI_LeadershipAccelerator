/**
 * Static contract test for ensurePresentationStudioSchema — asserts properties of the
 * SQL statement array itself, WITHOUT requiring a live database (same convention as
 * ensureCaseStudySchema.test.ts / ensureCapeSchema.test.ts). sequelize.query is mocked
 * so importing the module never opens a connection, which is what keeps this suite
 * inside CI's set: jest.ci.config.ts is an ignore-list for suites needing real
 * Postgres, and CI provisions none.
 *
 * WHAT THIS SUITE CANNOT PROVE, stated so a green run is not mistaken for a migrated
 * database: every statement is swallowed into a console.warn, so these tests show the
 * right SQL is ISSUED, never that it APPLIED. Proving the tables exist is
 * assertPresentationStudioSchema()'s job, run against a real database.
 *
 * THE LOAD-BEARING TEST IN THIS FILE is "every CREATE column has a matching ALTER".
 * It is not ceremony. `CREATE TABLE IF NOT EXISTS` is a no-op against an existing
 * table, so a column added only to the CREATE body is never applied to a database
 * that already ran this module, and Sequelize then silently drops every write to it
 * forever. That failure is invisible — no error, no warning, just missing data. The
 * test derives the column list from the CREATE bodies by parsing rather than from a
 * hand-written list, so forgetting the ALTER fails the build instead of shipping.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import {
  ensurePresentationStudioSchema,
  assertPresentationStudioSchema,
  PRESENTATION_STUDIO_STATEMENTS,
  PRESENTATION_STUDIO_TABLES,
  PRESENTATION_STUDIO_REQUIRED_COLUMNS,
  PRESENTATION_STUDIO_REQUIRED_INDEXES,
  PRESENTATION_STUDIO_FOREIGN_TABLE_COLUMNS,
  PRESENTATION_ATTEMPT_STATES,
  PRESENTATION_RECORDING_STATES,
} from '../ensurePresentationStudioSchema';
import { parseCreatedTables, parseAddedColumns } from './schemaParityHelpers';

const mockQuery = sequelize.query as unknown as jest.Mock;

/** Collapse whitespace before matching: DDL wraps across lines and `.` does not cross a newline. */
const flat = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

/**
 * Column lists are DERIVED from the statements, never hand-listed. A hand-written
 * expectation would have to be updated by the same person who forgot the ALTER, so it
 * could never catch them.
 *
 * The parsers themselves are the shared ones in `schemaParityHelpers`, reused rather
 * than re-implemented here — that module was extracted at the third use under
 * CLAUDE.md's "three is the threshold" rule, and a fourth private copy is exactly what
 * it exists to prevent.
 */
const createdColumns = (): Map<string, string[]> =>
  new Map(parseCreatedTables(PRESENTATION_STUDIO_STATEMENTS).map((t) => [t.table, t.columns]));

const alterAddedColumns = (): Set<string> =>
  new Set(parseAddedColumns(PRESENTATION_STUDIO_STATEMENTS).map((a) => `${a.table}.${a.column}`));

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([]);
});

describe('ensurePresentationStudioSchema — statement contract', () => {
  it('happy path: issues a CREATE TABLE IF NOT EXISTS for all 5 Studio tables', async () => {
    await ensurePresentationStudioSchema();
    const issued = mockQuery.mock.calls.map((c) => flat(String(c[0])));
    for (const table of PRESENTATION_STUDIO_TABLES) {
      expect(
        issued.some((s) => s.includes(`CREATE TABLE IF NOT EXISTS ${table} (`)),
      ).toBe(true);
    }
    expect(PRESENTATION_STUDIO_TABLES).toHaveLength(5);
  });

  it('issues every statement in the array, in order', async () => {
    await ensurePresentationStudioSchema();
    expect(mockQuery).toHaveBeenCalledTimes(PRESENTATION_STUDIO_STATEMENTS.length);
  });

  // ---------------------------------------------------------------------------
  // The one that matters.
  // ---------------------------------------------------------------------------
  it('every column in a CREATE body also has an explicit ALTER ... ADD COLUMN IF NOT EXISTS', () => {
    const created = createdColumns();
    const altered = alterAddedColumns();

    // Positive control: the parser must actually have found something. A regex that
    // silently stopped matching would make this whole test vacuously green — which is
    // exactly the failure mode it exists to prevent.
    expect(created.size).toBe(5);
    const totalCreated = [...created.values()].reduce((n, c) => n + c.length, 0);
    expect(totalCreated).toBeGreaterThan(50);
    expect(altered.size).toBeGreaterThan(50);

    const gaps: string[] = [];
    for (const [table, cols] of created) {
      for (const col of cols) {
        // `id` is the PRIMARY KEY established by CREATE and is never added later.
        if (col === 'id') continue;
        if (!altered.has(`${table}.${col}`)) gaps.push(`${table}.${col}`);
      }
    }
    expect(gaps).toEqual([]);
  });

  it('declares the additive columns on the pre-existing projects table', () => {
    const altered = alterAddedColumns();
    for (const col of PRESENTATION_STUDIO_FOREIGN_TABLE_COLUMNS) {
      expect(altered.has(col)).toBe(true);
    }
    // It must EXTEND projects, never recreate it — recreating would be a no-op that
    // masks the extension, and dropping it would destroy every student project.
    const issued = PRESENTATION_STUDIO_STATEMENTS.map(flat);
    expect(issued.some((s) => /CREATE TABLE IF NOT EXISTS projects\b/i.test(s))).toBe(false);
    expect(issued.some((s) => /DROP TABLE/i.test(s))).toBe(false);
    expect(issued.some((s) => /DROP COLUMN/i.test(s))).toBe(false);
  });

  it('every statement is idempotent — no bare CREATE/ALTER that fails on a second run', () => {
    for (const stmt of PRESENTATION_STUDIO_STATEMENTS) {
      const s = flat(stmt);
      if (/^CREATE TABLE/i.test(s)) expect(s).toMatch(/^CREATE TABLE IF NOT EXISTS/i);
      if (/^CREATE (UNIQUE )?INDEX/i.test(s)) expect(s).toMatch(/^CREATE (UNIQUE )?INDEX IF NOT EXISTS/i);
      // Two idempotent forms of ALTER TABLE are allowed, and only two.
      //
      // `ADD COLUMN IF NOT EXISTS` is the common one. `ALTER COLUMN ... TYPE` is the
      // other, and it exists because the first is a NO-OP against a column that is
      // already there - so widening one cannot be done by editing its ADD COLUMN line.
      // Re-running a widen to the same type succeeds, which is what makes it safe here.
      //
      // Deliberately NOT relaxed to "any ALTER TABLE": a bare ADD CONSTRAINT or a
      // SET NOT NULL throws on the second boot, and this test is the only thing that
      // notices.
      if (/^ALTER TABLE/i.test(s)) {
        expect(s).toMatch(/ADD COLUMN IF NOT EXISTS|ALTER COLUMN\s+\w+\s+TYPE\s/i);
      }
    }
  });

  it('creates the six uniqueness guarantees the Studio depends on', () => {
    const issued = PRESENTATION_STUDIO_STATEMENTS.map(flat);
    for (const index of PRESENTATION_STUDIO_REQUIRED_INDEXES) {
      expect(issued.some((s) => s.includes(index))).toBe(true);
    }
    expect(PRESENTATION_STUDIO_REQUIRED_INDEXES).toHaveLength(6);
  });

  it('the recording dedupe key is a real UNIQUE index on (occurrence_uuid, provider_file_id)', () => {
    // The existing pipeline dedupes by read-then-write on metadata @> {zoom_uuid}, so a
    // webhook and the cron sweep both see "absent" and both ingest. A constraint cannot race.
    const stmt = PRESENTATION_STUDIO_STATEMENTS.map(flat)
      .find((s) => s.includes('presentation_recordings_unique_part'));
    expect(stmt).toBeDefined();
    expect(stmt).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS/i);
    expect(stmt).toMatch(/presentation_recordings \(occurrence_uuid, provider_file_id\)/i);
  });

  it('at most one live showcase per attempt, and one final take per assignment', () => {
    const issued = PRESENTATION_STUDIO_STATEMENTS.map(flat);
    const showcase = issued.find((s) => s.includes('presentation_showcases_one_live'));
    expect(showcase).toMatch(/WHERE withdrawn_at IS NULL/i);
    const finalTake = issued.find((s) => s.includes('presentation_attempts_one_final_take'));
    expect(finalTake).toMatch(/WHERE is_final_take/i);
  });

  it('write-facing flags default to the closed state', () => {
    const issued = PRESENTATION_STUDIO_STATEMENTS.map(flat).join(' | ');
    // Nothing is required, public, verified or approved by omission.
    expect(issued).toMatch(/required BOOLEAN NOT NULL DEFAULT FALSE/i);
    expect(issued).toMatch(/is_final_take BOOLEAN NOT NULL DEFAULT FALSE/i);
    expect(issued).toMatch(/audience VARCHAR\(30\) NOT NULL DEFAULT 'private'/i);
    expect(issued).toMatch(/visibility VARCHAR\(20\) NOT NULL DEFAULT 'private'/i);
    expect(issued).toMatch(/external_verified BOOLEAN DEFAULT FALSE/i);
    // Approval timestamps are nullable with no default — they must be set by an actor.
    expect(issued).not.toMatch(/author_approved_at TIMESTAMPTZ NOT NULL/i);
    expect(issued).not.toMatch(/staff_approved_at TIMESTAMPTZ NOT NULL/i);
  });

  it('recording state starts at expected, and processing is not a success state', () => {
    expect(PRESENTATION_RECORDING_STATES).toContain('expected');
    expect(PRESENTATION_RECORDING_STATES).toContain('processing');
    expect(PRESENTATION_RECORDING_STATES).toContain('ready');
    expect(PRESENTATION_RECORDING_STATES).toContain('missing');
    expect(PRESENTATION_RECORDING_STATES).toContain('failed');
    // Attempt state and recording state are independent vocabularies — a shared member
    // would invite collapsing them back into one "complete" badge.
    const overlap = PRESENTATION_ATTEMPT_STATES
      .filter((s) => (PRESENTATION_RECORDING_STATES as readonly string[]).includes(s));
    expect(overlap).toEqual([]);
  });

  it('does not mint task completion — no write to student_tasks or points anywhere', () => {
    // markTaskVerifiedComplete stays the only writer that may set a task complete.
    const issued = PRESENTATION_STUDIO_STATEMENTS.map(flat).join(' | ');
    expect(issued).not.toMatch(/student_tasks/i);
    expect(issued).not.toMatch(/student_points_events/i);
  });
});

describe('ensurePresentationStudioSchema — failure and boundary behaviour', () => {
  it('failure path: one failing statement does not stop the rest', async () => {
    mockQuery
      .mockRejectedValueOnce(new Error('permission denied for table projects'))
      .mockResolvedValue([]);

    await expect(ensurePresentationStudioSchema()).resolves.toBeUndefined();
    // Every remaining statement still issued, so the next boot self-heals.
    expect(mockQuery).toHaveBeenCalledTimes(PRESENTATION_STUDIO_STATEMENTS.length);
  });

  it('failure path: assert reports missing objects rather than throwing', async () => {
    mockQuery
      .mockResolvedValueOnce([[{ table_name: 'presentation_assignments' }], {}])
      .mockResolvedValueOnce([[], {}])
      .mockResolvedValueOnce([[], {}]);

    const res = await assertPresentationStudioSchema();
    expect(res.ok).toBe(false);
    expect(res.missing).toContain('table presentation_attempts');
    expect(res.missing).toContain('index presentation_recordings_unique_part');
  });

  it('boundary: assert returns ok only when every table, column and index is present', async () => {
    mockQuery
      .mockResolvedValueOnce([PRESENTATION_STUDIO_TABLES.map((t) => ({ table_name: t })), {}])
      .mockResolvedValueOnce([
        PRESENTATION_STUDIO_REQUIRED_COLUMNS.map((c) => {
          const [table_name, column_name] = c.split('.');
          return { table_name, column_name };
        }),
        {},
      ])
      .mockResolvedValueOnce([PRESENTATION_STUDIO_REQUIRED_INDEXES.map((i) => ({ indexname: i })), {}]);

    const res = await assertPresentationStudioSchema();
    expect(res).toEqual({ ok: true, missing: [] });
  });

  it('failure path: a query error degrades to ok:false, never an unhandled rejection', async () => {
    mockQuery.mockRejectedValue(new Error('connection terminated'));
    const res = await assertPresentationStudioSchema();
    expect(res.ok).toBe(false);
    expect(res.missing).toEqual(['assert query failed']);
  });
});
