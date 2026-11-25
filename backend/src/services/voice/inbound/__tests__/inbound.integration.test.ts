/**
 * VS3.6 inbound against a REAL Postgres (the CI integration tier): number lookup, one call per
 * CallSid under concurrent redelivery, fallback rows end, and an inbound call is closed by its
 * session end.
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts inbound.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[inbound.integration] SKIPPED: no DATABASE_URL. See the header.');
}
jest.setTimeout(120_000);

describeIfDb('inbound calls against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let R: typeof import('../inboundRuntime');
  const T = '9b111111-1111-4111-8111-111111111111';
  const sid = (x: string) => 'CA' + x.repeat(16);
  const row = async (id: string) => (await sequelize.query(`SELECT state, state_reason, direction, recipient_ref, ended_at, human_answered FROM voice_calls WHERE id = '${id}'`) as [Array<Record<string, unknown>>, unknown])[0][0];

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    await (await import('../../../../db/ensureVoiceStudioSchema')).ensureVoiceStudioSchema();
    R = await import('../inboundRuntime');
    await sequelize.query(`INSERT INTO voice_numbers (tenant_id, provider, provider_number_id, number_ref, e164_restricted, status, routing_policy) VALUES
      ('${T}', 'twilio', 'PN-in-1', 'in-active', '+15555550151', 'active', '{"inbound": {"enabled": true}}'::jsonb),
      ('${T}', 'twilio', 'PN-in-2', 'in-off', '+15555550152', 'inactive', '{}'::jsonb)`);
  });
  afterAll(async () => {
    await sequelize.query(`DELETE FROM voice_calls WHERE tenant_id = '${T}'`);
    await sequelize.query(`DELETE FROM voice_numbers WHERE tenant_id = '${T}'`);
    await sequelize.close();
  });
  const open = async (x: string) => R.openInboundCall({ callSid: sid(x), number: (await R.findNumber('+15555550151'))!, engine: 'conversation_relay', testMode: true });

  it('finds only an active number we hold', async () => {
    expect(await R.findNumber('+15555550151')).toMatchObject({ tenantId: T, numberRef: 'in-active', routingPolicy: { inbound: { enabled: true } } });
    for (const n of ['+15555550152', '+15555550153', "' OR 1=1"]) expect(await R.findNumber(n)).toBeNull();
  });

  it('10 concurrent deliveries of one CallSid make one call row, with no phone number on it', async () => {
    const ids = new Set((await Promise.all(Array.from({ length: 10 }, () => open('c1')))).map((r) => r.callId));
    expect(ids.size).toBe(1);
    const r = await row([...ids][0]);
    expect(r).toMatchObject({ direction: 'inbound', recipient_ref: 'inbound:in-active', state: 'ringing' });
    expect(JSON.stringify(r)).not.toContain('5555550151');
  });

  it('no concurrent delivery ever throws (the second unique index raced: 117 of 300 rounds)', async () => {
    for (let i = 0; i < 60; i += 1) {
      const rs = await Promise.allSettled(Array.from({ length: 10 }, () => open(`r${i}-`)));
      expect(rs.filter((x) => x.status === 'rejected')).toEqual([]);
      expect(new Set(rs.map((x) => (x as PromiseFulfilledResult<{ callId: string }>).value.callId)).size).toBe(1);
    }
  });

  it('a CallSid already recorded under another tenant is refused, never handed the other row', async () => {
    await open('x9');
    const other = { ...(await R.findNumber('+15555550151'))!, tenantId: '9b111111-1111-4111-8111-111111111112' };
    await expect(R.openInboundCall({ callSid: sid('x9'), number: other, engine: 'conversation_relay', testMode: true })).rejects.toMatchObject({ name: 'ContractViolation' });
  });

  it('a message fallback ends the row; a human fallback leaves it open for the dial action', async () => {
    const a = (await open('c2')).callId;
    await R.markInboundFallback(a, 'inbound_disabled', true);
    expect(await row(a)).toMatchObject({ state: 'canceled', state_reason: 'inbound_disabled', ended_at: expect.any(Date) });
    const b = (await open('c3')).callId;
    await R.markInboundFallback(b, 'inbound_disabled', false);
    expect(await row(b)).toMatchObject({ state: 'ringing', ended_at: null });
  });

  it('the session end closes an inbound call; a redelivery changes nothing', async () => {
    const { closeInboundCall } = await import('../../../../controllers/voiceTransferController');
    const id = (await open('c4')).callId;
    const body = { Direction: 'inbound', CallSid: sid('c4') };
    await closeInboundCall(id, body);
    const first = await row(id);
    expect(first).toMatchObject({ state: 'completed' });
    await closeInboundCall(id, body);
    expect(await row(id)).toEqual(first);
  });
});
