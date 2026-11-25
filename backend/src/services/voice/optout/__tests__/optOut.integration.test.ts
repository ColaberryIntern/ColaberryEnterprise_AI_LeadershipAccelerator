/**
 * VS4.2 opt-out against a REAL Postgres (the CI integration tier).
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts optOut.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[optOut.integration] SKIPPED: no DATABASE_URL. See the header.');
}
jest.setTimeout(120_000);

describeIfDb('opt-out against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let O: typeof import('../optOut');
  let S: typeof import('../../twilio/voiceCallStore');
  const T = '7e111111-1111-4111-8111-111111111111';
  const call = async (k: string, lead: number | null, test = false) => ((await sequelize.query(`INSERT INTO voice_calls (tenant_id, engine, idempotency_key, recipient_ref, purpose, state, lead_id, test_mode) VALUES ('${T}', 'conversation_relay', 'oo-${k}', 'lead:x', 't', 'session_active', ${lead}, ${test}) RETURNING id`)) as [Array<{ id: string }>, unknown])[0][0].id;
  const reason = async (id: string) => ((await sequelize.query(`SELECT state_reason AS r FROM voice_calls WHERE id = '${id}'`)) as [Array<{ r: string | null }>, unknown])[0][0].r;

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    await (await import('../../../../db/ensureVoiceStudioSchema')).ensureVoiceStudioSchema();
    O = await import('../optOut');
    S = await import('../../twilio/voiceCallStore');
  });
  beforeEach(async () => { await sequelize.query(`DELETE FROM voice_calls WHERE tenant_id = '${T}'`); });
  afterAll(async () => { await sequelize.query(`DELETE FROM voice_calls WHERE tenant_id = '${T}'`); await sequelize.close(); });

  it('a failed suppression is retried by the sweep until it succeeds, then left alone', async () => {
    const id = await call('a', 42);
    let up = false;
    const suppressed: number[] = [];
    const d = { ...O.productionOptOutDeps(), suppress: async (l: number) => { if (!up) throw new Error('down'); suppressed.push(l); } };
    expect(await O.recordOptOut(id, d)).toBe('pending');
    expect(await reason(id)).toBe('caller_opt_out');
    expect(await O.reconcileOptOuts(20, d)).toBe(1);
    up = true;
    expect(await O.reconcileOptOuts(20, d)).toBe(1);
    expect(await O.reconcileOptOuts(20, d)).toBe(0);
    expect(suppressed).toEqual([42]);
  });

  it('test calls and calls without a lead are marked and never swept', async () => {
    const d = { ...O.productionOptOutDeps(), suppress: jest.fn() };
    for (const id of [await call('t', 42, true), await call('n', null)]) {
      expect(await O.recordOptOut(id, d)).toBe('marked');
      expect(await reason(id)).toBe('caller_opt_out');
    }
    expect(await O.reconcileOptOuts(20, d)).toBe(0);
    expect(d.suppress).not.toHaveBeenCalled();
  });

  it('an unknown call is not an error', async () => {
    expect(await O.recordOptOut('7e999999-9999-4999-8999-999999999999', O.productionOptOutDeps())).toBe('unknown_call');
  });

  it('a later fallback, or a later state change, does not erase the opt-out', async () => {
    const id = await call('f', null);
    await O.recordOptOut(id, O.productionOptOutDeps());
    await (await import('../../../../controllers/voiceTransferController')).defaultTransferDeps().recordFallback(id);
    expect(await reason(id)).toBe('caller_opt_out');
    await sequelize.query(`UPDATE voice_calls SET direction = 'inbound' WHERE id = '${id}'`);
    await (await import('../../inbound/inboundRuntime')).markInboundFallback(id, 'inbound_error', true);
    await S.recomputeCall(id);
    expect(await reason(id)).toBe('caller_opt_out');
  });
});
