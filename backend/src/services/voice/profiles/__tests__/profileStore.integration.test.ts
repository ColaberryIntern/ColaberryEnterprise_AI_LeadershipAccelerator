/**
 * VS3.1 profile store against a REAL Postgres (the CI integration tier): idempotent profile and
 * version creation, version numbering under concurrency, the four-eyes lifecycle, one published
 * version per profile, and no content mutation path.
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts profileStore.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[profileStore.integration] SKIPPED: no DATABASE_URL. See the header.');
}
jest.setTimeout(120_000);

describeIfDb('voice profile store against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let S: typeof import('../profileStore');
  const T = '95555555-5555-4555-8555-555555555555';
  const content = (prompt: string) => ({
    prompt, first_message: null, disclosure: "This is Colaberry's AI assistant. I'm an AI, not a person.",
    kb_refs: ['admissions_knowledge'], tool_permissions: ['next_open_strategy_slots'], engine: 'conversation_relay',
    engine_config: { promptShell: true }, voice_id: null, language: 'en-US',
    safety_policy: { bookingRequiresHumanApproval: true, maxToolCallsPerCall: 6 }, max_call_seconds: 180,
  });
  let profileId = '';

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    await (await import('../../../../db/ensureVoiceStudioSchema')).ensureVoiceStudioSchema();
    S = await import('../profileStore');
    await sequelize.query(`DELETE FROM voice_agent_versions WHERE tenant_id = '${T}'`);
    await sequelize.query(`DELETE FROM voice_agent_profiles WHERE tenant_id = '${T}'`);
  });
  afterAll(async () => {
    await sequelize.query(`UPDATE voice_agent_profiles SET active_version_id = NULL WHERE tenant_id = '${T}'`);
    await sequelize.query(`DELETE FROM voice_agent_versions WHERE tenant_id = '${T}'`);
    await sequelize.query(`DELETE FROM voice_agent_profiles WHERE tenant_id = '${T}'`);
    await sequelize.close();
  });

  it('ensureProfile is idempotent', async () => {
    const p = { tenantId: T, brandSlug: 'colaberry', agentKey: 'edu-cory-outbound', name: 'Edu: Cory - Outbound', direction: 'outbound' as const };
    const a = await S.ensureProfile(p);
    const b = await S.ensureProfile(p);
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.profile.id).toBe(a.profile.id);
    profileId = a.profile.id;
  });

  it('same content returns the same version; changed content gets the next number', async () => {
    const v1 = await S.createDraftVersion(profileId, content('{prompt}'), 'seed:test');
    const again = await S.createDraftVersion(profileId, content('{prompt}'), 'seed:test');
    const v2 = await S.createDraftVersion(profileId, content('{prompt} v2'), 'seed:test');
    expect(v1.created).toBe(true);
    expect(again).toEqual({ version: expect.objectContaining({ id: v1.version.id }), created: false });
    expect(v2.version.version).toBe(v1.version.version + 1);
    expect(v2.version.content_hash).not.toBe(v1.version.content_hash);
  });

  it('20 concurrent saves of distinct content get 20 distinct consecutive numbers', async () => {
    const res = await Promise.all(Array.from({ length: 20 }, (_, i) => S.createDraftVersion(profileId, content(`{prompt} c${i}`), 'seed:test')));
    const nums = res.map((r) => r.version.version).sort((a, b) => a - b);
    expect(new Set(nums).size).toBe(20);
    expect(nums[19] - nums[0]).toBe(19);
  });

  it('20 concurrent saves of the SAME content create exactly one version', async () => {
    const res = await Promise.all(Array.from({ length: 20 }, () => S.createDraftVersion(profileId, content('{prompt} same'), 'seed:test')));
    expect(res.filter((r) => r.created).length).toBe(1);
    expect(new Set(res.map((r) => r.version.id)).size).toBe(1);
  });

  it('invalid content writes nothing', async () => {
    const [[before]] = await sequelize.query(`SELECT COUNT(*)::int AS n FROM voice_agent_versions WHERE tenant_id = '${T}'`) as [Array<{ n: number }>, unknown];
    await expect(S.createDraftVersion(profileId, { ...content('x'), disclosure: 'Hello from Colaberry!' }, 'seed:test')).rejects.toMatchObject({ errorClass: 'ValidationError' });
    const [[after]] = await sequelize.query(`SELECT COUNT(*)::int AS n FROM voice_agent_versions WHERE tenant_id = '${T}'`) as [Array<{ n: number }>, unknown];
    expect(after.n).toBe(before.n);
  });

  it('four eyes, then publish; a second publish retires the first; only one published at a time', async () => {
    const a = (await S.createDraftVersion(profileId, content('{prompt} pub-a'), 'seed:test')).version;
    const b = (await S.createDraftVersion(profileId, content('{prompt} pub-b'), 'seed:test')).version;
    await expect(S.changeVersionStatus(a.id, 'approve', 'seed:test')).rejects.toMatchObject({ errorClass: 'LifecycleError' });
    await expect(S.changeVersionStatus(a.id, 'publish', 'ali@x')).rejects.toMatchObject({ errorClass: 'LifecycleError' });
    await S.changeVersionStatus(a.id, 'approve', 'ali@x');
    await S.changeVersionStatus(b.id, 'approve', 'ali@x');
    await S.changeVersionStatus(a.id, 'publish', 'ali@x');
    expect((await S.activeVersion(profileId))?.id).toBe(a.id);
    await Promise.all([S.changeVersionStatus(b.id, 'publish', 'ali@x')]);
    const [rows] = await sequelize.query(`SELECT id, status FROM voice_agent_versions WHERE profile_id = '${profileId}' AND status = 'published'`) as [Array<{ id: string }>, unknown];
    expect(rows.map((r) => r.id)).toEqual([b.id]);
    expect((await S.activeVersion(profileId))?.id).toBe(b.id);
    const [[old]] = await sequelize.query(`SELECT status, prompt FROM voice_agent_versions WHERE id = '${a.id}'`) as [Array<{ status: string; prompt: string }>, unknown];
    expect(old).toEqual({ status: 'retired', prompt: '{prompt} pub-a' });
  });

  it('retiring the published version clears the active pointer; unknown ids are NotFound', async () => {
    const active = await S.activeVersion(profileId);
    await S.changeVersionStatus(active!.id, 'retire', 'ali@x');
    expect(await S.activeVersion(profileId)).toBeNull();
    await expect(S.changeVersionStatus('96666666-6666-4666-8666-666666666666', 'approve', 'ali@x')).rejects.toMatchObject({ errorClass: 'NotFound' });
    await expect(S.createDraftVersion('96666666-6666-4666-8666-666666666666', content('x'), 'a')).rejects.toMatchObject({ errorClass: 'NotFound' });
  });

  it('the store exposes no content-update function (immutability by construction)', () => {
    expect(Object.keys(S).sort()).toEqual(['ProfileStoreError', 'activeVersion', 'changeVersionStatus', 'createDraftVersion', 'ensureProfile']);
  });
});
