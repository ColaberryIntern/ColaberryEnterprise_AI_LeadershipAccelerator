/**
 * VS4.2 transfer guard against a REAL Postgres (the CI integration tier).
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts transferGuard.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[transferGuard.integration] SKIPPED: no DATABASE_URL. See the header.');
}
jest.setTimeout(120_000);

describeIfDb('transfer guard against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let G: typeof import('../transferGuard');
  let S: typeof import('../../twilio/voiceCallStore');
  const T = '7d111111-1111-4111-8111-111111111111';
  const OK = '+15555550199';
  const go = async () => false;
  const call = async (k: string) => ((await sequelize.query(`INSERT INTO voice_calls (tenant_id, engine, idempotency_key, recipient_ref, purpose, state) VALUES ('${T}', 'conversation_relay', 'tg-${k}', 'lead:1', 't', 'session_active') RETURNING id`)) as [Array<{ id: string }>, unknown])[0][0].id;

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    await (await import('../../../../db/ensureVoiceStudioSchema')).ensureVoiceStudioSchema();
    G = await import('../transferGuard');
    S = await import('../../twilio/voiceCallStore');
    await sequelize.query(`INSERT INTO voice_numbers (tenant_id, provider, provider_number_id, number_ref, e164_restricted, status) VALUES ('${T}', 'twilio', 'PN-tg', 'tg', '+15555550151', 'active')`);
  });
  beforeEach(async () => { await sequelize.query(`DELETE FROM voice_calls WHERE tenant_id = '${T}'`); });
  afterAll(async () => {
    await sequelize.query(`DELETE FROM voice_calls WHERE tenant_id = '${T}'`);
    await sequelize.query(`DELETE FROM voice_numbers WHERE tenant_id = '${T}'`);
    await sequelize.close();
  });

  it('allows a dial, and the same call again (a redelivered webhook), counting it once', async () => {
    const id = await call('a');
    expect(await G.refuseTransferDial(id, OK, go)).toBeNull();
    expect(await G.refuseTransferDial(id, OK, go)).toBeNull();
    const [[r]] = (await sequelize.query(`SELECT COUNT(*)::int AS n FROM voice_call_events WHERE call_id = '${id}'`)) as [Array<{ n: number }>, unknown];
    expect(r.n).toBe(1);
  });

  it('refuses when stopped, for an unknown call, and to a number we hold', async () => {
    const id = await call('b');
    expect(await G.refuseTransferDial(id, OK, async () => true)).toBe('emergency_stop');
    expect(await G.refuseTransferDial('7d999999-9999-4999-8999-999999999999', OK, go)).toBe('unknown_call');
    expect(await G.refuseTransferDial(id, '+15555550151', go)).toBe('transfer_loop');
  });

  it('an unreadable emergency stop counts as stopped', async () => {
    expect(await G.emergencyStopped(async () => { throw new Error('db'); })).toBe(true);
    expect(await G.emergencyStopped(async () => undefined as unknown as boolean)).toBe(true);
    expect(await G.emergencyStopped(async () => false)).toBe(false);
  });

  it('30 at once: exactly the hourly cap is allowed', async () => {
    const ids = await Promise.all(Array.from({ length: 30 }, (_, i) => call(`c${i}`)));
    const rs = await Promise.all(ids.map((id) => G.refuseTransferDial(id, OK, go)));
    expect(rs.filter((r) => r === null)).toHaveLength(20);
    expect(rs.filter((r) => r === 'transfer_cap')).toHaveLength(10);
  });

  it('the transfer marker does not change how the call state is folded', async () => {
    const id = await call('d');
    await G.refuseTransferDial(id, OK, go);
    await expect(S.recomputeCall(id)).resolves.not.toBeNull();
  });
});
