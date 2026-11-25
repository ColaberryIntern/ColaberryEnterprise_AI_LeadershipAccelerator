/**
 * Voice AI Studio VS1.4 against a REAL Postgres (the CI integration tier). The unit test checks the
 * text; this proves the DDL is valid, re-runnable, and that its constraints actually hold.
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts ensureVoiceStudioSchema.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops the
 * voice_* tables.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[ensureVoiceStudioSchema.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('voice studio schema against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let schema: typeof import('../ensureVoiceStudioSchema');
  const T1 = '81111111-1111-4111-8111-111111111111';
  const one = async <T>(sql: string): Promise<T> => ((await sequelize.query(sql))[0] as T[])[0];
  const drop = async () => {
    for (const t of [...schema.VOICE_STUDIO_TABLES].reverse()) await sequelize.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
  };
  const columns = async () => (await sequelize.query(
    `SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name LIKE 'voice\\_%' AND table_name <> 'voice_dial_log'
      ORDER BY table_name, column_name`))[0];

  beforeAll(async () => {
    ({ sequelize } = await import('../../config/database'));
    schema = await import('../ensureVoiceStudioSchema');
    await drop();
  });

  afterAll(async () => {
    await drop();
    await sequelize.close();
  });

  it('runs twice with zero failed statements and the same resulting schema', async () => {
    const first = await schema.ensureVoiceStudioSchema();
    expect(first.failed).toBe(0);
    const cols = await columns();
    const second = await schema.ensureVoiceStudioSchema();
    expect(second.failed).toBe(0);
    expect(await columns()).toEqual(cols);
  });

  it('creates all 15 tables in public (ensure swallows statement errors, so prove none was skipped)', async () => {
    const list = schema.VOICE_STUDIO_TABLES.map((t) => `'${t}'`).join(',');
    const n = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (${list})`);
    expect(n.n).toBe(15);
  });

  it('rejects a duplicate call idempotency key within a tenant', async () => {
    const ins = `INSERT INTO voice_calls (tenant_id, engine, idempotency_key, recipient_ref, purpose)
                 VALUES ('${T1}', 'conversation_relay', 'idem-dup-1', 'lead:1', 'test')`;
    await sequelize.query(ins);
    await expect(sequelize.query(ins)).rejects.toThrow();
  });

  it('rejects a duplicate reservation idempotency key and an unknown reservation status', async () => {
    const ins = (key: string, status: string) => `INSERT INTO voice_dial_reservations (tenant_id, idempotency_key, destination_hash, purpose, status, lease_expires_at)
      VALUES ('${T1}', '${key}', repeat('a', 64), 'test', '${status}', NOW() + INTERVAL '5 minutes')`;
    await sequelize.query(ins('res-1', 'held'));
    await expect(sequelize.query(ins('res-1', 'held'))).rejects.toThrow();
    await expect(sequelize.query(ins('res-2', 'redialing'))).rejects.toThrow();
  });

  it('rejects an invalid call state and an out-of-range canary percentage', async () => {
    await expect(sequelize.query(`INSERT INTO voice_calls (tenant_id, engine, idempotency_key, recipient_ref, purpose, state)
      VALUES ('${T1}', 'x', 'idem-state', 'lead:1', 't', 'connected')`)).rejects.toThrow();
    await expect(sequelize.query(`INSERT INTO voice_routes (tenant_id, brand_slug, path_key, call_type, canary_percent)
      VALUES ('${T1}', 'colaberry', 'agent-tool', 'callback', 150)`)).rejects.toThrow();
  });

  it('a retention delete of a call removes its events, turns, tool runs, artifacts and usage', async () => {
    const call = await one<{ id: string }>(`INSERT INTO voice_calls (tenant_id, engine, idempotency_key, recipient_ref, purpose)
      VALUES ('${T1}', 'conversation_relay', 'idem-cascade', 'lead:2', 'test') RETURNING id`);
    const id = call.id;
    await sequelize.query(`INSERT INTO voice_call_events (tenant_id, call_id, event_key, source, state, occurred_at) VALUES ('${T1}', '${id}', 'k1', 'carrier', 'ringing', NOW())`);
    await sequelize.query(`INSERT INTO voice_turns (tenant_id, call_id, turn_index, speaker, started_at) VALUES ('${T1}', '${id}', 0, 'agent', NOW())`);
    await sequelize.query(`INSERT INTO voice_tool_runs (tenant_id, call_id, tool_name, idempotency_key, auth_decision) VALUES ('${T1}', '${id}', 'slots', 'tk1', 'allowed')`);
    await sequelize.query(`INSERT INTO voice_artifacts (tenant_id, call_id, kind, storage_ref) VALUES ('${T1}', '${id}', 'summary', 'ref:1')`);
    await sequelize.query(`INSERT INTO voice_usage (tenant_id, call_id, provider, unit, quantity) VALUES ('${T1}', '${id}', 'twilio', 'minute', 1)`);
    await sequelize.query(`DELETE FROM voice_calls WHERE id = '${id}'`);
    for (const t of ['voice_call_events', 'voice_turns', 'voice_tool_runs', 'voice_artifacts', 'voice_usage']) {
      expect((await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${t} WHERE call_id = '${id}'`)).n).toBe(0);
    }
  });

  it('a duplicate event key for the same call is rejected (append-only dedup)', async () => {
    const call = await one<{ id: string }>(`INSERT INTO voice_calls (tenant_id, engine, idempotency_key, recipient_ref, purpose)
      VALUES ('${T1}', 'openai_realtime', 'idem-events', 'lead:3', 'test') RETURNING id`);
    const ins = `INSERT INTO voice_call_events (tenant_id, call_id, event_key, source, state, occurred_at) VALUES ('${T1}', '${call.id}', 'dup', 'carrier', 'ringing', NOW())`;
    await sequelize.query(ins);
    await expect(sequelize.query(ins)).rejects.toThrow();
  });
});
