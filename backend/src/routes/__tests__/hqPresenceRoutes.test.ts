const mockTouch = jest.fn(async () => undefined);
jest.mock('../../services/campus/hqPresence', () => {
  const actual = jest.requireActual('../../services/campus/hqPresence');
  return { ...actual, touchHqPresence: (...a: unknown[]) => (mockTouch as unknown as (...x: unknown[]) => unknown)(...a) };
});
jest.mock('../../services/communityService', () => ({ touchPresence: jest.fn() }));
jest.mock('../../models/CampusPresence', () => ({ __esModule: true, default: { upsert: jest.fn() } }));
jest.mock('../../db/ensureCampusPresenceSchema', () => ({ ensureCampusPresenceSchema: jest.fn() }));
jest.mock('../../services/campus/campusPresenceService', () => ({ clearCampusArea: jest.fn() }));
jest.mock('../../config/env', () => ({ env: { jwtSecret: 'hq-test-secret' } }));
jest.mock('../../middlewares/authMiddleware', () => ({
  ...jest.requireActual('../../middlewares/authMiddleware'),
  requireAnyAdmin: (_q: unknown, _s: unknown, n: () => void) => n(),
}));

import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { postAdminCampusHere } from '../admin/hqPresenceRoutes';
import { mgmtSectionGate } from '../../middlewares/mgmtSectionGate';

/** Campus HQ: POST /api/admin/campus/here, the Management Portal presence heartbeat. */
function call(body: unknown, admin: Record<string, unknown> | undefined) {
  const res = { statusCode: 0, body: undefined as unknown, status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; }, end() { return this; } };
  return postAdminCampusHere({ body, admin } as unknown as Request, res as unknown as Response).then(() => res);
}

beforeEach(() => mockTouch.mockReset().mockResolvedValue(undefined));

it('a bridged staff session: online + on its page, enrollment from the token only', async () => {
  const res = await call({ path: '/admin/marketing/brands' }, { sub: 'enr-1', mgmt_role: 'marketing' });
  expect(res.statusCode).toBe(204);
  expect(mockTouch).toHaveBeenCalledWith('enr-1', '/admin/marketing/brands', true);
});

it('a direct admin login linked to a staff account uses portal_enrollment_id', async () => {
  await call({ path: null, share: false }, { sub: 'admin-7', portal_enrollment_id: 'enr-2' });
  expect(mockTouch).toHaveBeenCalledWith('enr-2', null, false);
});

it('the body cannot name someone else', async () => {
  const res = await call({ path: '/admin/leads', enrollment_id: 'victim' }, { sub: 'enr-1', mgmt_role: 'owner' });
  expect(res.statusCode).toBe(400);
  expect(mockTouch).not.toHaveBeenCalled();
});

it.each([
  ['a detail route', { path: '/admin/leads/42' }],
  ['a query string', { path: '/admin/leads?x=1' }],
  ['no path at all', {}],
  ['a non-string path', { path: 7 }],
  ['an oversized path', { path: '/admin/' + 'a'.repeat(200) }],
])('400 on %s, nothing written', async (_n, body) => {
  const res = await call(body, { sub: 'enr-1', mgmt_role: 'owner' });
  expect(res.statusCode).toBe(400);
  expect(mockTouch).not.toHaveBeenCalled();
});

it('a legacy admin with no staff account: 204, nothing written', async () => {
  const res = await call({ path: '/admin/leads' }, { sub: 'admin-7', role: 'admin' });
  expect(res.statusCode).toBe(204);
  expect(mockTouch).not.toHaveBeenCalled();
});

it('a write failure is a logged 500 with an error class, not a silent success', async () => {
  mockTouch.mockRejectedValueOnce(new Error('db down') as never);
  const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const res = await call({ path: '/admin/leads' }, { sub: 'enr-1', mgmt_role: 'owner' });
  expect(res.statusCode).toBe(500);
  expect(res.body).toMatchObject({ error_class: 'CampusPresenceUnavailable' });
  expect(spy.mock.calls[0][0]).toContain('admin_campus_here_failed');
  spy.mockRestore();
});

it('mgmtSectionGate lets every scoped role send its own heartbeat (section-agnostic)', () => {
  for (const role of ['mentor', 'support', 'marketing', 'community_organizer']) {
    const token = jwt.sign({ sub: 'enr-1', email: 'x@colaberry.com', role: 'admin', mgmt_role: role }, 'hq-test-secret');
    const next = jest.fn();
    const res = { status: jest.fn(() => ({ json: jest.fn() })) };
    mgmtSectionGate({ headers: { authorization: `Bearer ${token}` }, path: '/api/admin/campus/here' } as unknown as Request, res as unknown as Response, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  }
});

it('mutation control: the same roles ARE refused an unmapped admin path (so the pass above is the agnostic entry)', () => {
  const token = jwt.sign({ sub: 'enr-1', email: 'x@colaberry.com', role: 'admin', mgmt_role: 'mentor' }, 'hq-test-secret');
  const next = jest.fn();
  const json = jest.fn();
  const res = { status: jest.fn(() => ({ json })) };
  mgmtSectionGate({ headers: { authorization: `Bearer ${token}` }, path: '/api/admin/campus/elsewhere' } as unknown as Request, res as unknown as Response, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(403);
});
