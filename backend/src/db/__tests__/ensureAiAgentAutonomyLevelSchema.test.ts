/**
 * Static contract test for ensureAiAgentAutonomyLevelSchema — asserts the SQL
 * statement array is additive/idempotent, WITHOUT requiring a live database
 * (mocked sequelize.query, same convention as ensureAiAgentReportsToSchema.test.ts).
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import { ensureAiAgentAutonomyLevelSchema } from '../ensureAiAgentAutonomyLevelSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ensureAiAgentAutonomyLevelSchema', () => {
  it("happy path: adds autonomy_level with IF NOT EXISTS, defaulting to 'observe' (fail-closed, per abac-design.md)", async () => {
    await ensureAiAgentAutonomyLevelSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(
      statements.some((s) =>
        /ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS autonomy_level VARCHAR\(20\) DEFAULT 'observe'/.test(s),
      ),
    ).toBe(true);
  });

  it("happy path: adds autonomy_level_set_at as a plain nullable TIMESTAMP (2026-08-25) — the marker distinguishing a deliberate reactivation choice from the untouched default", async () => {
    await ensureAiAgentAutonomyLevelSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(
      statements.some((s) => /ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS autonomy_level_set_at TIMESTAMP/.test(s)),
    ).toBe(true);
  });

  it('running the ensure function twice does not error (idempotent DDL)', async () => {
    await ensureAiAgentAutonomyLevelSchema();
    await expect(ensureAiAgentAutonomyLevelSchema()).resolves.toBeUndefined();
  });

  it('a statement failure does not throw out of the ensure function (self-heals on next boot), and later statements still run', async () => {
    mockQuery.mockRejectedValueOnce(new Error('already exists'));
    await expect(ensureAiAgentAutonomyLevelSchema()).resolves.toBeUndefined();
    expect(mockQuery).toHaveBeenCalledTimes(2); // both statements attempted despite the first failing
  });
});
