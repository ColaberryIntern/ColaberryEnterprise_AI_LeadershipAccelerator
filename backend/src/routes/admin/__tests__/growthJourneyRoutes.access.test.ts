import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('../../../config/env', () => ({
  env: { jwtSecret: 'test-secret', nodeEnv: 'test' },
}));

// `requireAdmin`'s 401 path calls `logAuthFailure`, which does a dynamic import
// of the AI event service. Mocked so the 401 test does not reach a database.
jest.mock('../../../services/aiEventService', () => ({
  emitAiEvent: jest.fn().mockResolvedValue(undefined),
}));

const findByPk = jest.fn();
const findAndCountAll = jest.fn();
const create = jest.fn();
const update = jest.fn();
const destroy = jest.fn();

jest.mock('../../../models', () => ({
  GrowthJourneyEnrollment: {
    findByPk: (...a: unknown[]) => findByPk(...a),
    findAndCountAll: (...a: unknown[]) => findAndCountAll(...a),
    create: (...a: unknown[]) => create(...a),
    update: (...a: unknown[]) => update(...a),
    destroy: (...a: unknown[]) => destroy(...a),
  },
}));

// The context is what the tenancy module WOULD build from memberships. Mocked at
// the bridge so each scenario can state the caller's memberships directly; the
// guard functions (`requireBrandAccess`, `tenantScopeWhere`) are REAL.
const contextFromAdminRequest = jest.fn();
jest.mock('../../../modules/tenancy/adminScopeBridge', () => ({
  contextFromAdminRequest: (...a: unknown[]) => contextFromAdminRequest(...a),
}));

import growthJourneyRoutes from '../growthJourneyRoutes';

/**
 * T207 — brand scoping on the new read paths.
 *
 * The guard is REAL: `requireAdmin` is not mocked and neither is the router or
 * `tenantAuthorization`. Only the membership lookup (the bridge) and the model
 * are mocked, so every status code below is the one the shipped code returns.
 *
 * THE FOUR BRANDS SIT ACROSS THREE TENANTS (`seeds/ecosystemSeedData.ts`):
 *
 *   cpn            → tenant cpn
 *   ai-flotation   → tenant ai-flotation
 *   colaberry-training, colaberry-enterprise → tenant colaberry
 *
 * So cross-brand is usually cross-TENANT (404, anti-enumeration), and only the
 * Colaberry Training / Colaberry Enterprise pair is cross-brand within one
 * tenant (403). The plan's cycle 2 asserted 403 for every pair, which would
 * have failed against a correct implementation on two of the three.
 */

const BASE = '/api/admin/growth-journey';

const TENANT = {
  cpn: '10000000-0000-4000-8000-000000000001',
  colaberry: '10000000-0000-4000-8000-000000000002',
  aiFlotation: '10000000-0000-4000-8000-000000000003',
};
const BRAND = {
  cpn: '20000000-0000-4000-8000-000000000001',
  training: '20000000-0000-4000-8000-000000000002',
  enterprise: '20000000-0000-4000-8000-000000000003',
  aiFlotation: '20000000-0000-4000-8000-000000000004',
};
const ROW_ID = '30000000-0000-4000-8000-000000000001';

const token = (role = 'admin') =>
  jwt.sign({ sub: 'staff-1', email: 'staff@colaberry.com', role }, 'test-secret');

function app() {
  const a = express();
  a.use(growthJourneyRoutes);
  return a;
}

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token()}`);

/** A context as `buildRequestContext` would produce it for a member of one tenant. */
const memberOf = (tenantId: string, brandId: string | null = null) => ({
  platformIdentityId: 'pid-1',
  tenantId,
  brandId,
  organizationId: null,
  roles: ['tenant_admin'],
  isPlatformSuperAdmin: false,
  authorizedTenantIds: [tenantId],
});

const noMembership = () => ({
  platformIdentityId: 'pid-1',
  tenantId: null,
  brandId: null,
  organizationId: null,
  roles: [],
  isPlatformSuperAdmin: false,
  authorizedTenantIds: [],
});

const row = (tenantId: string, brandId: string) => ({
  id: ROW_ID,
  tenant_id: tenantId,
  brand_id: brandId,
  program_id: 'program-1',
  subject_ref: 'enrollment:enr-1',
  status: 'active',
  source: 'explorer_backfill',
});

beforeEach(() => {
  findByPk.mockReset().mockResolvedValue(null);
  findAndCountAll.mockReset().mockResolvedValue({ rows: [], count: 0 });
  create.mockReset();
  update.mockReset();
  destroy.mockReset();
  contextFromAdminRequest.mockReset().mockResolvedValue(memberOf(TENANT.cpn));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  // No read path writes.
  expect(create).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
  expect(destroy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('401 — the guard is real and path-scoped', () => {
  it('rejects an unauthenticated read of one row', async () => {
    const res = await request(app()).get(`${BASE}/participations/${ROW_ID}`);
    expect(res.status).toBe(401);
    expect(findByPk).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated list', async () => {
    const res = await request(app()).get(`${BASE}/participations`);
    expect(res.status).toBe(401);
    expect(findAndCountAll).not.toHaveBeenCalled();
  });

  it('does not bind the guard to paths outside its prefix', async () => {
    // A bare `router.use(requireAdmin)` would 401 this; the path-scoped form
    // lets Express fall through to its own 404.
    const a = express();
    a.use(growthJourneyRoutes);
    const res = await request(a).get('/api/public/anything');
    expect(res.status).toBe(404);
  });
});

describe('400 — Zod before any lookup', () => {
  it('refuses a non-uuid id', async () => {
    const res = await auth(request(app()).get(`${BASE}/participations/not-a-uuid`));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request');
    expect(findByPk).not.toHaveBeenCalled();
    expect(contextFromAdminRequest).not.toHaveBeenCalled();
  });

  it('refuses a limit outside 1..100', async () => {
    const res = await auth(request(app()).get(`${BASE}/participations?limit=500`));
    expect(res.status).toBe(400);
    expect(findAndCountAll).not.toHaveBeenCalled();
  });

  it('refuses a non-uuid brand_id', async () => {
    const res = await auth(request(app()).get(`${BASE}/participations?brand_id=cpn`));
    expect(res.status).toBe(400);
  });
});

describe('the status matrix, using the codes the guard actually returns', () => {
  it('200 — in-brand', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.cpn, BRAND.cpn));
    findByPk.mockResolvedValue(row(TENANT.cpn, BRAND.cpn));
    const res = await auth(request(app()).get(`${BASE}/participations/${ROW_ID}?brand_id=${BRAND.cpn}`));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ROW_ID);
  });

  it('404 — the row does not exist', async () => {
    findByPk.mockResolvedValue(null);
    const res = await auth(request(app()).get(`${BASE}/participations/${ROW_ID}`));
    expect(res.status).toBe(404);
  });

  it('404 — CROSS-TENANT: a CPN caller reading an AI Flotation row', async () => {
    // Not 403. A 403 would confirm the row exists, turning id enumeration into
    // a discovery tool for a competitor's inventory. This is the common case:
    // three of the four brands are alone in their tenant.
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.cpn));
    findByPk.mockResolvedValue(row(TENANT.aiFlotation, BRAND.aiFlotation));
    const res = await auth(request(app()).get(`${BASE}/participations/${ROW_ID}`));
    expect(res.status).toBe(404);
    expect(res.body.error_class).toBe('TenantIsolationViolation');
  });

  it('404 — cross-tenant is indistinguishable from not-found, by design', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.cpn));
    findByPk.mockResolvedValue(row(TENANT.aiFlotation, BRAND.aiFlotation));
    const crossTenant = await auth(request(app()).get(`${BASE}/participations/${ROW_ID}`));
    findByPk.mockResolvedValue(null);
    const missing = await auth(request(app()).get(`${BASE}/participations/${ROW_ID}`));
    expect(crossTenant.status).toBe(missing.status);
  });

  it('403 — CROSS-BRAND WITHIN ONE TENANT: Training scope reading an Enterprise row', async () => {
    // The only pair in §4's four brands that yields 403: both brands sit in the
    // `colaberry` tenant, so the tenant check passes and the brand check fires.
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.training));
    findByPk.mockResolvedValue(row(TENANT.colaberry, BRAND.enterprise));
    const res = await auth(
      request(app()).get(`${BASE}/participations/${ROW_ID}?brand_id=${BRAND.training}`),
    );
    expect(res.status).toBe(403);
    expect(res.body.error_class).toBe('AuthorizationError');
  });

  it('200 — a tenant-wide operator (no brand scope) reads either brand in their tenant', async () => {
    // A membership with brand_id null spans every brand in its tenant. That is
    // the tenancy module's documented semantics, inherited here.
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, null));
    findByPk.mockResolvedValue(row(TENANT.colaberry, BRAND.enterprise));
    const res = await auth(request(app()).get(`${BASE}/participations/${ROW_ID}`));
    expect(res.status).toBe(200);
  });

  it('404 — a caller with NO membership reads nothing, whatever the row', async () => {
    // Production today: zero active tenant_memberships. Every admin lands here.
    contextFromAdminRequest.mockResolvedValue(noMembership());
    findByPk.mockResolvedValue(row(TENANT.cpn, BRAND.cpn));
    const res = await auth(request(app()).get(`${BASE}/participations/${ROW_ID}`));
    expect(res.status).toBe(404);
  });

  it('all three outcomes are distinct for the same row id', async () => {
    const seen = new Set<number>();
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.training));
    findByPk.mockResolvedValue(row(TENANT.colaberry, BRAND.training));
    seen.add((await auth(request(app()).get(`${BASE}/participations/${ROW_ID}?brand_id=${BRAND.training}`))).status);
    findByPk.mockResolvedValue(row(TENANT.colaberry, BRAND.enterprise));
    seen.add((await auth(request(app()).get(`${BASE}/participations/${ROW_ID}?brand_id=${BRAND.training}`))).status);
    findByPk.mockResolvedValue(row(TENANT.aiFlotation, BRAND.aiFlotation));
    seen.add((await auth(request(app()).get(`${BASE}/participations/${ROW_ID}?brand_id=${BRAND.training}`))).status);
    expect([...seen].sort()).toEqual([200, 403, 404]);
  });
});

describe('refuse, never widen — a requested scope that was not granted', () => {
  it('403 when the caller asks for a brand the bridge did not grant', async () => {
    // `buildRequestContext` leaves brandId null for a brand the caller does not
    // hold, and null means UNSCOPED. Proceeding would hand a brand-scoped
    // operator the whole tenant for typing the wrong id.
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, null));
    findByPk.mockResolvedValue(row(TENANT.colaberry, BRAND.training));
    const res = await auth(
      request(app()).get(`${BASE}/participations/${ROW_ID}?brand_id=${BRAND.enterprise}`),
    );
    expect(res.status).toBe(403);
    expect(findByPk).not.toHaveBeenCalled();
  });

  it('403 when the caller asks for a tenant the bridge did not grant', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.cpn));
    const res = await auth(
      request(app()).get(`${BASE}/participations?tenant_id=${TENANT.aiFlotation}`),
    );
    expect(res.status).toBe(403);
    expect(findAndCountAll).not.toHaveBeenCalled();
  });

  it('passes the requested scope to the bridge for validation, not straight into the query', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.cpn, BRAND.cpn));
    await auth(request(app()).get(`${BASE}/participations?tenant_id=${TENANT.cpn}&brand_id=${BRAND.cpn}`));
    expect(contextFromAdminRequest).toHaveBeenCalledWith(expect.anything(), {
      requestedTenantId: TENANT.cpn,
      requestedBrandId: BRAND.cpn,
    });
  });
});

describe('spoofed hostname — the trusted map decides, never the claim', () => {
  const SPOOF_HEADERS = {
    Host: 'aiflotation.com',
    'X-Forwarded-Host': 'aiflotation.com',
    'X-Brand': 'ai-flotation',
  };

  it('a spoofed host does not grant access to another brand’s row', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.cpn));
    findByPk.mockResolvedValue(row(TENANT.aiFlotation, BRAND.aiFlotation));
    const res = await auth(request(app()).get(`${BASE}/participations/${ROW_ID}`)).set(SPOOF_HEADERS);
    expect(res.status).toBe(404);
  });

  it('a spoofed host does not change the outcome of an in-scope read either', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.cpn, BRAND.cpn));
    findByPk.mockResolvedValue(row(TENANT.cpn, BRAND.cpn));
    const plain = await auth(request(app()).get(`${BASE}/participations/${ROW_ID}?brand_id=${BRAND.cpn}`));
    const spoofed = await auth(request(app()).get(`${BASE}/participations/${ROW_ID}?brand_id=${BRAND.cpn}`)).set(
      SPOOF_HEADERS,
    );
    expect(spoofed.status).toBe(plain.status);
    expect(spoofed.status).toBe(200);
  });

  it('the controller has no code path that reads a host header at all', () => {
    // Not "refuses the claim" — there is nothing to refuse. Asserted on the
    // source so a future `req.hostname` cannot slip in beside the guard.
    const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'controllers', 'growthJourneyController.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/req\.hostname|req\.host\b|headers\[?['"`]?host|x-forwarded-host|x-brand|req\.get\(/i);
  });
});

describe('the list is scoped by tenantScopeWhere, never unscoped', () => {
  it('scopes to the caller’s tenant', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.cpn));
    await auth(request(app()).get(`${BASE}/participations`));
    expect(findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenant_id: TENANT.cpn } }),
    );
  });

  it('adds the brand when a brand scope was granted', async () => {
    contextFromAdminRequest.mockResolvedValue(memberOf(TENANT.colaberry, BRAND.training));
    await auth(request(app()).get(`${BASE}/participations?brand_id=${BRAND.training}`));
    expect(findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenant_id: TENANT.colaberry, brand_id: BRAND.training } }),
    );
  });

  it('a caller with no membership gets tenant_id: null — which matches nothing', async () => {
    // `tenantScopeWhere` documents this: returning `{}` here would turn a
    // membership-less request into an unscoped findAll.
    contextFromAdminRequest.mockResolvedValue(noMembership());
    await auth(request(app()).get(`${BASE}/participations`));
    expect(findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenant_id: null } }),
    );
  });

  it('never issues an unscoped query', async () => {
    for (const ctx of [memberOf(TENANT.cpn), noMembership(), memberOf(TENANT.colaberry, BRAND.enterprise)]) {
      findAndCountAll.mockClear();
      contextFromAdminRequest.mockResolvedValue(ctx);
      await auth(request(app()).get(`${BASE}/participations`));
      const where = findAndCountAll.mock.calls[0][0].where;
      expect(Object.keys(where)).toContain('tenant_id');
    }
  });

  it('applies limit and offset from the validated query', async () => {
    await auth(request(app()).get(`${BASE}/participations?limit=10&offset=20`));
    expect(findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, offset: 20 }));
  });
});

describe('failure path', () => {
  it('500 with a classified error when the read throws — never a stack trace', async () => {
    findByPk.mockRejectedValue(new Error('connection terminated'));
    const res = await auth(request(app()).get(`${BASE}/participations/${ROW_ID}`));
    expect(res.status).toBe(500);
    expect(res.body.error_class).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts:\d+/);
  });
});
