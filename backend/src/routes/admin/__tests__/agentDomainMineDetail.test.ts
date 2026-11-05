/**
 * A builder reading THEIR OWN domain's detail and coverage.
 *
 * ## The report
 *
 * Kalkidan Bezabeh, 5 Nov 2026, 9:10 AM CT, with a freshly minted token:
 * `GET /api/admin/agent-domains/admissions` and `.../coverage` both answer
 * **403 `{"error":"You do not have access to this section.","code":"section_not_permitted"}`**.
 * Her token carries `dashboard`, `lead_ingestion` and `agents`; both paths map to `program`.
 * STORY-000's panels 2, 3 and 4 — capability inventory, autonomy ladder, per-rung behaviour —
 * have no other source, so every builder is blocked on three of five panels.
 *
 * ## What is being tested, and why an admin token would prove nothing
 *
 * These routes are gated on `dashboard`, which every mgmt role except `support` holds. So the
 * section is NOT what protects them — the ownership check in the handler is, and that is what
 * this file is about. A test that asserted 200 with an admin token would pass whether or not the
 * scoping works at all, exactly as `agentDomainOwnerScope.test.ts` records for its own routes.
 * Every test below uses a SCOPED, NON-ADMIN token.
 *
 * The negative case is the one that matters: a builder asking for somebody else's domain must be
 * refused. Without it this is not a fix, it is the same disclosure on a different URL.
 */

import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const identityRows: Array<{ id: string }> = [];
let domainRows: Array<Record<string, unknown>> = [];

/**
 * Dispatch on the SQL rather than on call order, so the tests do not break when a handler
 * reorders its queries. Same shape and same reason as `agentDomainOwnerScope.test.ts`.
 *
 * The builder lookup is matched separately from the manager lookup because the two answer
 * different questions, and a mock that collapsed them would hide the case this fix is for:
 * Kalkidan manages nothing and is recorded as the intended BUILDER of her domain.
 */
const mockQuery = jest.fn(async (sql: string, opts?: { bind?: unknown[] }) => {
  // The MANAGER half: email -> org_members ids.
  if (/FROM\s+org_members/i.test(sql)) return identityRows;
  // The BUILDER half, and it is two hops, not one: email -> enrollments -> community_members
  // display_name, then `agent_domain_projects.intended_builder = that name`. Mocking it as a
  // single email match would have tested a query the reader does not make.
  if (/FROM\s+community_members/i.test(sql)) {
    const email = String((opts?.bind ?? [])[0] ?? '');
    return email.toLowerCase() === KALKIDAN ? [{ display_name: 'Kalkidan Bezabeh' }] : [];
  }
  if (/FROM\s+agent_domain_projects/i.test(sql)) {
    const bind = (opts?.bind ?? [])[0];
    if (Array.isArray(bind)) {
      return domainRows.filter((r) => (bind as string[]).includes(String(r.manager_identity_id)));
    }
    if (typeof bind === 'string') {
      return domainRows.filter((r) => String(r.intended_builder ?? '') === bind);
    }
    return domainRows;
  }
  return [];
});

jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => mockQuery(...(a as [string, { bind?: unknown[] }])) },
}));

import agentDomainRoutes from '../agentDomainRoutes';
import { env } from '../../../config/env';

const KALKIDAN = 'kalkidankin@gmail.com';

/**
 * A SCOPED staff token. `role: 'staff'` plus a mgmt_role is NOT a legacy full admin.
 *
 * `lead_intake` is the role Kalkidan actually holds, measured from her own report: sections
 * `dashboard`, `lead_ingestion`, `agents` — and notably NOT `program`.
 */
function scopedToken(email: string, mgmtRole = 'lead_intake'): string {
  return jwt.sign({ id: 't', email, role: 'staff', mgmt_role: mgmtRole },
    env.jwtSecret, { expiresIn: '5m' });
}

function app(): Express {
  const a = express();
  a.use(express.json());
  a.use(agentDomainRoutes);
  return a;
}

function domain(key: string, manager: string, over: Record<string, unknown> = {}) {
  return {
    domain_key: key,
    student_project_id: `p-${key}`,
    anchor_id: `a-${key}`,
    stage: 'discovery',
    entry_point: 'agent_domain_factory_provisioner',
    manager_identity_id: manager,
    manager_email: 'mgr@example.test',
    manager_can_reach: true,
    manager_blocker: null,
    intended_builder_state: 'verified_active',
    agent_id: null,
    releases: 3,
    stories: 50,
    stories_verified: 0,
    build_authorizations: 0,
    ...over,
  };
}

beforeEach(() => {
  mockQuery.mockClear();
  identityRows.length = 0;
  domainRows = [
    // Hers, held as BUILDER rather than manager — which is the case the fix is for. Every one of
    // the seven builders manages nothing; scoping by manager alone returned an empty page to all
    // six interns when AF8.3 tried it.
    domain('admissions', 'id-someone-else', { intended_builder: 'Kalkidan Bezabeh' }),
    domain('marketing', 'id-sohail'),
    domain('executive', 'id-ali'),
  ];
});

describe('THE REPORT — a builder can now read their own domain', () => {
  it('200 on her own domain detail, where the old route gave her 403', () => {
    return request(app())
      .get('/api/admin/agent-domains-mine/admissions')
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`)
      .expect(200)
      .then((res) => {
        expect(res.body.domain_key).toBe('admissions');
        // Panels 2 and 3 need these: the release ladder and the story count.
        expect(Array.isArray(res.body.releases)).toBe(true);
        expect(typeof res.body.story_count).toBe('number');
      });
  });

  it('200 on her own coverage matrix — STORY-000 panels 2, 3 and 4', () => {
    return request(app())
      .get('/api/admin/agent-domains-mine/admissions/coverage')
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`)
      .expect(200)
      .then((res) => {
        expect(res.body.domain_key).toBe('admissions');
        expect(res.body.summary).toBeDefined();
        expect(Array.isArray(res.body.rows)).toBe(true);
      });
  });

  it('the coverage filter and limit still work, so the panels can page', () => {
    return request(app())
      .get('/api/admin/agent-domains-mine/admissions/coverage?state=draft&limit=5')
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`)
      .expect(200)
      .then((res) => {
        expect(res.body.returned).toBeLessThanOrEqual(5);
        expect(res.body.matching).toBeGreaterThanOrEqual(res.body.returned);
      });
  });
});

describe('THE SCOPING — which is what makes this a fix and not a wider hole', () => {
  it('403 on a domain that is NOT hers, with the reason named', () => {
    // Without this the new route is the old disclosure on a new URL: every builder reading all
    // ten domains, each with its accountable human.
    return request(app())
      .get('/api/admin/agent-domains-mine/marketing')
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`)
      .expect(403)
      .then((res) => {
        expect(res.body.code).toBe('domain_not_yours');
        expect(res.body.your_domains).toEqual(['admissions']);
      });
  });

  it('403 on somebody else\'s COVERAGE too, not only the detail', () => {
    // Two routes, two checks. A scoping test that covered only the first would leave the matrix
    // — the richest of the two payloads — readable for every domain.
    return request(app())
      .get('/api/admin/agent-domains-mine/executive/coverage')
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`)
      .expect(403)
      .then((res) => expect(res.body.code).toBe('domain_not_yours'));
  });

  it('an identity that resolves to NO domain is told that, not told it is not hers', () => {
    // Different problem, different fix: an ownership record to correct, not a section to grant.
    // Collapsing the two sends a builder to argue about permissions.
    return request(app())
      .get('/api/admin/agent-domains-mine/admissions')
      .set('Authorization', `Bearer ${scopedToken('nobody@colaberry.com')}`)
      .expect(403)
      .then((res) => {
        expect(res.body.your_domains).toEqual([]);
        expect(res.body.error).toMatch(/matches no domain/);
      });
  });

  it('400 — not 403, and not 500 — on a domain key that does not exist', () => {
    return request(app())
      .get('/api/admin/agent-domains-mine/not_a_domain')
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`)
      .expect(400);
  });

  it('401 with no token at all', () => {
    return request(app())
      .get('/api/admin/agent-domains-mine/admissions')
      .expect(401);
  });

  it('`support` cannot reach it, because it holds no dashboard', () => {
    // Named rather than derived: `support` is the one mgmt role without `dashboard`, and if some
    // future role also loses it somebody should have to decide whether that was intended.
    //
    // THE BODY IS `requireSection`'S, NOT `mgmtSectionGate`'S, and the difference is worth
    // knowing. Two gates can refuse this path: the section-prefix gate that runs before the
    // router (whose 403 carries `code: 'section_not_permitted'` — the one in Kalkidan's report)
    // and this router's own `requireSection` (whose body is the sentence alone). This harness
    // mounts the router only, so it exercises the second. Asserting the code here would have
    // been asserting a middleware this test never runs.
    return request(app())
      .get('/api/admin/agent-domains-mine/admissions')
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN, 'support')}`)
      .expect(403)
      .then((res) => {
        expect(res.body.error).toMatch(/do not have access to this section/);
        // And NOT the ownership refusal — a section refusal must not read as "not your domain",
        // which would send someone to fix an org_members row that is already correct.
        expect(res.body.code).toBeUndefined();
      });
  });
});

describe('the old routes are UNTOUCHED', () => {
  it('still 403 for her, because they return any domain to anyone who reaches them', () => {
    // This fix adds routes; it does not re-section the existing ones. If this ever returns 200,
    // the per-domain read has been widened to every builder for every domain.
    return request(app())
      .get('/api/admin/agent-domains/marketing')
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`)
      .expect(403)
      .then((res) => {
        // `requireSection`'s body, for the reason the `support` test above records: this harness
        // mounts the router alone, so the outer section-prefix gate is not in the chain.
        expect(res.body.error).toMatch(/do not have access to this section/);
      });
  });

  it('and she STILL cannot read her own domain through the old route either', () => {
    // The honest statement of what was and was not fixed. The old path keeps refusing her, which
    // is correct — it is unscoped — and it is why the new path had to exist rather than the old
    // one being re-sectioned.
    return request(app())
      .get('/api/admin/agent-domains/admissions')
      .set('Authorization', `Bearer ${scopedToken(KALKIDAN)}`)
      .expect(403);
  });
});
