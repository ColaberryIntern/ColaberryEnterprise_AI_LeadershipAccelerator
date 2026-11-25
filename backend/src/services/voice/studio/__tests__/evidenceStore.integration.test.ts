/**
 * VS3.5 evidence queries against a REAL Postgres (the CI integration tier): filters, the call detail
 * joins (including the communication log), masking, and the cost aggregates with a missing price.
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts evidenceStore.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[evidenceStore.integration] SKIPPED: no DATABASE_URL. See the header.');
}
jest.setTimeout(120_000);

describeIfDb('evidence store against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let E: typeof import('../evidenceStore');
  const T = '9a111111-1111-4111-8111-111111111111';
  const CALL = '9a222222-2222-4222-8222-222222222222';
  const LOG = '9a333333-3333-4333-8333-333333333333';
  const SID = 'CA' + 'ab'.repeat(16);

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    await (await import('../../../../db/ensureVoiceStudioSchema')).ensureVoiceStudioSchema();
    E = await import('../evidenceStore');
    await sequelize.query(`CREATE TABLE IF NOT EXISTS communication_logs (
      id UUID PRIMARY KEY, lead_id INTEGER, channel VARCHAR(20) NOT NULL DEFAULT 'voice', status VARCHAR(30) NOT NULL DEFAULT 'pending',
      provider VARCHAR(50), provider_message_id VARCHAR(200), provider_response JSONB, metadata JSONB, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await sequelize.query(`INSERT INTO communication_logs (id, status, provider_response) VALUES ('${LOG}', 'delivered', '{"transcript_state": "present"}'::jsonb)`);
    await sequelize.query(`INSERT INTO voice_calls (id, tenant_id, engine, idempotency_key, recipient_ref, purpose, state, test_mode, provider_call_id, communication_log_id)
      VALUES ('${CALL}', '${T}', 'conversation_relay', 'ev-1', 'approved-destination:test', 'test', 'dispatch_unknown', TRUE, '${SID}', '${LOG}')`);
    await sequelize.query(`INSERT INTO voice_call_events (tenant_id, call_id, event_key, source, state, occurred_at) VALUES ('${T}', '${CALL}', 'k1', 'carrier', 'answered', NOW())`);
    await sequelize.query(`INSERT INTO voice_tool_runs (tenant_id, call_id, tool_name, idempotency_key, auth_decision, status) VALUES ('${T}', '${CALL}', 'book_meeting', 'x', 'denied', 'refused')`);
    await sequelize.query(`INSERT INTO voice_usage (tenant_id, call_id, provider, unit, quantity, unit_price_usd, measured) VALUES
      ('${T}', '${CALL}', 'ev-priced', 'min', 2, 0.05, TRUE), ('${T}', '${CALL}', 'ev-unpriced', 'min', 2, NULL, FALSE)`);
  });
  afterAll(async () => {
    await sequelize.query(`DELETE FROM voice_calls WHERE tenant_id = '${T}'`);
    await sequelize.query(`DELETE FROM communication_logs WHERE id = '${LOG}'`);
    await sequelize.close();
  });

  it('filters narrow the list, and absent filters do not', async () => {
    const has = async (f: object) => (await E.listCalls({ days: 7, limit: 200, ...f })).some((c) => c.id === CALL);
    expect(await has({})).toBe(true);
    expect(await has({ engine: 'conversation_relay', state: 'dispatch_unknown', testMode: true })).toBe(true);
    expect(await has({ engine: 'openai_realtime' })).toBe(false);
    expect(await has({ testMode: false })).toBe(false);
  });

  it('detail joins events, tools, usage and the log, with a masked carrier id', async () => {
    const d = (await E.getCallDetail(CALL))!;
    expect(d.events).toHaveLength(1);
    expect(d.tools[0]).toMatchObject({ tool_name: 'book_meeting', auth_decision: 'denied' });
    expect(d.usage).toHaveLength(2);
    expect(d.reconciliation).toEqual({ logged: true, logStatus: 'delivered', transcriptState: 'present' });
    expect(d.row.provider_call_id_masked).toBe('CA****abab');
    expect(JSON.stringify(d)).not.toContain(SID);
    expect(await E.getCallDetail('9a999999-9999-4999-8999-999999999999')).toBeNull();
  });

  it('costs keep actual and estimated apart; a missing price is null, not zero; unknown dials are dead letters', async () => {
    const c = await E.loadCosts(30);
    expect(Number(c.byProvider.find((p) => p.provider === 'ev-priced')?.usd)).toBeCloseTo(0.1);
    expect(c.byProvider.find((p) => p.provider === 'ev-unpriced')).toMatchObject({ usd: null, measured: false, unpriced: 1 });
    expect(c.deadLetters.some((d) => d.id === CALL)).toBe(true);
    expect(Array.isArray(await E.listEvaluations())).toBe(true);
  });
});
