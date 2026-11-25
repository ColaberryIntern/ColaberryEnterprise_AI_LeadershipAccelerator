/**
 * CCPP interviews into career_interviews against a REAL Postgres (CCPP itself is faked): one row per interview, a move
 * updates it, Central time is kept, past ones are not added, a cancel removes it unless there is a plan, and another
 * student's row is never touched.
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts ccppInterviews.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables.
 */
jest.mock('../../settingsService', () => ({ getSetting: jest.fn(async () => null) }));
jest.mock('../jdQuestions', () => ({ questionsFromJd: jest.fn(async () => null) }));
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[careerPrep ccppInterviews.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('CCPP interviews against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let schema: typeof import('../../../db/ensureCareerPrepSchema');
  let link: typeof import('../ccppInterviews');
  const E1 = '7eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
  const E2 = '7eeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';
  const iv = (o: object = {}) => ({ id: 11, company: "O'Brien: AI", role: 'AI Engineer', jd: null, typeId: 1, cancelled: false, startsLocal: '2099-01-15T10:30:00', ...o });
  const run = (e: string, ...list: object[]) => link.linkCcppInterviews(e, { fetch: async () => list as never });
  const rows = async () => (await sequelize.query('SELECT enrollment_id, company, type, starts_at, source FROM career_interviews ORDER BY ccpp_interview_id'))[0] as Array<{ enrollment_id: string; company: string; type: string; starts_at: Date; source: string }>;

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    schema = await import('../../../db/ensureCareerPrepSchema');
    link = await import('../ccppInterviews');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await sequelize.query('CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY, full_name TEXT)');
    await sequelize.query('ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS email TEXT');
    for (const e of [E1, E2]) await sequelize.query(`INSERT INTO enrollments (id, email) VALUES ('${e}', 's@example.com') ON CONFLICT (id) DO NOTHING`);
    await schema.ensureCareerPrepSchema();
  });
  afterAll(async () => {
    for (const s of schema.CAREER_PREP_ROLLBACK) await sequelize.query(s);
    await sequelize.close();
  });

  it('adds one row in Central time; a re-run and a move update that row', async () => {
    expect(await run(E1, iv())).toEqual({ added: 1, updated: 0, removed: 0 });
    expect(await run(E1, iv())).toEqual({ added: 0, updated: 1, removed: 0 });
    expect(await rows()).toMatchObject([{ company: "O'Brien: AI", type: 'recruiter', source: 'real', starts_at: new Date('2099-01-15T16:30:00Z') }]);
    await run(E1, iv({ startsLocal: '2099-07-15T09:00:00' }));
    expect((await rows())[0].starts_at).toEqual(new Date('2099-07-15T14:00:00Z'));
  });
  it('never takes over another student row, and never adds a past interview', async () => {
    expect(await run(E2, iv({ company: 'Stolen' }))).toEqual({ added: 0, updated: 0, removed: 0 });
    expect(await run(E2, iv({ id: 12, startsLocal: '2020-01-01T10:00:00' }))).toEqual({ added: 0, updated: 0, removed: 0 });
    expect(await run(E2, iv({ cancelled: true }))).toEqual({ added: 0, updated: 0, removed: 0 });
    expect(await rows()).toMatchObject([{ enrollment_id: E1, company: "O'Brien: AI" }]);
  });
  it('a cancel keeps an interview with a plan, and removes one without', async () => {
    await run(E1, iv({ id: 13 }));
    await sequelize.query(`INSERT INTO prep_plans (enrollment_id, interview_id, kind, minutes, days) SELECT enrollment_id, id, 'days', 20, '[]' FROM career_interviews WHERE ccpp_interview_id = 13`);
    expect(await run(E1, iv({ cancelled: true }), iv({ id: 13, cancelled: true }))).toEqual({ added: 0, updated: 0, removed: 1 });
    expect(await rows()).toHaveLength(1);
  });
});
