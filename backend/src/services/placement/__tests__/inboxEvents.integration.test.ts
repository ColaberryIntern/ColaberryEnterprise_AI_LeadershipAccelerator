/**
 * CP6.2 against a REAL Postgres (the integration tier): an inbox event is stored once per (message_id, type), its
 * arrival is recorded once, and a forwarding confirmation lands on the learner's inbox.
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts inboxEvents.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[inboxEvents.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('inbox events against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let schema: typeof import('../../../db/ensurePlacementSchema');
  let svc: typeof import('../inboxEvents');
  let shape: typeof import('../inboxEventSchema');
  const E1 = '7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const one = async <T>(sql: string): Promise<T> => ((await sequelize.query(sql))[0] as T[])[0];

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    schema = await import('../../../db/ensurePlacementSchema');
    svc = await import('../inboxEvents');
    shape = await import('../inboxEventSchema');
    for (const k of ['log', 'warn'] as const) jest.spyOn(console, k).mockImplementation(() => undefined);
    await sequelize.query('CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY)');
    await sequelize.query(`INSERT INTO enrollments (id) VALUES ('${E1}') ON CONFLICT DO NOTHING`);
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    await schema.ensurePlacementSchema();
    await sequelize.query(`INSERT INTO job_search_inboxes (enrollment_id, address, mailbox) VALUES ('${E1}', 'ann.lee.careers@gmail.com', 'annleecareers@gmail.com')`);
  });
  afterAll(async () => {
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    await sequelize.close();
  });
  const ev = (over: Record<string, unknown> = {}) => shape.InboxEventSchema.parse({ event_id: 'evt-1', message_id: '<m1@x>', type: 'email.classified',
    to_address: 'ann.lee.careers@gmail.com', received_at: '2026-11-21T18:00:00Z', subject: 'Interview request', confidence: 0.97, ...over });

  it('stored once, arrival recorded once, then a replay is a duplicate', async () => {
    expect(await svc.acceptInboxEvent(ev())).toEqual({ duplicate: false });
    expect(await svc.acceptInboxEvent(ev({ event_id: 'evt-1b' }))).toEqual({ duplicate: true });
    expect((await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM inbox_events WHERE message_id = '<m1@x>'")).n).toBe(1);
    expect((await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM inbox_received WHERE message_id = '<m1@x>'")).n).toBe(1);
    expect((await one<{ p: Date | null }>("SELECT processed_at AS p FROM inbox_events WHERE message_id = '<m1@x>'")).p).not.toBeNull();
  });

  it('a forwarding confirmation stores the code and Google link on that learner\'s inbox', async () => {
    await svc.acceptInboxEvent(ev({ type: 'forwarding.confirmation', message_id: '<c1@x>', confirmation_code: '123456789', confirmation_link: 'https://mail-settings.google.com/mail/vf-1' }));
    const r = await one<{ forwarding_code: string; forwarding_link: string }>(`SELECT forwarding_code, forwarding_link FROM job_search_inboxes WHERE enrollment_id = '${E1}'`);
    expect([r.forwarding_code, r.forwarding_link]).toEqual(['123456789', 'https://mail-settings.google.com/mail/vf-1']);
  });

  it('the CHECK refuses a type outside F3', async () => {
    await expect(sequelize.query("INSERT INTO inbox_events (event_id, message_id, type, payload, received_at) VALUES ('e', 'm', 'email.deleted', '{}', NOW())")).rejects.toThrow();
  });
});
