/**
 * Static contract test for ensureTicketIndexesSchema — asserts the SQL statement
 * array declares the 2 new performance indexes CONCURRENTLY, WITHOUT requiring a
 * live database (mocked sequelize.query), same convention as
 * ensureCapeGovernanceSchema.test.ts.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import { ensureTicketIndexesSchema } from '../ensureTicketIndexesSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ensureTicketIndexesSchema', () => {
  it('happy path: creates idx_tickets_created_at and idx_tickets_status_created_at', async () => {
    await ensureTicketIndexesSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));

    expect(statements.some((s) => /CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_created_at ON tickets \(created_at\)/.test(s))).toBe(true);
    expect(statements.some((s) => /CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_status_created_at ON tickets \(status, created_at\)/.test(s))).toBe(true);
  });

  it('uses CONCURRENTLY on every statement (tickets is write-heavy — 16+ autonomous agents insert continuously; a plain CREATE INDEX would lock writes for the build duration)', async () => {
    await ensureTicketIndexesSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));

    expect(statements.length).toBeGreaterThan(0);
    expect(statements.every((s) => /CREATE INDEX CONCURRENTLY/.test(s))).toBe(true);
  });

  it('idempotency: every statement is guarded with IF NOT EXISTS, so a re-run (e.g. every boot) is a no-op against an already-indexed table', async () => {
    await ensureTicketIndexesSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));

    expect(statements.every((s) => /IF NOT EXISTS/.test(s))).toBe(true);
  });

  it('idempotency: a statement failure (e.g. a stale invalid index from an interrupted prior CONCURRENTLY build) does not stop the remaining statements from running', async () => {
    mockQuery.mockRejectedValueOnce(new Error('relation "idx_tickets_created_at" already exists')).mockResolvedValue([]);

    await expect(ensureTicketIndexesSchema()).resolves.toBeUndefined();
    expect(mockQuery.mock.calls.length).toBe(2);
  });

  it('never touches any existing table via ALTER/DROP/UPDATE — additive index-only, no data or column mutation', async () => {
    await ensureTicketIndexesSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    const mutatesExisting = statements.some((s) => /\b(ALTER TABLE|DROP TABLE|UPDATE tickets|DELETE FROM|INSERT INTO)\b/i.test(s));
    expect(mutatesExisting).toBe(false);
  });

  it('boundary: runs each CREATE INDEX as its own top-level statement (never batched in a single multi-statement string) — CONCURRENTLY cannot run inside a transaction block', async () => {
    await ensureTicketIndexesSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(statements.every((s) => (s.match(/CREATE INDEX/g) || []).length === 1)).toBe(true);
  });
});
