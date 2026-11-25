/**
 * VS4.2 retention against a REAL Postgres (the CI integration tier).
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts retention.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[retention.integration] SKIPPED: no DATABASE_URL. See the header.');
}
jest.setTimeout(120_000);

describeIfDb('retention against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let R: typeof import('../retention');
  const T = '7c111111-1111-4111-8111-111111111111';
  const LOG = '7c222222-2222-4222-8222-222222222222';
  const ids: Record<string, string> = {};
  const rows = async <X>(sql: string): Promise<X[]> => (await sequelize.query(sql) as [X[], unknown])[0];
  const n = async (sql: string) => (await rows<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${sql}`))[0].n;
  const call = async (key: string, state: string, until: string) => {
    const r = await rows<{ id: string }>(`INSERT INTO voice_calls (tenant_id, engine, idempotency_key, recipient_ref, purpose, state, retention_until)
      VALUES ('${T}', 'conversation_relay', 'ret-${key}', 'lead:1', 'test', '${state}', ${until}) RETURNING id`);
    ids[key] = r[0].id;
  };
  const PAST = "NOW() - INTERVAL '1 minute'";
  const FUTURE = "NOW() + INTERVAL '1 hour'";
  const wipe = async () => {
    await sequelize.query(`DELETE FROM voice_calls WHERE tenant_id = '${T}'`);
    await sequelize.query('DELETE FROM audit_logs; DELETE FROM activities; DELETE FROM communication_logs');
  };

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    await (await import('../../../../db/ensureVoiceStudioSchema')).ensureVoiceStudioSchema();
    await sequelize.query('CREATE TABLE IF NOT EXISTS communication_logs (id UUID PRIMARY KEY, provider_response JSONB)');
    await sequelize.query('CREATE TABLE IF NOT EXISTS activities (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), type TEXT, body TEXT, metadata JSONB)');
    await sequelize.query('CREATE TABLE IF NOT EXISTS audit_logs (id UUID PRIMARY KEY, admin_user_id UUID, action VARCHAR(50), entity_type VARCHAR(100), entity_id UUID, new_values JSONB, created_at TIMESTAMPTZ)');
    R = await import('../retention');
  });
  beforeEach(async () => {
    await wipe();
    await call('expired', 'completed', PAST);
    await call('expired2', 'failed', PAST);
    await call('future', 'completed', FUTURE);
    await call('none', 'completed', 'NULL');
    await call('live', 'session_active', PAST);
    await call('unknown', 'dispatch_unknown', PAST);
    await call('recorded', 'completed', PAST);
    await sequelize.query(`INSERT INTO voice_artifacts (tenant_id, call_id, kind, storage_ref) VALUES ('${T}', '${ids.recorded}', 'recording', 'ref:rec')`);
    await sequelize.query(`INSERT INTO communication_logs VALUES ('${LOG}', '{"transcript": "secret words", "analysis": {"a": "secret words"}, "recording_url": "r", "completed_at": "x"}')`);
    await sequelize.query(`UPDATE voice_calls SET communication_log_id = '${LOG}' WHERE id = '${ids.expired}'`);
    await sequelize.query(`INSERT INTO activities (type, body, metadata) VALUES ('call', 'secret words', '{"voice_call_id": "${ids.expired}"}'), ('call', 'other', '{"voice_call_id": "${ids.future}"}')`);
    await sequelize.query(`INSERT INTO voice_turns (tenant_id, call_id, turn_index, speaker, started_at) VALUES ('${T}', '${ids.expired}', 0, 'agent', NOW())`);
    await sequelize.query(`INSERT INTO voice_dial_reservations (tenant_id, call_id, idempotency_key, destination_hash, purpose, lease_expires_at) VALUES ('${T}', '${ids.expired}', 'r-${ids.expired}', 'h', 't', NOW())`);
  });
  afterAll(async () => { await wipe(); await sequelize.query(`DELETE FROM voice_dial_reservations WHERE tenant_id = '${T}'`); await sequelize.close(); });

  it('a dry run lists exactly the expired calls, reports the rest, and changes nothing', async () => {
    const r = await R.runRetention(sequelize, { apply: false });
    expect(new Set(r.due)).toEqual(new Set([ids.expired, ids.expired2]));
    expect(r).toMatchObject({ applied: false, deleted: [], failed: [], blockedByRecording: 1, notEndedPastDeadline: 2, withoutDeadline: 1 });
    expect(await n('voice_calls')).toBe(7);
    expect(await n('audit_logs')).toBe(0);
  });

  it('apply removes the expired calls and every copy of their words, and audits counts only', async () => {
    const r = await R.runRetention(sequelize, { apply: true });
    expect(new Set(r.deleted)).toEqual(new Set([ids.expired, ids.expired2]));
    expect(await n('voice_calls')).toBe(5);
    expect(await n('voice_turns')).toBe(0);
    expect((await rows<{ provider_response: unknown }>('SELECT provider_response FROM communication_logs'))[0].provider_response).toEqual({ completed_at: 'x' });
    const bodies = await rows<{ body: string | null }>('SELECT body FROM activities ORDER BY body NULLS FIRST');
    expect(bodies.map((b) => b.body)).toEqual([null, 'other']);
    expect(await n(`voice_dial_reservations WHERE call_id = '${ids.expired}'`)).toBe(1); // caps survive
    const audit = await rows<{ entity_id: string; new_values: { removed: Record<string, number> } }>(`SELECT entity_id, new_values FROM audit_logs WHERE entity_id = '${ids.expired}'`);
    expect(audit).toHaveLength(1);
    expect(audit[0].new_values.removed.voice_turns).toBe(1);
    expect(JSON.stringify(audit)).not.toContain('secret');
  });

  it('a second run deletes nothing and writes no second audit row', async () => {
    await R.runRetention(sequelize, { apply: true });
    const again = await R.runRetention(sequelize, { apply: true });
    expect(again.deleted).toEqual([]);
    expect(await n('audit_logs')).toBe(2);
  });

  it('four runs at once delete and audit each call once', async () => {
    const rs = await Promise.all(Array.from({ length: 4 }, () => R.runRetention(sequelize, { apply: true })));
    expect(rs.flatMap((r) => r.failed)).toEqual([]);
    expect(rs.flatMap((r) => r.deleted)).toHaveLength(2);
    expect(await n('audit_logs')).toBe(2);
  });

  it('when the audit row cannot be written, nothing about that call is deleted', async () => {
    await sequelize.query('ALTER TABLE audit_logs RENAME TO audit_logs_away');
    try {
      const r = await R.runRetention(sequelize, { apply: true });
      expect(r.deleted).toEqual([]);
      expect(r.failed).toHaveLength(2);
      expect(await n('voice_calls')).toBe(7);
      expect((await rows<{ provider_response: { transcript?: string } }>('SELECT provider_response FROM communication_logs'))[0].provider_response.transcript).toBe('secret words');
    } finally { await sequelize.query('ALTER TABLE audit_logs_away RENAME TO audit_logs'); }
  });

  it('the limit bounds one run', async () => {
    expect((await R.runRetention(sequelize, { apply: true, limit: 1 })).deleted).toHaveLength(1);
  });

  it('a call whose deadline moved after planning is not deleted', async () => {
    await sequelize.query(`UPDATE voice_calls SET retention_until = ${FUTURE} WHERE id = '${ids.expired}'`);
    expect(await R.deleteExpiredCall(sequelize, ids.expired)).toBe(false);
    expect(await R.deleteExpiredCall(sequelize, ids.recorded)).toBe(false);
    expect(await R.deleteExpiredCall(sequelize, ids.live)).toBe(false);
  });
});
