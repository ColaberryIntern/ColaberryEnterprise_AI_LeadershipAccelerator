/**
 * Career Prep v27 CP1.2 against a REAL Postgres (the integration tier). The unit test checks the
 * text; this checks the DDL is valid, re-runnable, and that the idempotency keys actually hold.
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts ensureCareerPrepSchema.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[ensureCareerPrepSchema.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('career prep schema against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let schema: typeof import('../ensureCareerPrepSchema');
  const E1 = '74444444-4444-4444-8444-444444444444';
  const one = async <T>(sql: string): Promise<T> => ((await sequelize.query(sql))[0] as T[])[0];
  const columns = async () => (await sequelize.query(
    `SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_name IN ('career_interviews','prep_skills','prep_skill_sources','prep_observations','prep_plans','prep_sessions','prep_readiness_daily')
      ORDER BY table_name, column_name`))[0];

  beforeAll(async () => {
    ({ sequelize } = await import('../../config/database'));
    schema = await import('../ensureCareerPrepSchema');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY)`);
    await sequelize.query(`INSERT INTO enrollments (id) VALUES ('${E1}') ON CONFLICT DO NOTHING`);
    for (const sql of schema.CAREER_PREP_ROLLBACK) await sequelize.query(sql);
  });

  afterAll(async () => {
    for (const sql of schema.CAREER_PREP_ROLLBACK) await sequelize.query(sql);
    await sequelize.close();
  });

  it('runs twice to the same schema with 9 skills', async () => {
    await schema.ensureCareerPrepSchema();
    const first = await columns();
    await schema.ensureCareerPrepSchema();
    expect(await columns()).toEqual(first);
    expect((await one<{ n: number }>('SELECT COUNT(*)::int AS n FROM prep_skills')).n).toBe(9);
  });

  it('keeps one observation per (source_ref, skill_key)', async () => {
    const ins = `INSERT INTO prep_observations (enrollment_id, skill_key, value, source, source_ref, observed_at)
                 VALUES ('${E1}', 'few_fillers', 80, 'video', 'video:abc', NOW()) ON CONFLICT (source_ref, skill_key) DO NOTHING`;
    await sequelize.query(ins);
    await sequelize.query(ins);
    expect((await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM prep_observations WHERE source_ref = 'video:abc'")).n).toBe(1);
  });

  it('rejects an out-of-range score and an unknown skill', async () => {
    await expect(sequelize.query(`INSERT INTO prep_observations (enrollment_id, skill_key, value, source, source_ref, observed_at)
      VALUES ('${E1}', 'few_fillers', 101, 'video', 'video:x', NOW())`)).rejects.toThrow();
    await expect(sequelize.query(`INSERT INTO prep_observations (enrollment_id, skill_key, value, source, source_ref, observed_at)
      VALUES ('${E1}', 'eye_contact', 50, 'video', 'video:y', NOW())`)).rejects.toThrow();
  });

  it('drops cleanly and comes back', async () => {
    for (const sql of schema.CAREER_PREP_ROLLBACK) await sequelize.query(sql);
    expect((await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_name = 'prep_skills'")).n).toBe(0);
    await schema.ensureCareerPrepSchema();
    expect((await one<{ n: number }>('SELECT COUNT(*)::int AS n FROM prep_skills')).n).toBe(9);
  });
});
