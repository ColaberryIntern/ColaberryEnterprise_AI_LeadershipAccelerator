/**
 * VS3.4 lab and routing store against a REAL Postgres (the CI integration tier): blind trials are
 * scored exactly once under concurrency; route writes upsert, record the approver, and report a
 * path-key clash as null; the Overview and Agents read queries run against the real schema.
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts labStore.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[labStore.integration] SKIPPED: no DATABASE_URL. See the header.');
}
jest.setTimeout(120_000);

describeIfDb('Voice Lab and routing store against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let L: typeof import('../labStore');
  let Q: typeof import('../studioQueries');
  const TENANT = '00000000-0000-4000-8000-00000000c01a';
  const change = (p: Record<string, unknown> = {}) => ({ pathKey: 'it-route', callType: 'interest', brandSlug: 'colaberry', mode: 'shadow' as const, canaryPercent: 0, versionId: null, fallback: { kind: 'legacy' as const }, ...p });

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    await (await import('../../../../db/ensureVoiceStudioSchema')).ensureVoiceStudioSchema();
    L = await import('../labStore');
    Q = await import('../studioQueries');
    await sequelize.query(`DELETE FROM voice_routes WHERE tenant_id = '${TENANT}' AND path_key LIKE 'it-%'`);
  });
  afterAll(async () => {
    await sequelize.query(`DELETE FROM voice_routes WHERE tenant_id = '${TENANT}' AND path_key LIKE 'it-%'`);
    await sequelize.query(`DELETE FROM voice_evaluation_runs WHERE tenant_id = '${TENANT}' AND scenario_set = 'voice_ab'`);
    await sequelize.close();
  });

  it('a blind trial is stored and scored exactly once, even by 10 concurrent clicks', async () => {
    const id = await L.sqlTrialStore.create({ x: 'cedar', y: 'marin', text: 'Hello' }, 'admin-1');
    expect(await L.sqlTrialStore.get(id)).toMatchObject({ x: 'cedar', y: 'marin', preferred: null });
    const r = await Promise.all(Array.from({ length: 10 }, (_, i) => L.sqlTrialStore.score(id, 'X', `admin-${i}`)));
    expect(r.filter(Boolean).length).toBe(1);
    expect(await L.sqlTrialStore.get(id)).toMatchObject({ preferred: 'X' });
    expect(await L.sqlTrialStore.get('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('a route is created, updated, records its approver, and a path-key clash is null', async () => {
    const a = await L.applyRouteChange(null, change(), 'admin-1');
    const id = a!.id;
    expect(await L.getRoute(id)).toMatchObject({ path_key: 'it-route', mode: 'shadow', engine: 'synthflow_legacy', approved_by: 'admin-1', calls_7d: 0 });
    await L.applyRouteChange(id, change({ mode: 'disabled' }), 'admin-2');
    expect(await L.getRoute(id)).toMatchObject({ mode: 'disabled', approved_by: 'admin-2' });
    expect(await L.applyRouteChange(null, change(), 'admin-3')).toBeNull();
    expect((await L.listRoutes()).some((r) => r.id === id)).toBe(true);
  });

  it('numbers list never selects the restricted column; the Overview and Agents reads run', async () => {
    const n = await L.listNumbers();
    expect(n.every((x) => !('e164_restricted' in x))).toBe(true);
    const o = await Q.loadOverviewRows('live', 7);
    expect(Array.isArray(o.calls)).toBe(true);
    expect(typeof o.activeReservations).toBe('number');
    expect(Array.isArray(await Q.listAgentCards())).toBe(true);
    expect(await Q.listVersions('00000000-0000-4000-8000-000000000000')).toBeNull();
    expect((await L.versionFacts('00000000-0000-4000-8000-000000000000')).versionPublished).toBe(false);
  });
});
