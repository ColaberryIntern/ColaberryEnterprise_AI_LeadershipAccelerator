/**
 * VS4.3 operations facts against a REAL Postgres (the CI integration tier): each planted condition moves
 * exactly its own number.
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts opsSweep.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[opsSweep.integration] SKIPPED: no DATABASE_URL. See the header.');
}
jest.setTimeout(120_000);

describeIfDb('operations facts against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let S: typeof import('../opsSweep');
  let M: typeof import('../opsMetrics');
  const T = '7f111111-1111-4111-8111-111111111111';
  let n = 0;
  const call = async (cols: Record<string, string>) => {
    const c = { tenant_id: `'${T}'`, engine: "'conversation_relay'", idempotency_key: `'ops-${++n}'`, recipient_ref: "'lead:1'", purpose: "'t'", ...cols };
    return ((await sequelize.query(`INSERT INTO voice_calls (${Object.keys(c).join(', ')}) VALUES (${Object.values(c).join(', ')}) RETURNING id`)) as [Array<{ id: string }>, unknown])[0][0].id;
  };
  const facts = () => S.readFacts(sequelize, new M.OpsMetrics(() => 1));
  const ago = (x: string) => `NOW() - INTERVAL '${x}'`;

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    await (await import('../../../../db/ensureVoiceStudioSchema')).ensureVoiceStudioSchema();
    S = await import('../opsSweep');
    M = await import('../opsMetrics');
  });
  const wipe = async () => { await sequelize.query(`DELETE FROM voice_calls WHERE tenant_id = '${T}'; DELETE FROM voice_dial_reservations WHERE tenant_id = '${T}'; DELETE FROM voice_usage WHERE tenant_id = '${T}'`); };
  beforeEach(wipe);
  afterAll(async () => { await wipe(); await sequelize.close(); });

  it('an empty database is all zero, and latency is null rather than 0', async () => {
    expect(await facts()).toMatchObject({ ended: 0, failed: 0, acceptedNeverRang: 0, orphaned: 0, stalled: 0, queueStuck: 0, spend24hUsd: 0, turnLatencyP95Ms: null, turnLatencySamples: 0, optOutsPending: 0, duplicateDials: 0, wrongVersion: 0, silentAnswered: 0 });
  });

  it('each condition moves its own number, and test calls are left out of business rates', async () => {
    const rows: Array<[keyof Awaited<ReturnType<typeof facts>>, () => Promise<unknown>]> = [
      ['acceptedNeverRang', () => call({ state: "'queued'", provider_call_id: "'CA-1'", created_at: ago('3 minutes') })],
      ['dispatchUnknown24h', () => call({ state: "'dispatch_unknown'" })],
      ['orphaned', () => call({ state: "'session_active'", created_at: ago('71 minutes') })],
      ['stalled', () => call({ state: "'session_active'", created_at: ago('6 minutes') })],
      ['silentAnswered', () => call({ state: "'completed'", human_answered: 'TRUE', direction: "'inbound'" })],
      ['optOutsPending', () => call({ state: "'completed'", state_reason: "'caller_opt_out'", lead_id: '9', created_at: ago('2 hours'), updated_at: ago('16 minutes'), direction: "'inbound'" })],
      ['queueStuck', () => sequelize.query(`INSERT INTO voice_dial_reservations (tenant_id, idempotency_key, destination_hash, purpose, status, lease_expires_at) VALUES ('${T}', 'q', 'h', 't', 'dispatching', ${ago('3 minutes')})`)],
      ['duplicateDials', () => sequelize.query(`INSERT INTO voice_dial_reservations (tenant_id, idempotency_key, destination_hash, purpose, status, lease_expires_at) SELECT '${T}', 'd' || g, 'same', 't', 'accepted', NOW() FROM generate_series(1, 3) g`)],
      ['spend24hUsd', () => sequelize.query(`INSERT INTO voice_usage (tenant_id, provider, unit, quantity, unit_price_usd) VALUES ('${T}', 'twilio', 'minute', 2, 0.5)`)],
    ];
    for (const [key, plant] of rows) {
      await wipe(); // eslint-disable-line no-await-in-loop
      const before = await facts(); // eslint-disable-line no-await-in-loop
      await plant(); // eslint-disable-line no-await-in-loop
      const after = await facts(); // eslint-disable-line no-await-in-loop
      const changed = (Object.keys(after) as Array<keyof typeof after>).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]) && k !== 'wrongVersion');
      expect({ key, changed }).toEqual({ key, changed: [key] });
      expect(after[key]).toBe(1);
    }
    await wipe();
    await call({ state: "'failed'", test_mode: 'TRUE' });
    expect(await facts()).toMatchObject({ ended: 0, failed: 0, wrongVersion: 0 });
    await call({ state: "'failed'" });
    expect(await facts()).toMatchObject({ ended: 1, failed: 1, wrongVersion: 1 });
  });

  it('a recent event means not stalled; a recorded opt-out is not pending; turn latency is the 95th percentile', async () => {
    const id = await call({ state: "'session_active'", created_at: ago('6 minutes') });
    await sequelize.query(`INSERT INTO voice_call_events (tenant_id, call_id, event_key, source, state, occurred_at) VALUES ('${T}', '${id}', 'k', 'carrier', 'answered', NOW())`);
    const o = await call({ state: "'completed'", state_reason: "'caller_opt_out'", lead_id: '9', updated_at: ago('16 minutes') });
    await sequelize.query(`INSERT INTO voice_call_events (tenant_id, call_id, event_key, source, state, occurred_at) VALUES ('${T}', '${o}', 'opt_out_recorded', 'studio', 'session_active', NOW())`);
    await sequelize.query(`INSERT INTO voice_turns (tenant_id, call_id, turn_index, speaker, started_at, first_audio_latency_ms) SELECT '${T}', '${id}', g, 'agent', NOW(), g * 10 FROM generate_series(1, 100) g`);
    expect(await facts()).toMatchObject({ stalled: 0, optOutsPending: 0, turnLatencyP95Ms: 950, turnLatencySamples: 100 });
  });
});
