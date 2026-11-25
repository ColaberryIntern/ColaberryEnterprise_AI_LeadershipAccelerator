/**
 * Career Prep pilot feedback against a REAL Postgres (the integration tier): the save is one row however often it is
 * retried, an answer is unread once, and one student never sees another's.
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts feedback.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables. No mail is sent.
 */
jest.mock('../../emailService', () => ({ guardedSendMail: jest.fn() }));
jest.mock('../../settingsService', () => ({ getSetting: jest.fn(async () => null) }));
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[careerPrep feedback.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('prep feedback against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let fb: typeof import('../feedback');
  const E1 = '7ccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const E2 = '7ddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const input = (clientKey: string) => ({ clientKey, kind: 'broken' as const, message: "It's broken; 100% :e", screenshot: { buffer: Buffer.from([0, 255, 39]), filename: 'screenshot.png' },
    context: { pageUrl: '/p', tab: 'plan', browser: 'x', viewport: '1x1', errors: [], failedRequests: [] } });

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    fb = await import('../feedback');
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await sequelize.query('CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY, full_name TEXT)');
    await sequelize.query('ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS email TEXT');
    for (const e of [E1, E2]) await sequelize.query(`INSERT INTO enrollments (id, full_name) VALUES ('${e}', 'Test Student') ON CONFLICT (id) DO NOTHING`);
  });
  afterAll(async () => {
    await sequelize.query('DROP TABLE IF EXISTS prep_feedback');
    await sequelize.close();
  });

  it('two sends of one item at once store one row, words and picture intact', async () => {
    const r = await Promise.all([fb.submitFeedback(E1, input('fb-aaaaaaaa')), fb.submitFeedback(E1, input('fb-aaaaaaaa'))]);
    expect(r.map((x) => x.created).sort()).toEqual([false, true]);
    expect(r[0].item.id).toBe(r[1].item.id);
    const [rows] = await sequelize.query('SELECT message, screenshot, mail_status FROM prep_feedback');
    expect(rows).toHaveLength(1);
    expect((rows as Array<{ message: string }>)[0].message).toBe("It's broken; 100% :e");
    expect((rows as Array<{ screenshot: Buffer }>)[0].screenshot.equals(Buffer.from([0, 255, 39]))).toBe(true);
  });
  it('answer: unread, then seen, then the same answer stays seen and a changed one is unread', async () => {
    const id = (await fb.listFeedback(E1))[0].id;
    const unread = async () => (await fb.listFeedback(E1))[0].unread;
    expect(await fb.answerFeedback(id, 'looking', 'On it')).toBe(true);
    expect(await unread()).toBe(true);
    await fb.markRepliesSeen(E1);
    expect(await unread()).toBe(false);
    await fb.answerFeedback(id, 'looking', 'On it');
    expect(await unread()).toBe(false);
    await fb.answerFeedback(id, 'fixed', 'On it');
    expect(await unread()).toBe(true);
    expect(await fb.answerFeedback('11111111-1111-4111-8111-111111111111', 'fixed', 'x')).toBe(false);
  });
  it('another student sees nothing, and the same key is theirs to use', async () => {
    expect(await fb.listFeedback(E2)).toEqual([]);
    expect((await fb.submitFeedback(E2, input('fb-aaaaaaaa'))).created).toBe(true);
    expect(await fb.listFeedback(E1)).toHaveLength(1);
  });
});
