/**
 * Career Prep v27 CP4.5 against a REAL Postgres (the integration tier): one reminder per (ref, kind), and the
 * sender's claim-before-send, so two passes running together send a due reminder exactly once.
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts reminders.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[careerPrep reminders.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('prep reminders against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let schema: typeof import('../../../db/ensureCareerPrepSchema');
  let reminders: typeof import('../reminders');
  const E1 = '7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const P1 = '7bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const NOON = new Date('2026-11-16T18:00:00Z');
  const count = async (where: string) => Number(((await sequelize.query(`SELECT COUNT(*)::int AS n FROM prep_reminders WHERE ${where}`))[0] as Array<{ n: number }>)[0].n);

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    schema = await import('../../../db/ensureCareerPrepSchema');
    reminders = await import('../reminders');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await sequelize.query('CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY, full_name TEXT)');
    await sequelize.query('ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS email TEXT');
    await sequelize.query(`INSERT INTO enrollments (id, full_name, email) VALUES ('${E1}', 'Test Student', 'student@example.com') ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`);
    await schema.ensureCareerPrepSchema();
    await sequelize.query(`INSERT INTO prep_plans (id, enrollment_id, kind, minutes, days) VALUES ('${P1}', '${E1}', 'days', 20, '[]')`);
  });

  afterAll(async () => {
    for (const sql of schema.CAREER_PREP_ROLLBACK) await sequelize.query(sql);
    await sequelize.close();
  });

  it('asking for the same reminder twice at once stores one', async () => {
    const [a, b] = await Promise.all([reminders.scheduleReminder(E1, 'tonight', { planId: P1 }, NOON), reminders.scheduleReminder(E1, 'tonight', { planId: P1 }, NOON)]);
    expect(a.reminder.id).toBe(b.reminder.id);
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
    expect(await count(`ref = 'plan:${P1}' AND kind = 'tonight'`)).toBe(1);
  });

  it('two sender passes at once send a due reminder exactly once, and mark it sent', async () => {
    const mail = jest.fn(async () => undefined);
    const deps = { read: async () => null, enabled: async () => true, mail };
    const at = new Date('2026-11-17T00:01:00Z'); // 6:01 PM CST, just after it is due
    const sent = await Promise.all([reminders.sendDueReminders(at, deps), reminders.sendDueReminders(at, deps)]);
    expect(sent[0] + sent[1]).toBe(1);
    expect(mail).toHaveBeenCalledTimes(1);
    expect(mail).toHaveBeenCalledWith('student@example.com', 'Test Student');
    expect(await count(`ref = 'plan:${P1}' AND status = 'sent'`)).toBe(1);
  });
});
