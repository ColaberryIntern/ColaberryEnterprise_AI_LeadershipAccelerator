jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { SIGN_IN_LINK_STATEMENTS, ensureSignInLinkEventsSchema, __resetSignInLinkEventsSchemaForTests } from '../ensureSignInLinkEventsSchema';

describe('ensureSignInLinkEventsSchema (C106)', () => {
  beforeEach(() => __resetSignInLinkEventsSchemaForTests());

  it('every statement is IF NOT EXISTS, additive only, and no column could hold a token, IP or user agent', () => {
    for (const s of SIGN_IN_LINK_STATEMENTS) expect(s).toMatch(/IF NOT EXISTS/);
    const all = SIGN_IN_LINK_STATEMENTS.join('\n');
    expect(all).not.toMatch(/ALTER TABLE/);
    expect(all).not.toMatch(/token|ip_address|\bip\b|user_agent/i);
    expect(all).toMatch(/CREATE TABLE IF NOT EXISTS sign_in_link_uses \(\s*id BIGSERIAL PRIMARY KEY,\s*enrollment_id UUID NOT NULL,\s*used_at TIMESTAMPTZ/);
    expect(all).toMatch(/CREATE TABLE IF NOT EXISTS sign_in_link_invalid_daily \(\s*day DATE PRIMARY KEY/);
  });

  it('runs the statements once per process, even across concurrent callers', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    await Promise.all([ensureSignInLinkEventsSchema(run), ensureSignInLinkEventsSchema(run)]);
    await ensureSignInLinkEventsSchema(run);
    expect(run).toHaveBeenCalledTimes(SIGN_IN_LINK_STATEMENTS.length);
  });

  it('a failed first run is reported and retried on the next call', async () => {
    const run = jest.fn().mockRejectedValueOnce(new Error('duplicate key value violates unique constraint "pg_type_typname_nsp_index"'))
      .mockResolvedValue(undefined);
    await expect(ensureSignInLinkEventsSchema(run)).rejects.toThrow(/pg_type/);
    await expect(ensureSignInLinkEventsSchema(run)).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1 + SIGN_IN_LINK_STATEMENTS.length);
  });
});
