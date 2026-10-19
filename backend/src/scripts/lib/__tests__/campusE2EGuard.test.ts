import { checkCampusE2EDatabase } from '../campusE2EGuard';

const OK = 'postgres://campus:campus@127.0.0.1:55452/campus_e2e';

describe('checkCampusE2EDatabase', () => {
  it('accepts the throwaway database on each local host', () => {
    for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
      const r = checkCampusE2EDatabase({ DATABASE_URL: `postgres://campus:campus@${host}:55452/campus_e2e`, NODE_ENV: 'development' });
      expect(r).toEqual({ ok: true, host, database: 'campus_e2e' });
    }
  });

  it('refuses an unset DATABASE_URL, so the env.ts default can never be seeded', () => {
    expect(checkCampusE2EDatabase({}).ok).toBe(false);
    expect(checkCampusE2EDatabase({ DATABASE_URL: '  ' }).ok).toBe(false);
  });

  it('refuses NODE_ENV=production even with a perfect URL', () => {
    expect(checkCampusE2EDatabase({ DATABASE_URL: OK, NODE_ENV: 'production' }).ok).toBe(false);
  });

  it('refuses a real database name on a local host (an ssh tunnel lands on 127.0.0.1)', () => {
    for (const db of ['accelerator_dev', 'accelerator', 'campus_e2e_x', '']) {
      expect(checkCampusE2EDatabase({ DATABASE_URL: `postgres://u:p@127.0.0.1:5432/${db}` }).ok).toBe(false);
    }
  });

  it('refuses remote and look-alike hosts', () => {
    for (const host of ['95.216.199.47', 'localhost.evil.com', 'db.internal', '0.0.0.0', '127.0.0.2']) {
      expect(checkCampusE2EDatabase({ DATABASE_URL: `postgres://u:p@${host}:5432/campus_e2e` }).ok).toBe(false);
    }
  });

  it('refuses a non-postgres protocol and a malformed URL', () => {
    expect(checkCampusE2EDatabase({ DATABASE_URL: 'mysql://u:p@127.0.0.1/campus_e2e' }).ok).toBe(false);
    expect(checkCampusE2EDatabase({ DATABASE_URL: 'not a url' }).ok).toBe(false);
  });
});
