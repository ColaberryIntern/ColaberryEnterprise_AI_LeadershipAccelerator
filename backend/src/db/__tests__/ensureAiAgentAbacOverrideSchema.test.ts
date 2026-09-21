/**
 * Static contract test for ensureAiAgentAbacOverrideSchema — asserts the SQL
 * statement array is additive/idempotent, WITHOUT requiring a live database
 * (mocked sequelize.query, same convention as ensureAiAgentAutonomyLevelSchema.test.ts).
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import { ensureAiAgentAbacOverrideSchema } from '../ensureAiAgentAbacOverrideSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ensureAiAgentAbacOverrideSchema', () => {
  it('happy path: adds abac_mode_override with IF NOT EXISTS and NO default (null means "follow the global setting")', async () => {
    await ensureAiAgentAbacOverrideSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(
      statements.some((s) => /ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS abac_mode_override VARCHAR\(10\)$/.test(s.trim())),
    ).toBe(true);
  });

  it('happy path: adds abac_mode_override_set_at as a plain nullable TIMESTAMP', async () => {
    await ensureAiAgentAbacOverrideSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(
      statements.some((s) => /ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS abac_mode_override_set_at TIMESTAMP/.test(s)),
    ).toBe(true);
  });

  it('happy path: adds abac_mode_override_set_by as a plain nullable VARCHAR(255) — the real audit-trail field', async () => {
    await ensureAiAgentAbacOverrideSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(
      statements.some((s) => /ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS abac_mode_override_set_by VARCHAR\(255\)/.test(s)),
    ).toBe(true);
  });

  it('running the ensure function twice does not error (idempotent DDL)', async () => {
    await ensureAiAgentAbacOverrideSchema();
    await expect(ensureAiAgentAbacOverrideSchema()).resolves.toBeUndefined();
  });

  it('a statement failure does not throw out of the ensure function (self-heals on next boot), and later statements still run', async () => {
    mockQuery.mockRejectedValueOnce(new Error('already exists'));
    await expect(ensureAiAgentAbacOverrideSchema()).resolves.toBeUndefined();
    expect(mockQuery).toHaveBeenCalledTimes(3); // all 3 statements attempted despite the first failing
  });
});
