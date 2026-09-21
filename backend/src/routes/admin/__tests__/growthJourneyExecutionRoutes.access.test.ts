import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * T518 — the operator's switchboard on the admin router, on the same harness
 * as the handoff routes: `requireAdmin`, the router, the guard functions, the
 * controls service AND the probe are REAL; the controls table is T503's fixture
 * (its partial unique on `scope_key` enforced), the brand, programme and lead
 * reads are in-memory rows, and the membership bridge, the access audit and
 * the event ledger are spies. Every status code below is the one the shipped
 * code returns.
 *
 * The second half proves the plan's round trip: a pause written through the
 * route is what the read-only probe lists under active controls - with the
 * flags OFF - and a clear through the route is what makes it disappear.
 */

const growthJourney = { growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: false, journeyDecisions: false, journeyHandoffs: false, journeyExecution: false };
const explorerGrowth = { growthOsEnabled: true, signalIngestEnabled: false, journeyIntelligenceEnabled: false, journeyGovernorEnabled: false, commercialEnabled: false, aliOutreachEnabled: false, smsEnabled: false, autoDialEnabled: false, inAppNudgeEnabled: true, aiRankingEnabled: false };
jest.mock('../../../config/env', () => ({ env: { jwtSecret: 'test-secret', nodeEnv: 'test', growthJourney, explorerGrowth } }));
jest.mock('../../../services/aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));

/* ── the in-memory world ────────────────────────────────────────────────────── */

const TENANT = { colaberry: '10000000-0000-4000-8000-000000000002', aiFlotation: '10000000-0000-4000-8000-000000000003' };
const BRAND = { training: '20000000-0000-4000-8000-000000000002', enterprise: '20000000-0000-4000-8000-000000000003', aiFlotation: '20000000-0000-4000-8000-000000000004' };
const PROGRAM = { enterprise: '40000000-0000-4000-8000-000000000001', training: '40000000-0000-4000-8000-000000000002', aiFlotation: '40000000-0000-4000-8000-000000000003' };
const brands = [
  { id: BRAND.training, tenant_id: TENANT.colaberry, slug: 'colaberry-training' },
  { id: BRAND.enterprise, tenant_id: TENANT.colaberry, slug: 'colaberry-enterprise' },
  { id: BRAND.aiFlotation, tenant_id: TENANT.aiFlotation, slug: 'ai-flotation' },
];
const programs = [
  { id: PROGRAM.enterprise, tenant_id: TENANT.colaberry, brand_id: BRAND.enterprise, slug: 'business-growth', status: 'active' },
  { id: PROGRAM.training, tenant_id: TENANT.colaberry, brand_id: BRAND.training, slug: 'learner-journey', status: 'draft' },
  { id: PROGRAM.aiFlotation, tenant_id: TENANT.aiFlotation, brand_id: BRAND.aiFlotation, slug: 'flotation-growth', status: 'draft' },
];
const asRow = <T extends Record<string, unknown>>(r: T) => ({ ...r, get: (k: string) => r[k] });
const controlCreate = jest.fn();
const controlDestroy = jest.fn();
const receiptCount = jest.fn();
jest.mock('../../../models', () => {
  const { T5 } = require('../../../services/growthJourney/__tests__/fixtures/phase5Tables');
  return {
    GrowthJourneyEnrollment: { findByPk: jest.fn(), findAndCountAll: jest.fn() },
    GrowthJourneyClassification: { findByPk: jest.fn(), findAndCountAll: jest.fn() },
    GrowthJourneyDecision: { findByPk: jest.fn(), findAndCountAll: jest.fn() },
    GrowthJourneyHandoff: { findByPk: jest.fn(), findAndCountAll: jest.fn() },
    GrowthJourneyExecutionControl: {
      // The id is the database's default (gen_random_uuid) - the fixture's `ctl-N` would not pass the param schema, and never exists in production.
      create: async (attrs: Record<string, unknown>) => { controlCreate(attrs); return T5.controls.insert({ id: require('crypto').randomUUID(), ...attrs }); },
      findByPk: async (id: string) => T5.controls.findOne({ where: { id } }),
      findOne: (...a: unknown[]) => T5.controls.findOne(...(a as [never])),
      findAll: (...a: unknown[]) => T5.controls.findAll(...(a as [never])),
      update: (...a: unknown[]) => T5.controls.update(...(a as [never, never])),
      destroy: (...a: unknown[]) => controlDestroy(...a),
    },
    GrowthJourneyExecution: { count: (...a: unknown[]) => receiptCount(...a) },
    Brand: {
      findByPk: async (id: string) => brands.map(asRow).find((b) => b.id === id) ?? null,
      findAll: async ({ where }: { where: { id: string[] } }) => brands.filter((b) => where.id.includes(b.id)).map(asRow),
    },
    JourneyProgram: {
      findByPk: async (id: string) => programs.map(asRow).find((p) => p.id === id) ?? null,
      findAll: async () => programs.map(asRow),
    },
    Lead: { findAll: async ({ where }: { where: { id: { [k: symbol]: number[] } } }) => Object.getOwnPropertySymbols(where.id).flatMap((s) => (where.id as Record<symbol, number[]>)[s]).filter((id) => id < 900).map((id) => asRow({ id })) },
  };
});
jest.mock('../../../services/growthJourney/offerEligibility', () => {
  class OfferNotEligibleError extends Error {
    readonly error_class = 'OfferNotEligibleError';
    constructor(readonly decision: Record<string, unknown>) { super('Offer not eligible'); this.name = 'OfferNotEligibleError'; }
  }
  return { OfferNotEligibleError };
});
jest.mock('../../../services/growthJourney/classificationService', () => ({ overrideClassification: jest.fn() }));
jest.mock('../../../services/growthJourney/integration/integrateDisposition', () => ({ integrateDisposition: jest.fn() }));
const logEvent = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../services/ledgerService', () => ({ logEvent: (...a: unknown[]) => logEvent(...a) }));
jest.mock('../../../services/launchSafety', () => ({ isKillSwitchActiveStrict: jest.fn().mockResolvedValue(false), isKillSwitchActive: jest.fn().mockResolvedValue(false) }));
const contextFromAdminRequest = jest.fn();
jest.mock('../../../modules/tenancy/adminScopeBridge', () => ({ contextFromAdminRequest: (...a: unknown[]) => contextFromAdminRequest(...a) }));
const recordAccessDecision = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../modules/tenancy/tenantAccessAudit', () => ({ recordAccessDecision: (...a: unknown[]) => recordAccessDecision(...a) }));

import growthJourneyRoutes from '../growthJourneyRoutes';
import { T5, resetPhase5Tables } from '../../../services/growthJourney/__tests__/fixtures/phase5Tables';
import { buildReport } from '../../../scripts/growthJourneyExecutionStatus';

const BASE = '/api/admin/growth-journey';
const CONTROLS = `${BASE}/execution/controls`;
const PAUSES = `${BASE}/execution/pauses`;
const ROLLOUTS = `${BASE}/execution/rollouts`;
const STAFF_EMAIL = 'staff@colaberry.com';
const ADMIN_ID = 'staff-1';

const token = (role = 'admin') => jwt.sign({ sub: ADMIN_ID, email: STAFF_EMAIL, role }, 'test-secret');
function app() { const a = express(); a.use(express.json()); a.use(growthJourneyRoutes); return a; }
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token()}`);
const post = (url: string, body: Record<string, unknown>) => auth(request(app()).post(url)).send(body);
const get = (url: string) => auth(request(app()).get(url));

const memberOf = (tenantId: string, brandId: string | null = null, authorizedBrandIds: string[] | null = null) => ({
  platformIdentityId: 'pid-1', tenantId, brandId, organizationId: null, roles: ['tenant_admin'], isPlatformSuperAdmin: false, authorizedTenantIds: [tenantId], authorizedBrandIds,
});
const superAdmin = () => ({ platformIdentityId: 'pid-0', tenantId: null, brandId: null, organizationId: null, roles: ['platform_superadmin'], isPlatformSuperAdmin: true, authorizedTenantIds: [], authorizedBrandIds: null });

const REVIEW = { brand_id: BRAND.enterprise, program_id: PROGRAM.enterprise, channel: 'email', mode: 'review', reason: 'first review cohort' };
const LIMITED = { ...REVIEW, channel: 'in_app', mode: 'limited', cohort_lead_ids: [11, 12], daily_limit: 5 };
const BRAND_PAUSE = { brand_id: BRAND.enterprise, channel: 'email', reason: 'sender warm-up' };
const decisions = () => recordAccessDecision.mock.calls.map((c) => c[0] as Record<string, unknown>);
const probe = (over: Partial<typeof growthJourney> = {}) => buildReport({ flags: { ...growthJourney, ...over }, explorerFlags: explorerGrowth as never, asOf: new Date('2026-09-21T15:00:00.000Z') });

beforeEach(() => {
  resetPhase5Tables();
  controlCreate.mockClear(); controlDestroy.mockClear(); logEvent.mockClear(); recordAccessDecision.mockClear();
  receiptCount.mockReset().mockImplementation(async (q: { group?: string[] }) => (q?.group ? [] : 0));
  contextFromAdminRequest.mockReset().mockResolvedValue(memberOf(TENANT.colaberry, null));
  growthJourney.growthJourneyEnabled = true;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  // A control is cleared, never destroyed - by any route, ever.
  expect(controlDestroy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('the status matrix, on all five routes', () => {
  it('acceptance 1: 401 unauthenticated on every route; the control - a path under the base that is not mounted - is a plain 404 with a token, so the 401s are the guard, not a broken app', async () => {
    expect((await request(app()).get(CONTROLS)).status).toBe(401);
    expect((await request(app()).post(PAUSES).send(BRAND_PAUSE)).status).toBe(401);
    expect((await request(app()).post(`${PAUSES}/${PROGRAM.enterprise}/clear`).send({})).status).toBe(401);
    expect((await request(app()).post(ROLLOUTS).send(REVIEW)).status).toBe(401);
    expect((await request(app()).post(`${ROLLOUTS}/${PROGRAM.enterprise}/clear`).send({})).status).toBe(401);
    expect(contextFromAdminRequest).not.toHaveBeenCalled();
    expect((await get(`${BASE}/execution/nope`)).status).toBe(404);
    expect((await request(app()).get(`${BASE}/execution/nope`)).status).toBe(401);
  });

  it('404 on every route when the master flag is off, before anything is read, written or audited', async () => {
    growthJourney.growthJourneyEnabled = false;
    for (const r of [get(CONTROLS), post(PAUSES, BRAND_PAUSE), post(ROLLOUTS, REVIEW), post(`${PAUSES}/${PROGRAM.enterprise}/clear`, {}), post(`${ROLLOUTS}/${PROGRAM.enterprise}/clear`, {})]) {
      expect((await r).body).toEqual({ error: 'Not found' });
    }
    expect(contextFromAdminRequest).not.toHaveBeenCalled();
    expect(controlCreate).not.toHaveBeenCalled();
    expect(recordAccessDecision).not.toHaveBeenCalled();
  });

  it('acceptance 2: a rollout by an admin who is not a platform super admin is 403, recorded as denied on the cross-tenant permission, and nothing is written', async () => {
    const r = await post(ROLLOUTS, REVIEW);
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error_class: 'AuthorizationError' });
    expect(decisions()).toEqual([expect.objectContaining({ decision: 'denied', permission: 'platform.cross_tenant', action: 'set_rollout', resourceType: 'growth_journey_execution_control', actorEmail: STAFF_EMAIL })]);
    expect(controlCreate).not.toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalled();
    // the same for a pause with no brand: it spans brands, so it is the platform's
    const p = await post(PAUSES, { tenant_id: TENANT.colaberry, channel: 'email', reason: 'all email' });
    expect(p.status).toBe(403);
    expect(controlCreate).not.toHaveBeenCalled();
  });

  it('acceptance 3: `sms` is a 400 for a rollout and for a pause - no voice or SMS channel is governable here', async () => {
    contextFromAdminRequest.mockResolvedValue(superAdmin());
    const r = await post(ROLLOUTS, { ...REVIEW, channel: 'sms' });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body.details)).toContain('channel');
    expect((await post(PAUSES, { ...BRAND_PAUSE, channel: 'sms' })).status).toBe(400);
    expect((await post(PAUSES, { ...BRAND_PAUSE, channel: 'voice' })).status).toBe(400);
    expect((await post(ROLLOUTS, { ...REVIEW, channel: 'ali_outreach' })).status).toBe(400);
    expect(controlCreate).not.toHaveBeenCalled();
    expect(recordAccessDecision).not.toHaveBeenCalled();
  });

  it('acceptance 4: an all-wildcard pause is a 400 - a second global kill switch is refused before any guard runs', async () => {
    contextFromAdminRequest.mockResolvedValue(superAdmin());
    const r = await post(PAUSES, { tenant_id: TENANT.colaberry, reason: 'stop everything' });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toMatch(/brand, a programme, a channel or a subject/);
    expect(controlCreate).not.toHaveBeenCalled();
    expect(recordAccessDecision).not.toHaveBeenCalled();
  });

  it('the rollout body: limited needs 1-50 existing cohort ids and a 1-25 daily limit; review carries neither; a programme outside the brand is refused', async () => {
    contextFromAdminRequest.mockResolvedValue(superAdmin());
    expect((await post(ROLLOUTS, { ...LIMITED, cohort_lead_ids: undefined })).status).toBe(400);
    expect((await post(ROLLOUTS, { ...LIMITED, daily_limit: 26 })).status).toBe(400);
    expect((await post(ROLLOUTS, { ...LIMITED, daily_limit: 0 })).status).toBe(400);
    expect((await post(ROLLOUTS, { ...LIMITED, cohort_lead_ids: Array.from({ length: 51 }, (_, i) => i + 1) })).status).toBe(400);
    expect((await post(ROLLOUTS, { ...REVIEW, daily_limit: 5 })).status).toBe(400);
    const missing = await post(ROLLOUTS, { ...LIMITED, cohort_lead_ids: [11, 901] });
    expect(missing.status).toBe(400);
    expect(missing.body).toMatchObject({ code: 'cohort_lead_missing', missing: [901] });
    const foreign = await post(ROLLOUTS, { ...REVIEW, program_id: PROGRAM.training });
    expect(foreign.status).toBe(400);
    expect(foreign.body).toMatchObject({ code: 'program_not_in_brand' });
    expect(controlCreate).not.toHaveBeenCalled();
  });

  it('acceptance 5: a second active control for a scope is a 409 from the index, with the scope key; the first row is untouched', async () => {
    contextFromAdminRequest.mockResolvedValue(superAdmin());
    const first = await post(ROLLOUTS, REVIEW);
    expect(first.status).toBe(201);
    const dup = await post(ROLLOUTS, { ...REVIEW, mode: 'limited', cohort_lead_ids: [11], daily_limit: 1 });
    expect(dup.status).toBe(409);
    expect(dup.body).toEqual({ error: expect.stringContaining('already exists'), error_class: 'ConflictError', scope_key: `rollout|${BRAND.enterprise}|${PROGRAM.enterprise}|email` });
    expect(T5.controls.rows).toHaveLength(1);
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.enterprise, [BRAND.enterprise]));
    expect((await post(PAUSES, BRAND_PAUSE)).status).toBe(201);
    expect((await post(PAUSES, BRAND_PAUSE)).status).toBe(409);
    expect(logEvent).toHaveBeenCalledTimes(2);
  });
});

describe('a pause on a brand: the brand\'s admins', () => {
  it('201 with the id for a member of the brand\'s tenant; the row and the ledger carry the admin\'s id, never the email; the reason stays off the ledger', async () => {
    const r = await post(PAUSES, BRAND_PAUSE);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ id: expect.any(String), control: { kind: 'pause', mode: 'off', brand_id: BRAND.enterprise, channel: 'email', tenant_id: TENANT.colaberry, scope_key: `pause|${BRAND.enterprise}|*|email|*`, set_by_admin_id: ADMIN_ID, reason: 'sender warm-up' } });
    expect(decisions()).toEqual([expect.objectContaining({ decision: 'allowed', action: 'set_pause', resourceTenantId: TENANT.colaberry, resourceBrandId: BRAND.enterprise })]);
    expect(logEvent).toHaveBeenCalledTimes(1);
    const [type, actor, entity, entityId, payload, scope] = logEvent.mock.calls[0];
    expect([type, actor, entity, entityId, scope]).toEqual(['growth_journey.execution.control_set', ADMIN_ID, 'growth_journey_execution_control', r.body.id, { tenant_id: TENANT.colaberry, brand_id: BRAND.enterprise }]);
    expect(JSON.stringify(payload)).not.toMatch(/@|warm-up/);
  });

  it('404, byte-identical to not-found, for another tenant\'s brand and for a brand that does not exist; 403 for another brand inside the caller\'s tenant', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.aiFlotation, null));
    const foreign = await post(PAUSES, BRAND_PAUSE);
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual({ error: 'Not found' });
    const unknown = await post(PAUSES, { ...BRAND_PAUSE, brand_id: '20000000-0000-4000-8000-000000000099' });
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual(foreign.body);
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.training, [BRAND.training]));
    const sibling = await post(PAUSES, BRAND_PAUSE);
    expect(sibling.status).toBe(403);
    expect(decisions().map((d) => d.decision)).toEqual(['denied', 'denied']);
    expect(controlCreate).not.toHaveBeenCalled();
  });

  it('a subject pause names the subject; a programme pause on the brand is the brand\'s too', async () => {
    const subject = await post(PAUSES, { brand_id: BRAND.enterprise, subject_ref: 'lead:501', reason: 'asked us to wait' });
    expect(subject.status).toBe(201);
    expect(subject.body.control.scope_key).toBe(`pause|${BRAND.enterprise}|*|*|lead:501`);
    const program = await post(PAUSES, { brand_id: BRAND.enterprise, program_id: PROGRAM.enterprise, reason: 'programme review' });
    expect(program.status).toBe(201);
    expect((await post(PAUSES, { brand_id: BRAND.enterprise, subject_ref: 'lead:5|01', reason: 'x' })).status).toBe(400);
  });
});

describe('the platform\'s writes', () => {
  it('a super admin sets a rollout (201), a no-brand pause (201, the named tenant, a null brand in the ledger scope), both recorded as allowed on the cross-tenant permission', async () => {
    contextFromAdminRequest.mockResolvedValue(superAdmin());
    const rollout = await post(ROLLOUTS, LIMITED);
    expect(rollout.status).toBe(201);
    expect(rollout.body.control).toMatchObject({ kind: 'rollout', mode: 'limited', cohort_lead_ids: [11, 12], daily_limit: 5, tenant_id: TENANT.colaberry, scope_key: `rollout|${BRAND.enterprise}|${PROGRAM.enterprise}|in_app` });
    const pause = await post(PAUSES, { tenant_id: TENANT.colaberry, channel: 'email', reason: 'all email' });
    expect(pause.status).toBe(201);
    expect(pause.body.control).toMatchObject({ kind: 'pause', brand_id: null, channel: 'email', tenant_id: TENANT.colaberry, scope_key: 'pause|*|*|email|*' });
    expect(decisions().map((d) => [d.decision, d.permission, d.action])).toEqual([['allowed', 'platform.cross_tenant', 'set_rollout'], ['allowed', 'platform.cross_tenant', 'set_pause']]);
    expect(logEvent.mock.calls[1][5]).toEqual({ tenant_id: TENANT.colaberry, brand_id: null });
    const unknownBrand = await post(ROLLOUTS, { ...REVIEW, brand_id: '20000000-0000-4000-8000-000000000099' });
    expect(unknownBrand.status).toBe(404);
  });
});

describe('acceptance 6: the round trip through the probe', () => {
  it('POST /pauses -> 201, and the probe lists it under active controls with the flags OFF (mode off, flag_master_off); POST .../clear -> 200, and it is gone', async () => {
    const created = await post(PAUSES, BRAND_PAUSE);
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    const dark = await probe({ growthJourneyEnabled: false });
    const scope = dark.scopes.find((s) => s.brand_id === BRAND.enterprise && s.channel === 'email')!;
    expect(scope).toMatchObject({ mode: 'off', mode_reason: 'flag_master_off' });
    expect(scope.controls.map((c) => c.id)).toEqual([id]);
    expect(scope.controls[0]).toMatchObject({ kind: 'pause', scope_key: `pause|${BRAND.enterprise}|*|email|*`, mode: 'off', set_by_admin_id: ADMIN_ID });
    // the same pause covers no other channel, no other brand
    expect(dark.scopes.find((s) => s.brand_id === BRAND.enterprise && s.channel === 'in_app')!.controls).toEqual([]);
    expect(dark.scopes.find((s) => s.brand_id === BRAND.training && s.channel === 'email')!.controls).toEqual([]);

    const cleared = await post(`${PAUSES}/${id}/clear`, { reason: 'warm-up done' });
    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({ status: 'cleared', control: { id, cleared_by_admin_id: ADMIN_ID } });
    expect(cleared.body.control.cleared_at).toEqual(expect.any(String));
    const after = await probe({ growthJourneyEnabled: false });
    expect(after.scopes.find((s) => s.brand_id === BRAND.enterprise && s.channel === 'email')!.controls).toEqual([]);
    expect(T5.controls.rows).toHaveLength(1); // cleared, never deleted
    expect(logEvent.mock.calls.map((c) => c[0])).toEqual(['growth_journey.execution.control_set', 'growth_journey.execution.control_cleared']);

    const again = await post(`${PAUSES}/${id}/clear`, {});
    expect(again.status).toBe(200);
    expect(again.body.status).toBe('already_cleared');
    expect(logEvent).toHaveBeenCalledTimes(2);
  });

  it('the same codes for a rollout: 201 and listed (mode review when the flags are on, the rollout row named), 200 cleared and the scope drops back to shadow', async () => {
    contextFromAdminRequest.mockResolvedValue(superAdmin());
    const created = await post(ROLLOUTS, REVIEW);
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    const on = await probe({ journeyDecisions: true, journeyExecution: true });
    const scope = on.scopes.find((s) => s.brand_id === BRAND.enterprise && s.channel === 'email')!;
    expect(scope).toMatchObject({ mode: 'review', mode_reason: 'rollout' });
    expect(scope.controls.map((c) => [c.id, c.kind])).toEqual([[id, 'rollout']]);
    expect((await probe()).scopes.find((s) => s.brand_id === BRAND.enterprise && s.channel === 'email')!.controls.map((c) => c.id)).toEqual([id]); // listed in the dark too
    const cleared = await post(`${ROLLOUTS}/${id}/clear`, {});
    expect(cleared.status).toBe(200);
    const after = await probe({ journeyDecisions: true, journeyExecution: true });
    expect(after.scopes.find((s) => s.brand_id === BRAND.enterprise && s.channel === 'email')).toMatchObject({ mode: 'shadow', mode_reason: 'no_rollout', controls: [] });
  });

  it('a clear is authorised by the scope\'s own guard: a brand admin clears their brand\'s pause but not a rollout (403, recorded); a foreign tenant\'s pause is 404; the kinds do not cross', async () => {
    contextFromAdminRequest.mockResolvedValue(superAdmin());
    const rolloutId = (await post(ROLLOUTS, REVIEW)).body.id as string;
    const wideId = (await post(PAUSES, { tenant_id: TENANT.colaberry, channel: 'in_app', reason: 'nudges off' })).body.id as string;
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.enterprise, [BRAND.enterprise]));
    const pauseId = (await post(PAUSES, BRAND_PAUSE)).body.id as string;
    recordAccessDecision.mockClear();
    expect((await post(`${ROLLOUTS}/${rolloutId}/clear`, {})).status).toBe(403);
    expect((await post(`${PAUSES}/${wideId}/clear`, {})).status).toBe(403);
    expect(decisions().map((d) => [d.decision, d.action, d.permission])).toEqual([['denied', 'clear_rollout', 'platform.cross_tenant'], ['denied', 'clear_pause', 'platform.cross_tenant']]);
    // an UNRESTRICTED tenant admin (no brand confinement) is still not the platform: a brand-wide pause is not theirs to clear
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, null));
    const wide = await post(`${PAUSES}/${wideId}/clear`, {});
    expect(wide.status).toBe(403);
    expect(decisions().at(-1)).toMatchObject({ decision: 'denied', action: 'clear_pause', permission: 'platform.cross_tenant', resourceTenantId: null });
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.enterprise, [BRAND.enterprise]));
    expect((await post(`${PAUSES}/${rolloutId}/clear`, {})).status).toBe(404); // a rollout is not a pause
    expect((await post(`${ROLLOUTS}/${pauseId}/clear`, {})).status).toBe(404);
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.aiFlotation, null));
    expect((await post(`${PAUSES}/${pauseId}/clear`, {})).status).toBe(404);
    expect((await post(`${PAUSES}/not-a-uuid/clear`, {})).status).toBe(400);
    expect(T5.controls.rows.every((r) => r.cleared_at === null)).toBe(true);
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.enterprise, [BRAND.enterprise]));
    expect((await post(`${PAUSES}/${pauseId}/clear`, {})).status).toBe(200);
  });
});

describe('GET /execution/controls', () => {
  it('a brand-restricted admin sees their brand\'s active rows only; a super admin sees every tenant\'s; cleared rows only when asked; 403 for a scope not granted', async () => {
    // The bridge grants a super admin whatever scope they ask for; a member gets their memberships only.
    contextFromAdminRequest.mockImplementation(async (_admin: unknown, req: { requestedTenantId: string | null; requestedBrandId: string | null }) => ({ ...superAdmin(), tenantId: req.requestedTenantId, brandId: req.requestedBrandId }));
    const rolloutId = (await post(ROLLOUTS, REVIEW)).body.id as string;
    const wideId = (await post(PAUSES, { tenant_id: TENANT.colaberry, channel: 'in_app', reason: 'nudges off' })).body.id as string;
    const otherId = (await post(PAUSES, { brand_id: BRAND.aiFlotation, reason: 'flotation hold' })).body.id as string;
    const trainingId = (await post(PAUSES, { brand_id: BRAND.training, reason: 'training hold' })).body.id as string;
    await post(`${PAUSES}/${trainingId}/clear`, {});
    const all = await get(CONTROLS);
    expect(all.status).toBe(200);
    expect(all.body.controls.map((c: { id: string }) => c.id).sort()).toEqual([rolloutId, wideId, otherId].sort());
    expect((await get(`${CONTROLS}?include_cleared=true`)).body.count).toBe(4);
    expect((await get(`${CONTROLS}?brand_id=${BRAND.aiFlotation}`)).body.controls.map((c: { id: string }) => c.id)).toEqual([otherId]);

    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.enterprise, [BRAND.enterprise]));
    const mine = await get(CONTROLS);
    expect(mine.body.controls.map((c: { id: string }) => c.id)).toEqual([rolloutId]); // the brand-wide row (null brand) is not theirs to see
    expect((await get(`${CONTROLS}?tenant_id=${TENANT.aiFlotation}`)).status).toBe(403);
    expect((await get(`${CONTROLS}?include_cleared=maybe`)).status).toBe(400);
  });
});
