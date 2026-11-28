/**
 * The deck service (WL4.2) against a REAL Postgres (the CI integration tier, one database per suite):
 * claiming the paid writer exactly once, saving onto the session under a row lock, never overwriting a
 * deck Studio did not build, never touching an adopted class, and a byte-identical rebuild.
 * SKIPS without DATABASE_URL. Never point it at production: it creates and drops tables.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[deckService.integration] SKIPPED: no DATABASE_URL. See the header.');
}
jest.setTimeout(120_000);

describeIfDb('the deck service against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let svc: typeof import('../deckService');
  let store: typeof import('../blueprintStore');
  let sample: typeof import('./sampleBlueprint');
  const COHORT = '94444444-4444-4444-8444-444444444444';
  const one = async <T>(sql: string): Promise<T> => ((await sequelize.query(sql))[0] as T[])[0];
  const deckOf = async (sid: string) => (await one<{ html: string | null }>(`SELECT kit_config_json->'customDeck'->>'html' AS html FROM live_sessions WHERE id = '${sid}'`)).html;

  /** A chosen plan with its session and a ready blueprint. */
  async function chosen(origin: 'created' | 'adopted' = 'created', kit: object | null = null) {
    const sid = (await one<{ id: string }>(`INSERT INTO live_sessions (id, cohort_id, session_number, title, session_date, start_time, end_time, session_type, status, kit_config_json)
      VALUES (gen_random_uuid(), '${COHORT}', 1, 'Stop Doing It Nightly (Week 8 · Claude Code Workflows)', '2026-12-07', '18:30', '19:30', 'core', 'scheduled', ${kit ? `'${JSON.stringify(kit)}'::jsonb` : 'NULL'}) RETURNING id`)).id;
    const pid = (await one<{ id: string }>(`INSERT INTO weekly_live_plans (air_date, cohort_id, status, live_session_id, session_origin) VALUES ('2026-12-07', '${COHORT}', 'chosen', '${sid}', '${origin}') RETURNING id`)).id;
    const tid = (await one<{ id: string }>(`INSERT INTO weekly_live_topics (plan_id, rank, week, title, teach, viral, convert, topic_score) VALUES ('${pid}', 1, 8, 'Stop Doing It Nightly', 90, 90, 90, 90) RETURNING id`)).id;
    await sequelize.query(`UPDATE weekly_live_plans SET chosen_topic_id = '${tid}' WHERE id = '${pid}'`);
    return { sid, pid, tid };
  }
  const ready = async (pid: string, tid: string) => {
    const attempt = await store.claimWriter(pid, tid, 'm', false);
    expect(await store.finishWriter(pid, tid, attempt!, { status: 'ready', blueprint: sample.sampleBlueprint() })).toBe(true);
  };

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    svc = await import('../deckService'); store = await import('../blueprintStore'); sample = await import('./sampleBlueprint');
    const { default: LiveSession } = await import('../../../../models/LiveSession');
    const schema = await import('../../../../db/ensureWeeklyLiveSchema');
    await sequelize.query('CREATE TABLE IF NOT EXISTS cohorts (id UUID PRIMARY KEY, name VARCHAR(200))');
    await sequelize.query('CREATE TABLE IF NOT EXISTS curriculum_modules (id UUID PRIMARY KEY)');
    await sequelize.query(`INSERT INTO cohorts (id, name) VALUES ('${COHORT}', 'Cohort - December 2026') ON CONFLICT DO NOTHING`);
    await LiveSession.sync();
    await schema.ensureWeeklyLiveSchema();
  });
  beforeEach(async () => {
    await sequelize.query('TRUNCATE weekly_live_plans CASCADE');
    await sequelize.query('DELETE FROM live_sessions');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterAll(async () => { await sequelize.close(); });

  it('two starts claim the paid writer once', async () => {
    const { pid } = await chosen();
    const run = jest.fn();
    const [a, b] = await Promise.all([svc.startDeck(pid, false, run), svc.startDeck(pid, false, run)]);
    expect(run).toHaveBeenCalledTimes(1);
    expect([a.status, b.status]).toEqual(['writing', 'writing']);
  });

  it('saves the deck on the session, keeps the rest of the kit, and rebuilds byte for byte', async () => {
    const { sid, pid, tid } = await chosen('created', { theaterEnabled: false });
    await ready(pid, tid);
    const s1 = await svc.startDeck(pid, false, jest.fn());
    expect(s1).toMatchObject({ status: 'ready', saved: true, slides: 15, sessionId: sid });
    const first = await deckOf(sid);
    expect(first).toContain(svc.STUDIO_MARK);
    expect(await one(`SELECT kit_config_json->'theaterEnabled' AS t FROM live_sessions WHERE id = '${sid}'`)).toEqual({ t: false });
    await svc.saveDeck(pid);
    expect(await deckOf(sid)).toBe(first);
  });

  it('never overwrites a deck Studio did not build', async () => {
    const { sid, pid, tid } = await chosen('created', { customDeck: { html: '<html>hand built</html>', guideHtml: null } });
    await ready(pid, tid);
    await expect(svc.saveDeck(pid)).rejects.toMatchObject({ code: 'foreign_deck' });
    expect(await deckOf(sid)).toBe('<html>hand built</html>');
  });

  it('leaves an adopted class alone', async () => {
    const { pid } = await chosen('adopted');
    await expect(svc.startDeck(pid, false, jest.fn())).rejects.toMatchObject({ status: 409, code: 'adopted_session' });
  });

  it('a replaced writer cannot finish, and a failed one can be claimed again', async () => {
    const { pid, tid } = await chosen();
    const first = await store.claimWriter(pid, tid, 'm', false);
    await sequelize.query(`UPDATE weekly_live_blueprints SET heartbeat_at = NOW() - INTERVAL '31 minutes' WHERE plan_id = '${pid}'`);
    const second = await store.claimWriter(pid, tid, 'm', false);
    expect(second).toBe(first! + 1);
    expect(await store.finishWriter(pid, tid, first!, { status: 'ready', blueprint: sample.sampleBlueprint() })).toBe(false);
    expect(await store.finishWriter(pid, tid, second!, { status: 'failed', error: 'x', problems: ['no hot seat'] })).toBe(true);
    expect(await svc.deckStatus(pid)).toMatchObject({ status: 'failed', problems: ['no hot seat'], saved: false });
    expect(await store.claimWriter(pid, tid, 'm', false)).toBe(second! + 1);
  });

  it('a ready plan is rewritten only when asked', async () => {
    const { pid, tid } = await chosen();
    await ready(pid, tid);
    const run = jest.fn();
    await svc.startDeck(pid, false, run);
    expect(run).not.toHaveBeenCalled();
    await svc.startDeck(pid, true, run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('runDeck stores a rejected plan with its reasons and saves nothing', async () => {
    const { sid, pid, tid } = await chosen();
    const attempt = await store.claimWriter(pid, tid, 'm', false);
    const broken = sample.sampleBlueprint(); broken.slides[12].kind = 'teach'; broken.slides[12].prompt = null;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await svc.runDeck({ planId: pid, topicId: tid, sessionId: sid, inputs: { week: 'auto' } }, attempt!, jest.fn().mockResolvedValue(broken));
    expect(await svc.deckStatus(pid)).toMatchObject({ status: 'failed', saved: false });
    expect((await svc.deckStatus(pid)).problems.join(' ')).toMatch(/no hot seat/);
    expect(await deckOf(sid)).toBeNull();
  });
});
