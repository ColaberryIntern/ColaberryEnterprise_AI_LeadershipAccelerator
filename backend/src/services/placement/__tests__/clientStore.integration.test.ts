/**
 * CP10.2 against a REAL Postgres (the integration tier): the employer portal's scoping SQL runs as written. Two clients,
 * one learner put forward to both: each client sees only its own candidates, only interviews with its own members, only
 * its own offers; no statement returns the provider link; a sign-in link is spent once even under two redemptions at once.
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts clientStore.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables.
 */
export {};
const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[clientStore.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('employer portal scoping against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let placement: typeof import('../../../db/ensurePlacementSchema');
  let clients: typeof import('../../../db/ensureHireClientSchema');
  let store: typeof import('../clientStore');
  let svc: typeof import('../offerService');
  const ANN = '7fffffff-cccc-4ccc-8ccc-000000000001';
  const BOB = '7fffffff-cccc-4ccc-8ccc-000000000002';
  let A = ''; let B = '';
  const one = async (sql: string): Promise<Record<string, unknown>> => ((await sequelize.query(sql))[0] as Array<Record<string, unknown>>)[0];
  const interview = async (src: string, enrollment: string, contact: string | null, interviewers: string[]) => String((await one(`INSERT INTO placement_interviews
      (enrollment_id, source_event_id, company, position, contact_email, interviewer_emails, state, starts_at, minutes, room_url, room_provider_id)
      VALUES ('${enrollment}', '${src}', 'Co', 'Analyst', ${contact ? `'${contact}'` : 'NULL'}, ARRAY[${interviewers.map((e) => `'${e}'`).join(',')}]::text[],
      'booked', NOW() + INTERVAL '1 day', 30, 'https://zoom.example/j/SECRET', '987654') RETURNING id`)).id);

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    placement = await import('../../../db/ensurePlacementSchema');
    clients = await import('../../../db/ensureHireClientSchema');
    store = await import('../clientStore');
    svc = await import('../offerService');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await sequelize.query('CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY)');
    await sequelize.query('ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS full_name VARCHAR(200)');
    await sequelize.query(`INSERT INTO enrollments (id, full_name) VALUES ('${ANN}', 'Ann Lee'), ('${BOB}', 'Bob Ray') ON CONFLICT DO NOTHING`);
    for (const sql of [...clients.HIRE_CLIENT_SCHEMA_ROLLBACK, ...placement.PLACEMENT_SCHEMA_ROLLBACK]) await sequelize.query(sql);
    await placement.ensurePlacementSchema();
    await clients.ensureHireClientSchema();
    A = String((await one("INSERT INTO hire_clients (name, created_by) VALUES ('Acme', 'test') RETURNING id")).id);
    B = String((await one("INSERT INTO hire_clients (name, created_by) VALUES ('Globex', 'test') RETURNING id")).id);
    await sequelize.query(`INSERT INTO hire_client_members (client_id, email) VALUES ('${A}', 'pat@acme.example'), ('${B}', 'sam@globex.example')`);
    await sequelize.query(`INSERT INTO hire_client_candidates (client_id, enrollment_id, put_forward_by) VALUES ('${A}', '${ANN}', 't'), ('${B}', '${ANN}', 't'), ('${B}', '${BOB}', 't')`);
  });
  afterAll(async () => {
    for (const sql of [...clients.HIRE_CLIENT_SCHEMA_ROLLBACK, ...placement.PLACEMENT_SCHEMA_ROLLBACK]) await sequelize.query(sql);
    await sequelize.close();
  });

  it('candidates: each client sees only the learners put forward to it', async () => {
    expect((await store.clientCandidates(A)).map((c) => c.enrollment_id)).toEqual([ANN]);
    expect((await store.clientCandidates(B)).map((c) => c.enrollment_id).sort()).toEqual([ANN, BOB].sort());
    expect(await store.clientCandidate(A, BOB)).toBeUndefined();
  });

  it('interviews: one learner, two clients: each sees only interviews with its own members (contact or interviewer), never the room link', async () => {
    const forA = await interview('t26:a', ANN, ' Pat@Acme.example ', []);
    const forB = await interview('t26:b', ANN, 'recruiter@agency.example', ['Sam@Globex.example']);
    await interview('t26:none', ANN, 'someone@else.example', []);
    expect((await store.clientInterviews(A)).map((i) => i.id)).toEqual([forA]);
    expect((await store.clientInterviews(B)).map((i) => i.id)).toEqual([forB]);
    expect(await store.clientInterviews(A, forB)).toEqual([]);
    expect(JSON.stringify(await store.clientInterviews(A))).not.toMatch(/SECRET|987654|room_url|room_provider_id/);
  });

  it('offers: each client sees only its own current versions, with the invoice status', async () => {
    const mk = (client: string, key: string) => svc.createOffer({ enrollmentId: ANN, clientId: client, company: 'X', role: 'Analyst', pay: { basis: 'yearly', salaryCents: 105_000_00 },
      feeAgreed: true, agreedBy: 'hire_client_member:t', agreementTextVersion: 'v1', createdBy: 'hire_client_member:t' }, key, 1.1);
    const a = await mk(A, '7fffffff-dddd-4ddd-8ddd-000000000001');
    await mk(B, '7fffffff-dddd-4ddd-8ddd-000000000002');
    if (a.status !== 'ok') throw new Error(a.status);
    await svc.respondToOffer(ANN, a.offer.offer_group_id, 1, 'accept');
    const seen = await store.clientOffers(A);
    expect(seen.map((o) => [o.id, o.invoice_status, Number(o.fee_cents)])).toEqual([[a.offer.id, 'not_invoiced', 115_500_00]]);
    expect((await store.clientOffers(B)).every((o) => o.id !== a.offer.id)).toBe(true);
    // editOffer scoped to the client (T25 carry): B cannot add a version to A's offer group.
    const edit = await svc.editOffer(a.offer.offer_group_id, { enrollmentId: ANN, clientId: B, company: 'X', role: 'Analyst', pay: { basis: 'yearly', salaryCents: 1_00 },
      feeAgreed: true, agreedBy: 'b', agreementTextVersion: 'v1', createdBy: 'b' }, '7fffffff-dddd-4ddd-8ddd-000000000003', 1.1);
    expect(edit).toEqual({ status: 'not_found' });
  });

  it('a sign-in link is spent once: two redemptions at once, one email back; an expired link is refused', async () => {
    const always = () => true;
    await store.reserveSigninToken('pat@acme.example', 'a'.repeat(64), new Date(Date.now() + 3_600_000), always);
    const both = await Promise.all([store.consumeSigninToken('a'.repeat(64)), store.consumeSigninToken('a'.repeat(64))]);
    expect(both.filter(Boolean)).toEqual(['pat@acme.example']);
    await store.reserveSigninToken('pat@acme.example', 'b'.repeat(64), new Date(Date.now() - 1000), always);
    expect(await store.consumeSigninToken('b'.repeat(64))).toBeUndefined();
    // The rate limit is atomic with the insert: two reservations at once, each allowed only when no earlier request
    // exists, make ONE row (the advisory lock makes the second wait and then see the first).
    const firstOnly = (recent: Date[]) => recent.length === 0;
    const pair = await Promise.all([store.reserveSigninToken('sam@globex.example', 'c'.repeat(64), new Date(Date.now() + 3_600_000), firstOnly),
      store.reserveSigninToken('sam@globex.example', 'd'.repeat(64), new Date(Date.now() + 3_600_000), firstOnly)]);
    expect(pair.filter(Boolean)).toHaveLength(1);
    expect(Number((await one("SELECT COUNT(*)::int AS n FROM hire_client_signin_tokens WHERE email = 'sam@globex.example'")).n)).toBe(1);
    expect((await store.membershipsFor('pat@acme.example')).map((m) => [m.client_id, m.client_name])).toEqual([[A, 'Acme']]);
  });

  it('card readiness (CP10.2b): the latest GENERAL readiness per given id, as written; another learner and interview rows ignored', async () => {
    const { latestReadiness } = await import('../clientCards');
    const { NO_INTERVIEW } = await import('../../../db/ensureCareerPrepSchema');
    // The real table shape (ensureCareerPrepSchema); created here only when this database does not have it yet.
    await sequelize.query(`CREATE TABLE IF NOT EXISTS prep_readiness_daily (enrollment_id UUID NOT NULL, interview_id UUID NOT NULL DEFAULT '${NO_INTERVIEW}',
      date DATE NOT NULL, readiness NUMERIC(5,2), skills JSONB NOT NULL DEFAULT '{}'::jsonb, PRIMARY KEY (enrollment_id, interview_id, date))`);
    const iv = '7fffffff-eeee-4eee-8eee-000000000001';
    await sequelize.query(`DELETE FROM prep_readiness_daily WHERE enrollment_id IN ('${ANN}', '${BOB}')`);
    await sequelize.query(`INSERT INTO prep_readiness_daily (enrollment_id, interview_id, date, readiness) VALUES
      ('${ANN}', '${NO_INTERVIEW}', '2026-11-20', 60.4), ('${ANN}', '${NO_INTERVIEW}', '2026-11-21', 71.6), ('${ANN}', '${iv}', '2026-11-22', 99),
      ('${ANN}', '${NO_INTERVIEW}', '2026-11-22', NULL), ('${BOB}', '${NO_INTERVIEW}', '2026-11-21', 55)`);
    expect(await latestReadiness([ANN])).toEqual(new Map([[ANN, 72]]));
    expect(await latestReadiness([ANN, BOB])).toEqual(new Map([[ANN, 72], [BOB, 55]]));
    await sequelize.query(`DELETE FROM prep_readiness_daily WHERE enrollment_id IN ('${ANN}', '${BOB}')`);
  });

  it('the database refuses a mixed-case member email and a second identical membership', async () => {
    const upper = await sequelize.query(`INSERT INTO hire_client_members (client_id, email) VALUES ('${A}', 'Pat@acme.example')`).then(() => null, (e: unknown) => e);
    expect(upper).toMatchObject({ parent: { code: '23514' } });
    const dup = await sequelize.query(`INSERT INTO hire_client_members (client_id, email) VALUES ('${A}', 'pat@acme.example')`).then(() => null, (e: unknown) => e);
    expect(dup).toMatchObject({ parent: { code: '23505' } });
  });
});
