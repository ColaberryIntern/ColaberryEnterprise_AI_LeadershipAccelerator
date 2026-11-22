/**
 * CP10.3 against a REAL Postgres (the integration tier): the follow-up SQL runs as written. Scoped reads and cancel; the
 * scheduler's claim taken once under two passes at once; a row finishes once; held rows; the send-time context (reply,
 * put forward, sender); an engagement event counted once, only for a sent follow-up, link versus other.
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts followUpStore.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables.
 */
export {};
const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[followUpStore.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('employer follow-ups against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let placement: typeof import('../../../db/ensurePlacementSchema');
  let clients: typeof import('../../../db/ensureHireClientSchema');
  let schema: typeof import('../../../db/ensureEmployerFollowUpSchema');
  let store: typeof import('../followUpStore');
  const ANN = '7fffffff-ffff-4fff-8fff-000000000001';
  let A = ''; let B = ''; let PAT = '';
  let n = 0;
  const one = async (sql: string): Promise<Record<string, unknown>> => ((await sequelize.query(sql))[0] as Array<Record<string, unknown>>)[0];
  const id = () => `7fffffff-ffff-4fff-8fff-1${String((n += 1)).padStart(11, '0')}`;
  const add = async (over: Partial<import('../followUpStore').NewFollowUp> = {}) => {
    const f = { id: id(), clientId: A, memberId: PAT, enrollmentId: ANN, offerId: null, subject: 'Next steps', body: 'Hi {first}: {booking link}',
      bookingLink: 'https://cal.example/pat', template: 'next_steps' as const, sendOn: new Date(Date.now() - 60_000), onlyIf: 'always' as const, createdBy: 't', ...over };
    expect(await store.insertFollowUp(f)).toBe(true);
    return f.id;
  };
  const status = async (fid: string) => (await one(`SELECT status, status_reason, attempts, opens, clicks FROM employer_follow_ups WHERE id = '${fid}'`));

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    placement = await import('../../../db/ensurePlacementSchema');
    clients = await import('../../../db/ensureHireClientSchema');
    schema = await import('../../../db/ensureEmployerFollowUpSchema');
    store = await import('../followUpStore');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await sequelize.query('CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY)');
    await sequelize.query('ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS full_name VARCHAR(200)');
    await sequelize.query('ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS email VARCHAR(255)');
    await sequelize.query(`INSERT INTO enrollments (id, full_name, email) VALUES ('${ANN}', 'Ann Lee', 'ann@learner.example') ON CONFLICT DO NOTHING`);
    for (const sql of [...schema.EMPLOYER_FOLLOW_UP_SCHEMA_ROLLBACK, ...clients.HIRE_CLIENT_SCHEMA_ROLLBACK, ...placement.PLACEMENT_SCHEMA_ROLLBACK]) await sequelize.query(sql);
    await placement.ensurePlacementSchema();
    await clients.ensureHireClientSchema();
    await schema.ensureEmployerFollowUpSchema();
    A = String((await one("INSERT INTO hire_clients (name, created_by) VALUES ('Acme', 'test') RETURNING id")).id);
    B = String((await one("INSERT INTO hire_clients (name, created_by) VALUES ('Globex', 'test') RETURNING id")).id);
    PAT = String((await one(`INSERT INTO hire_client_members (client_id, email, display_name) VALUES ('${A}', 'pat@acme.example', 'Pat Kim') RETURNING id`)).id);
    await sequelize.query(`INSERT INTO hire_client_candidates (client_id, enrollment_id, put_forward_by) VALUES ('${A}', '${ANN}', 't')`);
  });
  afterAll(async () => {
    for (const sql of [...schema.EMPLOYER_FOLLOW_UP_SCHEMA_ROLLBACK, ...clients.HIRE_CLIENT_SCHEMA_ROLLBACK, ...placement.PLACEMENT_SCHEMA_ROLLBACK]) await sequelize.query(sql);
    await sequelize.close();
  });

  it('the id is the idempotency key; reads and cancel are scoped to the client', async () => {
    const fid = await add();
    expect(await store.insertFollowUp({ id: fid, clientId: B, memberId: PAT, enrollmentId: ANN, offerId: null, subject: 'x', body: 'y', bookingLink: null,
      template: 'custom', sendOn: new Date(), onlyIf: 'always', createdBy: 't' })).toBe(false);
    expect((await store.clientFollowUps(A, fid)).map((r) => [r.id, r.full_name, r.replied])).toEqual([[fid, 'Ann Lee', false]]);
    expect(await store.clientFollowUps(B, fid)).toEqual([]);
    expect(await store.cancelFollowUp(B, fid)).toBe(false);
    expect(await store.cancelFollowUp(A, fid)).toBe(true);
    expect(await store.cancelFollowUp(A, fid)).toBe(false);
    expect(await status(fid)).toMatchObject({ status: 'cancelled', status_reason: 'employer' });
  });

  it('two passes at once claim a due row once; a row finishes once; a retry waits for next_attempt_at', async () => {
    await sequelize.query("UPDATE employer_follow_ups SET status = 'cancelled' WHERE status IN ('scheduled','sending')");
    const fid = await add();
    const now = new Date(); const stale = new Date(now.getTime() - 15 * 60_000);
    const [p, q] = await Promise.all([store.claimDue(now, stale, 20), store.claimDue(now, stale, 20)]);
    expect([...p, ...q]).toEqual([{ id: fid, attempts: 1 }]);
    expect(await store.finish(fid, { status: 'scheduled', nextAttemptAt: new Date(now.getTime() + 5 * 60_000), errorClass: 'TimeoutError' })).toBe(true);
    expect(await store.finish(fid, { status: 'failed', reason: 'X' })).toBe(false);
    expect(await store.claimDue(new Date(now.getTime() + 4 * 60_000), stale, 20)).toEqual([]);
    expect(await store.claimDue(new Date(now.getTime() + 5 * 60_000), stale, 20)).toEqual([{ id: fid, attempts: 2 }]);
    // A row left `sending` (a pass that died) is claimed again only once it is stale.
    expect(await store.claimDue(new Date(now.getTime() + 6 * 60_000), new Date(now.getTime() - 60_000), 20)).toEqual([]);
    expect(await store.claimDue(new Date(now.getTime() + 30 * 60_000), new Date(now.getTime() + 15 * 60_000), 20)).toEqual([{ id: fid, attempts: 3 }]);
    expect(await store.finish(fid, { status: 'sent', messageId: '<m@x>', to: 'ann@learner.example', link: 'https://cal.example/pat', now })).toBe(true);
    expect(await status(fid)).toMatchObject({ status: 'sent', attempts: 3 });
  });

  it('held: due rows only, never a later one', async () => {
    const due = await add(); const later = await add({ sendOn: new Date(Date.now() + 3_600_000) });
    const stuck = await add(); const fresh = await add();
    await sequelize.query(`UPDATE employer_follow_ups SET status = 'sending', last_attempt_at = NOW() - INTERVAL '20 minutes' WHERE id = '${stuck}'`);
    await sequelize.query(`UPDATE employer_follow_ups SET status = 'sending', last_attempt_at = NOW() WHERE id = '${fresh}'`);
    const held = await store.holdDue(new Date(), new Date(Date.now() - 15 * 60_000), 50);
    expect(held).toEqual(expect.arrayContaining([due, stuck]));
    expect((await status(later)).status).toBe('scheduled');
    expect((await status(fresh)).status).toBe('sending'); // in flight right now: not touched
    expect(await status(due)).toMatchObject({ status: 'held', status_reason: 'employer_mail_off' });
    expect((await status(stuck)).status).toBe('held'); // a stale send is never resumed after an off-to-on flip
  });

  it('send context: the address now, the sender, put forward, and a reply after scheduling', async () => {
    const fid = await add({ onlyIf: 'no_reply' });
    const c1 = await store.sendContext(fid);
    expect(c1).toMatchObject({ to_email: 'ann@learner.example', member_email: 'pat@acme.example', display_name: 'Pat Kim', company: 'Acme', put_forward: true, replied: false });
    await sequelize.query(`INSERT INTO placement_offers (offer_group_id, version, client_key, enrollment_id, client_id, company, role, pay_basis, salary_cents, first_year_cents,
      fee_rate_bp, fee_cents, fee_agreed_at, agreed_by, agreement_text_version, status, decided_at, created_by)
      VALUES (gen_random_uuid(), 1, gen_random_uuid(), '${ANN}', '${B}', 'Globex', 'Analyst', 'yearly', 100, 100, 11000, 110, NOW(), 't', 'v', 'accepted', NOW() + INTERVAL '1 second', 't')`);
    expect((await store.sendContext(fid))?.replied).toBe(false); // another client's offer is not a reply to this one
    await sequelize.query(`INSERT INTO placement_offers (offer_group_id, version, client_key, enrollment_id, client_id, company, role, pay_basis, salary_cents, first_year_cents,
      fee_rate_bp, fee_cents, fee_agreed_at, agreed_by, agreement_text_version, status, decided_at, created_by)
      VALUES (gen_random_uuid(), 1, gen_random_uuid(), '${ANN}', '${A}', 'Acme', 'Analyst', 'yearly', 100, 100, 11000, 110, NOW(), 't', 'v', 'declined', NOW() + INTERVAL '1 second', 't')`);
    expect((await store.sendContext(fid))?.replied).toBe(true);
    await sequelize.query(`DELETE FROM hire_client_members WHERE id = '${PAT}'`);
    expect(await store.sendContext(fid)).toMatchObject({ member_email: null });
    PAT = String((await one(`INSERT INTO hire_client_members (client_id, email, display_name) VALUES ('${A}', 'pat@acme.example', 'Pat Kim') RETURNING id`)).id);
  });

  it('engagement: counted once per event key, only once sent; a click on its link under "link", else "other"', async () => {
    const fid = await add();
    expect(await store.recordEngagement('a'.repeat(64), fid, 'open', '')).toBe(false); // not sent yet
    const now = new Date();
    await store.claimDue(now, new Date(now.getTime() - 15 * 60_000), 50);
    await store.finish(fid, { status: 'sent', messageId: null, to: 'ann@learner.example', link: 'https://cal.example/pat', now });
    expect(await store.recordEngagement('b'.repeat(64), fid, 'open', '')).toBe(true);
    expect(await store.recordEngagement('b'.repeat(64), fid, 'open', '')).toBe(false);
    expect(await status(fid)).toMatchObject({ status: 'opened', opens: 1 });
    expect(await store.recordEngagement('c'.repeat(64), fid, 'click', 'https://cal.example/pat')).toBe(true);
    expect(await store.recordEngagement('d'.repeat(64), fid, 'click', 'https://other.example/')).toBe(true);
    expect(await store.recordEngagement('e'.repeat(64), fid, 'open', '')).toBe(true);
    expect(await status(fid)).toMatchObject({ status: 'clicked', opens: 2, clicks: { link: 1, other: 1 } });
  });

  it('the database refuses an unknown status, template or an empty body', async () => {
    const fid = await add();
    const bad = (sql: string) => sequelize.query(sql).then(() => null, (e: unknown) => e);
    expect(await bad(`UPDATE employer_follow_ups SET status = 'bogus' WHERE id = '${fid}'`)).toMatchObject({ parent: { code: '23514' } });
    expect(await bad(`UPDATE employer_follow_ups SET template = 'bogus' WHERE id = '${fid}'`)).toMatchObject({ parent: { code: '23514' } });
    expect(await bad(`UPDATE employer_follow_ups SET body = '' WHERE id = '${fid}'`)).toMatchObject({ parent: { code: '23514' } });
  });
});
