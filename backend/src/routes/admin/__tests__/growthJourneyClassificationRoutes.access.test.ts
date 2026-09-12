import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * T229 — the classification queue, its Why, and the human override, on the
 * same harness as the participation routes (growthJourneyRoutes.access.test.ts):
 * `requireAdmin`, the router and the guard functions are REAL; only the
 * membership bridge, the model and the two services are mocked. Every status
 * code below is the one the shipped code returns.
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
  GrowthJourneyClassification: {
    findByPk: (...a: unknown[]) => findByPk(...a),
    findAndCountAll: (...a: unknown[]) => findAndCountAll(...a),
    create: (...a: unknown[]) => create(...a),
    update: (...a: unknown[]) => update(...a),
    destroy: (...a: unknown[]) => destroy(...a),
  },
}));
// `offerEligibility` imports three models at load, each constructing the Sequelize
// instance, and `env` here has no database URL. Mocked at its boundary with an
// error class of the real shape, so the controller's `instanceof` still matches.
jest.mock('../../../services/growthJourney/offerEligibility', () => {
  class OfferNotEligibleError extends Error {
    readonly error_class = 'OfferNotEligibleError';
    constructor(readonly decision: Record<string, unknown>) { super('Offer not eligible'); this.name = 'OfferNotEligibleError'; }
  }
  return { OfferNotEligibleError };
});
const contextFromAdminRequest = jest.fn();
jest.mock('../../../modules/tenancy/adminScopeBridge', () => ({ contextFromAdminRequest: (...a: unknown[]) => contextFromAdminRequest(...a) }));
const recordAccessDecision = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../modules/tenancy/tenantAccessAudit', () => ({ recordAccessDecision: (...a: unknown[]) => recordAccessDecision(...a) }));
const overrideClassification = jest.fn();
jest.mock('../../../services/growthJourney/classificationService', () => ({ overrideClassification: (...a: unknown[]) => overrideClassification(...a) }));

import growthJourneyRoutes from '../growthJourneyRoutes';
import { TenantAccessError } from '../../../modules/tenancy/tenantAuthorization';
import { OfferNotEligibleError } from '../../../services/growthJourney/offerEligibility';

const BASE = '/api/admin/growth-journey';
const TENANT = { cpn: '10000000-0000-4000-8000-000000000001', colaberry: '10000000-0000-4000-8000-000000000002', aiFlotation: '10000000-0000-4000-8000-000000000003' };
const BRAND = { cpn: '20000000-0000-4000-8000-000000000001', training: '20000000-0000-4000-8000-000000000002', enterprise: '20000000-0000-4000-8000-000000000003', aiFlotation: '20000000-0000-4000-8000-000000000004' };
const ROW_ID = '40000000-0000-4000-8000-000000000001';
const PRIOR_ID = '40000000-0000-4000-8000-000000000000';

const token = (role = 'admin') => jwt.sign({ sub: 'staff-1', email: 'staff@colaberry.com', role }, 'test-secret');
function app() { const a = express(); a.use(express.json()); a.use(growthJourneyRoutes); return a; }
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token()}`);

const memberOf = (tenantId: string, brandId: string | null = null, authorizedBrandIds: string[] | null = null) => ({
  platformIdentityId: 'pid-1', tenantId, brandId, organizationId: null, roles: ['tenant_admin'], isPlatformSuperAdmin: false, authorizedTenantIds: [tenantId], authorizedBrandIds,
});
const row = (tenantId: string, brandId: string, over: Record<string, unknown> = {}) => ({
  id: ROW_ID, tenant_id: tenantId, brand_id: brandId, subject_ref: 'lead:501', lead_id: 501, enrollment_id: null, trigger: 'lead_ingest', input_hash: 'h',
  brand_relationship: 'colaberry-training', journey_program_slug: 'learner', primary_path: 'learner_paid_training', secondary_paths: [], intent: 'enrollment_interest',
  confidence: '0.850', evidence: ['step2:interest_area->learner_paid_training', 'brand_boundary:allowed', 'trace:1:abstained:no lock for this subject and brand', 'trace:2:answered:path learner_paid_training', 'trace:7:skipped:no model wired (capability off)', 'input_unavailable:behaviour'],
  source_step: 2, requires_human_review: false, status: 'proposed', locked: false, eligibility: { allowed: true, reason: 'allowed' }, referral_target_brand_id: null,
  ai_involved: false, model_version: null, ruleset_version: 'p2-v1', override_of: null, decided_by: null, created_at: new Date('2026-09-11T12:00:00Z'), ...over,
});

beforeEach(() => {
  findByPk.mockReset().mockResolvedValue(null);
  findAndCountAll.mockReset().mockResolvedValue({ rows: [], count: 0 });
  create.mockReset(); update.mockReset(); destroy.mockReset();
  recordAccessDecision.mockClear();
  overrideClassification.mockReset().mockImplementation(async (args: { classificationId: string }) => ({ status: 'overridden', row: { id: 'c-new', override_of: args.classificationId }, replayed: false }));
  contextFromAdminRequest.mockReset().mockResolvedValue(memberOf(TENANT.colaberry, null));
  growthJourney.growthJourneyEnabled = true;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  // The routes never touch the model's update/destroy — the table is append-only.
  expect(update).not.toHaveBeenCalled();
  expect(destroy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

const VALID_OVERRIDE = { primary_path: 'learner_certification', lock: true, reason: 'call notes say certification' };

describe('the status matrix, on all three routes', () => {
  it('401 unauthenticated', async () => {
    expect((await request(app()).get(`${BASE}/classifications`)).status).toBe(401);
    expect((await request(app()).get(`${BASE}/classifications/${ROW_ID}/why`)).status).toBe(401);
    expect((await request(app()).post(`${BASE}/classifications/${ROW_ID}/override`).send(VALID_OVERRIDE)).status).toBe(401);
  });

  it('404 on every route when the master flag is off, before anything is read', async () => {
    growthJourney.growthJourneyEnabled = false;
    for (const r of [auth(request(app()).get(`${BASE}/classifications`)), auth(request(app()).get(`${BASE}/classifications/${ROW_ID}/why`)), auth(request(app()).post(`${BASE}/classifications/${ROW_ID}/override`).send(VALID_OVERRIDE))]) {
      const res = await r;
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Not found' });
    }
    expect(findByPk).not.toHaveBeenCalled();
    expect(findAndCountAll).not.toHaveBeenCalled();
  });

  it('200 in-brand: the list, the Why, and the override', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.training, [BRAND.training]));
    findAndCountAll.mockResolvedValue({ rows: [row(TENANT.colaberry, BRAND.training)], count: 1 });
    findByPk.mockResolvedValue(row(TENANT.colaberry, BRAND.training));
    expect((await auth(request(app()).get(`${BASE}/classifications`))).status).toBe(200);
    expect((await auth(request(app()).get(`${BASE}/classifications/${ROW_ID}/why`))).status).toBe(200);
    expect((await auth(request(app()).post(`${BASE}/classifications/${ROW_ID}/override`).send(VALID_OVERRIDE))).status).toBe(201);
  });

  it('404 cross-tenant on the Why and the override — byte-identical to not-found', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.cpn, BRAND.cpn, [BRAND.cpn]));
    findByPk.mockResolvedValue(row(TENANT.aiFlotation, BRAND.aiFlotation));
    const why = await auth(request(app()).get(`${BASE}/classifications/${ROW_ID}/why`));
    const ov = await auth(request(app()).post(`${BASE}/classifications/${ROW_ID}/override`).send(VALID_OVERRIDE));
    findByPk.mockResolvedValue(null);
    const missing = await auth(request(app()).get(`${BASE}/classifications/${ROW_ID}/why`));
    expect([why.status, ov.status, missing.status]).toEqual([404, 404, 404]);
    expect(JSON.stringify(why.body)).toBe(JSON.stringify(missing.body));
    expect(JSON.stringify(ov.body)).toBe(JSON.stringify(missing.body));
    expect(overrideClassification).not.toHaveBeenCalled();
  });

  it('404 cross-tenant even when the body names a brand_id that does not match: the guard answers first, audited, and no 409 leaks that the row exists', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.cpn, BRAND.cpn, [BRAND.cpn]));
    findByPk.mockResolvedValue(row(TENANT.aiFlotation, BRAND.aiFlotation));
    const ov = await auth(request(app()).post(`${BASE}/classifications/${ROW_ID}/override`).send({ ...VALID_OVERRIDE, brand_id: BRAND.enterprise }));
    findByPk.mockResolvedValue(null);
    const missing = await auth(request(app()).post(`${BASE}/classifications/${ROW_ID}/override`).send({ ...VALID_OVERRIDE, brand_id: BRAND.enterprise }));
    expect([ov.status, missing.status]).toEqual([404, 404]);
    expect(JSON.stringify(ov.body)).toBe(JSON.stringify(missing.body));
    expect(recordAccessDecision).toHaveBeenCalledWith(expect.objectContaining({ action: 'override', decision: 'denied' }));
    expect(overrideClassification).not.toHaveBeenCalled();
  });

  it('403 cross-brand within one tenant (Training member reads an Enterprise row)', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.training, [BRAND.training]));
    findByPk.mockResolvedValue(row(TENANT.colaberry, BRAND.enterprise));
    expect((await auth(request(app()).get(`${BASE}/classifications/${ROW_ID}/why`))).status).toBe(403);
    expect((await auth(request(app()).post(`${BASE}/classifications/${ROW_ID}/override`).send(VALID_OVERRIDE))).status).toBe(403);
    expect(overrideClassification).not.toHaveBeenCalled();
  });

  it('G2 on the new routes: a brand-restricted member who OMITS ?brand_id= is refused another brand with 403', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, null, [BRAND.training]));
    findByPk.mockResolvedValue(row(TENANT.colaberry, BRAND.enterprise));
    expect((await auth(request(app()).get(`${BASE}/classifications/${ROW_ID}/why`))).status).toBe(403);
    expect((await auth(request(app()).post(`${BASE}/classifications/${ROW_ID}/override`).send(VALID_OVERRIDE))).status).toBe(403);
  });

  it('403 for a requested scope the bridge did not grant', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, null));
    expect((await auth(request(app()).get(`${BASE}/classifications?brand_id=${BRAND.enterprise}`))).status).toBe(403);
    expect(findAndCountAll).not.toHaveBeenCalled();
  });

  it('the list never returns a row outside the restricted set: the where clause carries brand_id and the status', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, null, [BRAND.training]));
    await auth(request(app()).get(`${BASE}/classifications`));
    expect(findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenant_id: TENANT.colaberry, brand_id: [BRAND.training], status: 'needs_review' }),
      limit: 25, offset: 0,
    }));
  });

  it('an UNRESTRICTED tenant admin who asks for ?brand_id= is narrowed to that brand (the request, not only the membership, confines)', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.enterprise, null)); // the bridge echoes the requested brand; no restriction
    await auth(request(app()).get(`${BASE}/classifications?brand_id=${BRAND.enterprise}`));
    expect(findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenant_id: TENANT.colaberry, brand_id: BRAND.enterprise }) }));
  });

  it('spoofed Host / X-Forwarded-Host / X-Brand headers change nothing', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.cpn, BRAND.cpn, [BRAND.cpn]));
    findByPk.mockResolvedValue(row(TENANT.colaberry, BRAND.enterprise));
    const res = await auth(request(app()).get(`${BASE}/classifications/${ROW_ID}/why`).set('Host', 'colaberry.ai').set('X-Forwarded-Host', 'colaberry.ai').set('X-Brand', 'colaberry-enterprise'));
    expect(res.status).toBe(404);
  });
});

describe('validation (Zod) — 400 before any business logic', () => {
  it('limit 0, limit 101, an unknown status, a non-uuid id', async () => {
    for (const q of ['limit=0', 'limit=101', 'status=nonsense']) {
      expect((await auth(request(app()).get(`${BASE}/classifications?${q}`))).status).toBe(400);
    }
    expect((await auth(request(app()).get(`${BASE}/classifications/not-a-uuid/why`))).status).toBe(400);
    expect(findAndCountAll).not.toHaveBeenCalled();
    expect(findByPk).not.toHaveBeenCalled();
  });

  it('override: reason too short, lock missing, an unknown body key (strict) — and nothing is written', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.training, [BRAND.training]));
    findByPk.mockResolvedValue(row(TENANT.colaberry, BRAND.training));
    for (const body of [{ ...VALID_OVERRIDE, reason: 'short' }, { primary_path: 'x', reason: 'long enough reason' }, { ...VALID_OVERRIDE, surprise: true }]) {
      expect((await auth(request(app()).post(`${BASE}/classifications/${ROW_ID}/override`).send(body))).status).toBe(400);
    }
    expect(overrideClassification).not.toHaveBeenCalled();
  });

  it('status=all lists every status; the default is the review queue', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.training, [BRAND.training]));
    await auth(request(app()).get(`${BASE}/classifications?status=all`));
    const where = (findAndCountAll.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where.status).toBeUndefined();
  });
});

describe('the override', () => {
  beforeEach(() => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.training, [BRAND.training]));
    findByPk.mockResolvedValue(row(TENANT.colaberry, BRAND.training));
  });

  it('happy path → 201 with the new row, override_of, and the admin id as decider; audited', async () => {
    const res = await auth(request(app()).post(`${BASE}/classifications/${ROW_ID}/override`).send(VALID_OVERRIDE));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ override_of: ROW_ID, replayed: false, classification: { id: 'c-new' } });
    expect(overrideClassification).toHaveBeenCalledWith({ classificationId: ROW_ID, admin: { id: 'staff-1' }, patch: { primary_path: 'learner_certification', journey_program: undefined }, lock: true, reason: 'call notes say certification' });
    expect(recordAccessDecision).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'growth_journey_classification', action: 'override', resourceId: ROW_ID, decision: 'allowed', reason: 'granted' }));
  });

  it('a body brand_id must match the row: in-scope but wrong brand → 409 AFTER the audited guard (recorded as allowed), nothing written; the right one passes', async () => {
    const wrong = await auth(request(app()).post(`${BASE}/classifications/${ROW_ID}/override`).send({ ...VALID_OVERRIDE, brand_id: BRAND.enterprise }));
    expect(wrong.status).toBe(409);
    expect(wrong.body).toMatchObject({ error_class: 'ValidationError' });
    expect(overrideClassification).not.toHaveBeenCalled();
    expect(recordAccessDecision).toHaveBeenCalledWith(expect.objectContaining({ action: 'override', decision: 'allowed' }));
    const right = await auth(request(app()).post(`${BASE}/classifications/${ROW_ID}/override`).send({ ...VALID_OVERRIDE, brand_id: BRAND.training }));
    expect(right.status).toBe(201);
  });

  it('a replayed override → 200, same row', async () => {
    overrideClassification.mockResolvedValue({ status: 'overridden', row: { id: 'c-new' }, replayed: true });
    const res = await auth(request(app()).post(`${BASE}/classifications/${ROW_ID}/override`).send(VALID_OVERRIDE));
    expect(res.status).toBe(200);
    expect(res.body.replayed).toBe(true);
  });

  it('a denied family → 422 carrying the eligibility decision, and no row', async () => {
    overrideClassification.mockRejectedValue(new OfferNotEligibleError({ allowed: false, reason: 'explicit_deny', brand_id: BRAND.training, offer_family: 'business_training', policy_id: null, approved_content_ready: false }));
    const res = await auth(request(app()).post(`${BASE}/classifications/${ROW_ID}/override`).send({ ...VALID_OVERRIDE, primary_path: 'business_training' }));
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error_class: 'OfferNotEligibleError', decision: { reason: 'explicit_deny', offer_family: 'business_training' } });
    expect(create).not.toHaveBeenCalled();
  });

  it('a refused (audited) write is recorded as denied and returns 403', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.training, [BRAND.training]));
    findByPk.mockResolvedValue(row(TENANT.colaberry, BRAND.enterprise));
    const res = await auth(request(app()).post(`${BASE}/classifications/${ROW_ID}/override`).send(VALID_OVERRIDE));
    expect(res.status).toBe(403);
    expect(recordAccessDecision).toHaveBeenCalledWith(expect.objectContaining({ action: 'override', decision: 'denied', reason: 'AuthorizationError' }));
  });

  it('a thrown bridge refusal is a 403, not a 500', async () => {
    contextFromAdminRequest.mockRejectedValue(new TenantAccessError('Brand not in scope', 403, 'AuthorizationError'));
    expect((await auth(request(app()).post(`${BASE}/classifications/${ROW_ID}/override?brand_id=${BRAND.enterprise}`).send(VALID_OVERRIDE))).status).toBe(403);
  });
});

describe('the Why', () => {
  it('is a stated FOUND: the answer, the deciding step, the parsed trace, the evidence, the versions, the chain', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.training, [BRAND.training]));
    const prior = row(TENANT.colaberry, BRAND.training, { id: PRIOR_ID, decided_by: null, override_of: null });
    const current = row(TENANT.colaberry, BRAND.training, { override_of: PRIOR_ID, decided_by: 'human:staff-1', locked: true, status: 'confirmed', source_step: 1 });
    findByPk.mockImplementation(async (id: string) => (id === ROW_ID ? current : id === PRIOR_ID ? prior : null));
    const res = await auth(request(app()).get(`${BASE}/classifications/${ROW_ID}/why`));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'found', classification_id: ROW_ID, decided_by_step: { step: 1, name: 'human_lock' },
      answer: { primary_path: 'learner_paid_training', locked: true, status: 'confirmed', confidence: 0.85 },
      versions: { ruleset_version: 'p2-v1', model_version: null, ai_involved: false },
      inputs_unavailable: ['behaviour'],
      override_chain: [{ classification_id: PRIOR_ID, decided_by: null }],
    });
    const steps = res.body.steps_considered as Array<{ step: number; outcome: string; note: string | null }>;
    expect(steps).toHaveLength(8);
    expect(steps[0]).toMatchObject({ step: 1, outcome: 'abstained' });
    expect(steps[1]).toMatchObject({ step: 2, outcome: 'answered', note: 'path learner_paid_training' });
    expect(steps[6]).toMatchObject({ step: 7, outcome: 'skipped' });
    expect(steps[2]).toMatchObject({ step: 3, outcome: 'unrecorded' });
    expect(res.body.evidence).not.toEqual(expect.arrayContaining([expect.stringMatching(/^trace:/)]));
  });

  it('contains no @ for a fixture whose lead email is known (redaction is structural)', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.training, [BRAND.training]));
    findByPk.mockResolvedValue(row(TENANT.colaberry, BRAND.training));
    const res = await auth(request(app()).get(`${BASE}/classifications/${ROW_ID}/why`));
    expect(res.text).not.toContain('@');
  });

  it('never walks the chain across a brand', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.training, [BRAND.training]));
    const foreignPrior = row(TENANT.colaberry, BRAND.enterprise, { id: PRIOR_ID });
    const current = row(TENANT.colaberry, BRAND.training, { override_of: PRIOR_ID });
    findByPk.mockImplementation(async (id: string) => (id === ROW_ID ? current : id === PRIOR_ID ? foreignPrior : null));
    const res = await auth(request(app()).get(`${BASE}/classifications/${ROW_ID}/why`));
    expect(res.status).toBe(200);
    expect(res.body.override_chain).toEqual([]);
  });
});
