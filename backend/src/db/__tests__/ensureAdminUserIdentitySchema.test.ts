/**
 * Static contract test for ensureAdminUserIdentitySchema — asserts the SQL
 * statement array is additive-only (ALTER ... ADD COLUMN IF NOT EXISTS) and
 * idempotent, WITHOUT requiring a live database (mocked sequelize.query, same
 * convention as ensureCapeGovernanceSchema.test.ts).
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import { ensureAdminUserIdentitySchema, ADMIN_USER_IDENTITY_STATEMENTS } from '../ensureAdminUserIdentitySchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ensureAdminUserIdentitySchema', () => {
  it('every statement matches the safe, additive CREATE/ALTER ... IF NOT EXISTS shape (idempotency contract)', () => {
    const shapeRe = /^(CREATE TABLE IF NOT EXISTS|CREATE INDEX IF NOT EXISTS|ALTER TABLE .+ ADD COLUMN IF NOT EXISTS)/i;
    for (const stmt of ADMIN_USER_IDENTITY_STATEMENTS) {
      expect(stmt).toMatch(shapeRe);
    }
  });

  it('happy path: adds display_name, is_ai_operated, agent_id to admin_users', async () => {
    await ensureAdminUserIdentitySchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(statements.some((s) => /ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS display_name/.test(s))).toBe(true);
    expect(statements.some((s) => /ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS is_ai_operated/.test(s))).toBe(true);
    expect(statements.some((s) => /ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS agent_id/.test(s))).toBe(true);
  });

  it('boundary: a statement failure does not stop the remaining statements from running (self-healing re-run)', async () => {
    mockQuery.mockRejectedValueOnce(new Error('column already exists')).mockResolvedValue([]);
    await expect(ensureAdminUserIdentitySchema()).resolves.toBeUndefined();
    expect(mockQuery.mock.calls.length).toBe(ADMIN_USER_IDENTITY_STATEMENTS.length);
  });

  it('never touches any table other than admin_users (additive-only, no cross-table ALTER)', async () => {
    await ensureAdminUserIdentitySchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    const touchesOtherTable = statements.some((s) => /ALTER TABLE (?!admin_users)/i.test(s));
    expect(touchesOtherTable).toBe(false);
  });
});
