jest.mock('../../../controllers/capeAdminController', () => new Proxy({ __esModule: true }, { get: (t: Record<string, unknown>, k: string) => (k in t ? t[k] : (_q: unknown, r: { json: (b: unknown) => void }) => r.json({ ok: true })) }));
jest.mock('../../../controllers/capeGovernanceController', () => new Proxy({ __esModule: true }, { get: (t: Record<string, unknown>, k: string) => (k in t ? t[k] : (_q: unknown, r: { json: (b: unknown) => void }) => r.json({ ok: true })) }));
import express, { type Router } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { env } from '../../../config/env';
import { ALL_SECTIONS, MGMT_ROLES, effectiveSections } from '../../../services/access/mgmtRoles';
import admin from '../capeAdminRoutes';
import governance from '../capeGovernanceRoutes';

/** CAPE is mounted above adminRoutes, so the section gate never sees it: every route must check 'program' itself. */
const app = express(); app.use(admin); app.use(governance);
interface Layer { route?: { path: string; methods: Record<string, boolean> } }
const routes = [admin, governance].flatMap((r: Router) => (r.stack as unknown as Layer[]).flatMap((l) => (l.route ? Object.keys(l.route.methods).map((m) => [m, l.route!.path.replace(/:\w+/g, 'x')] as [string, string]) : [])));
const call = (m: string, p: string, claims?: Record<string, unknown>) => {
  const req = (request(app) as unknown as Record<string, (u: string) => request.Test>)[m](p);
  return (claims ? req.set('Authorization', `Bearer ${jwt.sign({ sub: 'u', email: 'u@example.com', role: 'admin', ...claims }, env.jwtSecret)}`) : req).then((r) => r.status);
};

it('covers all 16 routes', () => { expect(routes).toHaveLength(16); });
it.each(routes)('%s %s follows the program section for every role', async (m, p) => {
  expect(await call(m, p)).toBe(401);
  expect(await call(m, p, {})).toBe(200);
  for (const mgmt_role of MGMT_ROLES) {
    expect([mgmt_role, await call(m, p, { mgmt_role })]).toEqual([mgmt_role, effectiveSections(mgmt_role, undefined).includes('program') ? 200 : 403]);
  }
});
it('the roles with program are owner, admin and curriculum', () => {
  expect(ALL_SECTIONS).toContain('program');
  expect(MGMT_ROLES.filter((r) => effectiveSections(r, undefined).includes('program')).sort()).toEqual(['admin', 'curriculum', 'owner']);
});
