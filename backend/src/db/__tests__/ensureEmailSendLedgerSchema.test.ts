/**
 * Static contract test for ensureEmailSendLedgerSchema, in this repo's
 * mocked-DB convention (see ensureSbpSchema.test.ts): sequelize.query is a
 * jest.fn() so importing the module never opens a connection.
 *
 * ── WHAT THIS FILE DOES NOT PROVE ──────────────────────────────────────────
 * Nothing here proves the DDL ran, and nothing here proves a UNIQUE index
 * actually refuses a second row. sequelize.query accepts any string, including
 * one Postgres would reject. These tests prove the statements are DECLARED with
 * the right shape and that the post-condition has teeth against a fake catalog.
 *
 * The real proof lives in src/services/email/__tests__/idempotentSend.pg.test.ts,
 * which runs this DDL and the claim statement against an actual Postgres. That
 * suite is opt-in (EMAIL_DEDUP_TEST_PG_URL) because CI has no database; this
 * one is what CI sees, and it is deliberately modest about what it establishes.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from '../../config/database';
import {
  ensureEmailSendLedgerSchema,
  assertEmailSendLedgerSchema,
  REQUIRED_TABLES,
  REQUIRED_COLUMNS,
  REQUIRED_UNIQUE_INDEXES,
} from '../ensureEmailSendLedgerSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

const FULL_CATALOG = {
  tables: ['email_send_ledger'],
  indexes: [
    { indexname: 'email_send_ledger_key_unique', is_unique: true },
    { indexname: 'email_send_ledger_triple_unique', is_unique: true },
  ],
  columns: [
    'idempotency_key', 'recipient', 'subject', 'business_event_id', 'status',
    'attempts', 'provider_message_id', 'error_class', 'error_detail',
    'correlation_id', 'claimed_at', 'sent_at',
  ].map((column_name) => ({ table_name: 'email_send_ledger', column_name })),
};

/**
 * The fixture must stay a superset of what the source demands. Two branches
 * each adding a required column would merge cleanly while leaving this fixture
 * with only one side's — a conflict no marker appears for. This fails loudly on
 * the next one instead of leaving a green suite that proves nothing.
 */
describe('the fixture itself', () => {
  it('covers every table, index and column the assertion demands', () => {
    const inFixture = new Set([
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

function mockCatalog(catalog: typeof FULL_CATALOG) {
  mockQuery.mockImplementation(async (sql: string) => {
    if (/information_schema\.tables/.test(sql)) return [[{ tables: catalog.tables }]];
    if (/pg_index/.test(sql)) return [catalog.indexes];
    if (/information_schema\.columns/.test(sql)) return [catalog.columns];
    return [[]];
  });
}

const ddlIssued = () =>
  mockQuery.mock.calls
    .map((c) => String(c[0]))
    .filter((s) => !/information_schema|pg_index/.test(s));

beforeEach(() => {
  jest.clearAllMocks();
  mockCatalog(FULL_CATALOG);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('ensureEmailSendLedgerSchema — the DDL it declares', () => {
  it('declares BOTH indexes as UNIQUE — a plain index here is a silent double send', async () => {
    await ensureEmailSendLedgerSchema();
    const created = ddlIssued().filter((s) => /email_send_ledger_(key|triple)_unique/.test(s));

    expect(created).toHaveLength(2);
    for (const s of created) expect(s).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS/);
  });

  it('keys the natural-key index on lower(recipient), so one mailbox is one key', async () => {
    await ensureEmailSendLedgerSchema();

    const triple = ddlIssued().find((s) => /email_send_ledger_triple_unique/.test(s));
    expect(triple).toMatch(/\(lower\(recipient\), subject, business_event_id\)/);
  });

  it('is additive and re-runnable: every statement is IF NOT EXISTS and nothing is dropped', async () => {
    await ensureEmailSendLedgerSchema();

    for (const s of ddlIssued()) expect(s).toMatch(/IF NOT EXISTS/);
    expect(ddlIssued().some((s) => /\bDROP\b|\bALTER\b/i.test(s))).toBe(false);
  });

  it('boundary: a second full run resolves cleanly and never throws', async () => {
    await expect(ensureEmailSendLedgerSchema()).resolves.toBeUndefined();
    await expect(ensureEmailSendLedgerSchema()).resolves.toBeUndefined();
  });
});

describe('assertEmailSendLedgerSchema — the post-condition', () => {
  it('reports ok against a fully-migrated catalog', async () => {
    await expect(assertEmailSendLedgerSchema()).resolves.toEqual({ ok: true, missing: [] });
  });

  it('a right-named index that is NOT unique is reported as such, not as present', async () => {
    mockCatalog({
      ...FULL_CATALOG,
      indexes: [
        { indexname: 'email_send_ledger_key_unique', is_unique: false },
        { indexname: 'email_send_ledger_triple_unique', is_unique: true },
      ],
    });

    const result = await assertEmailSendLedgerSchema();

    expect(result).toEqual({
      ok: false,
      missing: ['index-not-unique:email_send_ledger_key_unique'],
    });
  });

  it('a missing index is reported as missing', async () => {
    mockCatalog({ ...FULL_CATALOG, indexes: [FULL_CATALOG.indexes[0]] });

    const result = await assertEmailSendLedgerSchema();

    expect(result.missing).toEqual(['index:email_send_ledger_triple_unique']);
  });

  it('THE WHOLE POINT: ensure resolves even when the CREATE fails, and only the catalog check notices', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/CREATE TABLE/.test(sql)) throw new Error('permission denied for schema public');
      if (/information_schema\.tables/.test(sql)) return [[{ tables: [] }]];
      if (/pg_index/.test(sql)) return [[]];
      if (/information_schema\.columns/.test(sql)) return [[]];
      return [[]];
    });

    await expect(ensureEmailSendLedgerSchema()).resolves.toBeUndefined();
    // Resolved, and yet:
    const result = await assertEmailSendLedgerSchema();
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('table:email_send_ledger');
  });

  it('logs a structured SchemaInvariantViolation so the miss is greppable in prod logs', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCatalog({ ...FULL_CATALOG, tables: [] });

    await assertEmailSendLedgerSchema();

    const logged = JSON.parse(String(errSpy.mock.calls[0][0]));
    expect(logged.error_class).toBe('SchemaInvariantViolation');
    expect(logged.event).toBe('email_send_ledger_schema_incomplete');
    expect(logged.context.missing).toContain('table:email_send_ledger');
  });

  it('failure path: a catalog query that cannot run reports not-ok rather than claiming success', async () => {
    mockQuery.mockRejectedValue(new Error('connection terminated'));

    await expect(assertEmailSendLedgerSchema()).resolves.toEqual({
      ok: false, missing: ['post-check-failed'],
    });
  });
});
