/**
 * VS5.3 history import against a REAL Postgres (the CI integration tier).
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts history.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[history.integration] SKIPPED: no DATABASE_URL. See the header.');
}
jest.setTimeout(120_000);

describeIfDb('history import against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let M: typeof import('../historyImport');
  let X: typeof import('../historyExport');
  const T = '7d111111-1111-4111-8111-111111111111';
  const OTHER = '7d222222-2222-4222-8222-222222222222';
  const n = async (where = 'TRUE') => ((await sequelize.query(`SELECT COUNT(*)::int AS n FROM voice_call_history WHERE tenant_id = '${T}' AND ${where}`))[0] as Array<{ n: number }>)[0].n;
  const make = (count: number, p: Partial<import('../historyExport').HistoryCall> = {}, prefix = 'call') => {
    const calls = Array.from({ length: count }, (_x, i) => ({ id: `${prefix}-${String(i).padStart(6, '0')}`, assistant: 'sf-aaaaaaaa', startedAt: new Date(Date.parse('2026-03-01T00:00:00Z') + i * 1000).toISOString(), durationSeconds: i % 7 ? i : null, outcome: 'completed', endReason: null, hasTranscript: true, hasRecording: false, ...p }));
    return { version: 1 as const, from: '2026-01-01', until: '2026-11-25', assistants: [], errors: [], calls, sha256: X.exportHash(calls) };
  };
  const apply = (x: ReturnType<typeof make>, tenantId = T) => M.importHistory(sequelize, M.parseExport(JSON.stringify(x)), { tenantId, apply: true, retentionDays: 90 });
  const wipe = () => sequelize.query(`DELETE FROM voice_call_history WHERE tenant_id IN ('${T}','${OTHER}')`);

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    await (await import('../../../../db/ensureVoiceStudioSchema')).ensureVoiceStudioSchema();
    M = await import('../historyImport');
    X = await import('../historyExport');
  });
  beforeEach(wipe);
  afterAll(async () => { await wipe(); await sequelize.close(); });

  it('a dry run writes nothing', async () => {
    const r = await M.importHistory(sequelize, make(3), { tenantId: T, apply: false });
    expect(r).toMatchObject({ applied: false, inserted: 0, alreadyThere: 0, ok: true });
    expect(await n()).toBe(0);
  });
  it('imports every call across chunks, and verifies', async () => {
    const x = make(1_203);
    expect(await apply(x)).toMatchObject({ exported: 1_203, inserted: 1_203, alreadyThere: 0, conflicts: [], ok: true });
    expect(await n()).toBe(1_203);
    expect(await n("retention_until BETWEEN NOW() + INTERVAL '89 days' AND NOW() + INTERVAL '91 days'")).toBe(1_203);
    expect(await M.verifyHistory(sequelize, x, T)).toMatchObject({ manifest: 1_203, imported: 1_203, missing: [], unexpected: [], different: [], duplicates: [], ok: true });
  });
  it('a second import changes nothing, and so do two at once', async () => {
    const x = make(700);
    const both = await Promise.all([apply(x), apply(x)]);
    expect(both[0].inserted + both[1].inserted).toBe(700);
    expect(await apply(x)).toMatchObject({ inserted: 0, alreadyThere: 700, conflicts: [], ok: true });
    expect(await n()).toBe(700);
  });
  it('never overwrites: a call that differs is a conflict', async () => {
    await apply(make(3));
    const r = await apply(make(3, { outcome: 'busy' }));
    expect(r).toMatchObject({ inserted: 0, alreadyThere: 3, ok: false });
    expect(r.conflicts).toHaveLength(3);
    expect(await n("outcome = 'completed'")).toBe(3);
    expect((await M.verifyHistory(sequelize, make(3, { outcome: 'busy' }), T)).different).toHaveLength(3);
  });
  it('verify names a missing and an unexpected call', async () => {
    const x = make(4);
    await apply(x);
    await sequelize.query(`DELETE FROM voice_call_history WHERE tenant_id = '${T}' AND provider_call_id = 'call-000001'`);
    await sequelize.query(`UPDATE voice_call_history SET provider_call_id = 'call-extra1' WHERE tenant_id = '${T}' AND provider_call_id = 'call-000002'`);
    expect(await M.verifyHistory(sequelize, x, T)).toMatchObject({ missing: ['call-000001', 'call-000002'], unexpected: ['call-extra1'], ok: false });
  });
  it('rollback removes that batch only, and a dry run of it nothing', async () => {
    const a = await apply(make(3));
    await apply(make(2, {}, 'next'));
    await apply(make(3), OTHER);
    expect(await M.rollbackBatch(sequelize, T, a.batchId, false)).toBe(3);
    expect(await n()).toBe(5);
    expect(await M.rollbackBatch(sequelize, T, a.batchId, true)).toBe(3);
    expect(await n()).toBe(2);
    expect(await M.rollbackBatch(sequelize, OTHER, a.batchId, false)).toBe(3);
  });
  it('purge removes only rows past their deadline, in its own tenant', async () => {
    await apply(make(3));
    await apply(make(2), OTHER);
    await sequelize.query(`UPDATE voice_call_history SET retention_until = NOW() - INTERVAL '1 minute' WHERE tenant_id = '${OTHER}'`);
    await sequelize.query(`UPDATE voice_call_history SET retention_until = NOW() - INTERVAL '1 minute' WHERE tenant_id = '${T}' AND provider_call_id = 'call-000000'`);
    expect(await M.purgeExpired(sequelize, T, false)).toBe(1);
    expect(await M.purgeExpired(sequelize, T, true)).toBe(1);
    expect(await n()).toBe(2);
    expect(await M.purgeExpired(sequelize, OTHER, false)).toBe(2);
  });
  it('verify looks only at its tenant, its assistants and its dates', async () => {
    const x = make(3);
    await apply(x);
    await apply(make(2, {}, 'other'), OTHER);
    await apply({ ...make(1, { assistant: 'sf-bbbbbbbb' }, 'elsewhere') });
    await apply(make(1, { startedAt: '2026-11-25T00:00:00.000Z' }, 'after'));
    await apply(make(1, { startedAt: '2025-12-31T23:59:59.000Z' }, 'before'));
    expect(await M.verifyHistory(sequelize, x, T)).toMatchObject({ manifest: 3, imported: 3, unexpected: [], missing: [], ok: true });
  });
  it('another tenant holding the same calls does not count as already there', async () => {
    await apply(make(3), OTHER);
    expect(await apply(make(3))).toMatchObject({ inserted: 3, alreadyThere: 0, ok: true });
  });
  it('a provider id finds its call, in its tenant only', async () => {
    await apply(make(2));
    expect(await M.findHistory(sequelize, T, 'call-000001')).toMatchObject({ provider: 'synthflow', providerCallId: 'call-000001', startedAt: '2026-03-01T00:00:01.000Z', durationSeconds: 1 });
    expect(await M.findHistory(sequelize, OTHER, 'call-000001')).toBeNull();
  });
  it('a failed chunk leaves the earlier ones, and the same command finishes', async () => {
    const x = make(600);
    await sequelize.query(`CREATE OR REPLACE FUNCTION vs53_boom() RETURNS trigger AS $$ BEGIN IF NEW.provider_call_id = 'call-000550' THEN RAISE EXCEPTION 'boom'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql; CREATE TRIGGER vs53_boom BEFORE INSERT ON voice_call_history FOR EACH ROW EXECUTE FUNCTION vs53_boom()`);
    try { await expect(apply(x)).rejects.toThrow(); } finally { await sequelize.query('DROP TRIGGER vs53_boom ON voice_call_history; DROP FUNCTION vs53_boom()'); }
    expect(await n()).toBe(500);
    expect(await apply(x)).toMatchObject({ inserted: 100, alreadyThere: 500, ok: true });
  });
});
