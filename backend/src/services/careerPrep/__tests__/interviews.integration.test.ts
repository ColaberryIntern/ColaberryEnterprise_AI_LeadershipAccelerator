/**
 * Career Prep v27 CP3.3 against a REAL Postgres (the integration tier): the retry-safe save (advisory lock
 * + the 10-minute duplicate check, including `IS NOT DISTINCT FROM` for an undated interview) and the Hire
 * link (LEFT to the column width, ON CONFLICT on hire_interview_id).
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts interviews.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables.
 */
jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));

export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[careerPrep interviews.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('career interviews against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let schema: typeof import('../../../db/ensureCareerPrepSchema');
  let interviews: typeof import('../interviews');
  const E1 = '76666666-6666-4666-8666-666666666666';
  const count = async (where: string) => Number(((await sequelize.query(`SELECT COUNT(*)::int AS n FROM career_interviews WHERE ${where}`))[0] as Array<{ n: number }>)[0].n);

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    schema = await import('../../../db/ensureCareerPrepSchema');
    interviews = await import('../interviews');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await sequelize.query('CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY)');
    await sequelize.query(`INSERT INTO enrollments (id) VALUES ('${E1}') ON CONFLICT DO NOTHING`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS hire_interviews (id UUID PRIMARY KEY, enrollment_id UUID, format VARCHAR(20), starts_at TIMESTAMPTZ,
      status VARCHAR(20), employer_company VARCHAR(160), employer_role VARCHAR(120))`);
    await schema.ensureCareerPrepSchema();
  });

  afterAll(async () => {
    for (const sql of schema.CAREER_PREP_ROLLBACK) await sequelize.query(sql);
    await sequelize.close();
  });

  it('saves the same added interview once, even when two requests arrive together', async () => {
    const input = { company: 'Acme', role: 'AI Engineer', type: 'technical' as const, startsAt: null };
    const [a, b] = await Promise.all([interviews.addInterview(E1, input), interviews.addInterview(E1, input)]);
    expect(a.id).toBe(b.id);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
    expect(await count(`source = 'added' AND company = 'Acme'`)).toBe(1);
  });

  it('saves a practice interview once', async () => {
    await interviews.createPractice(E1, { role: 'AI Engineer', type: 'behavioral' });
    await interviews.createPractice(E1, { role: 'AI Engineer', type: 'behavioral' });
    expect(await count(`source = 'practice'`)).toBe(1);
  });

  it('links a Hire interview once, even with a company name longer than the column', async () => {
    const hid = '77777777-7777-4777-8777-777777777777';
    await sequelize.query(`INSERT INTO hire_interviews VALUES ('${hid}', '${E1}', 'working', NOW() + INTERVAL '3 days', 'confirmed', '${'X'.repeat(150)}', 'Engineer')`);
    expect(await interviews.linkHireInterviews(E1)).toBe(1);
    expect(await interviews.linkHireInterviews(E1)).toBe(0);
    expect(await count(`hire_interview_id = '${hid}' AND length(company) = 120`)).toBe(1);
  });
});
