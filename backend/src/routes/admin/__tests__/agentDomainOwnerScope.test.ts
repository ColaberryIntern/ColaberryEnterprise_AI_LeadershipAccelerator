/**
 * AF2.4 — the ten provisioned projects, retrievable by the human who owns the domain.
 *
 * ## What this is really testing
 *
 * `/admin/projects` cannot show these ten. It walks cohorts -> enrollments (by `cohort_id`) ->
 * projects, and all ten belong to one `ai_staff` enrollment whose `cohort_id` is NULL. Measured in
 * production 14 and 15 Oct 2026: `ten 10, with_cohort 0, invisible 10`.
 *
 * So the fix is not "query harder", it is "stop routing the question through cohorts". The
 * structural assertions below are therefore about what the SQL must NOT mention, which is the only
 * way to pin a bug whose shape is a join that should not exist.
 *
 * ## Why an admin token proves nothing here
 *
 * Ali is a legacy full admin, so `adminAllowedSections` grants him every section and
 * `requireSection('program')` admits him to every route in this router. A test that asserts 200
 * with an admin token would pass whether or not ownership scoping works at all. Every scoping test
 * below therefore uses a SCOPED, NON-ADMIN token, and the admin case is asserted only where the
 * point is that section access and ownership are different questions.
 */

import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * One mock for the connection, dispatching on the SQL rather than on call order, so the tests do
 * not break when a handler reorders its two queries.
 */
const identityRows: Array<{ id: string }> = [];
let domainRows: Array<Record<string, unknown>> = [];
const seenSql: string[] = [];
const seenBinds: unknown[][] = [];

const mockQuery = jest.fn(async (sql: string, opts?: { bind?: unknown[] }) => {
  seenSql.push(sql);
  if (opts?.bind) seenBinds.push(opts.bind);
  if (/FROM\s+org_members/i.test(sql)) return identityRows;
  if (/FROM\s+agent_domain_projects/i.test(sql)) {
    // Mirror the WHERE: when the query is owner-scoped, only matching rows come back.
    const bind = (opts?.bind ?? [])[0];
    if (Array.isArray(bind)) {
      return domainRows.filter((r) => (bind as string[]).includes(String(r.manager_identity_id)));
    }
    return domainRows;
  }
  return [];
});

jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => mockQuery(...(a as [string, { bind?: unknown[] }])) },
}));

import agentDomainRoutes from '../agentDomainRoutes';
import { AGENT_DOMAIN_ORG_ID } from '../../../services/agentDomain/agentDomainRegistry';
import { summariseProvisioned } from '../../../services/agentDomain/agentDomainProvisionedReader';
import { env } from '../../../config/env';

const READER_SRC = path.join(
  __dirname, '..', '..', '..', 'services', 'agentDomain', 'agentDomainProvisionedReader.ts',
);

/**
 * A SCOPED staff token. `role: 'staff'` plus a mgmt_role is NOT a legacy full admin.
 *
 * The default is `curriculum`, which is the NARROWEST real role holding the `program` section
 * (`['dashboard', 'program']`). `program` is a SECTION, not a role, and passing it as a mgmt_role
 * yields no sections at all and a 403 on every route here -- which is how this helper was wrong
 * on its first run. `support` (`['students']`) is the negative case.
 */
function scopedToken(email: string, mgmtRole = 'curriculum'): string {
  return jwt.sign({ id: 't', email, role: 'staff', mgmt_role: mgmtRole },
    env.jwtSecret, { expiresIn: '5m' });
}
/** A legacy full admin, who holds every section. Used only to show sections != ownership. */
function adminToken(email: string): string {
  return jwt.sign({ id: 'a', email, role: 'super_admin' }, env.jwtSecret, { expiresIn: '5m' });
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
  seenSql.length = 0;
  seenBinds.length = 0;
  identityRows.length = 0;
  domainRows = [
    domain('executive', 'id-ali', { stories: 95 }),
    domain('learner_success', 'id-ali', { stories: 43 }),
    domain('marketing', 'id-sohail', { stories: 70 }),
    domain('platform', 'id-kes', { manager_can_reach: false, manager_blocker: 'no admin_users row' }),
  ];
});

// ───────────────────────── the defect, pinned structurally ─────────────────────────

describe('AF2.4 the cohort route is not reintroduced', () => {
  const src = fs.readFileSync(READER_SRC, 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('nothing in the reader mentions cohorts, anywhere', () => {
    // The whole defect is that visibility was routed through `cohort_id`. If the word appears in
    // executable code here, the bug has a path back in.
    expect(/cohort/i.test(code)).toBe(false);
  });

  /**
   * THIS ASSERTION WAS WRONG ON ITS FIRST VERSION, and the correction is the interesting part.
   *
   * It originally said the reader must not touch `enrollments` at all. That conflated two
   * different uses of the same table:
   *
   *   - routing VISIBILITY through enrollments (and thus cohorts) is the defect;
   *   - resolving IDENTITY through `org_members.enrollment_id` is a real foreign key, and is the
   *     only way to match a manager whose org_members row carries their personal address while
   *     they sign in with their work one. Two of ten managers are in exactly that state.
   *
   * So the ban belongs on the DOMAIN query, not on the file.
   */
  it('the DOMAIN query reaches projects from the anchor, never through enrollments', () => {
    const base = code.slice(code.indexOf('const BASE_SQL'), code.indexOf('export async function'));
    expect(/\benrollments\b/i.test(base)).toBe(false);
    expect(/cohort/i.test(base)).toBe(false);
    // It starts from the anchor table, which is what makes a cohort-less project visible.
    expect(base).toMatch(/FROM agent_domain_projects adp/);
  });

  it('the IDENTITY resolver is allowed to join enrollments, and does', () => {
    const resolver = code.slice(code.indexOf('resolveOwnerIdentityIds'));
    expect(resolver).toMatch(/LEFT JOIN enrollments e ON e\.id = om\.enrollment_id/);
    // but still never by cohort
    expect(/cohort/i.test(resolver)).toBe(false);
  });

  it('POSITIVE CONTROL: the detectors fire on text that does mention them', () => {
    // Proves the assertions above can fail rather than being vacuously true.
    const planted = 'JOIN enrollments e ON e.id = p.enrollment_id WHERE e.cohort_id IS NOT NULL';
    expect(/cohort/i.test(planted)).toBe(true);
    expect(/\benrollments\b/i.test(planted)).toBe(true);
  });

  it('the uuid-to-text cast on manager_identity_id is present', () => {
    // `manager_identity_id` is TEXT and `org_members.id` is UUID. Without the cast Postgres
    // raises `operator does not exist: uuid = text`, so this is load-bearing, not cosmetic.
    expect(code).toMatch(/om\.id::text\s*=\s*adp\.manager_identity_id/);
  });

  it('the lifecycle join is LEFT, so a missing row shows as null instead of vanishing', () => {
    // An inner join is the exact semantics that made the cohort walk drop all ten rows.
    expect(code).toMatch(/LEFT JOIN project_lifecycle_states/);
    expect(code).not.toMatch(/\n\s*JOIN project_lifecycle_states/);
  });
});

// ───────────────────────── ownership scoping ─────────────────────────

describe('AF2.4 /agent-domains-mine scopes by identity, not by section', () => {
  it('a scoped caller gets only the domains it manages', async () => {
    identityRows.push({ id: 'id-ali' });
    const res = await request(app())
      .get('/api/admin/agent-domains-mine')
      .set('Authorization', `Bearer ${scopedToken('ali@colaberry.com')}`);

    expect(res.status).toBe(200);
    const keys = res.body.domains.map((d: { domain_key: string }) => d.domain_key);
    expect(keys.sort()).toEqual(['executive', 'learner_success']);
    // The discriminating part: it did NOT return the other two.
    expect(keys).not.toContain('marketing');
    expect(keys).not.toContain('platform');
    expect(res.body.resolved_identities).toBe(1);
  });

  it('a DIFFERENT scoped caller gets a different, disjoint set', async () => {
    identityRows.push({ id: 'id-sohail' });
    const res = await request(app())
      .get('/api/admin/agent-domains-mine')
      .set('Authorization', `Bearer ${scopedToken('sohail@colaberry.com')}`);

    expect(res.body.domains.map((d: { domain_key: string }) => d.domain_key)).toEqual(['marketing']);
  });

  it('an email that owns nothing gets an EMPTY list, never the full set', async () => {
    // identityRows deliberately left empty: this email resolves to no org_members row.
    const res = await request(app())
      .get('/api/admin/agent-domains-mine')
      .set('Authorization', `Bearer ${scopedToken('stranger@example.test')}`);

    expect(res.status).toBe(200);
    expect(res.body.domains).toEqual([]);
    expect(res.body.resolved_identities).toBe(0);
    // It must SAY why, so an empty list is not read as a load failure.
    expect(res.body.note).toMatch(/owns no domain/i);
    // And it must not have asked the domain table at all.
    expect(seenSql.some((s) => /FROM\s+agent_domain_projects/i.test(s))).toBe(false);
  });

  it('POSITIVE CONTROL: an unscoped query WOULD return everything', async () => {
    // Proves the test above is detecting the scoping rather than an empty fixture. The same mock,
    // asked without a bind array, hands back all four domains -- which is what a missing filter
    // would do, and why the empty case returns early instead of falling through.
    const all = await mockQuery('SELECT 1 FROM agent_domain_projects adp', {});
    expect(all).toHaveLength(4);
  });

  it('A FULL ADMIN IS SCOPED TOO: sections decide whether you may ask, ownership decides what you get',
    async () => {
      identityRows.push({ id: 'id-ali' });
      const res = await request(app())
        .get('/api/admin/agent-domains-mine')
        .set('Authorization', `Bearer ${adminToken('ali@colaberry.com')}`);

      expect(res.status).toBe(200);
      // He holds every section, and still gets two of four. If this ever returns all of them, the
      // route has started answering the section question instead of the ownership question.
      expect(res.body.domains).toHaveLength(2);
    });

  it('the owner lookup is scoped to the ORG OF RECORD', async () => {
    identityRows.push({ id: 'id-ali' });
    await request(app())
      .get('/api/admin/agent-domains-mine')
      .set('Authorization', `Bearer ${scopedToken('ali@colaberry.com')}`);

    // Three organisations are named "Colaberry"; an unscoped email lookup could match a member row
    // in a stale org and hand someone a domain through it.
    const orgBind = seenBinds.find((b) => b.includes(AGENT_DOMAIN_ORG_ID));
    expect(orgBind).toBeDefined();
  });

  it('resolves a manager whose login email differs from their org_members email', async () => {
    // THE CONCRETE CASE, measured 15 Oct: admissions' org_members row carries
    // taiwooludimimu@gmail.com while Taiwo signs in as taiwo@colaberry.com. An exact
    // org_members.email match resolved him to ZERO identities and showed him an empty portal,
    // even though he is a full admin. The resolver now also matches the enrollment email.
    identityRows.push({ id: 'id-taiwo' });
    domainRows.push(domain('admissions', 'id-taiwo', { stories: 53 }));

    const res = await request(app())
      .get('/api/admin/agent-domains-mine')
      .set('Authorization', `Bearer ${scopedToken('taiwo@colaberry.com')}`);

    expect(res.body.domains.map((d: { domain_key: string }) => d.domain_key)).toEqual(['admissions']);
    // and the query it used offered BOTH addresses a chance to match
    const sql = seenSql.find((s) => /FROM\s+org_members/i.test(s)) ?? '';
    expect(sql).toMatch(/lower\(om\.email\)\s*=\s*lower\(\$1\)/);
    expect(sql).toMatch(/lower\(e\.email\)\s*=\s*lower\(\$1\)/);
  });

  it('de-duplicates when one person holds more than one member row', async () => {
    // The two-address join can return the same member row twice. Counting a domain twice would
    // overstate what someone owns.
    identityRows.push({ id: 'id-ali' }, { id: 'id-ali' });
    const res = await request(app())
      .get('/api/admin/agent-domains-mine')
      .set('Authorization', `Bearer ${scopedToken('ali@colaberry.com')}`);
    expect(res.body.resolved_identities).toBe(1);
    expect(res.body.domains).toHaveLength(2);
  });

  it('the email comes from the verified token, never from the query string', async () => {
    identityRows.push({ id: 'id-sohail' });
    const res = await request(app())
      .get('/api/admin/agent-domains-mine?email=ali@colaberry.com')
      .set('Authorization', `Bearer ${scopedToken('sohail@colaberry.com')}`);

    // The query param is ignored: the answer is sohail's single domain, not ali's two.
    expect(res.body.caller_email).toBe('sohail@colaberry.com');
    expect(res.body.domains.map((d: { domain_key: string }) => d.domain_key)).toEqual(['marketing']);
  });
});

// ───────────────────────── the unscoped route, and honesty of the summary ─────────────────────────

describe('AF2.4 /agent-domains-provisioned reads the database', () => {
  it('returns every provisioned domain with its real counts', async () => {
    const res = await request(app())
      .get('/api/admin/agent-domains-provisioned')
      .set('Authorization', `Bearer ${scopedToken('anyone@example.test')}`);

    expect(res.status).toBe(200);
    expect(res.body.domains).toHaveLength(4);
    expect(res.body.summary.stories).toBe(95 + 43 + 70 + 50);
    expect(res.body.summary.releases).toBe(12);
  });

  it('reports a blocked manager rather than defaulting reachability to true', async () => {
    const res = await request(app())
      .get('/api/admin/agent-domains-provisioned')
      .set('Authorization', `Bearer ${scopedToken('anyone@example.test')}`);

    expect(res.body.summary.managers_blocked).toBe(1);
    const platform = res.body.domains.find((d: { domain_key: string }) => d.domain_key === 'platform');
    expect(platform.manager_can_reach).toBe(false);
    expect(platform.manager_blocker).toMatch(/admin_users/);
  });

  it('a missing lifecycle row is counted, not silently dropped', async () => {
    domainRows.push(domain('website', 'id-none', { stage: null, entry_point: null }));
    const res = await request(app())
      .get('/api/admin/agent-domains-provisioned')
      .set('Authorization', `Bearer ${scopedToken('anyone@example.test')}`);

    expect(res.body.domains).toHaveLength(5);
    expect(res.body.summary.missing_lifecycle_row).toBe(1);
  });
});

describe('AF2.4 the summary does not dress up a plan as progress', () => {
  it('says these are PLANS while nothing is verified or authorized', () => {
    const s = summariseProvisioned([domain('x', 'm') as never]);
    expect(s.stories_verified).toBe(0);
    expect(s.build_authorizations).toBe(0);
    expect(s.disclosure).toMatch(/PLANS/);
    expect(s.disclosure).toMatch(/no agent has done any of this work/i);
  });

  it('CHANGES ITS CLAIM once a single story is verified', () => {
    // The positive control for the disclosure: it must not be a constant string.
    const s = summariseProvisioned([domain('x', 'm', { stories_verified: 1 }) as never]);
    expect(s.disclosure).not.toMatch(/PLANS/);
    expect(s.disclosure).toMatch(/read the per-domain figures/i);
  });

  it('changes its claim once a build is authorized', () => {
    const s = summariseProvisioned([domain('x', 'm', { build_authorizations: 1 }) as never]);
    expect(s.disclosure).not.toMatch(/PLANS/);
  });
});

// ───────────────────────── auth on the new routes ─────────────────────────

describe('AF2.4 the new routes are guarded like every sibling', () => {
  const NEW = ['/api/admin/agent-domains-provisioned', '/api/admin/agent-domains-mine'];

  it.each(NEW)('%s is 401 with no token', async (p) => {
    expect((await request(app()).get(p)).status).toBe(401);
  });

  it.each(NEW)('%s is 401 with a garbage token', async (p) => {
    expect((await request(app()).get(p).set('Authorization', 'Bearer nonsense')).status).toBe(401);
  });

  it.each(NEW)('%s is 403 for a role without the program section', async (p) => {
    // `support` holds only ['students']. Using `curriculum` here would be a broken test, because
    // curriculum DOES hold program and would correctly answer 200.
    const res = await request(app()).get(p)
      .set('Authorization', `Bearer ${scopedToken('x@example.test', 'support')}`);
    expect(res.status).toBe(403);
  });

  it.each(NEW)('%s is 200 for the narrowest role that does hold program', async (p) => {
    // The control for the 403 above: it is about the SECTION, not about broken wiring.
    const res = await request(app()).get(p)
      .set('Authorization', `Bearer ${scopedToken('x@example.test', 'curriculum')}`);
    expect(res.status).toBe(200);
  });
});

// ───────────────────────── the stale hardcoded claim ─────────────────────────

describe('AF2.4 the detail route stops asserting a provisioning state it never checked', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'agentDomainRoutes.ts'), 'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('no longer returns a hardcoded provisioned:false', async () => {
    // It used to say `provisioned: false` with "T19 is the provisioning step and it has not run".
    // Provisioning ran on 14 Oct at fa7f636bc, so that field had become a false statement to
    // every caller.
    expect(src).not.toMatch(/provisioned:\s*false/);
  });

  it('no longer tells callers provisioning has not run', async () => {
    expect(src).not.toMatch(/has not run/);
    const res = await request(app())
      .get('/api/admin/agent-domains/marketing')
      .set('Authorization', `Bearer ${scopedToken('x@example.test')}`);
    expect(res.status).toBe(200);
    expect(res.body.provisioned_state).toBe('not checked by this route');
    // And it points at the route that does check.
    expect(res.body.provisioning_note).toMatch(/agent-domains-provisioned/);
  });
});
