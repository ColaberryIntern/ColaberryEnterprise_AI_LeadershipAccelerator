/**
 * The admin demo directory at the HTTP boundary: the 401 is asserted, not inferred.
 *
 * `scripts/lint-route-auth.js` substring-scans a route file for one of five guard names. It would
 * pass this file if `requireAdmin` appeared in a comment and nowhere else, and it knows nothing
 * about `mgmtSectionGate`, which holds a hardcoded prefix-to-section table and is DENY-BY-DEFAULT
 * for scoped management roles. A route family under an unmapped prefix therefore works for a
 * legacy full admin and 403s every scoped role, which looks fine in any manual check an owner
 * account can run. `caseStudyAdminRoutes.access.test.ts` was written for exactly that trap.
 *
 * So the proof here is a REAL scoped token through the REAL gate and the REAL `requireAdmin`,
 * reaching the handler. `/api/admin/projects` is already mapped to `program`, and this asserts
 * that rather than assuming it.
 */
jest.mock('../../../config/env', () => ({
  env: { jwtSecret: 'test-secret', nodeEnv: 'test' },
}));
jest.mock('../../../services/aiEventService', () => ({
  emitAiEvent: jest.fn().mockResolvedValue(undefined),
}));

const listDemoLinks = jest.fn();
jest.mock('../../../services/sbp/demoLinkDirectory', () => ({
  listDemoLinks: (...a: unknown[]) => listDemoLinks(...a),
  DEMO_DIRECTORY_MAX: 500,
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import projectDemoLinkRoutes from '../projectDemoLinkRoutes';
import { mgmtSectionGate, pathToSection } from '../../../middlewares/mgmtSectionGate';
import { roleCanAccessSection } from '../../../services/access/mgmtRoles';

const URL = '/api/admin/projects/demos';

const app = express();
app.use(express.json());
// The same order `routes/adminRoutes.ts` uses: the section gate runs once, before the sub-router.
app.use(mgmtSectionGate);
app.use(projectDemoLinkRoutes);

const token = (payload: Record<string, unknown>): string =>
  jwt.sign({ sub: 'staff-1', email: 'staff@colaberry.com', ...payload }, 'test-secret');

/** A legacy full admin: no `mgmt_role`, so the section gate passes it untouched. */
const LEGACY_ADMIN = token({ role: 'admin' });
/**
 * A bridge-minted scoped staff token in the section this path belongs to.
 *
 * `curriculum`, not `program`: `program` is a SECTION key, and `mgmtRoles.ts:88` shows the role
 * that holds it is `curriculum` (sections `['dashboard', 'program']`). Writing the section name
 * where a role belongs produced a 403 that looked like a missing PATH_SECTION row and was not.
 */
const CURRICULUM = token({ role: 'admin', mgmt_role: 'curriculum' });
/** Scoped somewhere else entirely: the negative control. */
const REVENUE = token({ role: 'admin', mgmt_role: 'revenue' });

const DIRECTORY = {
  rows: [{
    project_id: '11111111-1111-4111-8111-111111111111',
    name: 'Dispatch console',
    enrollment_id: 'enr-1',
    state: 'published',
    url: '/api/public/demo/tok',
    event_count: 4,
  }],
  counts: { published: 1, generated: 0, none: 0 },
  truncated: false,
};

beforeEach(() => {
  listDemoLinks.mockReset();
  listDemoLinks.mockResolvedValue(DIRECTORY);
});

describe('authentication, asserted rather than linted', () => {
  it('401s an unauthenticated request and never reaches the service', async () => {
    const res = await request(app).get(URL);
    expect(res.status).toBe(401);
    expect(listDemoLinks).not.toHaveBeenCalled();
  });

  it('401s a malformed bearer token', async () => {
    const res = await request(app).get(URL).set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
    expect(listDemoLinks).not.toHaveBeenCalled();
  });

  it('401s a token signed with the wrong secret', async () => {
    const forged = jwt.sign({ sub: 'staff-1', role: 'admin' }, 'not-the-secret');
    const res = await request(app).get(URL).set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(listDemoLinks).not.toHaveBeenCalled();
  });

  it('refuses a participant token with a 403, not a 401, and never reaches the service', async () => {
    // A participant carries no `mgmt_role`, so the section gate passes it through untouched and
    // `requireAdmin` is what refuses it. 403 rather than 401 is correct and worth pinning: the
    // caller IS authenticated, they are simply not staff, and conflating the two would tell an
    // enrolled student their session had expired.
    const participant = token({ role: 'participant', cohort_id: 'coh-1' });
    const res = await request(app).get(URL).set('Authorization', `Bearer ${participant}`);
    expect(res.status).toBe(403);
    expect(listDemoLinks).not.toHaveBeenCalled();
  });
});

describe('the section gate, which the lint cannot see', () => {
  it('the path is classified, and classified as the section that owns projects', () => {
    // The row itself. Without it the gate is deny-by-default and every scoped role 403s.
    expect(pathToSection(URL)).toBe('program');
  });

  it('a real role holds that section, so the classification is the RIGHT one', () => {
    // A row naming the wrong section would satisfy the assertion above and still lock staff out.
    expect(roleCanAccessSection('curriculum', 'program')).toBe(true);
    // And the negative control role genuinely lacks it, so the 403 below means something.
    expect(roleCanAccessSection('revenue', 'program')).toBe(false);
  });

  it('lets a real scoped staff token reach the handler', async () => {
    const res = await request(app).get(URL).set('Authorization', `Bearer ${CURRICULUM}`);
    expect(res.status).toBe(200);
    expect(listDemoLinks).toHaveBeenCalled();
  });

  it('lets a legacy full admin through as well', async () => {
    const res = await request(app).get(URL).set('Authorization', `Bearer ${LEGACY_ADMIN}`);
    expect(res.status).toBe(200);
  });

  it('refuses a token scoped to a different section, so the gate is doing something', async () => {
    const res = await request(app).get(URL).set('Authorization', `Bearer ${REVENUE}`);
    expect(res.status).toBe(403);
    expect(listDemoLinks).not.toHaveBeenCalled();
  });
});

describe('the response', () => {
  it('returns the directory as the service built it', async () => {
    const res = await request(app).get(URL).set('Authorization', `Bearer ${CURRICULUM}`);
    expect(res.body).toEqual(DIRECTORY);
  });

  it('defaults the page size rather than asking for everything', async () => {
    await request(app).get(URL).set('Authorization', `Bearer ${CURRICULUM}`);
    expect(listDemoLinks).toHaveBeenCalledWith(200);
  });

  it('passes a valid limit through', async () => {
    await request(app).get(`${URL}?limit=25`).set('Authorization', `Bearer ${CURRICULUM}`);
    expect(listDemoLinks).toHaveBeenCalledWith(25);
  });

  it('400s an unusable limit before the service is called', async () => {
    for (const q of ['limit=0', 'limit=-1', 'limit=abc', 'limit=501', 'limit=1.5']) {
      listDemoLinks.mockClear();
      const res = await request(app).get(`${URL}?${q}`).set('Authorization', `Bearer ${CURRICULUM}`);
      expect(res.status).toBe(400);
      expect(listDemoLinks).not.toHaveBeenCalled();
    }
  });

  it('accepts the maximum exactly, so the bound is inclusive and not off by one', async () => {
    const res = await request(app).get(`${URL}?limit=500`).set('Authorization', `Bearer ${CURRICULUM}`);
    expect(res.status).toBe(200);
    expect(listDemoLinks).toHaveBeenCalledWith(500);
  });

  it('500s WITHOUT echoing the driver message, because this reads a raw query', async () => {
    const secret = 'relation "projects" column "demo_share_token" does not exist';
    listDemoLinks.mockRejectedValue(new Error(secret));
    const res = await request(app).get(URL).set('Authorization', `Bearer ${CURRICULUM}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain(secret);
    expect(JSON.stringify(res.body)).not.toContain('demo_share_token');
  });
});

describe('read only, which is the point rather than an omission', () => {
  /**
   * Publishing a demo exposes a student's work at an unauthenticated URL, and that decision
   * belongs to the person whose work it is. Staff can see what is already public here and cannot
   * make anything public. Asserted so that a later change adding a write handler has to argue
   * with this test rather than slip past it.
   */
  it('declares no write handler of any kind', async () => {
    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      const res = await request(app)[method](URL).set('Authorization', `Bearer ${LEGACY_ADMIN}`);
      expect(res.status).toBe(404);
    }
  });
});
