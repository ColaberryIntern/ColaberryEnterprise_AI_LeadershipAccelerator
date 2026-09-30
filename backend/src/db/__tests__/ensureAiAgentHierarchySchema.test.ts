/**
 * Static contract test for ensureAiAgentHierarchySchema — asserts the SQL
 * statement array is additive/idempotent, WITHOUT requiring a live database
 * (mocked sequelize.query, same convention as ensureAiAgentReportsToSchema.test.ts,
 * which this schema supersedes as the resolver's source of truth).
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import { ensureAiAgentHierarchySchema } from '../ensureAiAgentHierarchySchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ensureAiAgentHierarchySchema', () => {
  it('happy path: adds reports_to_type with IF NOT EXISTS', async () => {
    await ensureAiAgentHierarchySchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(
      statements.some((s) => /ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS reports_to_type VARCHAR\(10\)/.test(s)),
    ).toBe(true);
  });

  it('happy path: adds reports_to_id with IF NOT EXISTS', async () => {
    await ensureAiAgentHierarchySchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(
      statements.some((s) => /ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS reports_to_id UUID/.test(s)),
    ).toBe(true);
  });

  it('declares the supporting index with IF NOT EXISTS', async () => {
    await ensureAiAgentHierarchySchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(
      statements.some((s) => /CREATE INDEX IF NOT EXISTS idx_ai_agents_reports_to_id ON ai_agents \(reports_to_id\)/.test(s)),
    ).toBe(true);
  });

  it('running the ensure function twice does not error (idempotent DDL)', async () => {
    await ensureAiAgentHierarchySchema();
    await expect(ensureAiAgentHierarchySchema()).resolves.toBeUndefined();
  });

  it('a statement failure does not stop the remaining statements from running', async () => {
    mockQuery.mockRejectedValueOnce(new Error('already exists')).mockResolvedValue([]);
    await expect(ensureAiAgentHierarchySchema()).resolves.toBeUndefined();
    expect(mockQuery.mock.calls.length).toBe(3);
  });
});
