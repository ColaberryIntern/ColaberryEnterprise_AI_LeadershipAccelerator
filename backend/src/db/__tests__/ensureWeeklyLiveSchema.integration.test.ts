/**
 * Weekly Live Studio WL2.1 against a REAL Postgres (the CI integration tier). The unit test checks
 * the text; this proves the DDL is valid, re-runnable, and that its keys actually hold.
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts ensureWeeklyLiveSchema.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables,
 * including minimal stand-ins for cohorts and live_sessions when they do not exist.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[ensureWeeklyLiveSchema.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('weekly live schema against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let schema: typeof import('../ensureWeeklyLiveSchema');
  const S1 = '91111111-1111-4111-8111-111111111111';
  const drop = async () => {
    for (const t of [...schema.WEEKLY_LIVE_TABLES].reverse()) await sequelize.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
  };
  const columns = async () => (await sequelize.query(
    `SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name LIKE 'weekly\\_live\\_%' ORDER BY table_name, column_name`))[0];

  beforeAll(async () => {
    ({ sequelize } = await import('../../config/database'));
    schema = await import('../ensureWeeklyLiveSchema');
    // The suite gets its own empty database: stand in for the two tables the DDL references.
    await sequelize.query('CREATE TABLE IF NOT EXISTS cohorts (id UUID PRIMARY KEY, name VARCHAR(200))');
    await sequelize.query('CREATE TABLE IF NOT EXISTS live_sessions (id UUID PRIMARY KEY, cohort_id UUID)');
    await sequelize.query(`INSERT INTO live_sessions (id) VALUES ('${S1}') ON CONFLICT DO NOTHING`);
    await drop();
  });

  afterAll(async () => {
    await drop();
    await sequelize.close();
  });

  it('runs twice and the second run changes nothing', async () => {
    await schema.ensureWeeklyLiveSchema();
    const cols = await columns();
    await schema.ensureWeeklyLiveSchema();
    expect(await columns()).toEqual(cols);
    const n = (await sequelize.query(`SELECT COUNT(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN (${schema.WEEKLY_LIVE_TABLES.map((t) => `'${t}'`).join(',')})`))[0] as { n: number }[];
    expect(n[0].n).toBe(9);
  });

  it('rejects a duplicate content piece for the same session', async () => {
    const ins = `INSERT INTO weekly_live_content_pieces (session_id, piece_key, kind) VALUES ('${S1}', 'short-1', 'short')`;
    await sequelize.query(ins);
    await expect(sequelize.query(ins)).rejects.toThrow();
  });

  it('rejects a duplicate signal URL within a plan, a second rank, and an out-of-range week', async () => {
    const [[plan]] = (await sequelize.query(`INSERT INTO weekly_live_plans (air_date) VALUES ('2026-11-30') RETURNING id`)) as [{ id: string }[], unknown];
    const sig = `INSERT INTO weekly_live_signals (plan_id, headline, url) VALUES ('${plan.id}', 'h', 'https://x.com/a')`;
    await sequelize.query(sig);
    await expect(sequelize.query(sig)).rejects.toThrow();
    const topic = (rank: number, week: number) => `INSERT INTO weekly_live_topics (plan_id, rank, week, title, teach, viral, convert, topic_score)
      VALUES ('${plan.id}', ${rank}, ${week}, 't', 90, 90, 90, 90)`;
    await sequelize.query(topic(1, 3));
    await expect(sequelize.query(topic(1, 4))).rejects.toThrow();
    await expect(sequelize.query(topic(2, 13))).rejects.toThrow();
  });

  it('rejects an unknown plan status, piece status and moment kind', async () => {
    await expect(sequelize.query(`INSERT INTO weekly_live_plans (air_date, status) VALUES ('2026-11-30', 'done')`)).rejects.toThrow();
    await expect(sequelize.query(`INSERT INTO weekly_live_content_pieces (session_id, piece_key, kind, status) VALUES ('${S1}', 'k2', 'short', 'live')`)).rejects.toThrow();
    await expect(sequelize.query(`INSERT INTO weekly_live_moments (session_id, at, kind) VALUES ('${S1}', NOW(), 'party')`)).rejects.toThrow();
  });

  it('one week tag per session', async () => {
    const ins = (w: number) => `INSERT INTO weekly_live_session_weeks (session_id, week) VALUES ('${S1}', ${w})`;
    await sequelize.query(ins(3));
    await expect(sequelize.query(ins(4))).rejects.toThrow();
  });
});
