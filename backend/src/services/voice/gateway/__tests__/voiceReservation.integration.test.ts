/**
 * VS1.5 atomic reservation against a REAL Postgres (the CI integration tier). The race this exists to
 * close cannot be shown with mocks: 20 concurrent requests for one destination must admit exactly the
 * cap, because every request takes the destination advisory lock before counting.
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts voiceReservation.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[voiceReservation.integration] SKIPPED: no DATABASE_URL. See the header.');
}
jest.setTimeout(120_000);

describeIfDb('voice dial reservation against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let R: typeof import('../voiceReservation');
  const T1 = '91111111-1111-4111-8111-111111111111';
  const base = (key: string, hash: string, e164 = '+15555550100') => ({
    tenantId: T1, idempotencyKey: key, destinationHash: hash, destinationE164: e164, routeId: null, purpose: 'test',
    caps: { perDestination24h: 2, perRoutePerDay: null, perTenantPerDay: null },
  });

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    const schema = await import('../../../../db/ensureVoiceStudioSchema');
    await schema.ensureVoiceStudioSchema();
    R = await import('../voiceReservation');
    await sequelize.query(`DELETE FROM voice_dial_reservations WHERE tenant_id = '${T1}'`);
  });
  afterAll(async () => {
    await sequelize.query(`DELETE FROM voice_dial_reservations WHERE tenant_id = '${T1}'`);
    await sequelize.close();
  });

  it('reserves on a database where the legacy voice_dial_log table does not exist (regression: parse-time relation error)', async () => {
    // Runs first, before the legacy test below creates the table. On a fresh CI database the table is absent;
    // if another suite already created it, this still proves a normal reservation works.
    const r = await R.reserveDial(base('fresh-1', 'f'.repeat(64)));
    expect(r).toMatchObject({ outcome: 'reserved' });
  });

  it('20 concurrent requests for one destination admit exactly the cap (2)', async () => {
    const hash = 'a'.repeat(64);
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => R.reserveDial(base(`race-${i}`, hash))));
    // On failure, show WHY each request was denied rather than only a count.
    const reasons = results.map((r) => (r.outcome === 'denied' ? `${r.reason}:${r.detail ?? ''}` : 'reserved'));
    expect({ reserved: results.filter((r) => r.outcome === 'reserved').length, reasons }).toMatchObject({ reserved: 2 });
    expect(results.filter((r) => r.outcome === 'denied' && r.reason === 'destination_cap')).toHaveLength(18);
  });

  it('the same idempotency key replays the same reservation instead of a second one', async () => {
    const hash = 'b'.repeat(64);
    const a = await R.reserveDial(base('idem-1', hash));
    const b = await R.reserveDial(base('idem-1', hash));
    expect(a.outcome).toBe('reserved');
    expect(b).toEqual({ outcome: 'reserved', reservationId: (a as { reservationId: string }).reservationId, replay: true });
  });

  it('an ambiguous reservation keeps counting; an expired held one does not', async () => {
    const hash = 'c'.repeat(64);
    const a = await R.reserveDial(base('amb-1', hash));
    const id = (a as { reservationId: string }).reservationId;
    expect(await R.transitionReservation(id, 'markDispatching')).toBe(true);
    expect(await R.transitionReservation(id, 'markAmbiguous')).toBe(true);
    const b = await R.reserveDial(base('amb-2', hash));
    await sequelize.query(`UPDATE voice_dial_reservations SET lease_expires_at = NOW() - INTERVAL '1 minute' WHERE id = '${(b as { reservationId: string }).reservationId}'`);
    expect((await R.reserveDial(base('amb-3', hash))).outcome).toBe('reserved'); // the expired held one freed its slot
    expect((await R.reserveDial(base('amb-4', hash))).outcome).toBe('denied'); // ambiguous + amb-3 = cap
  });

  it('legacy voice_dial_log dials count toward the same cap', async () => {
    const e164 = '+15555550199';
    await sequelize.query(`CREATE TABLE IF NOT EXISTS voice_dial_log (id BIGSERIAL PRIMARY KEY, phone VARCHAR(20) NOT NULL, call_type VARCHAR(40), call_id VARCHAR(80), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await sequelize.query(`INSERT INTO voice_dial_log (phone, call_type) VALUES ('${e164}', 'interest'), ('${e164}', 'interest')`);
    expect(await R.reserveDial(base('legacy-1', 'd'.repeat(64), e164))).toMatchObject({ outcome: 'denied', reason: 'destination_cap' });
    await sequelize.query(`DELETE FROM voice_dial_log WHERE phone = '${e164}'`);
  });

  it('transitions happen at most once (a retried markAccepted is a no-op)', async () => {
    const a = await R.reserveDial(base('once-1', 'e'.repeat(64)));
    const id = (a as { reservationId: string }).reservationId;
    expect(await R.transitionReservation(id, 'markDispatching')).toBe(true);
    expect(await R.transitionReservation(id, 'markDispatching')).toBe(false);
    expect(await R.transitionReservation(id, 'markAccepted')).toBe(true);
    expect(await R.transitionReservation(id, 'markAccepted')).toBe(false);
    expect(await R.transitionReservation(id, 'markRefused')).toBe(false);
  });
});
