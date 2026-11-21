/**
 * CP6.1c against a REAL Postgres (the integration tier): the daily test's claim, recordArrival's token rule, the
 * broken spell and the row lock, i.e. the SQL the unit tests can only drive through a stand-in.
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts inboxTestJob.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables.
 * The mailer and the send ledger are mocked: nothing is ever sent.
 */
export {};
const mockMail = jest.fn();
jest.mock('../../emailService', () => ({ guardedSendMail: (m: unknown) => mockMail(m), resolveEmailRecipient: async (to: string, subject: string) => ({ to, subject }) }));
jest.mock('../../email/idempotentSend', () => ({
  sendOnce: async (_id: unknown, send: () => Promise<{ ok: boolean; errorClass?: string }>) => {
    const r = await send();
    return r.ok ? { outcome: 'sent', ledgerId: 'l', idempotencyKey: 'k' } : { outcome: 'failed', ledgerId: 'l', idempotencyKey: 'k', errorClass: r.errorClass ?? 'ProviderRejected', error: '' };
  },
}));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[inboxTestJob.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('the forwarding test and its alert against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let schema: typeof import('../../../db/ensurePlacementSchema');
  let job: typeof import('../inboxTestJob');
  let arrival: typeof import('../inboxArrival');
  const E1 = '79999999-9999-4999-8999-999999999999';
  const ON = { read: async () => true, enabled: async () => true, enabledIds: async () => [E1] };
  const SENT = new Date('2026-11-21T15:00:00Z');
  const one = async <T>(sql: string): Promise<T> => ((await sequelize.query(sql))[0] as T[])[0];
  const state = () => one<{ last_test_token: string | null; last_test_ms: number | null; verified_at: Date | null; broken_since: Date | null; broken_alerted_at: Date | null }>(
    `SELECT last_test_token, last_test_ms, verified_at, broken_since, broken_alerted_at FROM job_search_inboxes WHERE enrollment_id = '${E1}'`);

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    schema = await import('../../../db/ensurePlacementSchema');
    job = await import('../inboxTestJob');
    arrival = await import('../inboxArrival');
    for (const k of ['log', 'warn', 'error'] as const) jest.spyOn(console, k).mockImplementation(() => undefined);
    await sequelize.query('CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY)');
    await sequelize.query('ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS email VARCHAR(255), ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)');
    await sequelize.query(`INSERT INTO enrollments (id) VALUES ('${E1}') ON CONFLICT DO NOTHING`);
    await sequelize.query(`UPDATE enrollments SET email = 'ann.personal@example.com', full_name = 'Ann Lee' WHERE id = '${E1}'`);
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    await schema.ensurePlacementSchema();
    await sequelize.query(`INSERT INTO job_search_inboxes (enrollment_id, address, mailbox, verified_at, last_test_ms) VALUES ('${E1}', 'ann.lee.careers@gmail.com', 'annleecareers@gmail.com', NOW(), 42000)`);
  });
  afterAll(async () => {
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    await sequelize.close();
  });
  beforeEach(() => mockMail.mockReset().mockResolvedValue({ messageId: 'mc-1' }));

  it('two tests at the same moment: the row lock lets ONE through, and it resets last_test_ms to NULL', async () => {
    const both = await Promise.all([job.sendTest(E1, { now: SENT, deps: ON }), job.sendTest(E1, { now: SENT, deps: ON })]);
    expect(both.map((r) => r.status).sort()).toEqual(['already_today', 'sent']);
    expect(mockMail).toHaveBeenCalledTimes(1);
    const s = await state();
    expect(s.last_test_ms).toBeNull();
    expect(s.last_test_token).toMatch(/^[a-f0-9]{24}$/);
  });

  it('an older token arriving changes no test; ten minutes later the spell starts and alerts ONCE', async () => {
    const old = await arrival.recordArrival({ toAddress: 'Ann.Lee.Careers@gmail.com', subject: 'Forwarding test [test:ffffeeeeddddccccbbbbaaaa]', receivedAt: new Date(SENT.getTime() + 5000), messageId: '<old@x>' });
    expect(old).toMatchObject({ status: 'recorded', testMs: null });
    expect((await state()).last_test_ms).toBeNull();
    expect(await job.sendBrokenAlerts(new Date(SENT.getTime() + 11 * 60_000), ON)).toBe(1);
    expect(await job.sendBrokenAlerts(new Date(SENT.getTime() + 30 * 60_000), ON)).toBe(0);
    const s = await state();
    expect(s.broken_since).toEqual(SENT);
    expect(s.broken_alerted_at).not.toBeNull();
  });

  it('the latest token arriving sets last_test_ms and ends the spell; the same message again adds nothing', async () => {
    const { last_test_token: tok } = await state();
    const msg = { toAddress: 'annleecareers+x@googlemail.com', subject: `Forwarding test [test:${tok}]`, receivedAt: new Date(SENT.getTime() + 42_000), messageId: '<latest@x>' };
    expect(await arrival.recordArrival(msg)).toEqual({ status: 'recorded', enrollmentId: E1, testMs: 42_000 });
    expect(await arrival.recordArrival(msg)).toEqual({ status: 'duplicate' });
    const s = await state();
    expect(s).toMatchObject({ last_test_ms: 42_000, broken_since: null, broken_alerted_at: null });
    expect((await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM inbox_received WHERE message_id = '<latest@x>'`)).n).toBe(1);
  });

  it('a failed send the next day puts the previous test back', async () => {
    const before = await state();
    mockMail.mockRejectedValueOnce(Object.assign(new Error('mandrill 500'), { name: 'UpstreamUnavailable' }));
    expect(await job.sendTest(E1, { now: new Date(SENT.getTime() + 86_400_000), deps: ON })).toEqual({ status: 'failed', errorClass: 'UpstreamUnavailable' });
    const after = await state();
    expect([after.last_test_token, after.last_test_ms]).toEqual([before.last_test_token, 42_000]);
  });
});
