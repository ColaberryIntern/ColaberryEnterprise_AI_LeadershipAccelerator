/**
 * Choose -> session (WL4.1) against a REAL Postgres (the CI integration tier, one database per suite):
 * "one row per plan" and "adopt, never retitle" are SQL under a lock, so mocks cannot prove them.
 * SKIPS without DATABASE_URL. Never point it at production: it creates and drops tables.
 */
export {};

const zoomCalls = { createMeeting: jest.fn(), createMeetingForSession: jest.fn(), updateMeeting: jest.fn(), cancelMeeting: jest.fn() };
jest.mock('../../../zoomService', () => zoomCalls);

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[chooseSession.integration] SKIPPED: no DATABASE_URL. See the header.');
}
jest.setTimeout(120_000);

describeIfDb('choosing a topic plans the session in the batch', () => {
  let sequelize: import('sequelize').Sequelize;
  let svc: typeof import('../chooseSession');
  const COHORT = '93333333-3333-4333-8333-333333333333';
  const AIR = '2026-12-07';
  const fetchSpy = jest.spyOn(global, 'fetch');
  const one = async <T>(sql: string): Promise<T> => ((await sequelize.query(sql))[0] as T[])[0];
  const count = async (where = '') => Number((await one<{ n: string }>(`SELECT count(*) n FROM live_sessions WHERE cohort_id = '${COHORT}' ${where}`)).n);
  const plan = async (air = AIR) => (await one<{ id: string }>(`INSERT INTO weekly_live_plans (air_date, cohort_id, status) VALUES ('${air}', '${COHORT}', 'ready') RETURNING id`)).id;
  const topic = async (planId: string, title: string, week: number, rank = 1) =>
    (await one<{ id: string }>(`INSERT INTO weekly_live_topics (plan_id, rank, week, title, teach, viral, convert, topic_score) VALUES ('${planId}', ${rank}, ${week}, '${title}', 90, 90, 90, 90) RETURNING id`)).id;
  const chosen = (planId: string, topicId: string) => svc.chooseWithSession(planId, topicId, COHORT, async (t) => {
    const [rows] = await sequelize.query(`UPDATE weekly_live_plans SET status = 'chosen', chosen_topic_id = '${topicId}' WHERE id = '${planId}' RETURNING id`, { transaction: t });
    return (rows as unknown[]).length > 0;
  });
  const handMade = (title: string, n: number, date = AIR) => sequelize.query(
    `INSERT INTO live_sessions (id, cohort_id, session_number, title, session_date, start_time, end_time, session_type, status)
     VALUES (gen_random_uuid(), '${COHORT}', ${n}, '${title}', '${date}', '18:30', '19:30', 'core', 'scheduled')`);

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    svc = await import('../chooseSession');
    const { default: LiveSession } = await import('../../../../models/LiveSession');
    const schema = await import('../../../../db/ensureWeeklyLiveSchema');
    await sequelize.query('CREATE TABLE IF NOT EXISTS cohorts (id UUID PRIMARY KEY, name VARCHAR(200))');
    await sequelize.query(`INSERT INTO cohorts (id, name) VALUES ('${COHORT}', 'Cohort - December 2026') ON CONFLICT DO NOTHING`);
    await sequelize.query('CREATE TABLE IF NOT EXISTS curriculum_modules (id UUID PRIMARY KEY)');
    await LiveSession.sync();
    await schema.ensureWeeklyLiveSchema();
  });
  beforeEach(async () => {
    await sequelize.query('TRUNCATE weekly_live_plans, weekly_live_session_weeks CASCADE');
    await sequelize.query('DELETE FROM live_sessions');
    jest.clearAllMocks();
  });
  afterAll(async () => { await sequelize.close(); });

  it('creates the session in the batch with Ali\'s room, the next number, the title and the week', async () => {
    await handMade('Open House — December', 1, '2026-12-03');
    const p = await plan(); const t = await topic(p, 'Stop Doing It Nightly', 8);
    const s = await chosen(p, t);
    expect(s).toMatchObject({ origin: 'created', created: true, title: 'Stop Doing It Nightly (Week 8 · Claude Code Workflows)' });
    const row = await one<Record<string, unknown>>(`SELECT * FROM live_sessions WHERE id = '${s!.sessionId}'`);
    expect(row).toMatchObject({ cohort_id: COHORT, session_number: 2, start_time: '18:30', end_time: '19:30', status: 'scheduled', guest_access: true,
      meeting_link: 'https://colaberry.zoom.us/j/8563379136', zoom_meeting_id: '8563379136' });
    expect(await one(`SELECT week, source FROM weekly_live_session_weeks WHERE session_id = '${s!.sessionId}'`)).toEqual({ week: 8, source: 'studio' });
    expect(await one(`SELECT live_session_id, session_origin FROM weekly_live_plans WHERE id = '${p}'`)).toEqual({ live_session_id: s!.sessionId, session_origin: 'created' });
  });

  it('choosing again makes no second row, and a different topic retitles and retags the same row', async () => {
    const p = await plan(); const a = await topic(p, 'Stop Doing It Nightly', 8); const b = await topic(p, 'Show Me It Ran', 12, 2);
    const first = await chosen(p, a);
    const again = await Promise.all([chosen(p, a), chosen(p, a)]);
    expect(again.map((x) => x!.sessionId)).toEqual([first!.sessionId, first!.sessionId]);
    const switched = await chosen(p, b);
    expect(switched).toMatchObject({ sessionId: first!.sessionId, origin: 'created', created: false, title: 'Show Me It Ran (Week 12 · Capstone)' });
    expect(await count()).toBe(1);
    expect(await one(`SELECT week FROM weekly_live_session_weeks WHERE session_id = '${first!.sessionId}'`)).toEqual({ week: 12 });
  });

  it('adopts a class already on the date and never retitles or retags it', async () => {
    await handMade('It Works While You Sleep (Weekly Live Ep 2)', 5);
    const id = (await one<{ id: string }>('SELECT id FROM live_sessions')).id;
    await sequelize.query(`INSERT INTO weekly_live_session_weeks (session_id, week, source) VALUES ('${id}', 3, 'studio')`);
    const p = await plan(); const a = await topic(p, 'Stop Doing It Nightly', 8); const b = await topic(p, 'Show Me It Ran', 12, 2);
    expect(await chosen(p, a)).toEqual({ sessionId: id, title: 'It Works While You Sleep (Weekly Live Ep 2)', origin: 'adopted', created: false });
    expect(await chosen(p, b)).toMatchObject({ sessionId: id, origin: 'adopted' });
    expect(await one(`SELECT title FROM live_sessions WHERE id = '${id}'`)).toEqual({ title: 'It Works While You Sleep (Weekly Live Ep 2)' });
    expect(await one(`SELECT week FROM weekly_live_session_weeks WHERE session_id = '${id}'`)).toEqual({ week: 3 });
    expect(await count()).toBe(1);
  });

  it('does not adopt an Open House on the same date', async () => {
    await handMade('Open House — JOIN ON ZOOM', 1);
    const p = await plan(); const s = await chosen(p, await topic(p, 'Stop Doing It Nightly', 8));
    expect(s).toMatchObject({ origin: 'created', created: true });
    expect(await count()).toBe(2);
  });

  it('writes nothing when the plan refuses the choice', async () => {
    const p = await plan(); const t = await topic(p, 'Stop Doing It Nightly', 8);
    const s = await svc.chooseWithSession(p, t, COHORT, async () => false);
    expect(s).toBeNull();
    expect(await count()).toBe(0);
    expect(await one(`SELECT live_session_id FROM weekly_live_plans WHERE id = '${p}'`)).toEqual({ live_session_id: null });
  });

  it('rolls back the choice and the session together when a step fails', async () => {
    const p = await plan(); const t = await topic(p, 'Stop Doing It Nightly', 8);
    await expect(svc.chooseWithSession(p, t, COHORT, async (tx) => {
      await sequelize.query(`UPDATE weekly_live_plans SET status = 'chosen' WHERE id = '${p}'`, { transaction: tx });
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(await one(`SELECT status FROM weekly_live_plans WHERE id = '${p}'`)).toEqual({ status: 'ready' });
    expect(await count()).toBe(0);
  });

  it('a cancelled session is replaced, not reused', async () => {
    const p = await plan(); const t = await topic(p, 'Stop Doing It Nightly', 8);
    const first = await chosen(p, t);
    await sequelize.query(`UPDATE live_sessions SET status = 'cancelled' WHERE id = '${first!.sessionId}'`);
    const second = await chosen(p, t);
    expect(second!.sessionId).not.toBe(first!.sessionId);
    expect(await count("AND status = 'scheduled'")).toBe(1);
  });

  it('never calls Zoom', async () => {
    const p = await plan(); await chosen(p, await topic(p, 'Stop Doing It Nightly', 8));
    for (const fn of Object.values(zoomCalls)) expect(fn).not.toHaveBeenCalled();
    expect(fetchSpy.mock.calls.filter(([u]) => /zoom\.us/.test(String(u)))).toEqual([]);
  });
});
