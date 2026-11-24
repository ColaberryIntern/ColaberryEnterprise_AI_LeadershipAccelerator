/**
 * VS2.1 event store against a REAL Postgres (the CI integration tier): idempotent event append,
 * single-use token consumption under concurrency, and the derived voice_calls row.
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts voiceCallStore.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[voiceCallStore.integration] SKIPPED: no DATABASE_URL. See the header.');
}
jest.setTimeout(120_000);

describeIfDb('voice call store against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let S: typeof import('../voiceCallStore');
  let M: typeof import('../twilioStatusMap');
  const T = '92222222-2222-4222-8222-222222222222';
  const CALL = '93333333-3333-4333-8333-333333333333';
  const GHOST = '94444444-4444-4444-8444-444444444444';
  const SID = 'CA' + 'f6'.repeat(16);
  const at = (i: number) => new Date(Date.parse('2026-11-24T20:00:00Z') + i * 1000).toUTCString();
  const cb = (CallStatus: string, n: number, extra: Record<string, string> = {}) =>
    M.twilioStatusToEvents(CALL, { CallSid: SID, CallStatus, SequenceNumber: String(n), Timestamp: at(n), ...extra }, '2026-11-24T20:00:00.000Z');

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    await (await import('../../../../db/ensureVoiceStudioSchema')).ensureVoiceStudioSchema();
    S = await import('../voiceCallStore');
    M = await import('../twilioStatusMap');
    await sequelize.query(`DELETE FROM voice_calls WHERE tenant_id = '${T}'`);
    await sequelize.query(
      `INSERT INTO voice_calls (id, tenant_id, engine, idempotency_key, recipient_ref, purpose, state, test_mode)
       VALUES ('${CALL}', '${T}', 'conversation_relay', 'store-it-1', 'approved-destination:test', 'test', 'dispatching', TRUE)`,
    );
  });
  afterAll(async () => {
    await sequelize.query(`DELETE FROM voice_calls WHERE tenant_id = '${T}'`); // cascades to events and token uses
    await sequelize.query(`DELETE FROM voice_numbers WHERE tenant_id = '${T}'`);
    await sequelize.close();
  });

  it('ownership: only an ACTIVE Twilio row in voice_numbers counts as our number', async () => {
    await sequelize.query(`DELETE FROM voice_numbers WHERE tenant_id = '${T}'`);
    await sequelize.query(
      `INSERT INTO voice_numbers (tenant_id, provider, provider_number_id, number_ref, e164_restricted, status) VALUES
       ('${T}', 'twilio', 'PN-it-active', 'it-active', '+15555550142', 'active'),
       ('${T}', 'twilio', 'PN-it-inactive', 'it-inactive', '+15555550143', 'inactive')`,
    );
    expect(await S.isOwnedActiveNumber('+15555550142')).toBe(true);
    expect(await S.isOwnedActiveNumber('+15555550143')).toBe(false); // inactive
    expect(await S.isOwnedActiveNumber('+15555550144')).toBe(false); // not ours
    expect(await S.isOwnedActiveNumber("'+15555550142' OR 1=1")).toBe(false); // not E.164: no query at all
  });

  it('appends each event once; a redelivery is a counted duplicate', async () => {
    const first = await S.appendCallEvents(cb('ringing', 1));
    const again = await S.appendCallEvents(cb('ringing', 1));
    expect(first).toEqual({ inserted: 1, duplicates: 0, unknownCall: false });
    expect(again).toEqual({ inserted: 0, duplicates: 1, unknownCall: false });
  });

  it('an event for a call with no voice_calls row inserts nothing and says so', async () => {
    const evs = M.twilioStatusToEvents(GHOST, { CallSid: SID, CallStatus: 'ringing', SequenceNumber: '1' }, '2026-11-24T20:00:00.000Z');
    expect(await S.appendCallEvents(evs)).toEqual({ inserted: 0, duplicates: 0, unknownCall: true });
  });

  it('out-of-order events reduce to the right voice_calls row, copying tenant from the call', async () => {
    await S.appendCallEvents([...cb('completed', 3), ...cb('in-progress', 2, { AnsweredBy: 'human' }), ...cb('initiated', 0)]);
    const rec = await S.recomputeCall(CALL);
    expect(rec?.state).toBe('completed');
    const [row] = await sequelize.query<{ state: string; provider_call_id: string; human_answered: boolean; carrier_answered: boolean; ended_at: Date | null }>(
      `SELECT state, provider_call_id, human_answered, carrier_answered, ended_at FROM voice_calls WHERE id = '${CALL}'`, { type: 'SELECT' as never });
    expect(row).toMatchObject({ state: 'completed', provider_call_id: SID, human_answered: true, carrier_answered: true });
    expect(row.ended_at).not.toBeNull();
    const tenants = await sequelize.query<{ tenant_id: string }>(`SELECT DISTINCT tenant_id FROM voice_call_events WHERE call_id = '${CALL}'`, { type: 'SELECT' as never });
    expect(tenants).toEqual([{ tenant_id: T }]);
  });

  it('recompute is idempotent (same row twice)', async () => {
    const a = await S.recomputeCall(CALL);
    const b = await S.recomputeCall(CALL);
    expect(b?.state).toBe(a?.state);
  });

  it('a single-use token is consumed exactly once even under 10 concurrent attempts', async () => {
    const claims = { callId: CALL, purpose: 'twiml' as const, exp: 9_999_999_999, nonce: 'nonce-concurrent-1' };
    const results = await Promise.all(Array.from({ length: 10 }, () => S.consumeToken(claims)));
    expect(results.filter((r) => r === 'consumed')).toHaveLength(1);
    expect(results.filter((r) => r === 'replay')).toHaveLength(9);
  });

  it('a token for an unknown call is reported, not consumed', async () => {
    expect(await S.consumeToken({ callId: GHOST, purpose: 'session', exp: 9_999_999_999, nonce: 'n-ghost' })).toBe('unknown_call');
  });
});
