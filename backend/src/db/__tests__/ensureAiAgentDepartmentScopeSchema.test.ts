/**
 * Static contract test for ensureAiAgentDepartmentScopeSchema — asserts the
 * SQL statement array is additive/idempotent, WITHOUT requiring a live
 * database (same mocked-sequelize convention as
 * ensureAiAgentAutonomyLevelSchema.test.ts).
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import { ensureAiAgentDepartmentScopeSchema } from '../ensureAiAgentDepartmentScopeSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ensureAiAgentDepartmentScopeSchema', () => {
  it('happy path: adds department (nullable VARCHAR) with IF NOT EXISTS', async () => {
    await ensureAiAgentDepartmentScopeSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(statements.some((s) => /ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS department VARCHAR\(50\)/.test(s))).toBe(true);
  });

  it("happy path: adds scope (JSONB) defaulting to an empty object, with IF NOT EXISTS", async () => {
    await ensureAiAgentDepartmentScopeSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(
      statements.some((s) => /ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS scope JSONB DEFAULT '\{\}'::jsonb/.test(s)),
    ).toBe(true);
  });

  it('running the ensure function twice does not error (idempotent DDL)', async () => {
    await ensureAiAgentDepartmentScopeSchema();
    await expect(ensureAiAgentDepartmentScopeSchema()).resolves.toBeUndefined();
  });

  it('a statement failure does not throw out of the ensure function (self-heals on next boot), and later statements still run', async () => {
    mockQuery.mockRejectedValueOnce(new Error('already exists'));
    await expect(ensureAiAgentDepartmentScopeSchema()).resolves.toBeUndefined();
    expect(mockQuery).toHaveBeenCalledTimes(2); // both statements attempted despite the first failing
  });
});
