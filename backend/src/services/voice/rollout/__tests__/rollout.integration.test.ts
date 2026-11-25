/**
 * VS4.5 rollout against a REAL Postgres (the CI integration tier).
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts rollout.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[rollout.integration] SKIPPED: no DATABASE_URL. See the header.');
}
jest.setTimeout(120_000);

describeIfDb('rollout against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let R: typeof import('../rolloutStore');
  let C: typeof import('../reconcile');
  let S: typeof import('../../twilio/voiceCallStore');
  const T = '7a111111-1111-4111-8111-111111111111';
  const P = '7a222222-2222-4222-8222-222222222222';
  const V = '7a333333-3333-4333-8333-333333333333';
  const RT = '7a444444-4444-4444-8444-444444444444';
  let n = 0;
  const q = (sql: string) => sequelize.query(sql);
  const req = (over: object = {}) => ({ tenantId: T, pathKey: 'pilot', brandSlug: 'colaberry', recipientRef: 'lead:1', idempotencyKey: `k${++n}`, testMode: false, ...over });
  const setRoute = (mode: string, percent: number, audience: string[] = ['lead:1']) => q(`UPDATE voice_routes SET mode = '${mode}', canary_percent = ${percent}, fallback = '${JSON.stringify({ kind: 'legacy', audience })}' WHERE id = '${RT}'`);
  const call = async (cols: Record<string, string>) => {
    const c = { tenant_id: `'${T}'`, engine: "'conversation_relay'", idempotency_key: `'ro-${++n}'`, recipient_ref: "'lead:1'", purpose: "'t'", ...cols };
    return ((await q(`INSERT INTO voice_calls (${Object.keys(c).join(', ')}) VALUES (${Object.values(c).join(', ')}) RETURNING id`)) as [Array<{ id: string }>, unknown])[0][0].id;
  };

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    await (await import('../../../../db/ensureVoiceStudioSchema')).ensureVoiceStudioSchema();
    await q('CREATE TABLE IF NOT EXISTS audit_logs (id UUID PRIMARY KEY, admin_user_id UUID, action VARCHAR(50), entity_type VARCHAR(100), entity_id UUID, old_values JSONB, new_values JSONB, created_at TIMESTAMPTZ)');
    R = await import('../rolloutStore');
    C = await import('../reconcile');
    S = await import('../../twilio/voiceCallStore');
    await q(`INSERT INTO voice_agent_profiles (id, tenant_id, brand_slug, agent_key, name, direction, status) VALUES ('${P}', '${T}', 'colaberry', 'edu-cory-outbound', 'x', 'outbound', 'active')`);
    await q(`INSERT INTO voice_agent_versions (id, tenant_id, profile_id, version, content_hash, prompt, disclosure, engine, author, status) VALUES ('${V}', '${T}', '${P}', 1, 'h', 'p', 'd', 'conversation_relay', 'a', 'published')`);
    await q(`INSERT INTO voice_routes (id, tenant_id, brand_slug, path_key, call_type, profile_id, version_id, engine, mode) VALUES ('${RT}', '${T}', 'colaberry', 'pilot', 'callback', '${P}', '${V}', 'conversation_relay', 'legacy')`);
  });
  beforeEach(async () => { await q(`DELETE FROM voice_calls WHERE tenant_id = '${T}'; DELETE FROM voice_dial_reservations WHERE tenant_id = '${T}'; DELETE FROM voice_allocations WHERE tenant_id = '${T}'; DELETE FROM audit_logs`); await setRoute('live', 0); });
  afterAll(async () => {
    await q(`DELETE FROM voice_calls WHERE tenant_id = '${T}'; DELETE FROM voice_allocations WHERE tenant_id = '${T}'; DELETE FROM voice_routes WHERE tenant_id = '${T}'; DELETE FROM voice_agent_versions WHERE tenant_id = '${T}'; DELETE FROM voice_agent_profiles WHERE tenant_id = '${T}'`);
    await sequelize.close();
  });

  it('reads the route, version and audience; another tenant cannot use them', async () => {
    expect(await R.allocateCall(sequelize, req(), true)).toMatchObject({ provider: 'direct', engine: 'conversation_relay', routeId: RT, versionId: V });
    expect(await R.allocateCall(sequelize, req({ tenantId: '7a999999-9999-4999-8999-999999999999' }), true)).toMatchObject({ provider: 'synthflow_legacy', reason: 'no_route' });
    await setRoute('canary', 100, ['lead:2']);
    expect(await R.allocateCall(sequelize, req(), true)).toMatchObject({ reason: 'outside_audience' });
    expect(await R.allocateCall(sequelize, req({ recipientRef: 'lead:2' }), true)).toMatchObject({ provider: 'direct' });
    await q(`UPDATE voice_agent_versions SET status = 'retired' WHERE id = '${V}'`);
    expect(await R.allocateCall(sequelize, req({ recipientRef: 'lead:2' }), true)).toMatchObject({ reason: 'version_not_published' });
    await q(`UPDATE voice_agent_versions SET status = 'published' WHERE id = '${V}'`);
  });

  it('a logical call already dispatched is never given to another provider', async () => {
    await call({ idempotency_key: "'same'", state: "'completed'" });
    expect(await R.allocateCall(sequelize, req({ idempotencyKey: 'same' }), true)).toMatchObject({ provider: 'none', reason: 'already_dispatched' });
    await call({ idempotency_key: "'unk'", state: "'dispatch_unknown'" });
    await R.rollbackRoute(sequelize, T, 'pilot', 'admin-1', false);
    expect(await R.allocateCall(sequelize, req({ idempotencyKey: 'unk' }), true)).toMatchObject({ provider: 'none', reason: 'outcome_unknown_never_redialed' });
  });

  it('rollback during a live call: the next call is legacy at once, the live one is untouched; it is audited once', async () => {
    const live = await call({ state: "'session_active'", route_id: `'${RT}'` });
    expect(await R.rollbackRoute(sequelize, T, 'pilot', 'admin-1', true)).toMatchObject({ changed: false, from: { mode: 'live' }, activeCalls: 1 });
    expect(await R.allocateCall(sequelize, req(), true)).toMatchObject({ provider: 'direct' }); // dry run changed nothing
    const t0 = Date.now();
    expect(await R.rollbackRoute(sequelize, T, 'pilot', 'admin-1', false)).toMatchObject({ changed: true, activeCalls: 1 });
    expect(await R.allocateCall(sequelize, req(), true)).toMatchObject({ provider: 'synthflow_legacy', reason: 'legacy_mode' });
    expect(Date.now() - t0).toBeLessThan(60_000);
    expect(await R.rollbackRoute(sequelize, T, 'pilot', 'admin-1', false)).toMatchObject({ changed: false });
    const [[c]] = (await q(`SELECT state, engine FROM voice_calls WHERE id = '${live}'`)) as [Array<{ state: string; engine: string }>, unknown];
    expect(c).toEqual({ state: 'session_active', engine: 'conversation_relay' });
    const [[a]] = (await q('SELECT COUNT(*)::int AS n FROM audit_logs')) as [Array<{ n: number }>, unknown];
    expect(a.n).toBe(1);
    expect(await R.rollbackRoute(sequelize, T, 'nope', 'admin-1', false)).toMatchObject({ changed: false, from: null });
  });

  it('a rollback that cannot be audited does not happen', async () => {
    await q('ALTER TABLE audit_logs RENAME TO audit_logs_away');
    try { await expect(R.rollbackRoute(sequelize, T, 'pilot', 'admin-1', false)).rejects.toThrow(); } finally { await q('ALTER TABLE audit_logs_away RENAME TO audit_logs'); }
    expect(await R.allocateCall(sequelize, req(), true)).toMatchObject({ provider: 'direct' });
  });

  const deps = (state: string) => ({ carrierStatus: jest.fn().mockResolvedValue({ providerCallId: 'CAx', state, observedAt: new Date().toISOString() }), append: (e: Parameters<typeof S.appendCallEvents>[0]) => S.appendCallEvents(e), recompute: (id: string) => S.recomputeCall(id) });

  it('reconcile: a dry run asks nobody; apply settles what the carrier knows and leaves the rest for a person', async () => {
    const known = await call({ state: "'dispatch_unknown'", provider_call_id: "'CA-k'" });
    const unknown = await call({ state: "'dispatch_unknown'" });
    await call({ state: "'session_active'" }); // recent: not our business
    await q(`INSERT INTO voice_dial_reservations (tenant_id, call_id, idempotency_key, destination_hash, purpose, status, lease_expires_at) VALUES ('${T}', '${known}', 'a', 'h', 't', 'ambiguous', NOW() - INTERVAL '1 minute')`);
    const d = deps('completed');
    expect(await C.runReconcile(sequelize, d, { apply: false })).toMatchObject({ settled: [], needsPerson: [unknown], unreconciled: 2, ambiguousReservations: 1, reservationsSettled: 0 });
    expect(d.carrierStatus).not.toHaveBeenCalled();
    const r = await C.runReconcile(sequelize, d, { apply: true });
    expect(r.settled).toEqual([{ callId: known, from: 'dispatch_unknown', to: 'completed' }]);
    expect(d.carrierStatus).toHaveBeenCalledTimes(1);
    const again = await C.runReconcile(sequelize, d, { apply: true });
    expect(again).toMatchObject({ settled: [], unreconciled: 1, ambiguousReservations: 0, needsPerson: [unknown] });
  });

  // ------- one provider per logical call -------
  const direct = async (k: string) => { const a = await R.allocateCall(sequelize, req({ idempotencyKey: k }), true); if (a.provider !== 'direct') throw new Error(JSON.stringify(a)); return a; };
  const claimStatus = async (k: string) => ((await q(`SELECT provider, status FROM voice_allocations WHERE tenant_id = '${T}' AND idempotency_key = '${k}'`)) as [Array<{ provider: string; status: string }>, unknown])[0][0];
  const held = async () => ((await q(`SELECT COUNT(*)::int AS n FROM voice_dial_reservations WHERE tenant_id = '${T}' AND status IN ('held','dispatching')`)) as [Array<{ n: number }>, unknown])[0][0].n;
  const content = { prompt: 'You are Cory.', first_message: null, disclosure: "This is Colaberry's AI assistant.", kb_refs: [], tool_permissions: [], engine: 'conversation_relay', engine_config: {}, voice_id: null, language: 'en-US', safety_policy: { bookingRequiresHumanApproval: true, maxToolCallsPerCall: 6 }, max_call_seconds: 120 };
  async function dispatcher(over: object = {}) {
    const { dispatchDirect } = await import('../directDispatch');
    const { createMockProvider } = await import('../../providers/mockProvider');
    const { reserveDial, transitionReservation } = await import('../../gateway/voiceReservation');
    const provider = createMockProvider(['accepted']);
    const d = {
      gateway: { mode: 'direct', now: () => new Date('2026-12-01T18:00:00Z'), killSwitch: async () => false, voiceEnabled: () => true, pathAllowed: () => true, resolveDestination: async () => ({ e164: '+15555550100', timezone: 'America/Chicago' }), exemptionFor: async () => null, consentFor: async () => 'granted', suppressedFor: async () => false,
        resolveRoute: async () => ({ routeId: null, profileVersionId: 'x', engine: 'conversation_relay', fromNumberRef: 'line-1', maxDurationSeconds: 60, caps: { perDestination24h: 1000, perRoutePerDay: null, perTenantPerDay: null } }), reserve: reserveDial, transition: transitionReservation, log: () => undefined },
      loadVersion: async () => ({ id: V, tenantId: T, profileId: P, brandSlug: 'colaberry', status: 'published', agentKey: 'edu-cory-outbound', content }), registeredTools: () => [], provider: () => provider, log: () => undefined,
      confirm: (id: string) => R.confirmDirect(sequelize, T, id), releaseClaim: (id: string, reserved: boolean) => R.releaseClaim(sequelize, T, id, reserved),
      insertCall: async (c: { callId: string; routeId: string }) => { await q(`INSERT INTO voice_calls (id, tenant_id, route_id, engine, idempotency_key, recipient_ref, purpose, state) VALUES ('${c.callId}', '${T}', '${c.routeId}', 'conversation_relay', 'row-${c.callId}', 'lead:1', 't', 'dispatching')`); return true; },
      recordOutcome: async () => undefined, ...over,
    } as unknown as Parameters<typeof dispatchDirect>[1];
    const go = (a: Awaited<ReturnType<typeof direct>>, k: string) => dispatchDirect({ allocation: a, tenantId: T, brandSlug: 'colaberry', pathKey: 'pilot', callType: 'callback', purpose: 'p', leadId: 1, recipientRef: 'lead:1', idempotencyKey: k }, d);
    return { go, provider };
  }

  it('(1) allocate, roll back, allocate again, dispatch the first: one owner, and no direct dial after the rollback', async () => {
    const a = await direct('key-one-1');
    await R.rollbackRoute(sequelize, T, 'pilot', 'admin-1', false);
    expect(await R.allocateCall(sequelize, req({ idempotencyKey: 'key-one-1' }), true)).toMatchObject({ provider: 'none', reason: 'already_claimed' });
    const { go, provider } = await dispatcher();
    expect(await go(a, 'key-one-1')).toMatchObject({ outcome: 'refused', reason: 'route_changed' });
    expect(provider.dispatched).toHaveLength(0);
    expect(await held()).toBe(0);
    expect(await claimStatus('key-one-1')).toEqual({ provider: 'direct', status: 'closed' });
    expect(await R.allocateCall(sequelize, req({ idempotencyKey: 'key-one-1' }), true)).toMatchObject({ provider: 'none' }); // finished, for good
  });

  it('(2) a key that went to legacy, whatever became of it, is never given to direct', async () => {
    await setRoute('legacy', 0);
    expect(await R.allocateCall(sequelize, req({ idempotencyKey: 'key-two-1' }), true)).toMatchObject({ provider: 'synthflow_legacy' });
    await setRoute('live', 0); // the legacy dial timed out: its outcome is unknown
    expect(await R.allocateCall(sequelize, req({ idempotencyKey: 'key-two-1' }), true)).toMatchObject({ provider: 'none', reason: 'already_claimed' });
  });

  it('(3) allocations racing a rollback: each key has exactly one owner, and nothing direct is confirmed after it', async () => {
    const keys = Array.from({ length: 12 }, (_, i) => `race-key-${i}`);
    const work = keys.flatMap((k) => [R.allocateCall(sequelize, req({ idempotencyKey: k }), true), R.allocateCall(sequelize, req({ idempotencyKey: k }), true)]);
    const [, ...rest] = await Promise.all([R.rollbackRoute(sequelize, T, 'pilot', 'admin-1', false), ...work]);
    keys.forEach((_, i) => expect([rest[2 * i], rest[2 * i + 1]].filter((a) => a.provider !== 'none')).toHaveLength(1));
    for (const a of rest) if (a.provider === 'direct') expect(await R.confirmDirect(sequelize, T, a.claimId!)).toBe(false); // eslint-disable-line no-await-in-loop
  });

  it('(4) a call row that cannot be written leaves no held reservation, and the key in a defined state', async () => {
    for (const [k, insertCall] of [['key-ins-a', async () => false], ['key-ins-b', async () => { throw new Error('db'); }]] as const) {
      const { go, provider } = await dispatcher({ insertCall }); // eslint-disable-line no-await-in-loop
      expect(await go(await direct(k), k)).toMatchObject({ outcome: 'refused' }); // eslint-disable-line no-await-in-loop
      expect(provider.dispatched).toHaveLength(0);
      expect(await held()).toBe(0); // eslint-disable-line no-await-in-loop
      expect(await claimStatus(k)).toEqual({ provider: 'direct', status: 'closed' }); // eslint-disable-line no-await-in-loop
    }
  });

  it('four dispatches of one claim: one dial', async () => {
    const a = await direct('key-four-1');
    const { go, provider } = await dispatcher();
    const rs = await Promise.all([1, 2, 3, 4].map(() => go(a, 'key-four-1')));
    expect(rs.filter((r) => r.outcome === 'accepted')).toHaveLength(1);
    expect(provider.dispatched).toHaveLength(1);
    expect(await claimStatus('key-four-1')).toEqual({ provider: 'direct', status: 'dispatching' });
  });

  it('a claim refused before anything was reserved may be claimed again; one being dialed may not be reopened', async () => {
    const a = await direct('key-aban-1');
    await R.releaseClaim(sequelize, T, a.claimId!, false);
    await setRoute('legacy', 0);
    expect(await R.allocateCall(sequelize, req({ idempotencyKey: 'key-aban-1' }), true)).toMatchObject({ provider: 'synthflow_legacy' });
    expect(await R.confirmDirect(sequelize, T, a.claimId!)).toBe(false); // the old direct allocation is dead
    await setRoute('live', 0);
    const b = await direct('key-aban-2');
    expect(await R.confirmDirect(sequelize, T, b.claimId!)).toBe(true);
    expect(await R.confirmDirect(sequelize, T, b.claimId!)).toBe(false); // once
    await R.releaseClaim(sequelize, T, b.claimId!, false);
    expect(await claimStatus('key-aban-2')).toEqual({ provider: 'direct', status: 'dispatching' });
    expect(await R.confirmDirect(sequelize, '7a999999-9999-4999-8999-999999999999', b.claimId!)).toBe(false);
  });

  it('when the claim cannot be written nobody may dial', async () => {
    await q('ALTER TABLE voice_allocations RENAME TO voice_allocations_away');
    try { expect(await R.allocateCall(sequelize, req(), true)).toEqual({ provider: 'none', reason: 'claim_unavailable', bucket: null }); } finally { await q('ALTER TABLE voice_allocations_away RENAME TO voice_allocations'); }
  });

  it('a disabled route is left alone by a rollback: legacy would switch dialing back on', async () => {
    await setRoute('disabled', 0);
    expect(await R.rollbackRoute(sequelize, T, 'pilot', 'admin-1', false)).toMatchObject({ changed: false, reason: 'disabled_left_alone' });
    expect(await R.allocateCall(sequelize, req(), true)).toMatchObject({ provider: 'none', reason: 'route_disabled' });
  });

  it('reconcile settles reservations of calls the carrier webhook already ended, and dispatching ones; a fresh or live one is left', async () => {
    const res = (id: string, k: string, status: string, lease: string) => q(`INSERT INTO voice_dial_reservations (tenant_id, call_id, idempotency_key, destination_hash, purpose, status, lease_expires_at) VALUES ('${T}', '${id}', '${k}', 'h', 't', '${status}', ${lease})`);
    await res(await call({ state: "'completed'" }), 'w1', 'ambiguous', "NOW() - INTERVAL '1 minute'");
    await res(await call({ state: "'completed'" }), 'w2', 'dispatching', "NOW() - INTERVAL '1 minute'");
    await res(await call({ state: "'completed'" }), 'w3', 'dispatching', "NOW() + INTERVAL '1 minute'");
    await res(await call({ state: "'session_active'" }), 'w4', 'ambiguous', "NOW() - INTERVAL '1 minute'");
    expect(await C.runReconcile(sequelize, deps('completed'), { apply: false })).toMatchObject({ reservationsSettled: 2, ambiguousReservations: 2 });
    expect(await C.runReconcile(sequelize, deps('completed'), { apply: true })).toMatchObject({ reservationsSettled: 2, ambiguousReservations: 1 });
    expect(await C.runReconcile(sequelize, deps('completed'), { apply: true })).toMatchObject({ reservationsSettled: 0 });
  });

  it('reconcile: rows only a person can settle never starve the rest, and the total is the true total', async () => {
    await q(`INSERT INTO voice_calls (tenant_id, engine, idempotency_key, recipient_ref, purpose, state, created_at) SELECT '${T}', 'conversation_relay', 'starve-' || g, 'lead:1', 't', 'dispatch_unknown', NOW() - INTERVAL '2 days' FROM generate_series(1, 120) g`);
    const id = await call({ state: "'dispatch_unknown'", provider_call_id: "'CA-st'" });
    const r = await C.runReconcile(sequelize, deps('completed'), { apply: true });
    expect(r.settled.map((x) => x.callId)).toEqual([id]);
    expect(r.unreconciled).toBe(120);
  });

  it('reconcile: a carrier failure is reported by class and changes nothing; a call still in progress is not settled', async () => {
    const id = await call({ state: "'dispatch_unknown'", provider_call_id: "'CA-f'" });
    const d = { ...deps('completed'), carrierStatus: jest.fn().mockRejectedValue(Object.assign(new Error('x'), { errorClass: 'RateLimitError' })) };
    expect(await C.runReconcile(sequelize, d, { apply: true })).toMatchObject({ failed: [{ callId: id, errorClass: 'RateLimitError' }], unreconciled: 1 });
    expect(await C.runReconcile(sequelize, deps('ringing'), { apply: true })).toMatchObject({ settled: [], unreconciled: 0 }); // known to be live now, not settled
  });

  it('reconcile: a canary dispatch outside the approved audience is named', async () => {
    await setRoute('canary', 50, ['lead:7']);
    await call({ route_id: `'${RT}'`, recipient_ref: "'lead:7'", state: "'completed'" });
    const bad = await call({ route_id: `'${RT}'`, recipient_ref: "'lead:8'", state: "'completed'" });
    expect((await C.runReconcile(sequelize, deps('completed'), { apply: false })).canaryOutsideAudience).toEqual([bad]);
  });
});
