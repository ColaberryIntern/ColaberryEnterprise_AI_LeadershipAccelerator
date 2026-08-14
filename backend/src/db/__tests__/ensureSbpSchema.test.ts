/**
 * Static contract test for ensureSbpSchema — asserts the SQL statement array
 * declares the `verified_at` / `verified_by` columns and that the post-condition
 * check refuses to pass without them. Follows this repo's mocked-DB convention
 * (see ensureOutcomeMeasurementsSchema.test.ts / ensureCapeSchema.test.ts):
 * sequelize.query is mocked so importing the module never opens a connection.
 *
 * ── WHAT THIS FILE DOES NOT PROVE ──────────────────────────────────────────
 * Nothing here proves the DDL RAN. sequelize.query is a jest.fn(); it accepts
 * any string, including one Postgres would reject. These tests prove the
 * statements are DECLARED and correctly shaped — not that a single column
 * exists in any database.
 *
 * That gap is exactly why assertSbpSchema() queries information_schema at boot.
 * ensureSbpSchema swallows every statement failure into a console.warn, so on a
 * real database "nothing threw" is not evidence of anything; a previous fix in
 * this workstream shipped green having silently done nothing. The runtime
 * catalog check is the only thing that can tell the truth about production, and
 * the tests below verify that check has teeth — they do not replace it.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from '../../config/database';
import { ensureSbpSchema, assertSbpSchema } from '../ensureSbpSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

/** Every table/index/column assertSbpSchema demands, as a fully-migrated DB. */
const FULL_CATALOG = {
  tables: ['build_intake', 'build_plans'],
  indexes: ['build_intake_unique_project', 'build_plans_unique_project_version'],
  columns: [
    { table_name: 'build_intake', column_name: 'answers' },
    { table_name: 'student_tasks', column_name: 'due_on' },
    { table_name: 'student_tasks', column_name: 'due_baseline_on' },
    { table_name: 'student_tasks', column_name: 'verified_at' },
    { table_name: 'student_tasks', column_name: 'verified_by' },
    // The evidence sha frozen at award time. Without it the XP lookup has
    // nothing durable to key on and falls back to matching the live repo.
    { table_name: 'student_tasks', column_name: 'verified_ref' },
    { table_name: 'student_tasks', column_name: 'verification_json' },
  ],
};

/**
 * Answer the two catalog queries from a fake catalog; everything else (the DDL)
 * resolves empty, the way a successful CREATE/ALTER does.
 */
function mockCatalog(catalog: typeof FULL_CATALOG) {
  mockQuery.mockImplementation(async (sql: string) => {
    if (/information_schema\.tables/.test(sql)) {
      return [[{ tables: catalog.tables, indexes: catalog.indexes }]];
    }
    if (/information_schema\.columns/.test(sql)) return [catalog.columns];
    return [[]];
  });
}

const ddlIssued = () =>
  mockQuery.mock.calls.map((c) => String(c[0])).filter((s) => !/information_schema/.test(s));

beforeEach(() => {
  jest.clearAllMocks();
  mockCatalog(FULL_CATALOG);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('ensureSbpSchema — verified_at / verified_by', () => {
  it('happy path: declares both columns on student_tasks', async () => {
    await ensureSbpSchema();
    const statements = ddlIssued();

    expect(
      statements.some((s) =>
        /ALTER TABLE student_tasks ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ/.test(s)),
    ).toBe(true);
    expect(
      statements.some((s) =>
        /ALTER TABLE student_tasks ADD COLUMN IF NOT EXISTS verified_by TEXT/.test(s)),
    ).toBe(true);
  });

  it('idempotency: the new ALTERs are re-runnable on every boot — IF NOT EXISTS, no DEFAULT, no NOT NULL', async () => {
    await ensureSbpSchema();
    const verifyAlters = ddlIssued().filter((s) => /verified_(at|by)/.test(s));

    expect(verifyAlters).toHaveLength(2);
    for (const s of verifyAlters) {
      // Without IF NOT EXISTS the second boot errors (and gets swallowed).
      expect(s).toMatch(/ADD COLUMN IF NOT EXISTS/);
      // A DEFAULT would backdate every already-complete task into "verified",
      // and NOT NULL cannot be satisfied by the rows a live cohort already has.
      expect(s).not.toMatch(/DEFAULT/i);
      expect(s).not.toMatch(/NOT NULL/i);
    }
  });

  it('boundary: a second full run is a clean no-op and never throws', async () => {
    await expect(ensureSbpSchema()).resolves.toBeUndefined();
    await expect(ensureSbpSchema()).resolves.toBeUndefined();
  });

  it('touches student_tasks by ALTER ... ADD COLUMN only — never CREATE TABLE, never DROP', async () => {
    await ensureSbpSchema();
    for (const s of ddlIssued().filter((x) => /student_tasks/.test(x) && !/^CREATE INDEX/.test(x))) {
      expect(s).toMatch(/^ALTER TABLE student_tasks ADD COLUMN IF NOT EXISTS/);
    }
    expect(ddlIssued().some((s) => /\bDROP\b/i.test(s))).toBe(false);
  });
});

describe('assertSbpSchema — the post-condition, because a swallowed ALTER is silent', () => {
  it('reports ok when the catalog actually has both columns', async () => {
    const result = await assertSbpSchema();

    expect(result).toEqual({ ok: true, missing: [] });
  });

  it('failure path: names each missing column instead of passing quietly', async () => {
    mockCatalog({
      ...FULL_CATALOG,
      columns: FULL_CATALOG.columns.filter((c) => !/^verified_/.test(c.column_name)),
    });

    const result = await assertSbpSchema();

    expect(result.ok).toBe(false);
    expect(result.missing).toContain('column:student_tasks.verified_at');
    expect(result.missing).toContain('column:student_tasks.verified_by');
  });

  it('logs a structured SchemaInvariantViolation so the miss is greppable in prod logs', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCatalog({
      ...FULL_CATALOG,
      columns: FULL_CATALOG.columns.filter((c) => c.column_name !== 'verified_at'),
    });

    await assertSbpSchema();

    const logged = JSON.parse(String(errSpy.mock.calls[0][0]));
    expect(logged.error_class).toBe('SchemaInvariantViolation');
    expect(logged.event).toBe('sbp_schema_incomplete');
    expect(logged.context.missing).toContain('column:student_tasks.verified_at');
  });

  it('THE WHOLE POINT: ensureSbpSchema still resolves when the ALTER fails, and only the catalog check notices', async () => {
    // Reproduces the failure mode this assertion exists for. The ALTER rejects,
    // the loop swallows it into a console.warn, ensureSbpSchema resolves exactly
    // as it does on success — so a green run is not evidence the column landed.
    mockQuery.mockImplementation(async (sql: string) => {
      if (/verified_at/.test(sql)) throw new Error('permission denied for table student_tasks');
      if (/information_schema\.tables/.test(sql)) {
        return [[{ tables: FULL_CATALOG.tables, indexes: FULL_CATALOG.indexes }]];
      }
      if (/information_schema\.columns/.test(sql)) {
        return [FULL_CATALOG.columns.filter((c) => c.column_name !== 'verified_at')];
      }
      return [[]];
    });

    await expect(ensureSbpSchema()).resolves.toBeUndefined();
    // Resolved, and yet:
    const result = await assertSbpSchema();
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('column:student_tasks.verified_at');
  });

  it('failure path: a catalog query that cannot run reports not-ok rather than claiming success', async () => {
    mockQuery.mockRejectedValue(new Error('connection terminated'));

    await expect(assertSbpSchema()).resolves.toEqual({ ok: false, missing: ['post-check-failed'] });
  });
});
