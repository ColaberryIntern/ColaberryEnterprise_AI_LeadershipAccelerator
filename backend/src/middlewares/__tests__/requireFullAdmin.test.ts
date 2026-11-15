/**
 * `requireFullAdmin` — may this identity ACT on a platform surface, as opposed to read it.
 *
 * Driven both ways for every management role there is, because this guard's whole job is to
 * separate two sets that `requireAdmin` cannot tell apart: `mintMgmtAdminToken` mints
 * `role: 'admin'` for every management role, so every one of them passes `requireAdmin`.
 *
 * The property that matters most is the LAST describe block: applying this guard must take
 * access from nobody. Every identity that reaches an unmapped admin path today — legacy admin,
 * owner, the near-full `admin` role — must still pass, or this change is a regression dressed up
 * as a hardening.
 */

jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../config/env', () => require('../../__tests__/testSupport/configMocks')
  .envModuleMock({ jwtSecret: 'test-secret' }));

import jwt from 'jsonwebtoken';
import { requireAdmin, requireFullAdmin } from '../authMiddleware';
import { MGMT_ROLE_DEFS, MGMT_ROLES, ALL_SECTIONS } from '../../services/access/mgmtRoles';

const verify = jwt.verify as unknown as jest.Mock;

function ctx(payload: unknown, withAuth = true) {
  const req: any = { method: 'POST', headers: withAuth ? { authorization: 'Bearer t' } : {} };
  const res: any = {
    statusCode: 0, body: null as any,
    status(c: number) { this.statusCode = c; return this; },
    json(b: any) { this.body = b; return this; },
  };
  const next = jest.fn();
  if (payload instanceof Error) verify.mockImplementation(() => { throw payload; });
  else verify.mockReturnValue(payload);
  return { req, res, next };
}

/** What the bridge actually mints for a given management role. The fact under test. */
const minted = (mgmt_role: string) => ({
  sub: 'e1',
  email: `${mgmt_role}@colaberry.com`,
  role: mgmt_role === 'owner' ? 'super_admin' : 'admin',
  mgmt_role,
});

/** The roles that are NOT section-scoped, derived rather than restated. */
const BROAD = MGMT_ROLES.filter(
  (r) => MGMT_ROLE_DEFS[r].sections.length >= ALL_SECTIONS.length - 1,
);
const SCOPED = MGMT_ROLES.filter((r) => !BROAD.includes(r));

beforeEach(() => { jest.clearAllMocks(); });

describe('POSITIVE CONTROL — the premise this guard exists for', () => {
  it('requireAdmin passes EVERY scoped management role, which is why this guard is needed', () => {
    // If this ever fails, `requireFullAdmin` may be redundant and should be reconsidered rather
    // than kept out of habit. It is the entire justification for a second guard.
    for (const role of SCOPED) {
      const { req, res, next } = ctx(minted(role));
      requireAdmin(req, res, next);
      expect({ role, passedRequireAdmin: next.mock.calls.length === 1 })
        .toEqual({ role, passedRequireAdmin: true });
    }
  });

  it('there IS at least one scoped role and at least one broad one', () => {
    // A derivation that silently produced an empty list would make both loops below vacuous.
    expect(SCOPED.length).toBeGreaterThan(0);
    expect(BROAD.length).toBeGreaterThan(0);
    expect(BROAD).toEqual(expect.arrayContaining(['owner', 'admin']));
  });
});

describe('who may ACT', () => {
  it('ADMITS a legacy admin, who carries no mgmt_role at all', () => {
    const { req, res, next } = ctx({ sub: 'a', email: 'ali@colaberry.com', role: 'admin' });
    requireFullAdmin(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
  });

  it('ADMITS a legacy super_admin', () => {
    const { req, res, next } = ctx({ sub: 'a', email: 'ali@colaberry.com', role: 'super_admin' });
    requireFullAdmin(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it.each(BROAD.map((r) => [r]))('ADMITS the broad management role %s', (role) => {
    const { req, res, next } = ctx(minted(role as string));
    requireFullAdmin(req, res, next);
    expect({ role, admitted: next.mock.calls.length === 1 }).toEqual({ role, admitted: true });
  });

  it.each(SCOPED.map((r) => [r]))('REFUSES the scoped management role %s with 403', (role) => {
    const { req, res, next } = ctx(minted(role as string));
    requireFullAdmin(req, res, next);
    expect({ role, status: res.statusCode, called: next.mock.calls.length })
      .toEqual({ role, status: 403, called: 0 });
  });

  it('refuses a scoped role with a CODE a client can branch on, and a sentence a person can read', () => {
    // The sentence matters here more than usual. A scoped reader is LOOKING AT the surface when
    // the button fails, so "Admin access required" reads as a bug rather than as a boundary.
    const { req, res, next } = ctx(minted('mentor'));
    requireFullAdmin(req, res, next);
    expect(res.body.code).toBe('full_admin_required');
    expect(res.body.error).toMatch(/view this surface but not change it/);
  });

  it('REFUSES a non-admin role outright, before it ever looks at mgmt_role', () => {
    const { req, res, next } = ctx({ sub: 'p', email: 'x@y.com', role: 'participant' });
    requireFullAdmin(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Admin access required');
  });

  it('REFUSES a sales token, which passes requireSalesOrAdmin elsewhere', () => {
    const { req, res, next } = ctx({ sub: 's', email: 's@y.com', role: 'sales' });
    requireFullAdmin(req, res, next);
    expect(res.statusCode).toBe(403);
  });

  it('401s with no Authorization header, never 403 — the caller is unauthenticated, not refused', () => {
    const { req, res, next } = ctx({ role: 'admin' }, false);
    requireFullAdmin(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('401s on a token that does not verify', () => {
    const { req, res, next } = ctx(new Error('bad signature'));
    requireFullAdmin(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('REFUSES an unrecognised mgmt_role rather than treating it as broad', () => {
    // Deny by default. A role string this code does not know is not a licence to act, and a
    // typo in a grant must not read as `admin`.
    const { req, res, next } = ctx({
      sub: 'e', email: 'x@y.com', role: 'admin', mgmt_role: 'adminn',
    });
    requireFullAdmin(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('full_admin_required');
  });

  it('cannot be widened by mgmt_extra_sections — sections grant READING, never acting', () => {
    // The hazard worth pinning. `mgmt_extra_sections` is how a reader is granted a surface, so
    // if it could also lift this guard, granting Quincy the read would grant him the kill switch
    // in the same row.
    const { req, res, next } = ctx({
      ...minted('mentor'),
      mgmt_extra_sections: [...ALL_SECTIONS],
    });
    requireFullAdmin(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches the verified payload to req.admin, so a handler never re-reads the header', () => {
    const { req, res, next } = ctx(minted('owner'));
    requireFullAdmin(req, res, next);
    expect(req.admin).toMatchObject({ mgmt_role: 'owner', email: 'owner@colaberry.com' });
  });
});

describe('THE REGRESSION PROPERTY — applying this guard takes access from nobody', () => {
  it('admits exactly the identities that reach an UNMAPPED admin path today', () => {
    // `mgmtSectionGate` lets a legacy admin through untouched, lets `owner` through on the
    // all-sections check, and lets `admin` through its `isBroad` branch (which denies only
    // mapped-and-forbidden paths). Every scoped role is refused an unmapped path there.
    //
    // So this set and that set must be the same, or this change is not a hardening: it either
    // locks out somebody who can act today, or admits somebody who cannot.
    const admitted: string[] = [];
    for (const role of MGMT_ROLES) {
      const { req, res, next } = ctx(minted(role));
      requireFullAdmin(req, res, next);
      if (next.mock.calls.length === 1) admitted.push(role);
      jest.clearAllMocks();
    }
    expect(admitted.sort()).toEqual([...BROAD].sort());
  });
});
