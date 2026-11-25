/**
 * VS3.2 completion claim against a REAL Postgres (the CI integration tier). Proves the property the
 * Synthflow webhook now depends on: of N concurrent deliveries of the same completion exactly ONE is
 * the first delivery (so one text message, one timeline entry); a new status is a new claim; a replay
 * still merges the latest data but keeps the original completed_at.
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts completion.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[completion.integration] SKIPPED: no DATABASE_URL. See the header.');
}
jest.setTimeout(120_000);

describeIfDb('call completion claim against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let C: typeof import('../completion');
  const LOG = '97777777-7777-4777-8777-777777777777';
  const payload = (status: string, transcript = 'Agent: hello there. Caller: yes I am interested.') => C.fromSynthflowPayload({ call: { call_id: 'sf-int-1', status, duration: 42, transcript } })!;
  const read = async () => {
    const [[r]] = await sequelize.query(`SELECT status, provider_response FROM communication_logs WHERE id = '${LOG}'`) as [Array<{ status: string; provider_response: Record<string, unknown> }>, unknown];
    return r;
  };

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    C = await import('../completion');
    await sequelize.query(`CREATE TABLE IF NOT EXISTS communication_logs (
      id UUID PRIMARY KEY, lead_id INTEGER, channel VARCHAR(20) NOT NULL DEFAULT 'voice', status VARCHAR(30) NOT NULL DEFAULT 'pending',
      provider VARCHAR(50), provider_message_id VARCHAR(200), provider_response JSONB, metadata JSONB, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await sequelize.query(`DELETE FROM communication_logs WHERE id = '${LOG}'`);
    await sequelize.query(`INSERT INTO communication_logs (id, channel, status, provider, provider_message_id, provider_response) VALUES ('${LOG}', 'voice', 'pending', 'synthflow', 'sf-int-1', '{"dispatched": true}'::jsonb)`);
  });
  afterAll(async () => {
    await sequelize.query(`DELETE FROM communication_logs WHERE id = '${LOG}'`);
    await sequelize.close();
  });

  it('20 concurrent deliveries of the same completion: exactly one first delivery', async () => {
    const res = await Promise.all(Array.from({ length: 20 }, () => C.claimCompletion(LOG, payload('completed'))));
    expect(res.filter((r) => r.firstDelivery).length).toBe(1);
    const r = await read();
    expect(r.status).toBe('delivered');
    expect(r.provider_response).toMatchObject({ dispatched: true, call_status: 'completed', duration: 42, transcript_state: 'present' });
    expect(typeof r.provider_response.completed_at).toBe('string');
  });

  it('a replay merges fuller data but keeps the first completed_at', async () => {
    const before = (await read()).provider_response.completed_at;
    await new Promise((r) => setTimeout(r, 20));
    const again = await C.claimCompletion(LOG, payload('completed', 'Agent: hello there. Caller: yes I am interested. Agent: great, a teammate will follow up.'));
    expect(again.firstDelivery).toBe(false);
    const r = await read();
    expect(r.provider_response.completed_at).toBe(before);
    expect(String(r.provider_response.transcript)).toContain('teammate will follow up');
  });

  it('a different status is a new fact and is claimable once', async () => {
    const a = await C.claimCompletion(LOG, payload('failed'));
    const b = await C.claimCompletion(LOG, payload('failed'));
    expect([a.firstDelivery, b.firstDelivery]).toEqual([true, false]);
    expect((await read()).status).toBe('failed');
  });

  it('a completed call with no usable transcript is marked pending_review, not done', async () => {
    await C.claimCompletion(LOG, payload('completed', ''));
    expect((await read()).provider_response.transcript_state).toBe('pending_review');
  });

  it('a pending-review mark from a failed extraction survives later deliveries', async () => {
    await sequelize.query(`UPDATE communication_logs SET provider_response = provider_response || '{"transcript_state": "pending_review", "transcript_state_reason": "extraction_failed"}'::jsonb WHERE id = '${LOG}'`);
    await C.claimCompletion(LOG, payload('completed'));
    await C.claimCompletion(LOG, payload('canceled'));
    const r = await read();
    expect(r.provider_response).toMatchObject({ transcript_state: 'pending_review', transcript_state_reason: 'extraction_failed' });
  });

  it('an unknown row claims nothing and does not throw', async () => {
    const r = await C.claimCompletion('98888888-8888-4888-8888-888888888888', payload('completed'));
    expect(r.firstDelivery).toBe(false);
  });
});
