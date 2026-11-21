/**
 * CP8.2c against a REAL Postgres (the integration tier): the scheduler's statements run as written on the real placement
 * schema: the booked scan, the done-row lookup (IN list), the try counter (ON CONFLICT on the partial unique index), the
 * keyed event rows, and the not_booked review item (its CHECK).
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts bookingScheduler.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables.
 * The mailer and the send ledger are stand-ins (their own suites cover them).
 */
export {};
const mockSent: string[] = [];
let mockFail = false;
jest.mock('../../email/idempotentSend', () => ({
  sendOnce: async (id: { recipient: string; subject: string; businessEventId: string }, send: () => Promise<{ ok: boolean }>) => {
    const key = `${id.recipient}|${id.subject}|${id.businessEventId}`;
    if (mockSent.includes(key)) return { outcome: 'skipped', reason: 'already_sent', idempotencyKey: key };
    if (mockFail) return { outcome: 'failed', ledgerId: key, idempotencyKey: key, errorClass: 'ProviderRejected', error: '' };
    mockSent.push(key); await send();
    return { outcome: 'sent', ledgerId: key, idempotencyKey: key };
  },
}));
jest.mock('../../emailService', () => ({ guardedSendMail: async () => ({ messageId: 'm' }), resolveEmailRecipient: async (to: string, subject: string) => ({ to, subject }) }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[bookingScheduler.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('reminders and the nudge against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let schema: typeof import('../../../db/ensurePlacementSchema');
  let sch: typeof import('../bookingScheduler');
  const E1 = '7fffffff-ffff-4fff-8fff-ffffffffffff';
  const START = new Date('2026-11-24T15:00:00Z');
  const opts = { read: async () => true, learnerAllowed: async () => true };
  const one = async (sql: string): Promise<Record<string, unknown>> => ((await sequelize.query(sql))[0] as Array<Record<string, unknown>>)[0];

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    schema = await import('../../../db/ensurePlacementSchema');
    sch = await import('../bookingScheduler');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await sequelize.query('CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY)');
    await sequelize.query('ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)');
    await sequelize.query('ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS email VARCHAR(255)');
    await sequelize.query(`INSERT INTO enrollments (id, full_name, email) VALUES ('${E1}', 'Ann Lee', 'ann.personal@mail.example') ON CONFLICT DO NOTHING`);
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    await schema.ensurePlacementSchema();
    await sequelize.query(`INSERT INTO placement_interviews (enrollment_id, source_event_id, company, contact_email, state, starts_at, minutes, confirm_done_at)
      VALUES ('${E1}', 'sched:booked', 'Acme', 'pat@acme.example', 'booked', '${START.toISOString()}', 30, '2026-11-20T12:00:00Z')`);
    await sequelize.query(`INSERT INTO placement_interviews (enrollment_id, source_event_id, company, contact_email, state, booking_link_round, booking_link_sent_at, token_expires_at)
      VALUES ('${E1}', 'sched:unbooked', 'Beta', 'lee@beta.example', 'awaiting', 'first', '2026-11-22T12:00:00Z', '2026-12-06T12:00:00Z')`);
    // an expired link: never nudged, no review item
    await sequelize.query(`INSERT INTO placement_interviews (enrollment_id, source_event_id, company, contact_email, state, booking_link_round, booking_link_sent_at, token_expires_at)
      VALUES ('${E1}', 'sched:expired', 'Delta', 'kai@delta.example', 'awaiting', 'first', '2026-11-01T12:00:00Z', '2026-11-15T12:00:00Z')`);
  });
  afterAll(async () => {
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    await sequelize.close();
  });

  it('a failing reminder counts its tries on the real upsert; once it goes, two more passes send nothing more', async () => {
    mockFail = true;
    await sch.runBookingScheduler(new Date(START.getTime() - 23 * 3_600_000), opts);
    await sch.runBookingScheduler(new Date(START.getTime() - 23 * 3_600_000), opts);
    expect((await one(`SELECT (payload->>'tries')::int AS n FROM placement_events WHERE source_event_id LIKE 'reminder_try:24h:%'`)).n).toBe(2);
    mockFail = false;
    await sch.runBookingScheduler(new Date(START.getTime() - 22 * 3_600_000), opts);
    const sentAfter = mockSent.length;
    await sch.runBookingScheduler(new Date(START.getTime() - 21 * 3_600_000), opts);
    await sch.runBookingScheduler(new Date(START.getTime() - 20 * 3_600_000), opts);
    expect(mockSent.filter((k) => k.includes(':reminder_24h:'))).toHaveLength(2); // learner + employer, once each
    expect(mockSent.length).toBe(sentAfter);
    expect((await one("SELECT COUNT(*)::int AS n FROM placement_events WHERE event = 'reminder_done'")).n).toBe(1);
  });

  it('the unused link: one not_booked review item (the CHECK accepts it) and one nudge, however many passes', async () => {
    const now = new Date('2026-11-23T13:00:00Z');
    await sch.runBookingScheduler(now, opts);
    await sch.runBookingScheduler(new Date(now.getTime() + 5 * 60_000), opts);
    expect((await one("SELECT COUNT(*)::int AS n FROM placement_review_items WHERE kind = 'not_booked'")).n).toBe(1);
    expect(mockSent.filter((k) => k.includes(':booking_nudge:'))).toHaveLength(1);
    expect((await one("SELECT COUNT(*)::int AS n FROM placement_events WHERE event = 'booking_nudge_done'")).n).toBe(1);
  });
});
