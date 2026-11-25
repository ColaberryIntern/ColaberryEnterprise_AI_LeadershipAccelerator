/**
 * Weekly Live plans (WL3.4) and the cost cap (WL3.1) against a REAL Postgres (the CI integration tier):
 * the one-run-per-air-date rule and the cap are SQL, so mocks cannot prove them. SKIPS without
 * DATABASE_URL. Never point it at production: it creates and drops tables.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[planStore.integration] SKIPPED: no DATABASE_URL. See the header.');
}
jest.setTimeout(120_000);

describeIfDb('weekly live plans against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let schema: typeof import('../../../../db/ensureWeeklyLiveSchema');
  let store: typeof import('../planStore');
  let budget: typeof import('../../signals/researchBudget');
  const C1 = '92222222-2222-4222-8222-222222222222';
  const drop = async () => { for (const t of [...schema.WEEKLY_LIVE_TABLES].reverse()) await sequelize.query(`DROP TABLE IF EXISTS ${t} CASCADE`); };
  const make = (airDate: string) => store.createOrJoin({ airDate, cohortId: C1, inputs: { week: 'auto', proof: "it's built" }, createdBy: null });
  const age = (id: string) => sequelize.query("UPDATE weekly_live_plan_runs SET heartbeat_at = NOW() - INTERVAL '31 minutes' WHERE plan_id = :id", { replacements: { id } });
  const topic = async (planId: string) => {
    const [rows] = await sequelize.query(`INSERT INTO weekly_live_topics (plan_id, rank, week, title, teach, viral, convert, topic_score) VALUES ('${planId}', 1, 3, 'T', 1, 1, 1, 1) RETURNING id`);
    return (rows as { id: string }[])[0].id;
  };

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    schema = await import('../../../../db/ensureWeeklyLiveSchema');
    store = await import('../planStore');
    budget = await import('../../signals/researchBudget');
    await sequelize.query('CREATE TABLE IF NOT EXISTS cohorts (id UUID PRIMARY KEY, name VARCHAR(200))');
    await sequelize.query('CREATE TABLE IF NOT EXISTS live_sessions (id UUID PRIMARY KEY, cohort_id UUID)');
    await sequelize.query(`INSERT INTO cohorts (id, name) VALUES ('${C1}', 'Cohort - Test') ON CONFLICT DO NOTHING`);
    await drop();
    await schema.ensureWeeklyLiveSchema();
  });
  afterAll(async () => { await drop(); await sequelize.close(); });

  it('five presses at once start one run', async () => {
    const all = await Promise.all(Array.from({ length: 5 }, () => make('2099-01-05')));
    expect(new Set(all.map((x) => x.id)).size).toBe(1);
    expect(all.filter((x) => x.created)).toHaveLength(1);
    expect((await store.getPlan(all[0].id))).toMatchObject({ air_date: '2099-01-05', status: 'researching', stage: 'queued', inputs: { week: 'auto', proof: "it's built" } });
  });

  it('a run that stopped reads as failed, and a new press starts a new one', async () => {
    const a = await make('2099-01-12');
    await age(a.id);
    expect(await store.getPlan(a.id)).toMatchObject({ status: 'failed', error: expect.stringContaining('stopped') });
    const b = await make('2099-01-12');
    expect(b).toMatchObject({ created: true });
    expect(b.id).not.toBe(a.id);
    expect(await store.claimForRun(a.id)).toBeNull(); // another plan for the date is running
  });

  it('a finished plan is claimed by one of two regenerates', async () => {
    const { id, runId } = await make('2099-01-19');
    expect(await store.claimForRun(id)).toBeNull();
    expect(await store.setStage(id, runId!, 'topics', 'a note')).toBe(true);
    await store.finish(id, runId!, true);
    expect(await store.getPlan(id)).toMatchObject({ status: 'ready', stage: 'done', note: 'a note' });
    const claims = (await Promise.all([store.claimForRun(id), store.claimForRun(id)])).filter(Boolean);
    expect(claims).toHaveLength(1);
    // the first run can no longer touch the plan the second one holds
    expect(await store.setStage(id, runId!, 'signals')).toBe(false);
    await store.finish(id, runId!, false, 'late');
    expect(await store.getPlan(id)).toMatchObject({ status: 'researching', stage: 'queued', error: null });
    await store.finish(id, claims[0]!, false, 'why');
    expect(await store.getPlan(id)).toMatchObject({ status: 'failed', error: 'why' });
  });

  it('choosing needs its own topic and no run in progress; a failed or stopped run still allows it', async () => {
    const { id, runId } = await make('2099-01-26'); const t = await topic(id);
    expect(await store.setChosen(id, t)).toBe(false);
    await store.finish(id, runId!, false, 'why');
    expect(await store.setChosen(id, C1)).toBe(false);
    expect(await store.setChosen(id, t)).toBe(true);
    expect(await store.setChosen(id, t)).toBe(true);
    expect(await store.claimForRun(id)).toBeNull();
    const stopped = await make('2099-02-02'); const t2 = await topic(stopped.id);
    await age(stopped.id);
    expect(await store.setChosen(stopped.id, t2)).toBe(true);
    await store.finish(stopped.id, stopped.runId!, false, 'late'); // a late finish cannot undo the choice or leave an error on it
    expect(await store.getPlan(stopped.id)).toMatchObject({ status: 'chosen', chosen_topic_id: t2, error: null });
    expect((await store.latestPlanFor('2099-01-26'))?.id).toBe(id);
  });

  it('the cost cap refuses at the limit, even for two reservations at once', async () => {
    const r = await Promise.allSettled([budget.reserve(null, 'a', 0.6, 1), budget.reserve(null, 'b', 0.6, 1)]);
    expect(r.map((x) => x.status).sort()).toEqual(['fulfilled', 'rejected']);
    const ok = r.find((x): x is PromiseFulfilledResult<string> => x.status === 'fulfilled');
    await budget.settle(ok!.value, 0.1);
    await expect(budget.reserve(null, 'c', 0.6, 1)).resolves.toEqual(expect.any(String));
  });
});
