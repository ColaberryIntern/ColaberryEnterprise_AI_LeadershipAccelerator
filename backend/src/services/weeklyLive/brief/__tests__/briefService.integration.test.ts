/**
 * Jackie's brief (WL4.4) against a REAL Postgres (the CI integration tier, one database per suite):
 * "approve twice creates one to-do" and the writer claims are SQL, so mocks cannot prove them.
 * Basecamp, the PDF and the photo fetch are fakes; nothing leaves the test.
 * SKIPS without DATABASE_URL. Never point it at production: it creates and drops tables.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[briefService.integration] SKIPPED: no DATABASE_URL. See the header.');
}
jest.setTimeout(120_000);

describeIfDb('Jackie\'s brief against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let svc: typeof import('../briefService');
  let store: typeof import('../briefStore');
  let sample: typeof import('./sampleCopy');
  const COHORT = '95555555-5555-4555-8555-555555555555';
  const AIR = '2099-12-07';
  const one = async <T>(sql: string): Promise<T> => ((await sequelize.query(sql))[0] as T[])[0];
  const deps = () => ({
    pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF')), fetchPhoto: jest.fn().mockResolvedValue(Buffer.from('jpg')), listTodos: jest.fn().mockResolvedValue([]),
    upload: jest.fn().mockResolvedValue('sgid'), createTodo: jest.fn().mockImplementation(async () => { await new Promise((r) => setTimeout(r, 50)); return { id: 4242, title: 't', app_url: 'https://3.basecamp.com/x/todos/4242' }; }),
  });

  async function chosen(origin: 'created' | 'adopted' = 'created') {
    const sid = (await one<{ id: string }>(`INSERT INTO live_sessions (id, cohort_id, session_number, title, session_date, start_time, end_time, session_type, status)
      VALUES (gen_random_uuid(), '${COHORT}', 1, 'Stop Doing It Nightly (Week 8 · Claude Code Workflows)', '${AIR}', '18:30', '19:30', 'core', 'scheduled') RETURNING id`)).id;
    const pid = (await one<{ id: string }>(`INSERT INTO weekly_live_plans (air_date, cohort_id, status, live_session_id, session_origin) VALUES ('${AIR}', '${COHORT}', 'chosen', '${sid}', '${origin}') RETURNING id`)).id;
    const tid = (await one<{ id: string }>(`INSERT INTO weekly_live_topics (plan_id, rank, week, title, teach, viral, convert, topic_score) VALUES ('${pid}', 1, 8, 'Stop Doing It Nightly', 90, 90, 90, 90) RETURNING id`)).id;
    await sequelize.query(`UPDATE weekly_live_plans SET chosen_topic_id = '${tid}' WHERE id = '${pid}'`);
    return { pid, tid };
  }
  /** A ready brief written today, with posts for today's slots. */
  async function ready(pid: string, tid: string) {
    const { promotionSlots } = await import('../briefCalendar');
    const { centralDate } = await import('../../curriculumMap');
    const today = centralDate();
    const attempt = await store.claimWriter(pid, tid, today, false);
    const ids = promotionSlots(today, AIR).filter((s) => s.who === 'Jackie').map((s) => s.id);
    expect(await store.finishWriter(pid, attempt!, { status: 'ready', copy: sample.sampleCopy(ids) })).toBe(true);
  }

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    svc = await import('../briefService'); store = await import('../briefStore'); sample = await import('./sampleCopy');
    const { default: LiveSession } = await import('../../../../models/LiveSession');
    const schema = await import('../../../../db/ensureWeeklyLiveSchema');
    await sequelize.query('CREATE TABLE IF NOT EXISTS cohorts (id UUID PRIMARY KEY, name VARCHAR(200))');
    await sequelize.query('CREATE TABLE IF NOT EXISTS curriculum_modules (id UUID PRIMARY KEY)');
    await sequelize.query(`INSERT INTO cohorts (id, name) VALUES ('${COHORT}', 'Cohort - December 2099') ON CONFLICT DO NOTHING`);
    await LiveSession.sync();
    await schema.ensureWeeklyLiveSchema();
  });
  beforeEach(async () => {
    await sequelize.query('TRUNCATE weekly_live_plans CASCADE');
    await sequelize.query('DELETE FROM live_sessions');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterAll(async () => { await sequelize.close(); });

  it('two starts write the brief once', async () => {
    const { pid } = await chosen();
    const run = jest.fn();
    await Promise.all([svc.startBrief(pid, false, run), svc.startBrief(pid, false, run)]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('approving twice at once creates one to-do, and approving later returns the same one', async () => {
    const { pid, tid } = await chosen(); await ready(pid, tid);
    const d = deps();
    const results = await Promise.allSettled([svc.approveBrief(pid, 'a@example.com', d), svc.approveBrief(pid, 'a@example.com', d)]);
    expect(d.createTodo).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: 'sending' } });
    const again = await svc.approveBrief(pid, 'a@example.com', d);
    expect(again).toMatchObject({ approved: true, todoUrl: 'https://3.basecamp.com/x/todos/4242' });
    expect(d.createTodo).toHaveBeenCalledTimes(1);
    expect(await one(`SELECT bc_todo_id::text AS id, approved_by FROM weekly_live_briefs WHERE plan_id = '${pid}'`)).toEqual({ id: '4242', approved_by: 'a@example.com' });
  });

  it('a failed send records nothing and can be approved again', async () => {
    const { pid, tid } = await chosen(); await ready(pid, tid);
    const bad = deps(); bad.createTodo.mockRejectedValue(Object.assign(new Error('Basecamp 503'), { name: 'UpstreamUnavailable' }));
    await expect(svc.approveBrief(pid, 'a@example.com', bad)).rejects.toMatchObject({ code: 'send_failed' });
    expect(await svc.briefView(pid)).toMatchObject({ todoUrl: null, sending: false, sendError: 'Sending to Basecamp failed. Approve again to retry.' });
    const good = deps();
    await expect(svc.approveBrief(pid, 'a@example.com', good)).resolves.toMatchObject({ todoUrl: 'https://3.basecamp.com/x/todos/4242' });
  });

  it('a sent brief is never rewritten; an unsent one follows a new topic', async () => {
    const { pid, tid } = await chosen(); await ready(pid, tid);
    const other = (await one<{ id: string }>(`INSERT INTO weekly_live_topics (plan_id, rank, week, title, teach, viral, convert, topic_score) VALUES ('${pid}', 2, 12, 'Show Me It Ran', 90, 90, 90, 90) RETURNING id`)).id;
    expect(await store.claimWriter(pid, other, '2099-12-01', false)).not.toBeNull();
    await sequelize.query(`UPDATE weekly_live_briefs SET status = 'ready', bc_todo_id = 1 WHERE plan_id = '${pid}'`);
    expect(await store.claimWriter(pid, tid, '2099-12-01', true)).toBeNull();
  });

  it('shows the brief as HTML once written, and refuses an adopted class', async () => {
    const { pid, tid } = await chosen(); await ready(pid, tid);
    const v = await svc.briefView(pid);
    expect(v.status).toBe('ready'); expect(v.html).toContain('Stop Doing It Nightly'); expect(v.html).toContain('8563379136');
    const adopted = await chosen('adopted');
    await expect(svc.startBrief(adopted.pid, false, jest.fn())).rejects.toMatchObject({ code: 'adopted_session' });
  });
});
