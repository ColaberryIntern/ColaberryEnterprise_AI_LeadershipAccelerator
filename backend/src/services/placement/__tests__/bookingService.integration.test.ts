/**
 * CP8.2 against a REAL Postgres (the integration tier): two bookers racing for one time (two interviews of one learner)
 * under the real row and advisory locks, one wins; the same booker twice is one booking; the token is single use.
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts bookingService.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables.
 * The learner's availability is a stub (its own suite covers it). The held times are REAL: hireInterviews.heldTimes reads
 * hire_interviews and the booked placement_interviews, which is what makes the race decide on Postgres.
 */
export {};
jest.mock('../../hire/hireStudioSettings', () => ({ readAvailability: async () => ({ enabled: true, tz: 'America/Chicago', blocks: ['Mon-morning'], formats: ['intro'], maxPerWeek: null, minNoticeHours: 0, autoConfirm: false }) }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[bookingService.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('booking against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let schema: typeof import('../../../db/ensurePlacementSchema');
  let svc: typeof import('../bookingService');
  let tok: typeof import('../bookingToken');
  const E1 = '7ccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const NOW = new Date('2026-11-20T18:00:00Z');
  const MON9 = '2026-11-23T15:00:00.000Z';
  const count = async (sql: string): Promise<number> => (((await sequelize.query(sql))[0] as Array<{ n: number }>)[0]).n;
  async function interview(src: string): Promise<string> {
    const t = tok.newBookingToken(NOW);
    await sequelize.query(`INSERT INTO placement_interviews (enrollment_id, source_event_id, company, state, booking_token_hash, token_expires_at)
      VALUES ('${E1}', '${src}', 'Acme', 'new', '${t.hash}', '${t.expiresAt.toISOString()}')`);
    return t.token;
  }

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    schema = await import('../../../db/ensurePlacementSchema');
    svc = await import('../bookingService');
    tok = await import('../bookingToken');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await sequelize.query('CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY)');
    await sequelize.query('ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)');
    await sequelize.query(`INSERT INTO enrollments (id) VALUES ('${E1}') ON CONFLICT DO NOTHING`);
    // The Hire profile's table, only the columns heldTimes reads (its real schema has its own suite).
    await sequelize.query(`CREATE TABLE IF NOT EXISTS hire_interviews (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), enrollment_id UUID NOT NULL,
      status VARCHAR(20) NOT NULL, starts_at TIMESTAMPTZ NOT NULL, minutes INTEGER NOT NULL)`);
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    await schema.ensurePlacementSchema();
  });
  afterAll(async () => {
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    await sequelize.close();
  });

  it('two bookers racing for one time: ONE booked, the other taken', async () => {
    const [a, b] = [await interview('race:a'), await interview('race:b')];
    const input = { slot: MON9, tz: 'America/Chicago', interviewers: [] };
    const both = await Promise.all([svc.confirmBooking(a, input, NOW), svc.confirmBooking(b, input, NOW)]);
    expect(both.map((r) => r.status).sort()).toEqual(['booked', 'taken']);
    expect(await count("SELECT COUNT(*)::int AS n FROM placement_interviews WHERE state = 'booked'")).toBe(1);
  });

  it('the same booker twice at once: one booking, one event row; the token is then used', async () => {
    const t = await interview('twice');
    const input = { slot: '2026-11-23T16:30:00.000Z', tz: 'America/Chicago', interviewers: ['pat@acme.example'] };
    const both = await Promise.all([svc.confirmBooking(t, input, NOW), svc.confirmBooking(t, input, NOW)]);
    expect(both.every((r) => r.status === 'booked')).toBe(true);
    expect(both.filter((r) => r.status === 'booked' && r.replay)).toHaveLength(1);
    expect(await count("SELECT COUNT(*)::int AS n FROM placement_events WHERE event = 'booked'")).toBe(2); // one per interview booked in this suite
    expect(await svc.confirmBooking(t, { ...input, slot: '2026-11-23T17:00:00.000Z' }, NOW)).toEqual({ status: 'gone', reason: 'used' });
  });
});
