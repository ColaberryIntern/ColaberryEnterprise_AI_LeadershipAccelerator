jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../config/env', () => ({ env: { jwtSecret: 'test-secret' } }));

import jwt from 'jsonwebtoken';
import { requireSection, adminAllowedSections } from '../authMiddleware';
import { mgmtSectionGate, pathToSection } from '../mgmtSectionGate';

const verify = jwt.verify as unknown as jest.Mock;

function ctx(payload: any, withAuth = true) {
  const req: any = { method: 'GET', headers: withAuth ? { authorization: 'Bearer t' } : {} };
  const res: any = {
    statusCode: 0, body: null as any,
    status(c: number) { this.statusCode = c; return this; },
    json(b: any) { this.body = b; return this; },
  };
  const next = jest.fn();
  verify.mockReturnValue(payload);
  return { req, res, next };
}

describe('adminAllowedSections — role → sections', () => {
  it('legacy full admins see every section', () => {
    expect(adminAllowedSections({ role: 'super_admin' })).toContain('inbox_content');
    expect(adminAllowedSections({ role: 'admin' })).toContain('revenue');
    expect(adminAllowedSections({ role: 'admin' }).length).toBeGreaterThan(5);
  });
  it('mgmt owner = everything; mgmt admin = everything EXCEPT inbox_content', () => {
    expect(adminAllowedSections({ role: 'super_admin', mgmt_role: 'owner' })).toContain('inbox_content');
    const kes = adminAllowedSections({ role: 'admin', mgmt_role: 'admin' });
    expect(kes).toContain('revenue');
    expect(kes).toContain('program');
    expect(kes).not.toContain('inbox_content'); // Kes cannot see Inbox & Content
  });
  it('scoped roles get exactly their sections', () => {
    expect(adminAllowedSections({ role: 'curriculum', mgmt_role: 'curriculum' }).sort()).toEqual(['dashboard', 'program']);
    expect(adminAllowedSections({ role: 'revenue', mgmt_role: 'revenue' }).sort()).toEqual(['dashboard', 'revenue']);
    expect(adminAllowedSections({ role: 'support', mgmt_role: 'support' })).toEqual(['students']);
  });
  it('unknown / non-admin identities get nothing (deny by default)', () => {
    expect(adminAllowedSections({ role: 'sales' })).toEqual([]);
    expect(adminAllowedSections({ role: 'participant' })).toEqual([]);
    expect(adminAllowedSections({ role: 'x', mgmt_role: 'not_a_role' })).toEqual([]);
  });
});

describe('requireSection — enforcement', () => {
  beforeEach(() => jest.clearAllMocks());

  it('mgmt admin (Kes) is 403 on inbox_content but passes revenue', () => {
    let c = ctx({ role: 'admin', mgmt_role: 'admin' });
    requireSection('inbox_content')(c.req, c.res, c.next);
    expect(c.res.statusCode).toBe(403);
    expect(c.next).not.toHaveBeenCalled();

    c = ctx({ role: 'admin', mgmt_role: 'admin' });
    requireSection('revenue')(c.req, c.res, c.next);
    expect(c.next).toHaveBeenCalledTimes(1);
  });

  it('scoped curriculum passes program, 403 on revenue', () => {
    let c = ctx({ role: 'curriculum', mgmt_role: 'curriculum' });
    requireSection('program')(c.req, c.res, c.next);
    expect(c.next).toHaveBeenCalledTimes(1);

    c = ctx({ role: 'curriculum', mgmt_role: 'curriculum' });
    requireSection('revenue')(c.req, c.res, c.next);
    expect(c.res.statusCode).toBe(403);
    expect(c.next).not.toHaveBeenCalled();
  });

  it('support reaches students only', () => {
    let c = ctx({ role: 'support', mgmt_role: 'support' });
    requireSection('students')(c.req, c.res, c.next);
    expect(c.next).toHaveBeenCalledTimes(1);

    c = ctx({ role: 'support', mgmt_role: 'support' });
    requireSection('program')(c.req, c.res, c.next);
    expect(c.res.statusCode).toBe(403);
  });

  it('legacy full admin passes every section incl. inbox_content', () => {
    const c = ctx({ role: 'super_admin' });
    requireSection('inbox_content')(c.req, c.res, c.next);
    expect(c.next).toHaveBeenCalledTimes(1);
  });

  it('missing auth → 401', () => {
    const c = ctx({ role: 'admin' }, false);
    requireSection('revenue')(c.req, c.res, c.next);
    expect(c.res.statusCode).toBe(401);
    expect(c.next).not.toHaveBeenCalled();
  });
});

describe('pathToSection — request path → section', () => {
  it('maps section prefixes with a segment boundary', () => {
    expect(pathToSection('/api/admin/revenue/summary')).toBe('revenue');
    expect(pathToSection('/api/admin/accelerator/people')).toBe('program');
    expect(pathToSection('/api/admin/community/members')).toBe('program');
    expect(pathToSection('/api/admin/inbox/threads')).toBe('inbox_content');
    expect(pathToSection('/api/admin/students/abc')).toBe('students');
  });
  it('does not let /community capture /communications', () => {
    expect(pathToSection('/api/admin/communications/send')).toBe('campaigns');
  });
  it('returns null for unmapped paths', () => {
    expect(pathToSection('/api/admin/whoami')).toBeNull();
  });
});

describe('mgmtSectionGate — global path enforcement', () => {
  beforeEach(() => jest.clearAllMocks());

  function gctx(payload: any, path: string, withAuth = true) {
    const req: any = { path, headers: withAuth ? { authorization: 'Bearer t' } : {} };
    const res: any = {
      statusCode: 0, body: null as any,
      status(c: number) { this.statusCode = c; return this; },
      json(b: any) { this.body = b; return this; },
    };
    const next = jest.fn();
    if (withAuth) verify.mockReturnValue(payload);
    return { req, res, next };
  }

  it('no token → next() (requireAdmin downstream handles 401)', () => {
    const c = gctx(null, '/api/admin/revenue/x', false);
    mgmtSectionGate(c.req, c.res, c.next);
    expect(c.next).toHaveBeenCalledTimes(1);
  });

  it('legacy admin (no mgmt_role) passes any path', () => {
    const c = gctx({ role: 'super_admin' }, '/api/admin/inbox/threads');
    mgmtSectionGate(c.req, c.res, c.next);
    expect(c.next).toHaveBeenCalledTimes(1);
  });

  it('owner passes everything, inbox included', () => {
    const c = gctx({ role: 'super_admin', mgmt_role: 'owner' }, '/api/admin/inbox/threads');
    mgmtSectionGate(c.req, c.res, c.next);
    expect(c.next).toHaveBeenCalledTimes(1);
  });

  it('admin (Kes) 403 on inbox, passes program + unmapped cross-cutting', () => {
    let c = gctx({ role: 'admin', mgmt_role: 'admin' }, '/api/admin/inbox/threads');
    mgmtSectionGate(c.req, c.res, c.next);
    expect(c.res.statusCode).toBe(403);
    expect(c.next).not.toHaveBeenCalled();

    c = gctx({ role: 'admin', mgmt_role: 'admin' }, '/api/admin/accelerator/people');
    mgmtSectionGate(c.req, c.res, c.next);
    expect(c.next).toHaveBeenCalledTimes(1);

    c = gctx({ role: 'admin', mgmt_role: 'admin' }, '/api/admin/whoami'); // unmapped
    mgmtSectionGate(c.req, c.res, c.next);
    expect(c.next).toHaveBeenCalledTimes(1);
  });

  it('curriculum (Swati) passes program, 403 on revenue and inbox', () => {
    let c = gctx({ role: 'admin', mgmt_role: 'curriculum' }, '/api/admin/accelerator/people');
    mgmtSectionGate(c.req, c.res, c.next);
    expect(c.next).toHaveBeenCalledTimes(1);

    c = gctx({ role: 'admin', mgmt_role: 'curriculum' }, '/api/admin/revenue/summary');
    mgmtSectionGate(c.req, c.res, c.next);
    expect(c.res.statusCode).toBe(403);

    c = gctx({ role: 'admin', mgmt_role: 'curriculum' }, '/api/admin/inbox/threads');
    mgmtSectionGate(c.req, c.res, c.next);
    expect(c.res.statusCode).toBe(403);
  });

  it('revenue (Taiwo) passes revenue, 403 on program', () => {
    let c = gctx({ role: 'admin', mgmt_role: 'revenue' }, '/api/admin/refunds/list');
    mgmtSectionGate(c.req, c.res, c.next);
    expect(c.next).toHaveBeenCalledTimes(1);

    c = gctx({ role: 'admin', mgmt_role: 'revenue' }, '/api/admin/accelerator/people');
    mgmtSectionGate(c.req, c.res, c.next);
    expect(c.res.statusCode).toBe(403);
  });

  it('scoped role is 403 on unmapped paths (deny by default)', () => {
    const c = gctx({ role: 'admin', mgmt_role: 'revenue' }, '/api/admin/whoami');
    mgmtSectionGate(c.req, c.res, c.next);
    expect(c.res.statusCode).toBe(403);
  });

  it('every mgmt role reaches the section-agnostic /me', () => {
    for (const mgmt_role of ['admin', 'curriculum', 'revenue', 'support']) {
      const c = gctx({ role: 'admin', mgmt_role }, '/api/admin/me');
      mgmtSectionGate(c.req, c.res, c.next);
      expect(c.next).toHaveBeenCalledTimes(1);
    }
  });

  it('support reaches students, 403 on program/revenue', () => {
    let c = gctx({ role: 'admin', mgmt_role: 'support' }, '/api/admin/students/abc');
    mgmtSectionGate(c.req, c.res, c.next);
    expect(c.next).toHaveBeenCalledTimes(1);

    c = gctx({ role: 'admin', mgmt_role: 'support' }, '/api/admin/revenue/summary');
    mgmtSectionGate(c.req, c.res, c.next);
    expect(c.res.statusCode).toBe(403);
  });
});
