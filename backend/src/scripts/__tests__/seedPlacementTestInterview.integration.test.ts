/**
 * Loop T33 against a REAL Postgres (the integration tier): the test-records seed creates its interview, employer account,
 * member and put-forward once; --remove deletes, in one transaction in foreign-key order, everything hanging off the
 * tagged client and interview (follow-ups and their events, invoice records, offers, put-forwards, sign-in tokens, member,
 * client, interview events, prep row, interview) and NOTHING of an untagged client (its offer and invoice stay).
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts seedPlacementTestInterview.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables.
 */
export {};
jest.mock('../../services/careerPrep/careerPrepFlag', () => ({ careerPrepEnrollmentIds: async () => ['7fffffff-ffff-4fff-8fff-fffffffffff1'] }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[seedPlacementTestInterview.integration] SKIPPED: no DATABASE_URL. See the header.');
}
jest.setTimeout(120_000);

describeIfDb('the test-records seed against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let seed: typeof import('../seedPlacementTestInterview');
  const E = '7fffffff-ffff-4fff-8fff-fffffffffff1';
  const rows = async <T>(sql: string, replacements: Record<string, unknown> = {}): Promise<T[]> => (await sequelize.query(sql, { replacements }))[0] as T[];
  const count = async (sql: string, replacements: Record<string, unknown> = {}) => Number((await rows<{ n: string }>(sql, replacements))[0].n);
  const offer = async (clientId: string, status: string) => (await rows<{ id: string }>(`INSERT INTO placement_offers (offer_group_id, version, client_key, enrollment_id,
      client_id, company, role, pay_basis, salary_cents, first_year_cents, fee_rate_bp, fee_cents, fee_agreed_at, agreed_by, agreement_text_version, status, created_by)
    VALUES (gen_random_uuid(), 1, gen_random_uuid(), :e, :c, 'Co', 'Analyst', 'yearly', 10000000, 10000000, 11000, 11000000, NOW(), 'x', 'v1', :s, 'x') RETURNING id`,
  { e: E, c: clientId, s: status }))[0].id;

  beforeAll(async () => {
    ({ sequelize } = await import('../../config/database'));
    const placement = await import('../../db/ensurePlacementSchema');
    const hire = await import('../../db/ensureHireClientSchema');
    const fu = await import('../../db/ensureEmployerFollowUpSchema');
    seed = await import('../seedPlacementTestInterview');
    for (const m of ['log', 'warn', 'error'] as const) jest.spyOn(console, m).mockImplementation(() => undefined);
    await sequelize.query('CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY)');
    await sequelize.query(`INSERT INTO enrollments (id) VALUES ('${E}') ON CONFLICT DO NOTHING`);
    await sequelize.query('CREATE TABLE IF NOT EXISTS career_interviews (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), placement_interview_id UUID)');
    for (const sql of [...fu.EMPLOYER_FOLLOW_UP_SCHEMA_ROLLBACK, ...placement.PLACEMENT_SCHEMA_ROLLBACK, ...hire.HIRE_CLIENT_SCHEMA_ROLLBACK]) await sequelize.query(sql);
    await hire.ensureHireClientSchema();
    await placement.ensurePlacementSchema();
    await fu.ensureEmployerFollowUpSchema();
  });
  afterAll(async () => { await sequelize.close(); });

  it('apply creates each record once; remove deletes exactly the tagged records and leaves an untagged client whole; both are idempotent', async () => {
    const args = seed.parseArgs(['--enrollment', E, '--employer-email', 'ali+emp@example.com', '--interviewer-email', 'ali+iv@example.com', '--apply']);
    const first = await seed.create(args);
    const again = await seed.create(args);
    expect(first.changed).toBe(true);
    expect(again).toMatchObject({ changed: false, interviewId: first.interviewId, clientId: first.clientId });
    const c = first.clientId as string; const iv = first.interviewId as string;
    expect(await count('SELECT count(*) n FROM hire_client_members WHERE client_id = :c', { c })).toBe(1);
    expect(await count('SELECT count(*) n FROM hire_client_candidates WHERE client_id = :c', { c })).toBe(1);

    // What testing leaves behind on the tagged client: an accepted offer + invoice record, a follow-up + event, a token, a prep row.
    const o = await offer(c, 'accepted');
    await sequelize.query("INSERT INTO placement_invoices (offer_id, enrollment_id, fee_cents) VALUES (:o, :e, 11000000)", { replacements: { o, e: E } });
    const fid = (await rows<{ id: string }>(`INSERT INTO employer_follow_ups (client_id, enrollment_id, offer_id, subject, body, template, send_on, only_if, created_by)
      VALUES (:c, :e, :o, 'Hi', 'Hello', 'thank_you', NOW(), 'always', 'x') RETURNING id`, { c, e: E, o }))[0].id;
    await sequelize.query("INSERT INTO employer_follow_up_events (follow_up_id, kind) VALUES (:f, 'click')", { replacements: { f: fid } });
    await sequelize.query(`INSERT INTO hire_client_signin_tokens (email, token_hash, expires_at) VALUES ('ali+emp@example.com', repeat('a', 64), NOW())`);
    await sequelize.query("INSERT INTO career_interviews (placement_interview_id) VALUES (:iv)", { replacements: { iv } });
    // An UNTAGGED client with its own offer and invoice record.
    const other = (await rows<{ id: string }>("INSERT INTO hire_clients (name, created_by) VALUES ('Real Co', 'staff-1') RETURNING id"))[0].id;
    const ro = await offer(other, 'accepted');
    await sequelize.query("INSERT INTO placement_invoices (offer_id, enrollment_id, fee_cents) VALUES (:o, :e, 11000000)", { replacements: { o: ro, e: E } });

    const rm = seed.parseArgs(['--enrollment', E, '--remove', '--apply']);
    expect(await seed.remove(rm)).toMatchObject({ changed: true, clientId: c, interviewId: iv });
    for (const [table, sql] of [
      ['employer_follow_up_events', 'SELECT count(*) n FROM employer_follow_up_events WHERE follow_up_id = :f'], ['employer_follow_ups', 'SELECT count(*) n FROM employer_follow_ups WHERE client_id = :c'],
      ['placement_invoices', 'SELECT count(*) n FROM placement_invoices WHERE offer_id = :o'], ['placement_offers', 'SELECT count(*) n FROM placement_offers WHERE client_id = :c'],
      ['hire_client_candidates', 'SELECT count(*) n FROM hire_client_candidates WHERE client_id = :c'], ['hire_client_signin_tokens', "SELECT count(*) n FROM hire_client_signin_tokens WHERE email = 'ali+emp@example.com'"],
      ['hire_client_members', 'SELECT count(*) n FROM hire_client_members WHERE client_id = :c'], ['hire_clients', 'SELECT count(*) n FROM hire_clients WHERE id = :c'],
      ['placement_events', 'SELECT count(*) n FROM placement_events WHERE subject_id IN (:iv, :o)'], ['career_interviews', 'SELECT count(*) n FROM career_interviews WHERE placement_interview_id = :iv'],
      ['placement_interviews', 'SELECT count(*) n FROM placement_interviews WHERE id = :iv'],
    ] as Array<[string, string]>) expect([table, await count(sql, { f: fid, c, o, iv })]).toEqual([table, 0]);
    expect(await count('SELECT count(*) n FROM placement_offers WHERE id = :o', { o: ro })).toBe(1);
    expect(await count('SELECT count(*) n FROM placement_invoices WHERE offer_id = :o', { o: ro })).toBe(1);
    expect(await count('SELECT count(*) n FROM hire_clients WHERE id = :c', { c: other })).toBe(1);
    expect(await seed.remove(rm)).toMatchObject({ changed: false, clientId: null, interviewId: null });
  });
});
