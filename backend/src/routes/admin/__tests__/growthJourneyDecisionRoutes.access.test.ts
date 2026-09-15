import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * T312 — the shadow decision queue and its Why, on the same harness as the
 * classification routes (growthJourneyClassificationRoutes.access.test.ts):
 * `requireAdmin`, the router and the guard functions are REAL; only the
 * membership bridge, the models and the audit writer are mocked. Every status
 * code below is the one the shipped code returns, and the matrix is the T229
 * one applied to two read routes.
 */

const growthJourney = { growthJourneyEnabled: true, journeySignalIngest: false, journeyClassification: false, journeyExecution: false };
jest.mock('../../../config/env', () => ({ env: { jwtSecret: 'test-secret', nodeEnv: 'test', growthJourney } }));
jest.mock('../../../services/aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));

const findByPk = jest.fn();
const findAndCountAll = jest.fn();
const create = jest.fn();
const update = jest.fn();
const destroy = jest.fn();
jest.mock('../../../models', () => ({
  GrowthJourneyEnrollment: { findByPk: jest.fn(), findAndCountAll: jest.fn() },
  GrowthJourneyClassification: { findByPk: jest.fn(), findAndCountAll: jest.fn() },
  GrowthJourneyDecision: {
    findByPk: (...a: unknown[]) => findByPk(...a),
    findAndCountAll: (...a: unknown[]) => findAndCountAll(...a),
    create: (...a: unknown[]) => create(...a),
    update: (...a: unknown[]) => update(...a),
    destroy: (...a: unknown[]) => destroy(...a),
  },
}));
// The classification controller (same router) imports these at load; mocked at
// their boundary exactly as the T229 harness does, so the router can be REAL.
jest.mock('../../../services/growthJourney/offerEligibility', () => {
  class OfferNotEligibleError extends Error {
    readonly error_class = 'OfferNotEligibleError';
    constructor(readonly decision: Record<string, unknown>) { super('Offer not eligible'); this.name = 'OfferNotEligibleError'; }
  }
  return { OfferNotEligibleError };
});
jest.mock('../../../services/growthJourney/classificationService', () => ({ overrideClassification: jest.fn() }));
const contextFromAdminRequest = jest.fn();
jest.mock('../../../modules/tenancy/adminScopeBridge', () => ({ contextFromAdminRequest: (...a: unknown[]) => contextFromAdminRequest(...a) }));
const recordAccessDecision = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../modules/tenancy/tenantAccessAudit', () => ({ recordAccessDecision: (...a: unknown[]) => recordAccessDecision(...a) }));

import growthJourneyRoutes from '../growthJourneyRoutes';
import { TenantAccessError } from '../../../modules/tenancy/tenantAuthorization';
import { DECISION_LIST_ATTRIBUTES } from '../../../services/growthJourney/decisionWhyService';
import { DECISION_ID as ROW_ID, KNOWN_EMAIL, storedRow, suppression } from '../../../services/growthJourney/__tests__/fixtures/decisionRowFixture';

const BASE = '/api/admin/growth-journey';
const TENANT = { cpn: '10000000-0000-4000-8000-000000000001', colaberry: '10000000-0000-4000-8000-000000000002', aiFlotation: '10000000-0000-4000-8000-000000000003' };
const BRAND = { cpn: '20000000-0000-4000-8000-000000000001', training: '20000000-0000-4000-8000-000000000002', enterprise: '20000000-0000-4000-8000-000000000003', aiFlotation: '20000000-0000-4000-8000-000000000004' };

const token = (role = 'admin') => jwt.sign({ sub: 'staff-1', email: 'staff@colaberry.com', role }, 'test-secret');
function app() { const a = express(); a.use(express.json()); a.use(growthJourneyRoutes); return a; }
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token()}`);

const memberOf = (tenantId: string, brandId: string | null = null, authorizedBrandIds: string[] | null = null) => ({
  platformIdentityId: 'pid-1', tenantId, brandId, organizationId: null, roles: ['tenant_admin'], isPlatformSuperAdmin: false, authorizedTenantIds: [tenantId], authorizedBrandIds,
});
const row = (tenantId: string, brandId: string, over: Record<string, unknown> = {}) => storedRow({ tenant_id: tenantId, brand_id: brandId, ...over });

const LIST = `${BASE}/decisions`;
const WHY = `${BASE}/decisions/${ROW_ID}/why`;

beforeEach(() => {
  findByPk.mockReset().mockResolvedValue(null);
  findAndCountAll.mockReset().mockResolvedValue({ rows: [], count: 0 });
  create.mockReset(); update.mockReset(); destroy.mockReset();
  recordAccessDecision.mockClear();
  contextFromAdminRequest.mockReset().mockResolvedValue(memberOf(TENANT.colaberry, null));
  growthJourney.growthJourneyEnabled = true;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  // Two read routes: the decision model is never created, updated or destroyed
  // by either, and no read is audited (an audit row would be a write on a GET).
  expect(create).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
  expect(destroy).not.toHaveBeenCalled();
  expect(recordAccessDecision).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('the status matrix, on both routes', () => {
  it('401 unauthenticated', async () => {
    expect((await request(app()).get(LIST)).status).toBe(401);
    expect((await request(app()).get(WHY)).status).toBe(401);
    expect(contextFromAdminRequest).not.toHaveBeenCalled();
  });

  it('404 on both routes when the master flag is off, before anything is read', async () => {
    growthJourney.growthJourneyEnabled = false;
    for (const r of [auth(request(app()).get(LIST)), auth(request(app()).get(WHY))]) {
      const res = await r;
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Not found' });
    }
    expect(findByPk).not.toHaveBeenCalled();
    expect(findAndCountAll).not.toHaveBeenCalled();
    expect(contextFromAdminRequest).not.toHaveBeenCalled();
  });

  it('200 in-brand: the list and the Why', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.enterprise, [BRAND.enterprise]));
    findAndCountAll.mockResolvedValue({ rows: [row(TENANT.colaberry, BRAND.enterprise)], count: 1 });
    findByPk.mockResolvedValue(row(TENANT.colaberry, BRAND.enterprise));
    const list = await auth(request(app()).get(LIST));
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ total: 1, limit: 25, offset: 0, mode: 'shadow' });
    expect(list.body.rows[0].id).toBe(ROW_ID);
    const why = await auth(request(app()).get(WHY));
    expect(why.status).toBe(200);
    expect(why.body).toMatchObject({ status: 'found', decision_id: ROW_ID, brand_id: BRAND.enterprise, tenant_id: TENANT.colaberry, subject_ref: 'lead:501' });
  });

  it('404 cross-tenant on the Why — byte-identical to not-found', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.cpn, BRAND.cpn, [BRAND.cpn]));
    findByPk.mockResolvedValue(row(TENANT.aiFlotation, BRAND.aiFlotation));
    const foreign = await auth(request(app()).get(WHY));
    findByPk.mockResolvedValue(null);
    const missing = await auth(request(app()).get(WHY));
    expect([foreign.status, missing.status]).toEqual([404, 404]);
    expect(foreign.text).toBe(missing.text);
    expect(Object.fromEntries(Object.entries(foreign.headers).filter(([k]) => k !== 'date' && k !== 'etag'))).toEqual(
      Object.fromEntries(Object.entries(missing.headers).filter(([k]) => k !== 'date' && k !== 'etag')),
    );
  });

  it('403 cross-brand within one tenant (Training member reads an Enterprise decision)', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.training, [BRAND.training]));
    findByPk.mockResolvedValue(row(TENANT.colaberry, BRAND.enterprise));
    const res = await auth(request(app()).get(WHY));
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error_class: 'AuthorizationError' });
    // The refusal carries none of the row: the caller learns it exists, not what it says.
    expect(res.text).not.toContain('suppressed');
    expect(res.text).not.toContain('lead:501');
  });

  it('G2: a brand-restricted member who OMITS ?brand_id= is refused another brand with 403 on the Why', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, null, [BRAND.training]));
    findByPk.mockResolvedValue(row(TENANT.colaberry, BRAND.enterprise));
    expect((await auth(request(app()).get(WHY))).status).toBe(403);
  });

  it('403 for a requested scope the bridge did not grant, on both routes, before any read', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, null));
    expect((await auth(request(app()).get(`${LIST}?brand_id=${BRAND.enterprise}`))).status).toBe(403);
    expect((await auth(request(app()).get(`${WHY}?brand_id=${BRAND.enterprise}`))).status).toBe(403);
    expect((await auth(request(app()).get(`${LIST}?tenant_id=${TENANT.cpn}`))).status).toBe(403);
    expect(findAndCountAll).not.toHaveBeenCalled();
    expect(findByPk).not.toHaveBeenCalled();
  });

  it('a thrown bridge refusal is a 403, not a 500', async () => {
    contextFromAdminRequest.mockRejectedValue(new TenantAccessError('Brand not in scope', 403, 'AuthorizationError'));
    expect((await auth(request(app()).get(`${LIST}?brand_id=${BRAND.enterprise}`))).status).toBe(403);
    expect((await auth(request(app()).get(WHY))).status).toBe(403);
  });

  it('spoofed Host / X-Forwarded-Host / X-Brand headers change nothing, on both routes', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.cpn, BRAND.cpn, [BRAND.cpn]));
    findByPk.mockResolvedValue(row(TENANT.colaberry, BRAND.enterprise));
    const spoof = (r: request.Test) => r.set('Host', 'colaberry.ai').set('X-Forwarded-Host', 'colaberry.ai').set('X-Brand', 'colaberry-enterprise');
    expect((await spoof(auth(request(app()).get(WHY)))).status).toBe(404);
    await spoof(auth(request(app()).get(LIST)));
    expect(findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenant_id: TENANT.cpn, brand_id: BRAND.cpn }) }));
  });

  it('a model failure is a 500 with an error class and no row content', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.enterprise, [BRAND.enterprise]));
    findByPk.mockRejectedValue(new Error('connection reset'));
    findAndCountAll.mockRejectedValue(new Error('connection reset'));
    const why = await auth(request(app()).get(WHY));
    const list = await auth(request(app()).get(LIST));
    expect(why.status).toBe(500);
    expect(list.status).toBe(500);
    expect(why.body).toMatchObject({ error: 'Decision why failed', error_class: expect.any(String) });
    expect(list.body).toMatchObject({ error: 'Decision list failed', error_class: expect.any(String) });
  });
});

describe('the list: scope, projection, filters', () => {
  it('never returns a row outside the restricted set: the where clause carries tenant, brand and the shadow mode, newest first', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, null, [BRAND.training]));
    await auth(request(app()).get(LIST));
    expect(findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenant_id: TENANT.colaberry, brand_id: [BRAND.training], mode: 'shadow' },
      attributes: [...DECISION_LIST_ATTRIBUTES],
      order: [['created_at', 'DESC']],
      limit: 25, offset: 0,
    }));
  });

  it('an UNRESTRICTED tenant admin who asks for ?brand_id= is narrowed to that brand', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.enterprise, null));
    await auth(request(app()).get(`${LIST}?brand_id=${BRAND.enterprise}`));
    expect(findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenant_id: TENANT.colaberry, brand_id: BRAND.enterprise }) }));
  });

  it('mode=all lists every mode; subject_ref narrows to one subject exactly as stored; paging is passed through', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.enterprise, [BRAND.enterprise]));
    await auth(request(app()).get(`${LIST}?mode=all&subject_ref=lead:501&limit=5&offset=10`));
    const call = findAndCountAll.mock.calls[0][0] as { where: Record<string, unknown>; limit: number; offset: number };
    expect(call.where.mode).toBeUndefined();
    expect(call.where.subject_ref).toBe('lead:501');
    expect(call.limit).toBe(5);
    expect(call.offset).toBe(10);
  });

  it('the projection excludes every JSONB record: the queue is for finding a row, the Why is for reading one', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.enterprise, [BRAND.enterprise]));
    await auth(request(app()).get(LIST));
    const attributes = (findAndCountAll.mock.calls[0][0] as { attributes: string[] }).attributes;
    for (const blob of ['candidates', 'suppressed', 'eligibility', 'scores', 'contact_evidence', 'selected_content', 'execution_receipt']) {
      expect(attributes).not.toContain(blob);
    }
    expect(attributes).toEqual(expect.arrayContaining(['id', 'subject_ref', 'selected_action', 'reason', 'created_at']));
  });
});

describe('validation (Zod) — 400 before any business logic', () => {
  it('limit 0, limit 101, an unknown mode, an empty subject_ref, a non-uuid brand, a non-uuid id', async () => {
    for (const q of ['limit=0', 'limit=101', 'mode=nonsense', 'subject_ref=', 'brand_id=not-a-uuid']) {
      const res = await auth(request(app()).get(`${LIST}?${q}`));
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'Invalid request', details: expect.any(Array) });
    }
    expect((await auth(request(app()).get(`${BASE}/decisions/not-a-uuid/why`))).status).toBe(400);
    expect((await auth(request(app()).get(`${WHY}?limit=0`))).status).toBe(400);
    expect(findAndCountAll).not.toHaveBeenCalled();
    expect(findByPk).not.toHaveBeenCalled();
    expect(contextFromAdminRequest).not.toHaveBeenCalled();
  });
});

describe('the Why', () => {
  beforeEach(() => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.enterprise, [BRAND.enterprise]));
  });

  it('is a stated FOUND from the stored row: the answer, every suppressed candidate, the gap for the sourceless dimension, the two unknowns, the versions', async () => {
    const suppressed = Array.from({ length: 12 }, (_, i) => suppression(i + 1));
    findByPk.mockResolvedValue(row(TENANT.colaberry, BRAND.enterprise, { suppressed }));
    const res = await auth(request(app()).get(WHY));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'found', decision_id: ROW_ID, mode: 'shadow', trigger: 'nightly',
      journey_program: { status: 'draft', ruleset_version: 'p3-business-v1' },
      answer: { selected_action: 'SEND_EMAIL', selected_channel: 'email', reason: 'selected: capabilityEducation', decided_by: 'governor:p3-business-v1' },
      versions: { ruleset_version: 'p3-business-v1', model_version: null, ai_involved: false },
      inputs_unavailable: ['appointments'],
      unknown_inputs: { human_conversation: { value: 'unknown' }, sales_capacity: { value: 'unknown' } },
      execution: { executed: false, receipt: null },
    });
    expect(res.body.suppressed).toEqual(suppressed);
    expect(res.body.candidates).toHaveLength(2);
    const dims = res.body.scores.dimensions as Array<{ key: string; value: number | null; gap: string | null }>;
    expect(dims.find((d) => d.key === 'budget_signal')).toMatchObject({ value: null, gap: 'budget_signal:no_source' });
    expect(res.body.scores.summary).toBeNull();
    // Read once, by primary key; nothing else is looked up.
    expect(findByPk).toHaveBeenCalledTimes(1);
    expect(findAndCountAll).not.toHaveBeenCalled();
  });

  it('contains no @ for a fixture whose subject address is known (redaction is structural)', async () => {
    expect(KNOWN_EMAIL).toContain('@');
    findByPk.mockResolvedValue(row(TENANT.colaberry, BRAND.enterprise));
    const res = await auth(request(app()).get(WHY));
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('@');
  });
});
