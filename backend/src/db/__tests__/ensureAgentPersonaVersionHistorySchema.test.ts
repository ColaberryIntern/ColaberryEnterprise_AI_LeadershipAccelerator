/**
 * Static contract test for ensureAgentPersonaVersionHistorySchema — asserts
 * the SQL statement array is additive/idempotent, WITHOUT requiring a live
 * database (mocked sequelize.query, same convention as
 * ensureAiAgentAutonomyLevelSchema.test.ts).
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import { ensureAgentPersonaVersionHistorySchema } from '../ensureAgentPersonaVersionHistorySchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ensureAgentPersonaVersionHistorySchema', () => {
  it('happy path: creates the new table with CREATE TABLE IF NOT EXISTS, never ALTER or DROP', async () => {
    await ensureAgentPersonaVersionHistorySchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));

    expect(statements.some((s) => /CREATE TABLE IF NOT EXISTS agent_persona_version_history/.test(s))).toBe(true);
    expect(statements.some((s) => /\bALTER TABLE\b/.test(s))).toBe(false);
    expect(statements.some((s) => /\bDROP\b/.test(s))).toBe(false);
  });

  it('happy path: creates the per-agent lookup index', async () => {
    await ensureAgentPersonaVersionHistorySchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));

    expect(
      statements.some((s) => /CREATE INDEX IF NOT EXISTS idx_agent_persona_version_history_agent/.test(s)),
    ).toBe(true);
  });

  it('running the ensure function twice does not error (idempotent DDL)', async () => {
    await ensureAgentPersonaVersionHistorySchema();
    await expect(ensureAgentPersonaVersionHistorySchema()).resolves.toBeUndefined();
  });

  it('a statement failure does not throw out of the ensure function (self-heals on next boot), and later statements still run', async () => {
    mockQuery.mockRejectedValueOnce(new Error('already exists'));
    await expect(ensureAgentPersonaVersionHistorySchema()).resolves.toBeUndefined();
    expect(mockQuery).toHaveBeenCalledTimes(2); // both statements attempted despite the first failing
  });
});
