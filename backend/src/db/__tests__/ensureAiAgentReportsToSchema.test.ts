/**
 * Static contract test for ensureAiAgentReportsToSchema — asserts the SQL
 * statement array is additive/idempotent, WITHOUT requiring a live database
 * (mocked sequelize.query, same convention as ensureCapeTodayPlanSchema.test.ts).
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import { ensureAiAgentReportsToSchema } from '../ensureAiAgentReportsToSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ensureAiAgentReportsToSchema', () => {
  it('happy path: adds reports_to_org_member_id with IF NOT EXISTS', async () => {
    await ensureAiAgentReportsToSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(
      statements.some((s) =>
        /ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS reports_to_org_member_id UUID/.test(s),
      ),
    ).toBe(true);
  });

  it('declares the supporting index with IF NOT EXISTS', async () => {
    await ensureAiAgentReportsToSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(
      statements.some((s) =>
        /CREATE INDEX IF NOT EXISTS idx_ai_agents_reports_to_org_member_id ON ai_agents \(reports_to_org_member_id\)/.test(s),
      ),
    ).toBe(true);
  });

  it('running the ensure function twice does not error (idempotent DDL)', async () => {
    await ensureAiAgentReportsToSchema();
    await expect(ensureAiAgentReportsToSchema()).resolves.toBeUndefined();
  });

  it('a statement failure does not stop the remaining statements from running', async () => {
    mockQuery.mockRejectedValueOnce(new Error('already exists')).mockResolvedValue([]);
    await expect(ensureAiAgentReportsToSchema()).resolves.toBeUndefined();
    expect(mockQuery.mock.calls.length).toBe(2);
  });
});
