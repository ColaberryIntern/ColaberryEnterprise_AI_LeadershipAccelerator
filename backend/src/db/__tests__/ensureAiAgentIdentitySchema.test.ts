/**
 * Static contract test for ensureAiAgentIdentitySchema — asserts the SQL
 * statement array is additive-only (ALTER ... ADD COLUMN IF NOT EXISTS) and
 * idempotent, WITHOUT requiring a live database (mocked sequelize.query, same
 * convention as ensureAdminUserIdentitySchema.test.ts).
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import { ensureAiAgentIdentitySchema, AI_AGENT_IDENTITY_STATEMENTS } from '../ensureAiAgentIdentitySchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ensureAiAgentIdentitySchema', () => {
  it('every statement matches the safe, additive CREATE/ALTER ... IF NOT EXISTS shape (idempotency contract)', () => {
    const shapeRe = /^(CREATE TABLE IF NOT EXISTS|CREATE INDEX IF NOT EXISTS|ALTER TABLE .+ ADD COLUMN IF NOT EXISTS)/i;
    for (const stmt of AI_AGENT_IDENTITY_STATEMENTS) {
      expect(stmt).toMatch(shapeRe);
    }
  });

  it('happy path: adds system_prompt, tools_granted, persona_version to ai_agents', async () => {
    await ensureAiAgentIdentitySchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(statements.some((s) => /ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS system_prompt/.test(s))).toBe(true);
    expect(statements.some((s) => /ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS tools_granted/.test(s))).toBe(true);
    expect(statements.some((s) => /ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS persona_version/.test(s))).toBe(true);
  });

  it('boundary: a statement failure does not stop the remaining statements from running (self-healing re-run)', async () => {
    mockQuery.mockRejectedValueOnce(new Error('column already exists')).mockResolvedValue([]);
    await expect(ensureAiAgentIdentitySchema()).resolves.toBeUndefined();
    expect(mockQuery.mock.calls.length).toBe(AI_AGENT_IDENTITY_STATEMENTS.length);
  });

  it('never touches any table other than ai_agents (additive-only, no cross-table ALTER)', async () => {
    await ensureAiAgentIdentitySchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    const touchesOtherTable = statements.some((s) => /ALTER TABLE (?!ai_agents)/i.test(s));
    expect(touchesOtherTable).toBe(false);
  });
});
