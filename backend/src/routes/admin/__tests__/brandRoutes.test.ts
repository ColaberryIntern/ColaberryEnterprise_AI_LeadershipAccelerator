/**
 * Brand administration — tenant isolation, and the guard the lint cannot see.
 *
 * `scripts/lint-route-auth.js` does a plain SUBSTRING search over each admin route file,
 * comments included. Its own header records a file that passed only because its prose happened
 * to contain the word `requireAdmin`. So "the lint exits 0" is not evidence that this endpoint
 * is guarded — it is evidence that the six letters appear somewhere. The first test below is
 * what actually proves the guard runs.
 *
 * The isolation tests matter because both services this route wires up take a bare `brandId`
 * and check nothing: `brandSendReadiness('<any uuid>')` returns whichever brand it is given,
 * with its domains and sender profiles attached. Every authorisation decision therefore lives
 * in the route, and if one handler forgets, that handler leaks — which is why each of the four
 * is asserted separately rather than trusting a shared helper to be reached.
 *
 * `scopeAllows` is deliberately NOT mocked. It is the isolation rule itself; mocking it would
 * leave these tests asserting that a stub returns what the stub was told to return.
 */

const mockFindByPk = jest.fn();
const mockFindAll = jest.fn();
const mockScope = jest.fn();
const mockReadiness = jest.fn();
const mockListProfiles = jest.fn();
let adminGuard: (req: any, res: any, next: any) => void;

jest.mock('../../../models', () => ({
  Brand: {
    findByPk: (...a: unknown[]) => mockFindByPk(...a),
    findAll: (...a: unknown[]) => mockFindAll(...a),
  },
}));

// Partial mock with requireActual spread: enumerating the exports would silently delete
// `scopeAllows`, and the failure would surface inside the route as "not a function" rather
// than as a missing mock.
jest.mock('../../../modules/tenancy/adminScopeBridge', () => ({
  ...jest.requireActual('../../../modules/tenancy/adminScopeBridge'),
  adminTenantScope: (...a: unknown[]) => mockScope(...a),
}));

jest.mock('../../../modules/communications/senderProfileService', () => ({
  brandSendReadiness: (...a: unknown[]) => mockReadiness(...a),
  listBrandSenderProfiles: (...a: unknown[]) => mockListProfiles(...a),
}));

jest.mock('../../../middlewares/authMiddleware', () => ({
  requireAdmin: (req: any, res: any, next: any) => adminGuard(req, res, next),
}));

import express from 'express';
import request from 'supertest';
import brandRoutes from '../brandRoutes';
import { brandTenantFilter } from '../brandRoutes';

const OURS = 'a0000000-0000-4000-8000-000000000001';
const THEIRS = 'b0000000-0000-4000-8000-000000000002';
const BRAND_OURS = 'c0000000-0000-4000-8000-000000000003';
const BRAND_THEIRS = 'd0000000-0000-4000-8000-000000000004';

function app() {
  const a = express();
  a.use(express.json());
  a.use(brandRoutes);
  return a;
}

function brand(id: string, tenantId: string) {
  return { id, tenant_id: tenantId, slug: 'main', name: 'Main', status: 'active', update: jest.fn() };
}

/** The guard every test uses unless it is specifically testing the guard. */
function allowAdmin(req: any, _res: any, next: any) {
  req.admin = { id: 'admin-1', email: 'ali@colaberry.com' };
  next();
}

beforeEach(() => {
  jest.clearAllMocks();
  adminGuard = allowAdmin;
  mockScope.mockResolvedValue({ mode: 'scoped', tenantIds: [OURS] });
});

describe('the admin guard is actually applied, not merely mentioned', () => {
  const paths = [
    '/api/admin/brands',
    `/api/admin/brands/${BRAND_OURS}`,
    `/api/admin/brands/${BRAND_OURS}/send-readiness`,
    `/api/admin/brands/${BRAND_OURS}/sender-profiles`,
  ];

  it.each(paths)('%s refuses an unauthenticated caller', async (path) => {
    adminGuard = (_req, res) => res.status(401).json({ error: 'Unauthorized' });
    const res = await request(app()).get(path);
    expect(res.status).toBe(401);
    // The point: nothing behind the guard ran.
    expect(mockFindByPk).not.toHaveBeenCalled();
    expect(mockFindAll).not.toHaveBeenCalled();
    expect(mockReadiness).not.toHaveBeenCalled();
  });

  it('PATCH refuses an unauthenticated caller too', async () => {
    adminGuard = (_req, res) => res.status(401).json({ error: 'Unauthorized' });
    const res = await request(app()).patch(`/api/admin/brands/${BRAND_OURS}`).send({ name: 'x' });
    expect(res.status).toBe(401);
    expect(mockFindByPk).not.toHaveBeenCalled();
  });
});

describe('a brand in another tenant is 404, never 403', () => {
  beforeEach(() => mockFindByPk.mockResolvedValue(brand(BRAND_THEIRS, THEIRS)));

  it.each([
    ['GET brand', (a: any) => request(a).get(`/api/admin/brands/${BRAND_THEIRS}`)],
    ['GET send-readiness', (a: any) => request(a).get(`/api/admin/brands/${BRAND_THEIRS}/send-readiness`)],
    ['GET sender-profiles', (a: any) => request(a).get(`/api/admin/brands/${BRAND_THEIRS}/sender-profiles`)],
    ['PATCH brand', (a: any) => request(a).patch(`/api/admin/brands/${BRAND_THEIRS}`).send({ name: 'Renamed' })],
  ])('%s returns 404', async (_label, call) => {
    const res = await call(app());
    expect(res.status).toBe(404);
    // 403 would confirm the brand exists, which is the enumeration leak.
    expect(res.status).not.toBe(403);
  });

  it('is byte-identical to the response for a brand that does not exist', async () => {
    const foreign = await request(app()).get(`/api/admin/brands/${BRAND_THEIRS}`);
    mockFindByPk.mockResolvedValue(null);
    const missing = await request(app()).get(`/api/admin/brands/${BRAND_THEIRS}`);
    // If these differ at all, the difference IS the oracle an attacker uses.
    expect(foreign.body).toEqual(missing.body);
    expect(foreign.status).toBe(missing.status);
  });

  it('never calls the readiness service for a foreign brand', async () => {
    // The load-bearing one. brandSendReadiness performs no check of its own, so reaching it at
    // all means another tenant's domains and sender profiles were read into this process -
    // filtering the response afterwards would be too late.
    await request(app()).get(`/api/admin/brands/${BRAND_THEIRS}/send-readiness`);
    expect(mockReadiness).not.toHaveBeenCalled();
  });

  it('never calls listBrandSenderProfiles for a foreign brand', async () => {
    await request(app()).get(`/api/admin/brands/${BRAND_THEIRS}/sender-profiles`);
    expect(mockListProfiles).not.toHaveBeenCalled();
  });

  it('does not write to a foreign brand', async () => {
    const target = brand(BRAND_THEIRS, THEIRS);
    mockFindByPk.mockResolvedValue(target);
    await request(app()).patch(`/api/admin/brands/${BRAND_THEIRS}`).send({ name: 'Renamed' });
    expect(target.update).not.toHaveBeenCalled();
  });
});

describe('a brand in our own tenant is served', () => {
  beforeEach(() => mockFindByPk.mockResolvedValue(brand(BRAND_OURS, OURS)));

  it('returns the brand', async () => {
    const res = await request(app()).get(`/api/admin/brands/${BRAND_OURS}`);
    expect(res.status).toBe(200);
    expect(res.body.brand.id).toBe(BRAND_OURS);
  });

  it('reaches the readiness service with the RESOLVED id, not the raw param', async () => {
    mockReadiness.mockResolvedValue({ brand: {}, domains: [], profiles: [] });
    const res = await request(app()).get(`/api/admin/brands/${BRAND_OURS}/send-readiness`);
    expect(res.status).toBe(200);
    expect(mockReadiness).toHaveBeenCalledWith(BRAND_OURS);
  });
});

describe('a caller-supplied tenant filter can only NARROW, never widen', () => {
  // This is the property the plan names, tested directly on the pure function rather than
  // inferred from a query object, because the bug it guards against is silent: the filter and
  // the scope would both be present and the wrong one would win.
  it('scoped + no filter -> the whole authorised scope', () => {
    expect(brandTenantFilter({ mode: 'scoped', tenantIds: [OURS, THEIRS] })).toEqual({
      tenant_id: [OURS, THEIRS],
    });
  });

  it('scoped + in-scope filter -> narrowed to that one', () => {
    expect(brandTenantFilter({ mode: 'scoped', tenantIds: [OURS, THEIRS] }, OURS)).toEqual({
      tenant_id: [OURS],
    });
  });

  it('scoped + OUT-OF-SCOPE filter -> matches nothing, does NOT widen', () => {
    // The attack: ask for a tenant you have no membership in. A spread-based implementation
    // where the user filter came second would return exactly that tenant's brands.
    expect(brandTenantFilter({ mode: 'scoped', tenantIds: [OURS] }, THEIRS)).toEqual({
      tenant_id: null,
    });
  });

  it('denied -> matches nothing, and specifically NOT an empty object', () => {
    // `{}` is "no filter" to Sequelize. Returning it here would hand every brand in the system
    // to a caller who was just denied - a lockout inverted into a full disclosure.
    const filter = brandTenantFilter({ mode: 'denied' }, OURS);
    expect(filter).toEqual({ tenant_id: null });
    expect(Object.keys(filter)).toHaveLength(1);
  });

  it('migration_open honours a narrowing filter and is otherwise unfiltered', () => {
    expect(brandTenantFilter({ mode: 'migration_open' })).toEqual({});
    expect(brandTenantFilter({ mode: 'migration_open' }, OURS)).toEqual({ tenant_id: OURS });
  });

  it('applies the scope to the actual list query', async () => {
    mockFindAll.mockResolvedValue([]);
    await request(app()).get('/api/admin/brands').query({ tenant_id: THEIRS });
    const where = mockFindAll.mock.calls[0][0].where;
    expect(where.tenant_id).toBeNull();
  });
});

describe('malformed input is refused before anything is loaded', () => {
  it('a non-uuid brand id is 400, and no query runs', async () => {
    const res = await request(app()).get('/api/admin/brands/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error_class).toBe('ValidationError');
    // findByPk('not-a-uuid') against Postgres raises at the driver and surfaces as a 500 -
    // an invalid request reported as a server fault.
    expect(mockFindByPk).not.toHaveBeenCalled();
  });

  it('a malformed PATCH body is 400 before the brand is loaded', async () => {
    mockFindByPk.mockResolvedValue(brand(BRAND_OURS, OURS));
    const res = await request(app())
      .patch(`/api/admin/brands/${BRAND_OURS}`)
      .send({ status: 'exploded' });
    expect(res.status).toBe(400);
    expect(mockFindByPk).not.toHaveBeenCalled();
  });

  it('rejects an attempt to move a brand between tenants', async () => {
    // `.strict()` makes this a 400 rather than a 200 that quietly ignored the field. Re-homing
    // a brand would silently take every lead context, campaign and tracked link with it.
    mockFindByPk.mockResolvedValue(brand(BRAND_OURS, OURS));
    const res = await request(app())
      .patch(`/api/admin/brands/${BRAND_OURS}`)
      .send({ tenant_id: THEIRS });
    expect(res.status).toBe(400);
    expect(mockFindByPk).not.toHaveBeenCalled();
  });

  it('rejects a slug change for the same reason', async () => {
    const res = await request(app())
      .patch(`/api/admin/brands/${BRAND_OURS}`)
      .send({ slug: 'renamed' });
    expect(res.status).toBe(400);
  });

  it('rejects an empty patch rather than reporting success for a no-op', async () => {
    const res = await request(app()).patch(`/api/admin/brands/${BRAND_OURS}`).send({});
    expect(res.status).toBe(400);
  });

  it('rejects an unknown list filter value', async () => {
    const res = await request(app()).get('/api/admin/brands').query({ status: 'retired' });
    expect(res.status).toBe(400);
    expect(mockFindAll).not.toHaveBeenCalled();
  });

  it('accepts a well-formed patch and writes exactly the validated fields', async () => {
    const target = brand(BRAND_OURS, OURS);
    mockFindByPk.mockResolvedValue(target);
    const res = await request(app())
      .patch(`/api/admin/brands/${BRAND_OURS}`)
      .send({ name: 'Colaberry Enterprise', support_email: 'hi@colaberry.com' });
    expect(res.status).toBe(200);
    expect(target.update).toHaveBeenCalledWith({
      name: 'Colaberry Enterprise',
      support_email: 'hi@colaberry.com',
    });
  });
});
