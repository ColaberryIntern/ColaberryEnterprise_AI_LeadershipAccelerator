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
  let prepSchema: typeof import('../../../db/ensureCareerPrepSchema');
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
    prepSchema = await import('../../../db/ensureCareerPrepSchema');
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
    await prepSchema.ensureCareerPrepSchema(); // CP8.3: the booking links the learner's prep row (career_interviews)
    await schema.ensurePlacementSchema();
  });
  afterAll(async () => {
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    for (const sql of prepSchema.CAREER_PREP_ROLLBACK) await sequelize.query(sql);
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
    // CP8.3: ONE prep row for the learner (the in-app notice), from the real upsert on the real partial unique index
    expect(await one(`SELECT COUNT(*)::int AS n, MIN(source) AS source, MIN(company) AS company FROM career_interviews WHERE placement_interview_id = '${r.interviewId}'`)).toEqual({ n: 1, source: 'real', company: 'Acme' });
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
    // the lease and the backoff run on the DATABASE clock: straight away it is still leased and not due
    expect((await fin.finishBooking(r.interviewId, { now: NOW, read: ON, learnerAllowed: allowed })).status).toBe('busy');
    expect((await sweep.sweepBookingConfirms(NOW, { read: ON, learnerAllowed: allowed })).tried).toBe(0);
    // ten minutes later (moved on the database's own clock): past the lease and the 5-minute backoff
    await sequelize.query(`UPDATE placement_interviews SET confirm_last_attempt_at = confirm_last_attempt_at - INTERVAL '10 minutes' WHERE id = '${r.interviewId}'`);
    const res = await sweep.sweepBookingConfirms(NOW, { read: ON, learnerAllowed: allowed });
    expect(res).toEqual({ tried: 1, done: 1, gaveUp: 0 });
    expect((await one(`SELECT room_provider_id FROM placement_interviews WHERE id = '${r.interviewId}'`)).room_provider_id).toBe('zm-2');
  });

  it('rescheduled and booked again: a NEW time gets a new meeting (its start in the requestId); the SAME time keeps its meeting', async () => {
    const { newBookingToken } = await import('../bookingToken');
    const E2 = '7eeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'; // its own learner, so the earlier tests' held times do not interfere
    await sequelize.query(`INSERT INTO enrollments (id, full_name, email) VALUES ('${E2}', 'Bo Kim', 'bo.personal@mail.example') ON CONFLICT DO NOTHING`);
    const t1 = newBookingToken(NOW);
    await sequelize.query(`INSERT INTO placement_interviews (enrollment_id, source_event_id, company, contact_email, state, booking_token_hash, token_expires_at)
      VALUES ('${E2}', 'confirm:c', 'Gamma', 'sam@gamma.example', 'new', '${t1.hash}', '${t1.expiresAt.toISOString()}')`);
    let n = 10;
    mockCreate.mockReset().mockImplementation(async () => ({ providerEventId: `zm-${++n}`, joinUrl: 'https://zoom.example/j/SECRET' }));
    const a = await svc.confirmBooking(t1.token, { slot: '2026-11-23T15:00:00.000Z', tz: 'America/Chicago', interviewers: [] }, NOW);
    if (a.status !== 'booked') throw new Error(`not booked: ${a.status}`);
    await fin.finishBooking(a.interviewId, { now: NOW, read: ON, learnerAllowed: allowed });
    const room = async () => (await one(`SELECT room_provider_id, room_url FROM placement_interviews WHERE id = '${a.interviewId}'`)).room_provider_id;
    expect(await room()).toBe('zm-11');
    // the same time again (a double click): the same booking, the same meeting
    expect(await svc.confirmBooking(t1.token, { slot: '2026-11-23T15:00:00.000Z', tz: 'America/Chicago', interviewers: [] }, NOW)).toMatchObject({ status: 'booked', replay: true });
    expect(await room()).toBe('zm-11');
    // the reschedule moves it back to new and a new booking link is minted (interviewIngest and bookingReply; their own suites)
    const t2 = newBookingToken(NOW);
    await sequelize.query(`UPDATE placement_interviews SET state = 'new', booking_token_hash = '${t2.hash}', token_expires_at = '${t2.expiresAt.toISOString()}', token_used_at = NULL WHERE id = '${a.interviewId}'`);
    const b = await svc.confirmBooking(t2.token, { slot: '2026-11-23T16:00:00.000Z', tz: 'America/Chicago', interviewers: [] }, NOW);
    if (b.status !== 'booked') throw new Error(`not booked: ${b.status}`);
    expect(await room()).toBeNull(); // the booking statement itself dropped the old time's meeting
    expect((await fin.finishBooking(b.interviewId, { now: NOW, read: ON, learnerAllowed: allowed })).status).toBe('done');
    expect(mockCreate.mock.calls.map((c) => (c[0] as { requestId: string }).requestId)).toEqual([
      `placement-interview-${a.interviewId}-2026-11-23T15:00:00.000Z`, `placement-interview-${a.interviewId}-2026-11-23T16:00:00.000Z`]);
    expect(await room()).toBe('zm-12');
    // CP8.3: the same prep row followed the booking to the new time
    const prep = await one(`SELECT COUNT(*)::int AS n, MIN(starts_at) AS starts_at FROM career_interviews WHERE placement_interview_id = '${a.interviewId}'`);
    expect([prep.n, new Date(prep.starts_at as string).toISOString()]).toEqual([1, '2026-11-23T16:00:00.000Z']);
  });

  it('CP8.3 on Postgres: the booked interview reaches the card and anchors (loadPrepData), and leaves them once cancelled or moved', async () => {
    const { newBookingToken } = await import('../bookingToken');
    const { loadPrepData } = await import('../../careerPrep/prepData');
    const E3 = '7fffffff-ffff-4fff-8fff-ffffffffffff';
    await sequelize.query(`INSERT INTO enrollments (id, full_name, email) VALUES ('${E3}', 'Cy Diaz', 'cy.personal@mail.example') ON CONFLICT DO NOTHING`);
    const t = newBookingToken(NOW);
    await sequelize.query(`INSERT INTO placement_interviews (enrollment_id, source_event_id, company, position, type, contact_email, state, booking_token_hash, token_expires_at)
      VALUES ('${E3}', 'confirm:d', 'Delta', 'Data Analyst', 'technical', 'ro@delta.example', 'new', '${t.hash}', '${t.expiresAt.toISOString()}')`);
    mockCreate.mockReset().mockResolvedValue({ providerEventId: 'zm-31', joinUrl: 'https://zoom.example/j/SECRET' });
    const b = await svc.confirmBooking(t.token, { slot: '2026-11-23T15:00:00.000Z', tz: 'America/Chicago', interviewers: [] }, NOW);
    if (b.status !== 'booked') throw new Error(`not booked: ${b.status}`);
    expect((await fin.finishBooking(b.interviewId, { now: NOW, read: ON, learnerAllowed: allowed })).status).toBe('done');
    const shown = async () => (await loadPrepData(E3, NOW)).interviews.map((i) => [i.source, i.company, i.role, i.type, i.startsAt?.toISOString()]);
    expect(await shown()).toEqual([['real', 'Delta', 'Data Analyst', 'technical', '2026-11-23T15:00:00.000Z']]);
    // rescheduled (back to new at another time, not booked again yet): gone from the card and the anchors
    await sequelize.query(`UPDATE placement_interviews SET state = 'new', starts_at = NULL WHERE id = '${b.interviewId}'`);
    expect(await shown()).toEqual([]);
    // booked again at the row's time: back; then cancelled: gone
    await sequelize.query(`UPDATE placement_interviews SET state = 'booked', starts_at = '2026-11-23T15:00:00Z' WHERE id = '${b.interviewId}'`);
    expect(await shown()).toHaveLength(1);
    await sequelize.query(`UPDATE placement_interviews SET state = 'cancelled' WHERE id = '${b.interviewId}'`);
    expect(await shown()).toEqual([]);
  });
});
