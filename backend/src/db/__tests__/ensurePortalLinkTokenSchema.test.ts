/**
 * Static contract test for ensurePortalLinkTokenSchema, in this repo's mocked-DB
 * convention (see ensureEmailSendLedgerSchema.test.ts): sequelize.query is a
 * jest.fn() so importing the module never opens a connection.
 *
 * ── WHAT THIS FILE DOES NOT PROVE ──────────────────────────────────────────
 * Nothing here proves the DDL ran, and nothing here proves the UNIQUE index
 * actually refuses a second row — sequelize.query accepts any string, including
 * one Postgres would reject. These tests prove the statements are DECLARED with
 * the right shape and that the post-condition has teeth against a fake catalog.
 *
 * The uniqueness of `portal_link_tokens_hash_unique` is the property that stops
 * two rows sharing a hash, which would make "which token did I just consume"
 * depend on scan order. It is asserted here only as a declaration.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from '../../config/database';
import {
  ensurePortalLinkTokenSchema,
  assertPortalLinkTokenSchema,
  REQUIRED_TABLES,
  REQUIRED_COLUMNS,
  REQUIRED_UNIQUE_INDEXES,
  REPLAY_GRACE_SECONDS,
} from '../ensurePortalLinkTokenSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

interface Catalog {
  tables: string[];
  indexes: { indexname: string; is_unique: boolean }[];
  columns: { table_name: string; column_name: string }[];
}

const FULL_CATALOG: Catalog = {
  tables: ['portal_link_tokens'],
  indexes: [{ indexname: 'portal_link_tokens_hash_unique', is_unique: true }],
  columns: [
    'token_hash', 'enrollment_id', 'purpose', 'next_path',
    'expires_at', 'used_at', 'created_at',
  ].map((column_name) => ({ table_name: 'portal_link_tokens', column_name })),
};

/**
 * The fixture must stay a superset of what the source demands. Two branches each
 * adding a required column would merge cleanly while leaving this fixture with
 * only one side's — a conflict no marker appears for. This fails loudly on the
 * next one instead of leaving a green suite that proves nothing.
 */
describe('the fixture itself', () => {
  it('covers every table, index and column the assertion demands', () => {
    const inFixture = new Set<string>([
      ...FULL_CATALOG.tables.map((t) => `table:${t}`),
      ...FULL_CATALOG.indexes.map((i) => `index:${i.indexname}`),
      ...FULL_CATALOG.columns.map((c) => `column:${c.table_name}.${c.column_name}`),
    ]);
    const required = [
      ...REQUIRED_TABLES.map((t) => `table:${t}`),
      ...REQUIRED_UNIQUE_INDEXES.map((i) => `index:${i}`),
      ...REQUIRED_COLUMNS.map((c) => `column:${c}`),
    ];

    expect(required.filter((r) => !inFixture.has(r))).toEqual([]);
  });
});

function mockCatalog(catalog: Catalog): void {
  mockQuery.mockImplementation(async (sql: string) => {
    if (/information_schema\.tables/.test(sql)) return [[{ tables: catalog.tables }]];
    if (/pg_index/.test(sql)) return [catalog.indexes];
    if (/information_schema\.columns/.test(sql)) return [catalog.columns];
    return [[]];
  });
}

const ddlIssued = (): string[] =>
  mockQuery.mock.calls
    .map((c: unknown[]) => String(c[0]))
    .filter((s: string) => !/information_schema|pg_index/.test(s));

beforeEach(() => {
  jest.clearAllMocks();
  mockCatalog(FULL_CATALOG);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('ensurePortalLinkTokenSchema — the DDL it declares', () => {
  it('declares the hash index as UNIQUE — a plain index lets two rows share a hash', async () => {
    await ensurePortalLinkTokenSchema();
    const created = ddlIssued().filter((s) => /portal_link_tokens_hash_unique/.test(s));

    expect(created).toHaveLength(1);
    expect(created[0]).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS/);
  });

  it('stores a hash column, and never a token column — a dump must not yield a sign-in', async () => {
    await ensurePortalLinkTokenSchema();
    const create = ddlIssued().find((s) => /CREATE TABLE IF NOT EXISTS portal_link_tokens/.test(s));

    expect(create).toMatch(/token_hash\s+CHAR\(64\)\s+NOT NULL/);
    // The column the table must NOT have. Written as an explicit negative because
    // "we only ever store the hash" is the security claim this table rests on, and
    // a future hand adding a convenience `token` column would otherwise pass.
    expect(create).not.toMatch(/\btoken\s+(VARCHAR|TEXT|CHAR)/i);
  });

  it('carries used_at, which is what makes a token single use', async () => {
    await ensurePortalLinkTokenSchema();
    const create = ddlIssued().find((s) => /CREATE TABLE IF NOT EXISTS portal_link_tokens/.test(s));

    expect(create).toMatch(/used_at\s+TIMESTAMPTZ/);
    expect(create).toMatch(/expires_at\s+TIMESTAMPTZ\s+NOT NULL/);
  });

  it('is additive and re-runnable: every statement is IF NOT EXISTS and nothing is dropped', async () => {
    await ensurePortalLinkTokenSchema();

    for (const s of ddlIssued()) expect(s).toMatch(/IF NOT EXISTS/);
    expect(ddlIssued().some((s) => /\bDROP\b|\bALTER\b/i.test(s))).toBe(false);
  });

  it('boundary: a second full run resolves cleanly and never throws', async () => {
    await expect(ensurePortalLinkTokenSchema()).resolves.toBeUndefined();
    await expect(ensurePortalLinkTokenSchema()).resolves.toBeUndefined();
  });

  it('the grace window is a small number of seconds, not a second lifetime', () => {
    // A grace window exists to survive a StrictMode double-invoke and a refresh.
    // If it ever grew to hours it would quietly undo single use, which is the
    // property the whole table exists for.
    expect(REPLAY_GRACE_SECONDS).toBeGreaterThan(0);
    expect(REPLAY_GRACE_SECONDS).toBeLessThanOrEqual(600);
  });
});

describe('assertPortalLinkTokenSchema — the post-condition', () => {
  it('reports ok against a fully-migrated catalog', async () => {
    await expect(assertPortalLinkTokenSchema()).resolves.toEqual({ ok: true, missing: [] });
  });

  it('a right-named index that is NOT unique is reported as such, not as present', async () => {
    mockCatalog({ ...FULL_CATALOG, indexes: [{ indexname: 'portal_link_tokens_hash_unique', is_unique: false }] });

    const result = await assertPortalLinkTokenSchema();
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('index-not-unique:portal_link_tokens_hash_unique');
  });

  it('a missing table is reported', async () => {
    mockCatalog({ tables: [], indexes: [], columns: [] });

    const result = await assertPortalLinkTokenSchema();
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('table:portal_link_tokens');
  });

  it('a missing column is reported', async () => {
    mockCatalog({
      ...FULL_CATALOG,
      columns: FULL_CATALOG.columns.filter((c) => c.column_name !== 'used_at'),
    });

    const result = await assertPortalLinkTokenSchema();
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('column:portal_link_tokens.used_at');
  });

  it('a catalog read that throws is reported rather than passing as clean', async () => {
    mockQuery.mockRejectedValue(new Error('connection refused'));

    const result = await assertPortalLinkTokenSchema();
    expect(result.ok).toBe(false);
    expect(result.missing.some((m) => m.startsWith('check-failed:'))).toBe(true);
  });
});
