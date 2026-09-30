/**
 * Static contract test for ensureTicketCreatorIndexSchema — asserts the SQL
 * statement array is additive-only (CREATE INDEX IF NOT EXISTS) and idempotent,
 * WITHOUT requiring a live database (mocked sequelize.query, same convention as
 * ensureAiAgentIdentitySchema.test.ts).
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import { ensureTicketCreatorIndexSchema, TICKET_CREATOR_INDEX_STATEMENTS } from '../ensureTicketCreatorIndexSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ensureTicketCreatorIndexSchema', () => {
  it('every statement matches the safe, additive CREATE/ALTER ... IF NOT EXISTS shape (idempotency contract)', () => {
    const shapeRe = /^(CREATE TABLE IF NOT EXISTS|CREATE INDEX IF NOT EXISTS|ALTER TABLE .+ ADD COLUMN IF NOT EXISTS)/i;
    for (const stmt of TICKET_CREATOR_INDEX_STATEMENTS) {
      expect(stmt).toMatch(shapeRe);
    }
  });

  it('happy path: creates an index on tickets.created_by_id', async () => {
    await ensureTicketCreatorIndexSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(statements.some((s) => /CREATE INDEX IF NOT EXISTS tickets_created_by_id ON tickets \(created_by_id\)/.test(s))).toBe(true);
  });

  it('boundary: a statement failure does not throw (self-healing re-run)', async () => {
    mockQuery.mockRejectedValueOnce(new Error('index already exists'));
    await expect(ensureTicketCreatorIndexSchema()).resolves.toBeUndefined();
    expect(mockQuery.mock.calls.length).toBe(TICKET_CREATOR_INDEX_STATEMENTS.length);
  });

  it('idempotency: running twice issues the identical statement both times, safe to re-run every boot', async () => {
    await ensureTicketCreatorIndexSchema();
    await ensureTicketCreatorIndexSchema();
    expect(mockQuery).toHaveBeenCalledTimes(TICKET_CREATOR_INDEX_STATEMENTS.length * 2);
    const allSame = mockQuery.mock.calls.every((c) => String(c[0]) === TICKET_CREATOR_INDEX_STATEMENTS[0]);
    expect(allSame).toBe(true);
  });

  it('never touches any table other than tickets (scoped index only)', async () => {
    await ensureTicketCreatorIndexSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    const touchesOtherTable = statements.some((s) => /ON (?!tickets)/i.test(s));
    expect(touchesOtherTable).toBe(false);
  });
});
