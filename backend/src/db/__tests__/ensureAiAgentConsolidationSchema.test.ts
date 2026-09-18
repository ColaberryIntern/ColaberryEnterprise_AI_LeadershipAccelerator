/**
 * Static contract test for ensureAiAgentConsolidationSchema, in this repo's
 * mocked-DB convention (see ensureEmailSendLedgerSchema.test.ts — the closest
 * real precedent for this module's shape: an ALTER TABLE on an EXISTING
 * table, not a CREATE TABLE case, so there is no "table missing" branch here,
 * only "column missing" and "index missing").
 *
 * ── WHAT THIS FILE DOES NOT PROVE ──────────────────────────────────────────
 * Nothing here proves the DDL ran against a real Postgres. sequelize.query is
 * fully mocked, so these tests prove (a) the statements are declared with the
 * right, additive shape, and (b) assertAiAgentConsolidationSchema() actually
 * has teeth against a fake catalog — it fires false when the catalog doesn't
 * match, not just when the DDL loop throws (which it never does; every
 * statement is individually try/caught).
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from '../../config/database';
import {
  ensureAiAgentConsolidationSchema,
  assertAiAgentConsolidationSchema,
  AI_AGENT_CONSOLIDATION_STATEMENTS,
  REQUIRED_COLUMNS,
  REQUIRED_INDEXES,
} from '../ensureAiAgentConsolidationSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

const FULL_CATALOG = {
  indexes: ['idx_ai_agents_parent_agent_id'],
  columns: ['record_kind', 'parent_agent_id', 'migration_status'].map((column_name) => ({
    table_name: 'ai_agents',
    column_name,
  })),
};

/** The fixture must stay a superset of what the assertion demands — see
 * ensureEmailSendLedgerSchema.test.ts's identical reasoning: two branches
 * each adding a required field would merge cleanly while leaving this
 * fixture out of sync, and that must fail loudly here, not pass silently. */
describe('the fixture itself', () => {
  it('covers every column and index the assertion demands', () => {
    const inFixture = new Set([
      ...FULL_CATALOG.indexes.map((i) => `index:${i}`),
      ...FULL_CATALOG.columns.map((c) => `column:${c.table_name}.${c.column_name}`),
    ]);
    const required = [
      ...REQUIRED_INDEXES.map((i) => `index:${i}`),
      ...REQUIRED_COLUMNS.map((c) => `column:${c}`),
    ];

    expect(required.filter((r) => !inFixture.has(r))).toEqual([]);
  });
});

function mockCatalog(catalog: typeof FULL_CATALOG) {
  mockQuery.mockImplementation(async (sql: string) => {
    if (/pg_indexes/.test(sql)) return [catalog.indexes.map((indexname) => ({ indexname }))];
    if (/information_schema\.columns/.test(sql)) return [catalog.columns];
    return [[]];
  });
}

const ddlIssued = () =>
  mockQuery.mock.calls.map((c) => String(c[0])).filter((s) => !/pg_indexes|information_schema/.test(s));

beforeEach(() => {
  jest.clearAllMocks();
  mockCatalog(FULL_CATALOG);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('ensureAiAgentConsolidationSchema — the DDL it declares', () => {
  it('happy path: adds all 3 columns (nullable, no default) plus the parent_agent_id index, each with IF NOT EXISTS', async () => {
    await ensureAiAgentConsolidationSchema();
    const statements = ddlIssued();

    expect(statements.some((s) => /ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS record_kind VARCHAR\(20\)/.test(s))).toBe(true);
    expect(statements.some((s) => /ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS parent_agent_id UUID/.test(s))).toBe(true);
    expect(statements.some((s) => /ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS migration_status VARCHAR\(20\)/.test(s))).toBe(true);
    expect(statements.some((s) => /CREATE INDEX IF NOT EXISTS idx_ai_agents_parent_agent_id ON ai_agents \(parent_agent_id\)/.test(s))).toBe(true);
  });

  it('is additive and re-runnable: every statement is IF NOT EXISTS, nothing is dropped, no DEFAULT is set', async () => {
    await ensureAiAgentConsolidationSchema();
    const statements = ddlIssued();

    for (const s of statements) expect(s).toMatch(/IF NOT EXISTS/);
    expect(statements.some((s) => /\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i.test(s))).toBe(false);
    expect(statements.filter((s) => s.includes('ADD COLUMN')).some((s) => /DEFAULT/i.test(s))).toBe(false);
  });

  it('declares no FK/REFERENCES — mirrors reports_to_id\'s own unconstrained precedent on this table', async () => {
    await ensureAiAgentConsolidationSchema();
    expect(ddlIssued().some((s) => /REFERENCES/i.test(s))).toBe(false);
  });

  it('idempotency: a second full run issues byte-identical SQL and never throws', async () => {
    await ensureAiAgentConsolidationSchema();
    const first = ddlIssued();
    jest.clearAllMocks();
    mockCatalog(FULL_CATALOG);

    await expect(ensureAiAgentConsolidationSchema()).resolves.toBeUndefined();
    expect(ddlIssued()).toEqual(first);
  });

  it('failure path: one failing statement does not stop the rest (partial DB self-heals)', async () => {
    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('already exists'))
      .mockResolvedValue([]);

    await expect(ensureAiAgentConsolidationSchema()).resolves.toBeUndefined();
    expect(mockQuery).toHaveBeenCalledTimes(AI_AGENT_CONSOLIDATION_STATEMENTS.length);
  });
});

describe('assertAiAgentConsolidationSchema — the post-check that actually proves migration', () => {
  it('reports ok when the catalog contains every column and index', async () => {
    await expect(assertAiAgentConsolidationSchema()).resolves.toEqual({ ok: true, missing: [] });
  });

  it('THE WHOLE POINT: ensure resolves even when every ALTER fails, and only the catalog check notices', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/ALTER TABLE|CREATE INDEX/.test(sql)) throw new Error('permission denied for schema public');
      if (/pg_indexes/.test(sql)) return [[]];
      if (/information_schema\.columns/.test(sql)) return [[]];
      return [[]];
    });

    await expect(ensureAiAgentConsolidationSchema()).resolves.toBeUndefined();
    // Resolved, and yet:
    const result = await assertAiAgentConsolidationSchema();
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining(['column:ai_agents.record_kind', 'index:idx_ai_agents_parent_agent_id']));
  });

  it('boundary: detects a table that has 2 of 3 required columns but is missing the third (the realistic partial-migration shape — ADD COLUMN IF NOT EXISTS is a no-op once a column already exists)', async () => {
    mockCatalog({
      ...FULL_CATALOG,
      columns: FULL_CATALOG.columns.filter((c) => c.column_name !== 'parent_agent_id'),
    });

    const result = await assertAiAgentConsolidationSchema();

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['column:ai_agents.parent_agent_id']);
  });

  it('a missing index is reported as missing', async () => {
    mockCatalog({ ...FULL_CATALOG, indexes: [] });

    const result = await assertAiAgentConsolidationSchema();

    expect(result.missing).toContain('index:idx_ai_agents_parent_agent_id');
  });

  it('logs a structured SchemaInvariantViolation so the miss is greppable in prod logs', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCatalog({ ...FULL_CATALOG, columns: [] });

    await assertAiAgentConsolidationSchema();

    const logged = JSON.parse(String(errSpy.mock.calls[0][0]));
    expect(logged.error_class).toBe('SchemaInvariantViolation');
    expect(logged.event).toBe('ai_agent_consolidation_schema_incomplete');
    expect(logged.context.missing).toEqual(expect.arrayContaining(['column:ai_agents.record_kind']));
  });

  it('failure path: an unreachable catalog reports not-ok rather than throwing or claiming success', async () => {
    mockQuery.mockRejectedValue(new Error('connection terminated'));

    await expect(assertAiAgentConsolidationSchema()).resolves.toEqual({ ok: false, missing: ['post-check-failed'] });
  });
});
