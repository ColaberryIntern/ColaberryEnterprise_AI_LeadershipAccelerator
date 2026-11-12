/**
 * hire.refactored.ai profile upgrade, Phase 2, against a REAL Postgres (the integration tier).
 *
 * The unit tier mocks SQL, so it cannot see whether the DDL is valid, whether the upserts and the
 * partial unique index behave, or whether the advisory lock actually serialises two employers
 * racing for one slot. This suite does. The listing gate (`loadHireIndex`) is mocked at its module:
 * it is tested on its own, and it reads a dozen tables this suite has no reason to build.
 *
 * Running it:
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts hireInterviews.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables.
 */
jest.mock('../hireTalentIndex', () => ({ loadHireIndex: jest.fn() }));

export {}; // a module, so its consts never collide with another suite's in the test typecheck

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[hireInterviews.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('hire interviews against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let schema: typeof import('../../../db/ensureHireInterviewSchema');
  let settings: typeof import('../hireStudioSettings');
  let interviews: typeof import('../hireInterviews');
  let inbox: typeof import('../hireInterviewInbox');

  const E1 = '73333333-3333-4333-8333-333333333333';
  const NOW = new Date('2026-11-12T16:00:00Z');
  const MON_9 = '2026-11-16T15:00:00.000Z';
  const body = (email: string, o: Record<string, unknown> = {}) => ({
    talentSlug: 'ann-lee', format: 'intro', startsAt: MON_9, name: 'Jane', email, company: 'Acme', role: 'CTO', ...o,
  });
  const count = async () => Number(((await sequelize.query('SELECT COUNT(*)::int AS n FROM hire_interviews'))[0] as { n: number }[])[0].n);

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    schema = await import('../../../db/ensureHireInterviewSchema');
    settings = await import('../hireStudioSettings');
    interviews = await import('../hireInterviews');
    inbox = await import('../hireInterviewInbox');
    const { loadHireIndex } = await import('../hireTalentIndex');
    (loadHireIndex as unknown as jest.Mock).mockResolvedValue([{ page: { enrollment_id: E1, slug: 'ann-lee' }, cases: [{ slug: 'case-a' }] }]);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await sequelize.query('CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY)');
    await sequelize.query('INSERT INTO enrollments (id) VALUES ($1) ON CONFLICT DO NOTHING', { bind: [E1] });
    await schema.ensureHireInterviewSchema();
    await schema.ensureHireInterviewSchema(); // re-runnable at every boot
  });

  afterAll(async () => {
    for (const s of schema.HIRE_INTERVIEW_ROLLBACK) await sequelize.query(s);
    await sequelize.close();
  });

  it('creates all four tables, every statement valid (none skipped)', async () => {
    const [rows] = await sequelize.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'hire\\_%' ORDER BY table_name`,
    );
    expect((rows as { table_name: string }[]).map((r) => r.table_name)).toEqual(
      expect.arrayContaining(['hire_case_study_order', 'hire_interview_availability', 'hire_interviews', 'hire_profile_intro']),
    );
    const [idx] = await sequelize.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'hire_interviews'`);
    expect((idx as { indexname: string }[]).map((r) => r.indexname)).toEqual(expect.arrayContaining(['uq_hire_interviews_repeat']));
  });

  it('round-trips the studio settings as idempotent upserts', async () => {
    const intro = { headlineDraft: null, answers: [{ key: 'team' as const, text: 'Pairing' }], roles: ['FDE'], setups: ['remote' as const], location: null, earliestStart: '2027-01-04', workAuth: 'internal' };
    await settings.writeHireIntro(E1, intro);
    expect(await settings.writeHireIntro(E1, intro)).toMatchObject({ answers: intro.answers, earliestStart: '2027-01-04' });
    expect(JSON.stringify(await settings.readPublicIntro(E1))).not.toContain('internal');

    const avail = { ...settings.DEFAULT_AVAILABILITY, enabled: true, blocks: ['Mon-morning'], formats: ['intro' as const], minNoticeHours: 24 };
    await settings.writeAvailability(E1, avail);
    expect(await settings.readAvailability(E1)).toEqual(avail);
    expect(await settings.writeCaseStudyOrder(E1, ['case-a'], ['case-a'])).toEqual(['case-a']);
  });

  it('books an open slot once, answers a repeat as duplicate, and hides the slot from everyone after', async () => {
    expect((await interviews.requestInterview(body('jane@acme.com'), NOW)).status).toBe('created');
    expect((await interviews.requestInterview(body('JANE@acme.com'), NOW)).status).toBe('duplicate');
    expect((await interviews.requestInterview(body('bob@other.com'), NOW)).status).toBe('unavailable');
    expect(await count()).toBe(1);
    const slots: any = await interviews.talentSlots('ann-lee', { from: '2026-11-16' }, NOW);
    expect(slots.body.slots.map((s: any) => s.start)).not.toContain(MON_9);
  });

  it('lets exactly one of two employers racing for the same time win (the advisory lock)', async () => {
    const at = '2026-11-16T16:00:00.000Z';
    const out = await Promise.all(['a@one.com', 'b@two.com', 'c@three.com'].map((e) => interviews.requestInterview(body(e, { startsAt: at }), NOW)));
    expect(out.map((o) => o.status).sort()).toEqual(['created', 'unavailable', 'unavailable']);
  });

  it('lets the candidate confirm their own request, idempotently, and lists it without the employer email', async () => {
    const [mine] = await inbox.listMyInterviews(E1);
    expect(JSON.stringify(mine)).not.toMatch(/@/);
    expect((await inbox.actOnInterview(E1, mine.id, 'confirm', {}, NOW)).status).toBe('confirmed');
    expect((await inbox.actOnInterview(E1, mine.id, 'confirm', {}, NOW)).status).toBe('confirmed');
    await expect(inbox.actOnInterview('74444444-4444-4444-8444-444444444444', mine.id, 'decline', {}, NOW)).rejects.toMatchObject({ status: 404 });
  });
});
