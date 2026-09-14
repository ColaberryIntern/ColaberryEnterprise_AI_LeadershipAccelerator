/**
 * Static contract test for ensureAiAgentAutonomySourceSchema — asserts the
 * SQL statement array is additive/idempotent, WITHOUT requiring a live
 * database (same mocked-sequelize convention as
 * ensureAiAgentAutonomyLevelSchema.test.ts).
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import { ensureAiAgentAutonomySourceSchema } from '../ensureAiAgentAutonomySourceSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ensureAiAgentAutonomySourceSchema', () => {
  it('happy path: adds autonomy_level_source (nullable VARCHAR, no default) with IF NOT EXISTS', async () => {
    await ensureAiAgentAutonomySourceSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(
      statements.some((s) => /ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS autonomy_level_source VARCHAR\(10\)/.test(s)),
    ).toBe(true);
  });

  it('the statement never sets a DEFAULT — existing rows must read NULL, never a guessed value', async () => {
    await ensureAiAgentAutonomySourceSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(statements.some((s) => /DEFAULT/i.test(s))).toBe(false);
  });

  it('running the ensure function twice does not error (idempotent DDL)', async () => {
    await ensureAiAgentAutonomySourceSchema();
    await expect(ensureAiAgentAutonomySourceSchema()).resolves.toBeUndefined();
  });

  it('a statement failure does not throw out of the ensure function (self-heals on next boot)', async () => {
    mockQuery.mockRejectedValueOnce(new Error('already exists'));
    await expect(ensureAiAgentAutonomySourceSchema()).resolves.toBeUndefined();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
