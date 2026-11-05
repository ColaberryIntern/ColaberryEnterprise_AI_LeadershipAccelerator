import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';
import { SECTION_DENIED, SECTION_DENIED_CODE, mgmtSectionGate } from '../mgmtSectionGate';

/**
 * A section refusal carries a MACHINE-READABLE code, not only an English sentence.
 *
 * ## Why this exists
 *
 * Mihret Netsereab, 2 Nov 2026, sent a screenshot of `/admin/dashboard` under a scoped role: TEN
 * red banners, every one of them "You do not have access to this section", stacked over every
 * tile on the page.
 *
 * Nothing was broken. That page fires thirteen requests in one `Promise.allSettled` and correctly
 * renders nothing for the ones a scoped role cannot see. The wall came from the frontend's
 * response interceptor, which raised a global toast for EVERY 4xx carrying a server message, so
 * the one case where a 403 is the system working as designed was reported ten times as a failure.
 *
 * The client cannot tell that case apart by matching on prose. `code` is what lets it, and this
 * file is the backend half of that contract: `frontend/src/utils/__tests__/apiSectionRefusal.test.ts`
 * pins the same literal on the other side, because the two stacks share no module.
 *
 * ## What must NOT change
 *
 * `error` keeps its exact wording. Anything already reading the sentence, including a person
 * reading a log, keeps working. The code is added beside it, never in place of it.
 */

function tokenFor(mgmt_role: string, extras: string[] = []): string {
  return jwt.sign(
    { sub: 'enr-1', email: 'scoped@colaberry.com', role: 'admin', mgmt_role, ...(extras.length ? { mgmt_extra_sections: extras } : {}) },
    env.jwtSecret,
    { expiresIn: '1h' },
  );
}

/** Drive the real middleware and capture what it sent. */
function callGate(path: string, token: string) {
  const req = { path, headers: { authorization: `Bearer ${token}` } } as unknown as Request;
  const sent: { status?: number; body?: Record<string, unknown> } = {};
  const res = {
    status(code: number) { sent.status = code; return this; },
    json(body: Record<string, unknown>) { sent.body = body; return this; },
  } as unknown as Response;
  let passed = false;
  const next = (() => { passed = true; }) as NextFunction;
  mgmtSectionGate(req, res, next);
  return { ...sent, passed };
}

/**
 * Mihret's own role, measured in production on 4 Nov 2026: `product_experience` with the `agents`
 * section added. The paths are the ones `AdminDashboardPage.tsx` actually requests.
 */
const HER_ROLE = 'product_experience';
const HER_EXTRAS = ['agents'];

describe('the refusal is readable by a program, not only by a person', () => {
  it('sends the code alongside the sentence', () => {
    const out = callGate('/api/admin/leads/stats', tokenFor(HER_ROLE, HER_EXTRAS));
    expect(out.status).toBe(403);
    expect(out.body).toEqual({ error: SECTION_DENIED, code: SECTION_DENIED_CODE });
  });

  it('pins the literal, because the frontend matches on it and shares no module with us', () => {
    expect(SECTION_DENIED_CODE).toBe('section_not_permitted');
  });

  it('keeps the sentence EXACTLY as it was, so nothing reading prose breaks', () => {
    expect(SECTION_DENIED).toBe('You do not have access to this section.');
  });

  it('sends the code on the broad-admin branch too, not just the scoped one', () => {
    // Two separate `res.status(403)` calls exist in the gate. A code on only one of them would
    // leave half the refusals untyped, and the half that stayed untyped would still toast.
    const out = callGate('/api/admin/inbox/threads', tokenFor('admin'));
    if (out.status === 403) {
      expect(out.body).toEqual({ error: SECTION_DENIED, code: SECTION_DENIED_CODE });
    } else {
      // If this path stops being forbidden for `admin`, the assertion above is vacuous and should
      // be repointed rather than silently passing.
      expect(out.passed).toBe(true);
    }
  });
});

describe("her dashboard's requests, as the page actually fires them", () => {
  // From the Promise.allSettled in AdminDashboardPage.tsx.
  const DASHBOARD_PATHS = [
    '/api/admin/stats',
    '/api/admin/cohorts',
    '/api/admin/opportunities/summary',
    '/api/admin/opportunities/forecast',
    '/api/admin/leads/stats',
    '/api/admin/pipeline/stats',
    '/api/admin/dashboard/campaign-activity',
    '/api/admin/scheduler/status',
    '/api/admin/admissions/stats',
    '/api/admin/dashboard/campaign-performance',
  ];

  it('refuses several of them for her role, which is the wall she photographed', () => {
    const token = tokenFor(HER_ROLE, HER_EXTRAS);
    const refused = DASHBOARD_PATHS.map((p) => callGate(p, token)).filter((o) => o.status === 403);
    // Not pinned to an exact count: the point is that it is MANY, and the exact number moves as
    // paths are reclassified. A single refusal would not reproduce her screenshot.
    expect(refused.length).toBeGreaterThan(3);
  });

  it('EVERY refusal carries the code, so not one of them can slip through as a toast', () => {
    // The assertion that matters. One untyped refusal among ten still puts a red banner on her
    // dashboard, so "most of them" is not good enough.
    const token = tokenFor(HER_ROLE, HER_EXTRAS);
    for (const p of DASHBOARD_PATHS) {
      const out = callGate(p, token);
      if (out.status === 403) {
        expect(out.body).toHaveProperty('code', SECTION_DENIED_CODE);
      }
    }
  });
});

describe('what the code must not become', () => {
  it('does not appear on a request the gate lets through', () => {
    // An owner-equivalent token passes untouched, and a pass must send no body at all.
    const out = callGate('/api/admin/stats', tokenFor('owner'));
    expect(out.passed).toBe(true);
    expect(out.body).toBeUndefined();
  });

  it('does not gate a token with no mgmt_role at all', () => {
    // Legacy direct admins are not bridge-minted and are deliberately untouched here.
    const token = jwt.sign({ sub: 'a', email: 'ali@colaberry.com', role: 'admin' }, env.jwtSecret, { expiresIn: '1h' });
    const out = callGate('/api/admin/leads/stats', token);
    expect(out.passed).toBe(true);
  });
});
