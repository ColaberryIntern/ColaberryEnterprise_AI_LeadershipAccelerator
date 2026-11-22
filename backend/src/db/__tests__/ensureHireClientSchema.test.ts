const mockQuery = jest.fn();
jest.mock('../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));

import { ensureHireClientSchema, HIRE_CLIENT_SCHEMA_ROLLBACK, HIRE_CLIENT_STATEMENTS } from '../ensureHireClientSchema';

/** CP10.2: the employer accounts. Additive, scoped by client, sign-in links stored hashed and unique. */
const find = (name: string) => HIRE_CLIENT_STATEMENTS.find((s) => s.includes(`CREATE TABLE IF NOT EXISTS ${name} (`)) as string;

describe('ensureHireClientSchema (statements)', () => {
  it('is additive and re-runnable: every statement is IF NOT EXISTS, none ALTERs or DROPs', () => {
    for (const s of HIRE_CLIENT_STATEMENTS) {
      expect(s).toMatch(/IF NOT EXISTS/);
      expect(s).not.toMatch(/\bALTER\b|\bDROP\b/i);
    }
  });
  it('members: lower-case email, UNIQUE per client; candidates: UNIQUE per client and learner', () => {
    expect(find('hire_client_members')).toMatch(/client_id UUID NOT NULL REFERENCES hire_clients\(id\) ON DELETE CASCADE/);
    expect(find('hire_client_members')).toMatch(/CHECK \(email = lower\(btrim\(email\)\)/);
    expect(find('hire_client_members')).toMatch(/CONSTRAINT uq_hire_client_members_email UNIQUE \(client_id, email\)/);
    expect(find('hire_client_candidates')).toMatch(/CONSTRAINT uq_hire_client_candidates UNIQUE \(client_id, enrollment_id\)/);
    expect(find('hire_client_candidates')).toMatch(/enrollment_id UUID NOT NULL REFERENCES enrollments\(id\) ON DELETE CASCADE/);
  });
  it('sign-in tokens: only the sha256 hash is stored, UNIQUE, with expiry and single use', () => {
    const t = find('hire_client_signin_tokens');
    expect(t).toMatch(/token_hash CHAR\(64\) NOT NULL UNIQUE/);
    expect(t).toMatch(/expires_at TIMESTAMPTZ NOT NULL/);
    expect(t).toMatch(/consumed_at TIMESTAMPTZ,/);
    expect(t).not.toMatch(/\btoken VARCHAR|\btoken TEXT/);
  });
  it('has a rollback that drops every table it creates, dependents first', () => {
    const made = HIRE_CLIENT_STATEMENTS.map((s) => /CREATE TABLE IF NOT EXISTS (\w+)/.exec(s)?.[1]).filter(Boolean);
    const dropped = HIRE_CLIENT_SCHEMA_ROLLBACK.map((s) => /DROP TABLE IF EXISTS (\w+)/.exec(s)?.[1]);
    expect([...dropped].sort()).toEqual([...made].sort());
    expect(dropped.indexOf('hire_client_members')).toBeLessThan(dropped.indexOf('hire_clients'));
    expect(dropped.indexOf('hire_client_candidates')).toBeLessThan(dropped.indexOf('hire_clients'));
  });
  it('keeps booting when one statement fails, and says so', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    mockQuery.mockReset().mockResolvedValue([[], 0]).mockRejectedValueOnce(Object.assign(new Error('nope'), { name: 'SequelizeDatabaseError' }));
    await ensureHireClientSchema();
    expect(mockQuery).toHaveBeenCalledTimes(HIRE_CLIENT_STATEMENTS.length);
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({ event: 'hire_client_schema_stmt_skipped', error_class: 'SequelizeDatabaseError' });
    jest.restoreAllMocks();
  });
});
