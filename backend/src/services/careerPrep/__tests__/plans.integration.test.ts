/**
 * Career Prep v27 CP4.1 against a REAL Postgres (the integration tier): one active plan per interview,
 * even when two requests arrive together (advisory lock + the prep_plans_one_active partial unique index).
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts plans.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[careerPrep plans.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('prep plans against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let schema: typeof import('../../../db/ensureCareerPrepSchema');
  let plans: typeof import('../plans');
  const E1 = '78888888-8888-4888-8888-888888888888';
  const I1 = '79999999-9999-4999-8999-999999999999';
  const activeCount = async () => Number(((await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM prep_plans WHERE interview_id = '${I1}' AND status = 'active'`))[0] as Array<{ n: number }>)[0].n);

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    schema = await import('../../../db/ensureCareerPrepSchema');
    plans = await import('../plans');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await sequelize.query('CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY, full_name TEXT)');
    await sequelize.query(`INSERT INTO enrollments (id, full_name) VALUES ('${E1}', 'Test Student') ON CONFLICT DO NOTHING`);
    await schema.ensureCareerPrepSchema();
    await sequelize.query(`INSERT INTO career_interviews (id, enrollment_id, source, company, role, type, starts_at)
      VALUES ('${I1}', '${E1}', 'added', 'Acme', 'AI Engineer', 'technical', NOW() + INTERVAL '3 days')`);
  });

  afterAll(async () => {
    for (const sql of schema.CAREER_PREP_ROLLBACK) await sequelize.query(sql);
    await sequelize.close();
  });

  it('two plans requested at once leave exactly one active plan', async () => {
    await Promise.all([plans.createPlan(E1, { interviewId: I1, kind: 'days' }), plans.createPlan(E1, { interviewId: I1, kind: 'tonight' })]);
    expect(await activeCount()).toBe(1);
  });

  it('the database itself refuses a second active plan', async () => {
    await expect(sequelize.query(`INSERT INTO prep_plans (enrollment_id, interview_id, kind, minutes, days) VALUES ('${E1}', '${I1}', 'full', 30, '[]')`)).rejects.toThrow();
  });
});
