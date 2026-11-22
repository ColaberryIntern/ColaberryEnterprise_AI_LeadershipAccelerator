/**
 * CP6.1 inbox saving against a REAL Postgres (the integration tier): the re-save rules the unit test can only read as SQL.
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts inboxService.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[inboxService.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('saving a job-search inbox address against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let schema: typeof import('../../../db/ensurePlacementSchema');
  let svc: typeof import('../inboxService');
  const E1 = '77777777-7777-4777-8777-777777777777';
  const E2 = '78888888-8888-4888-8888-888888888888';
  const one = async <T>(sql: string): Promise<T> => ((await sequelize.query(sql))[0] as T[])[0];

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    schema = await import('../../../db/ensurePlacementSchema');
    svc = await import('../inboxService');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await sequelize.query('CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY)');
    await sequelize.query(`INSERT INTO enrollments (id) VALUES ('${E1}'), ('${E2}') ON CONFLICT DO NOTHING`);
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    await schema.ensurePlacementSchema();
  });
  afterAll(async () => {
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    await sequelize.close();
  });

  it('first save, then the same mailbox typed differently keeps verification; a different mailbox clears it', async () => {
    expect((await svc.saveInboxAddress(E1, 'ann.lee.careers@gmail.com')).status).toBe('saved');
    await sequelize.query(`UPDATE job_search_inboxes SET verified_at = NOW(), last_test_at = NOW(), last_test_ms = 4000 WHERE enrollment_id = '${E1}'`);
    expect((await svc.saveInboxAddress(E1, 'ann.lee.careers@gmail.com')).status).toBe('unchanged');
    const retyped = await svc.saveInboxAddress(E1, 'annlee.careers+jobs@gmail.com');
    expect(retyped.status).toBe('saved');
    const kept = await one<{ address: string; verified_at: Date | null; last_test_ms: number | null }>(`SELECT address, verified_at, last_test_ms FROM job_search_inboxes WHERE enrollment_id = '${E1}'`);
    expect(kept.address).toBe('annlee.careers+jobs@gmail.com');
    expect(kept.verified_at).not.toBeNull();
    expect(kept.last_test_ms).toBe(4000);
    expect((await svc.saveInboxAddress(E1, 'someone.new@gmail.com')).status).toBe('saved');
    const reset = await one<{ verified_at: Date | null; last_test_ms: number | null }>(`SELECT verified_at, last_test_ms FROM job_search_inboxes WHERE enrollment_id = '${E1}'`);
    expect(reset.verified_at).toBeNull();
    expect(reset.last_test_ms).toBeNull();
  });

  it('another learner cannot claim that mailbox, however it is typed', async () => {
    expect((await svc.saveInboxAddress(E2, 'Someone.New+x@googlemail.com')).status).toBe('taken');
    expect((await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM job_search_inboxes WHERE enrollment_id = '${E2}'`)).n).toBe(0);
  });
});
