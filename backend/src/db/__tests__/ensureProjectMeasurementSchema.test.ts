/**
 * Static contract test for ensureProjectMeasurementSchema, in this repo's mocked-DB
 * convention (see ensureEmailSendLedgerSchema.test.ts): sequelize.query is a
 * jest.fn() so importing never opens a connection.
 *
 * ── WHAT THIS FILE DOES NOT PROVE ──────────────────────────────────────────
 * Nothing here proves the DDL ran, and nothing here proves Postgres enforces a
 * CHECK - a mock accepts any string, including one the server would reject. These
 * tests prove the statements are DECLARED with the right shape, and that the
 * post-condition has teeth against a fake catalog.
 *
 * The constraints are asserted as text because they carry the rule the whole
 * design rests on: nobody approves their own measurement, and nobody confirms
 * their own reading. A table created without them would satisfy every
 * table-and-column check while permitting exactly that.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from '../../config/database';
import {
  ensureProjectMeasurementSchema,
  assertProjectMeasurementSchema,
  REQUIRED_TABLES,
  REQUIRED_COLUMNS,
  REQUIRED_UNIQUE_INDEXES,
  REQUIRED_CONSTRAINTS,
} from '../ensureProjectMeasurementSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

interface Catalog {
  tables: string[];
  indexes: { indexname: string; is_unique: boolean }[];
  constraints: string[];
  columns: { table_name: string; column_name: string }[];
}

const FULL_CATALOG: Catalog = {
  tables: ['project_measurement_definitions', 'project_measurement_outcomes'],
  indexes: [{ indexname: 'project_measurement_definitions_key_unique', is_unique: true }],
  constraints: [...REQUIRED_CONSTRAINTS],
  columns: REQUIRED_COLUMNS.map((c) => {
    const [table_name, column_name] = c.split('.');
    return { table_name, column_name };
  }),
};

/**
 * The fixture must stay a superset of what the source demands. Two branches each
 * adding a required column would merge cleanly while leaving this fixture with only
 * one side's — a conflict no marker appears for.
 */
describe('the fixture itself', () => {
  it('covers every table, index, constraint and column the assertion demands', () => {
    const inFixture = new Set<string>([
      ...FULL_CATALOG.tables.map((t) => `table:${t}`),
      ...FULL_CATALOG.indexes.map((i) => `index:${i.indexname}`),
      ...FULL_CATALOG.constraints.map((c) => `constraint:${c}`),
      ...FULL_CATALOG.columns.map((c) => `column:${c.table_name}.${c.column_name}`),
    ]);
    const required = [
      ...REQUIRED_TABLES.map((t) => `table:${t}`),
      ...REQUIRED_UNIQUE_INDEXES.map((i) => `index:${i}`),
      ...REQUIRED_CONSTRAINTS.map((c) => `constraint:${c}`),
      ...REQUIRED_COLUMNS.map((c) => `column:${c}`),
    ];

    expect(required.filter((r) => !inFixture.has(r))).toEqual([]);
  });
});

function mockCatalog(catalog: Catalog): void {
  mockQuery.mockImplementation(async (sql: string) => {
    if (/information_schema\.tables/.test(sql)) return [[{ tables: catalog.tables }]];
    if (/pg_index/.test(sql)) return [catalog.indexes];
    if (/pg_constraint/.test(sql)) return [catalog.constraints.map((conname) => ({ conname }))];
    if (/information_schema\.columns/.test(sql)) return [catalog.columns];
    return [[]];
  });
}

const ddlIssued = (): string[] =>
  mockQuery.mock.calls
    .map((c: unknown[]) => String(c[0]))
    .filter((s: string) => !/information_schema|pg_index|pg_constraint/.test(s));

beforeEach(() => {
  jest.clearAllMocks();
  mockCatalog(FULL_CATALOG);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('ensureProjectMeasurementSchema — the DDL it declares', () => {
  it('declares a CHECK that refuses a self-approved definition', async () => {
    // The rule the whole design rests on. Stated in SQL rather than only in a
    // service, because a rule in one caller is a rule until somebody writes a second.
    await ensureProjectMeasurementSchema();
    const create = ddlIssued().find((s) => /CREATE TABLE IF NOT EXISTS project_measurement_definitions/.test(s));
    expect(create).toBeDefined();
    expect(create).toMatch(/project_measurement_definitions_approval_ck/);
    expect(create).toMatch(/LOWER\(approved_by\)\s*<>\s*LOWER\(created_by\)/);
  });

  it('declares a CHECK that refuses a self-confirmed reading', async () => {
    await ensureProjectMeasurementSchema();
    const create = ddlIssued().find((s) => /CREATE TABLE IF NOT EXISTS project_measurement_outcomes/.test(s));
    expect(create).toBeDefined();
    expect(create).toMatch(/project_measurement_outcomes_confirmation_ck/);
    expect(create).toMatch(/LOWER\(confirmed_by\)\s*<>\s*LOWER\(recorded_by\)/);
  });

  it('requires an approver AND a timestamp before a definition may be approved', async () => {
    await ensureProjectMeasurementSchema();
    const create = ddlIssued().find((s) => /CREATE TABLE IF NOT EXISTS project_measurement_definitions/.test(s));
    expect(create).toMatch(/approved_by IS NOT NULL AND approved_at IS NOT NULL/);
  });

  it('ties a reading to its definition and removes it with the definition', async () => {
    await ensureProjectMeasurementSchema();
    const create = ddlIssued().find((s) => /CREATE TABLE IF NOT EXISTS project_measurement_outcomes/.test(s));
    expect(create).toMatch(/REFERENCES project_measurement_definitions\(id\) ON DELETE CASCADE/);
  });

  it('declares the key index as UNIQUE, per project', async () => {
    await ensureProjectMeasurementSchema();
    const idx = ddlIssued().find((s) => /project_measurement_definitions_key_unique/.test(s));
    expect(idx).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS/);
    expect(idx).toMatch(/\(project_id, LOWER\(measurement_key\)\)/);
  });

  it('is additive and re-runnable: every statement is IF NOT EXISTS and nothing is dropped', async () => {
    await ensureProjectMeasurementSchema();

    for (const s of ddlIssued()) expect(s).toMatch(/IF NOT EXISTS/);
    expect(ddlIssued().some((s) => /\bDROP\b/i.test(s))).toBe(false);
  });

  it('boundary: a second full run resolves cleanly and never throws', async () => {
    await expect(ensureProjectMeasurementSchema()).resolves.toBeUndefined();
    await expect(ensureProjectMeasurementSchema()).resolves.toBeUndefined();
  });
});

describe('assertProjectMeasurementSchema — the post-condition', () => {
  it('reports ok against a fully-migrated catalog', async () => {
    await expect(assertProjectMeasurementSchema()).resolves.toEqual({ ok: true, missing: [] });
  });

  it('reports a MISSING CONSTRAINT rather than passing the table as present', async () => {
    // The failure that matters: the tables and columns exist, so every name-based
    // check passes, and self-approval is silently permitted.
    mockCatalog({ ...FULL_CATALOG, constraints: ['project_measurement_outcomes_confirmation_ck'] });

    const result = await assertProjectMeasurementSchema();
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('constraint:project_measurement_definitions_approval_ck');
  });

  it('a right-named index that is NOT unique is reported as such', async () => {
    mockCatalog({
      ...FULL_CATALOG,
      indexes: [{ indexname: 'project_measurement_definitions_key_unique', is_unique: false }],
    });

    const result = await assertProjectMeasurementSchema();
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('index-not-unique:project_measurement_definitions_key_unique');
  });

  it('a missing table is reported', async () => {
    mockCatalog({ tables: [], indexes: [], constraints: [], columns: [] });

    const result = await assertProjectMeasurementSchema();
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('table:project_measurement_definitions');
    expect(result.missing).toContain('table:project_measurement_outcomes');
  });

  it('a missing column is reported', async () => {
    mockCatalog({
      ...FULL_CATALOG,
      columns: FULL_CATALOG.columns.filter((c) => c.column_name !== 'confirmed_by'),
    });

    const result = await assertProjectMeasurementSchema();
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('column:project_measurement_outcomes.confirmed_by');
  });

  it('a catalog read that throws is reported rather than passing as clean', async () => {
    mockQuery.mockRejectedValue(new Error('connection refused'));

    const result = await assertProjectMeasurementSchema();
    expect(result.ok).toBe(false);
    expect(result.missing.some((m) => m.startsWith('check-failed:'))).toBe(true);
  });
});
