/**
 * CP10.1 against a REAL Postgres (the integration tier): the offers' statements and constraints run as written, through
 * the real offerService: one invoice record under two accepts at once, versions under the row lock, one current version
 * per group, one row per client key, and the pay shape CHECK.
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts offerStore.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables.
 */
export {};
const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[offerStore.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('offers and invoice records against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let schema: typeof import('../../../db/ensurePlacementSchema');
  let svc: typeof import('../offerService');
  const E1 = '7fffffff-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const K = (n: number) => `bbbbbbbb-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
  const one = async (sql: string): Promise<Record<string, unknown>> => ((await sequelize.query(sql))[0] as Array<Record<string, unknown>>)[0];
  const input = (over: Record<string, unknown> = {}) => ({ enrollmentId: E1, clientId: null, company: 'Acme', role: 'Analyst',
    pay: { basis: 'yearly' as const, salaryCents: 105_000_00 }, feeAgreed: true,
    agreedBy: 'pat@acme.example', agreementTextVersion: 'f7-fee-2026-11', createdBy: 'test', ...over });
  const COLS = 'first_year_cents, fee_rate_bp, fee_cents, fee_agreed_at, agreed_by, agreement_text_version, status, created_by';
  const made = async (n: number) => { const r = await svc.createOffer(input(), K(n), 1.1); if (r.status !== 'ok') throw new Error(r.status); return r.offer; };

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    schema = await import('../../../db/ensurePlacementSchema');
    svc = await import('../offerService');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await sequelize.query('CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY)');
    await sequelize.query(`INSERT INTO enrollments (id) VALUES ('${E1}') ON CONFLICT DO NOTHING`);
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    await schema.ensurePlacementSchema();
  });
  afterAll(async () => {
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    await sequelize.close();
  });

  it('two accepts at the same moment: ONE invoice record, with the stored fee', async () => {
    const o = await made(1);
    const rs = await Promise.all([svc.respondToOffer(E1, o.offer_group_id, 1, 'accept'), svc.respondToOffer(E1, o.offer_group_id, 1, 'accept')]);
    expect(rs.map((r) => r.status)).toEqual(['ok', 'ok']);
    expect(await one(`SELECT COUNT(*)::int AS n, MIN(fee_cents)::bigint AS fee FROM placement_invoices WHERE offer_id = '${o.id}'`)).toEqual({ n: 1, fee: '11550000' });
  });

  it('the same Send twice at once stores one offer (client_key UNIQUE)', async () => {
    const [a, b] = await Promise.all([svc.createOffer(input(), K(2), 1.1), svc.createOffer(input(), K(2), 1.1)].map((p) => p.catch((e: unknown) => e)));
    expect(Number((await one(`SELECT COUNT(*)::int AS n FROM placement_offers WHERE client_key = '${K(2)}'`)).n)).toBe(1);
    expect([a, b].map((r) => [(r as { status?: string }).status, (r as { replay?: boolean }).replay]).sort()).toEqual([['ok', false], ['ok', true]]);
  });

  it('an edit supersedes under the lock: one current version; two concurrent edits make versions 2 and 3', async () => {
    const o = await made(3);
    await Promise.all([svc.editOffer(o.offer_group_id, input(), K(4), 1.1), svc.editOffer(o.offer_group_id, input(), K(5), 1.1)]);
    const rows = (await sequelize.query(`SELECT version, superseded_at IS NULL AS current FROM placement_offers WHERE offer_group_id = '${o.offer_group_id}' ORDER BY version`))[0];
    expect(rows).toEqual([{ version: 1, current: false }, { version: 2, current: false }, { version: 3, current: true }]);
  });

  it('the database refuses a second current version, a second invoice and a mixed pay shape', async () => {
    const o = await made(6);
    const dup = await sequelize.query(`INSERT INTO placement_offers (offer_group_id, version, client_key, enrollment_id, company, role, pay_basis, salary_cents,
      ${COLS}) VALUES ('${o.offer_group_id}', 9, '${K(7)}', '${E1}', 'A', 'R', 'yearly', 100, 100, 11000, 110, NOW(), 'p', 'v', 'sent', 't')`).then(() => null, (e: unknown) => e);
    expect(dup).toMatchObject({ name: 'SequelizeUniqueConstraintError', parent: { code: '23505', constraint: 'uq_placement_offers_current' } });
    await svc.respondToOffer(E1, o.offer_group_id, 1, 'accept');
    const inv = await sequelize.query(`INSERT INTO placement_invoices (offer_id, enrollment_id, fee_cents) VALUES ('${o.id}', '${E1}', 1)`).then(() => null, (e: unknown) => e);
    expect(inv).toMatchObject({ name: 'SequelizeUniqueConstraintError', parent: { code: '23505' } });
    const mixed = await sequelize.query(`INSERT INTO placement_offers (offer_group_id, version, client_key, enrollment_id, company, role, pay_basis, salary_cents, hourly_rate_cents,
      ${COLS}) VALUES (gen_random_uuid(), 1, '${K(8)}', '${E1}', 'A', 'R', 'yearly', 100, 100, 100, 11000, 110, NOW(), 'p', 'v', 'sent', 't')`).then(() => null, (e: unknown) => e);
    expect(mixed).toMatchObject({ parent: { code: '23514', constraint: 'ck_placement_offers_pay' } });
  });

  it('stores who agreed and the agreement text version; refuses a 99 cent salary or rate and a missing agreed_by', async () => {
    const o = await made(10);
    expect(await one(`SELECT agreed_by, agreement_text_version FROM placement_offers WHERE id = '${o.id}'`)).toEqual({ agreed_by: 'pat@acme.example', agreement_text_version: 'f7-fee-2026-11' });
    const raw = (n: number, pay: string, agreedBy: string) => sequelize.query(`INSERT INTO placement_offers (offer_group_id, version, client_key, enrollment_id, company, role,
      pay_basis, salary_cents, hourly_rate_cents, hours_per_week, ${COLS}) VALUES (gen_random_uuid(), 1, '${K(n)}', '${E1}', 'A', 'R', ${pay}, 100, 11000, 110, NOW(), ${agreedBy}, 'v', 'sent', 't')`)
      .then(() => null, (e: unknown) => e);
    expect(await raw(11, `'yearly', 99, NULL, NULL`, `'p'`)).toMatchObject({ parent: { code: '23514' } });
    expect(await raw(12, `'hourly', NULL, 99, 40`, `'p'`)).toMatchObject({ parent: { code: '23514' } });
    expect(await raw(14, `'yearly', 100, NULL, NULL`, 'NULL')).toMatchObject({ parent: { code: '23502' } });
    expect(await raw(15, `'yearly', 100, NULL, NULL`, `'p'`)).toBeNull(); // the $1 floor itself is allowed
  });
});
