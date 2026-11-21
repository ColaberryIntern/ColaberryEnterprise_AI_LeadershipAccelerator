/**
 * CP8.2b against a REAL Postgres (the integration tier): the after-booking statements (attempt count, room store, done
 * mark, keyed event rows, the sweep's scan) run as written, on the real placement schema, after a real confirm.
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts bookingConfirm.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables.
 * The room provider, the mailer and the send ledger are stand-ins (their own suites cover them); the availability is a stub.
 */
export {};
jest.mock('../../hire/hireStudioSettings', () => ({ readAvailability: async () => ({ enabled: true, tz: 'America/Chicago', blocks: ['Mon-morning'], formats: ['intro'], maxPerWeek: null, minNoticeHours: 0, autoConfirm: false }) }));
const mockCreate = jest.fn();
jest.mock('../../communityRooms/meetingProvider', () => ({ getMeetingProvider: () => ({ createMeeting: (i: unknown) => mockCreate(i) }) }));
const mockSent: string[] = [];
jest.mock('../../email/idempotentSend', () => ({
  sendOnce: async (id: { recipient: string; subject: string; businessEventId: string }, send: () => Promise<{ ok: boolean }>) => {
    const key = `${id.recipient}|${id.subject}|${id.businessEventId}`;
    if (mockSent.includes(key)) return { outcome: 'skipped', reason: 'already_sent', idempotencyKey: key };
    mockSent.push(key);
    await send();
    return { outcome: 'sent', ledgerId: key, idempotencyKey: key };
  },
}));
jest.mock('../../emailService', () => ({ guardedSendMail: async () => ({ messageId: 'm' }), resolveEmailRecipient: async (to: string, subject: string) => ({ to, subject }) }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[bookingConfirm.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('after-booking work against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let schema: typeof import('../../../db/ensurePlacementSchema');
  let svc: typeof import('../bookingService');
  let fin: typeof import('../bookingConfirm');
  let sweep: typeof import('../bookingConfirmSweep');
  const E1 = '7ddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const NOW = new Date('2026-11-20T18:00:00Z');
  const ON = async () => true;
  const allowed = async () => true;
  const one = async (sql: string): Promise<Record<string, unknown>> => ((await sequelize.query(sql))[0] as Array<Record<string, unknown>>)[0];

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    schema = await import('../../../db/ensurePlacementSchema');
    svc = await import('../bookingService');
    fin = await import('../bookingConfirm');
    sweep = await import('../bookingConfirmSweep');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await sequelize.query('CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY)');
    await sequelize.query('ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)');
    await sequelize.query('ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS email VARCHAR(255)');
    await sequelize.query(`INSERT INTO enrollments (id, full_name, email) VALUES ('${E1}', 'Ann Lee', 'ann.personal@mail.example') ON CONFLICT DO NOTHING`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS hire_interviews (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), enrollment_id UUID NOT NULL,
      status VARCHAR(20) NOT NULL, starts_at TIMESTAMPTZ NOT NULL, minutes INTEGER NOT NULL)`);
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    await schema.ensurePlacementSchema();
  });
  afterAll(async () => {
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    await sequelize.close();
  });

  it('a real confirm, then two runs at once: one holds the lease, one room stored, done once, one done row; the sweep then finds nothing', async () => {
    const { newBookingToken } = await import('../bookingToken');
    const t = newBookingToken(NOW);
    await sequelize.query(`INSERT INTO placement_interviews (enrollment_id, source_event_id, company, contact_email, state, booking_token_hash, token_expires_at)
      VALUES ('${E1}', 'confirm:a', 'Acme', 'pat@acme.example', 'new', '${t.hash}', '${t.expiresAt.toISOString()}')`);
    const r = await svc.confirmBooking(t.token, { slot: '2026-11-23T15:00:00.000Z', tz: 'America/Chicago', interviewers: ['kim@acme.example'] }, NOW);
    if (r.status !== 'booked') throw new Error(`not booked: ${r.status}`);
    mockCreate.mockResolvedValue({ providerEventId: 'zm-1', joinUrl: 'https://zoom.example/j/SECRET' });
    const both = await Promise.all([fin.finishBooking(r.interviewId, { now: NOW, read: ON, learnerAllowed: allowed }), fin.finishBooking(r.interviewId, { now: NOW, read: ON, learnerAllowed: allowed })]);
    expect(both.map((x) => x.status).sort()).toEqual(['busy', 'done']); // the row-serialized lease: the second run never reached the provider
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const row = await one(`SELECT room_provider_id, confirm_done_at, confirm_attempts FROM placement_interviews WHERE id = '${r.interviewId}'`);
    expect(row.room_provider_id).toBe('zm-1');
    expect(row.confirm_done_at).not.toBeNull();
    expect((await one("SELECT COUNT(*)::int AS n FROM placement_events WHERE event = 'booking_confirm_done'")).n).toBe(1);
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ autoRecording: 'none' });
    expect(new Set(mockSent).size).toBe(3); // learner, employer, one interviewer
    expect(await sweep.sweepBookingConfirms(new Date(NOW.getTime() + 60 * 60_000), { read: ON, learnerAllowed: allowed })).toEqual({ tried: 0, done: 0, gaveUp: 0 });
  });

  it('a provider failure leaves it owed; the sweep (after the backoff) finishes it on Postgres', async () => {
    const { newBookingToken } = await import('../bookingToken');
    const t = newBookingToken(NOW);
    await sequelize.query(`INSERT INTO placement_interviews (enrollment_id, source_event_id, company, contact_email, state, booking_token_hash, token_expires_at)
      VALUES ('${E1}', 'confirm:b', 'Beta', 'lee@beta.example', 'new', '${t.hash}', '${t.expiresAt.toISOString()}')`);
    const r = await svc.confirmBooking(t.token, { slot: '2026-11-23T17:00:00.000Z', tz: 'America/Chicago', interviewers: [] }, NOW);
    if (r.status !== 'booked') throw new Error(`not booked: ${r.status}`);
    mockCreate.mockRejectedValueOnce(Object.assign(new Error('zoom 503'), { name: 'UpstreamUnavailable' })).mockResolvedValue({ providerEventId: 'zm-2', joinUrl: 'https://zoom.example/j/SECRET' });
    expect((await fin.finishBooking(r.interviewId, { now: NOW, read: ON, learnerAllowed: allowed })).status).toBe('incomplete');
    const later = new Date(NOW.getTime() + 10 * 60_000); // past the 5-minute backoff after one run
    const res = await sweep.sweepBookingConfirms(later, { read: ON, learnerAllowed: allowed });
    expect(res).toEqual({ tried: 1, done: 1, gaveUp: 0 });
    expect((await one(`SELECT room_provider_id FROM placement_interviews WHERE id = '${r.interviewId}'`)).room_provider_id).toBe('zm-2');
  });
});
