/**
 * Career Prep R2/R3 placement tables against a REAL Postgres (the integration tier). The unit test checks the text; this
 * checks the DDL is valid, re-runnable, and that the uniqueness rules actually hold.
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts ensurePlacementSchema.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[ensurePlacementSchema.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('placement schema against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let schema: typeof import('../ensurePlacementSchema');
  const E1 = '75555555-5555-4555-8555-555555555555';
  const E2 = '76666666-6666-4666-8666-666666666666';
  const one = async <T>(sql: string): Promise<T> => ((await sequelize.query(sql))[0] as T[])[0];
  const columns = async () => (await sequelize.query(
    `SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_name IN ('job_search_inboxes','inbox_received') ORDER BY table_name, column_name`))[0];

  beforeAll(async () => {
    ({ sequelize } = await import('../../config/database'));
    schema = await import('../ensurePlacementSchema');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await sequelize.query('CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY)');
    await sequelize.query(`INSERT INTO enrollments (id) VALUES ('${E1}'), ('${E2}') ON CONFLICT DO NOTHING`);
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
  });

  afterAll(async () => {
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    await sequelize.close();
  });

  it('runs twice to the same schema (ensure swallows statement errors, so prove both tables exist)', async () => {
    await schema.ensurePlacementSchema();
    const first = await columns();
    await schema.ensurePlacementSchema();
    expect(await columns()).toEqual(first);
    expect((await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_name IN ('job_search_inboxes','inbox_received')")).n).toBe(2);
  });

  it('one inbox per learner, and one Gmail mailbox across learners (the canonical mailbox is the key)', async () => {
    await sequelize.query(`INSERT INTO job_search_inboxes (enrollment_id, address, mailbox) VALUES ('${E1}', 'ann.lee.careers@gmail.com', 'annleecareers@gmail.com')`);
    await expect(sequelize.query(`INSERT INTO job_search_inboxes (enrollment_id, address, mailbox) VALUES ('${E1}', 'other@gmail.com', 'other@gmail.com')`)).rejects.toThrow();
    await expect(sequelize.query(`INSERT INTO job_search_inboxes (enrollment_id, address, mailbox) VALUES ('${E2}', 'annlee.careers+x@gmail.com', 'annleecareers@gmail.com')`)).rejects.toThrow();
  });

  it('keeps one received row per Message-ID, so a replay adds nothing', async () => {
    const ins = `INSERT INTO inbox_received (enrollment_id, message_id, received_at, subject) VALUES ('${E1}', '<m1@mail>', NOW(), 'Interview')
                 ON CONFLICT (message_id) DO NOTHING`;
    await sequelize.query(ins);
    await sequelize.query(ins);
    expect((await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM inbox_received WHERE message_id = '<m1@mail>'")).n).toBe(1);
  });

  it('drops cleanly and comes back', async () => {
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    expect((await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_name = 'job_search_inboxes'")).n).toBe(0);
    await schema.ensurePlacementSchema();
    expect((await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_name = 'job_search_inboxes'")).n).toBe(1);
  });
});
