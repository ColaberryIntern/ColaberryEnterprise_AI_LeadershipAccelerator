/**
 * CP9.2 against a REAL Postgres (the integration tier): the replay store's statements run as written on the real
 * placement schema. The consent rule (CONSENTED) in the scan and under the row lock, the claim (one winner, backoff,
 * cap), the finish (only the claiming attempt), the employer statement (no feedback columns) and UNIQUE (interview_id).
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts replayStore.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables.
 */
export {};
const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[replayStore.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('the replay store against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let schema: typeof import('../../../db/ensurePlacementSchema');
  let store: typeof import('../replayStore');
  const E1 = '7fffffff-dddd-4ddd-8ddd-dddddddddddd';
  const E2 = '7fffffff-cccc-4ccc-8ccc-cccccccccccc';
  const one = async (sql: string): Promise<Record<string, unknown>> => ((await sequelize.query(sql))[0] as Array<Record<string, unknown>>)[0];
  let n = 0;
  async function interview(over: { state?: string; consent?: string | null; recMeeting?: string; decisions?: Array<[string, string]>; enrollment?: string } = {}): Promise<string> {
    n += 1;
    const consent = over.consent === undefined ? 'on' : over.consent;
    const r = await one(`INSERT INTO placement_interviews (enrollment_id, source_event_id, company, state, starts_at, minutes, room_provider_id, room_url, recording_consent, recording_meeting_id)
      VALUES ('${over.enrollment ?? E1}', 'replay:${n}', 'Acme', '${over.state ?? 'done'}', '2026-11-20T15:00:00Z', 30, 'mtg-${n}', 'https://zoom.example/j/SECRET',
        ${consent === null ? 'NULL' : `'${consent}'`}, '${over.recMeeting ?? `mtg-${n}`}') RETURNING id`);
    const id = String(r.id);
    for (const [party, decision] of over.decisions ?? [['candidate', 'consent'], ['employer', 'consent']]) {
      await sequelize.query(`INSERT INTO interview_consents (interview_id, party, party_ref, decision) VALUES ('${id}', '${party}', '${party}', '${decision}')`);
    }
    return id;
  }
  const due = async () => (await store.listDue(20)).map((r) => String(r.id));

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    schema = await import('../../../db/ensurePlacementSchema');
    store = await import('../replayStore');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await sequelize.query('CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY)');
    await sequelize.query('ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS full_name VARCHAR(200)');
    await sequelize.query(`INSERT INTO enrollments (id, full_name) VALUES ('${E1}', 'Ann Lee'), ('${E2}', 'Bob Park') ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name`);
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    await schema.ensurePlacementSchema();
  });
  afterAll(async () => {
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    await sequelize.close();
  });

  it('the scan lists ONLY held interviews recorded with both sides\' consent for the meeting they were held in', async () => {
    const ok = await interview();
    const declined = await interview({ consent: 'declined', decisions: [['candidate', 'consent'], ['employer', 'decline']] });
    const partial = await interview({ decisions: [['candidate', 'consent']] });
    const unavailable = await interview({ consent: 'unavailable' });
    const rebooked = await interview({ recMeeting: 'an-old-meeting' });
    const booked = await interview({ state: 'booked' });
    const list = await due();
    expect(list).toContain(ok);
    for (const id of [declined, partial, unavailable, rebooked, booked]) expect(list).not.toContain(id);
    for (const id of [declined, partial, unavailable, rebooked, booked]) expect(await store.claim(id)).toBeNull();
  });

  it('two claims at the same moment: one wins (attempt 1, with the learner\'s name); a third inside the backoff gets nothing', async () => {
    const id = await interview();
    const [a, b] = await Promise.all([store.claim(id), store.claim(id)]);
    const won = [a, b].filter(Boolean);
    expect(won).toHaveLength(1);
    expect(won[0]).toMatchObject({ interviewId: id, enrollmentId: E1, fullName: 'Ann Lee', attempt: 1 });
    expect(await store.claim(id)).toBeNull();
    expect(await due()).not.toContain(id);
    await sequelize.query(`UPDATE interview_replays SET last_attempt_at = NOW() - INTERVAL '16 minutes' WHERE interview_id = '${id}'`);
    expect(await due()).toContain(id);
    expect((await store.claim(id))?.attempt).toBe(2);
  });

  it('at the attempt cap a waiting row is never claimed again', async () => {
    const id = await interview();
    await store.claim(id);
    await sequelize.query(`UPDATE interview_replays SET attempts = ${store.MAX_ATTEMPTS}, last_attempt_at = NOW() - INTERVAL '30 days' WHERE interview_id = '${id}'`);
    expect(await due()).not.toContain(id);
    expect(await store.claim(id)).toBeNull();
  });

  it('only the claiming attempt finishes; a finished replay is never claimed again; the recording is served only then', async () => {
    const id = await interview();
    const c1 = (await store.claim(id))!;
    expect(await store.storedRecording(id)).toBeNull();
    const rec = { downloadUrl: 'https://zoom.example/rec/x', sizeBytes: 4, providerFileId: 'f' };
    expect(await store.finish({ ...c1, attempt: 9 }, { status: 'scored', reason: null, questions: [], score: 70, recording: rec })).toBe(false);
    expect(await store.finish(c1, { status: 'scored', reason: null, questions: [], score: 70, recording: rec })).toBe(true);
    expect(await store.finish(c1, { status: 'unavailable', reason: 'x', questions: [], score: null, recording: null })).toBe(false);
    await sequelize.query(`UPDATE interview_replays SET last_attempt_at = NOW() - INTERVAL '30 days' WHERE interview_id = '${id}'`);
    expect(await store.claim(id)).toBeNull();
    expect(await store.storedRecording(id)).toEqual(rec);
    const row = await one(`SELECT status, scores FROM interview_replays WHERE interview_id = '${id}'`);
    expect(row).toMatchObject({ status: 'scored', scores: { score: 70 } });
  });

  it('keepWaiting keeps a found recording location for the next attempt', async () => {
    const id = await interview();
    const c = (await store.claim(id))!;
    await store.keepWaiting(c, { downloadUrl: 'https://zoom.example/rec/y', sizeBytes: null, providerFileId: null });
    await store.keepWaiting(c, null);
    expect((await one(`SELECT recording FROM interview_replays WHERE interview_id = '${id}'`)).recording).toMatchObject({ downloadUrl: 'https://zoom.example/rec/y' });
  });

  it('the candidate statement is scoped to their enrollment; the employer statement carries no feedback columns', async () => {
    const id = await interview({ enrollment: E2 });
    const c = (await store.claim(id))!;
    await store.finish(c, { status: 'scored', reason: null, questions: [], score: 66, recording: null });
    expect(await store.candidateReplayRow(E1, id)).toBeUndefined();
    expect(await store.candidateReplayRow(E2, id)).toMatchObject({ r_status: 'scored', consented: true, rec_current: true, scores: { score: 66 } });
    const emp = (await store.employerReplayRow(id))!;
    expect(emp).toMatchObject({ r_status: 'scored', consented: true });
    for (const k of ['turns', 'scores', 'room_url', 'room_provider_id']) expect(Object.keys(emp)).not.toContain(k);
  });

  it('the database itself refuses a second replay for one interview (UNIQUE (interview_id))', async () => {
    const id = await interview();
    await store.claim(id);
    const err = await sequelize.query(`INSERT INTO interview_replays (interview_id, enrollment_id, meeting_id, status) VALUES ('${id}', '${E1}', 'm', 'waiting')`).then(() => null, (e: unknown) => e);
    expect(err).toMatchObject({ name: 'SequelizeUniqueConstraintError', parent: { code: '23505' } });
  });
});
