import express, { type Express } from 'express';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import path from 'path';
import request from 'supertest';

/**
 * AF12.5 — the `program` twin of the domain detail, and the ONE projection both handlers share.
 *
 * ## Why this is its own file
 *
 * `agentDomainRoutes.test.ts` is already 529 lines, past this repo's 500-line hard ceiling, and
 * CLAUDE.md's Modular Composition Rule says the next change to an oversize file splits it rather
 * than adding to it. So the program route's AF12.5 behaviour lands here. The builder-facing twin
 * is covered in `agentDomainMineDetail.test.ts`, which has the scoped non-admin token that proves
 * the fix for a real builder.
 *
 * ## The test that matters most here
 *
 * The ticket's instruction was "one shared projection function", for both routes AND the snapshot.
 * Three hand-written field lists would pass every behavioural test in this repo on the day they
 * were written and drift apart afterwards, which is how a builder's page and their committed
 * snapshot come to disagree about their own capability set. So this file asserts the two handlers
 * return IDENTICAL rows for the same domain, and that neither one spreads a record.
 *
 * The DB is mocked at the connection, matching the sibling file: there is no local Postgres and
 * the detail route reaches `sequelize` through the manager-reach resolver.
 */
/**
 * Dispatched on the SQL, not on call order, so the tests do not break when a handler reorders its
 * queries. Same shape and same reason as `agentDomainMineDetail.test.ts`.
 *
 * It must resolve OWNERSHIP, not just reachability: the byte-identical test below needs the
 * `-mine` route to actually answer 200. An earlier draft of this file mocked every query to `[]`,
 * so `myDomainKeys` returned nothing, the `-mine` route 403'd, and the comparison silently took a
 * fallback branch — a test that passed without testing anything.
 */
const mockQuery = jest.fn(async (sql: string, opts?: { bind?: unknown[] }) => {
  if (/FROM\s+org_members/i.test(sql)) return [{ id: 'id-ali' }];
  if (/FROM\s+community_members/i.test(sql)) return [{ display_name: 'Ali Muwwakkil' }];
  if (/FROM\s+agent_domain_projects/i.test(sql)) {
    const row = {
      domain_key: 'executive',
      student_project_id: 'p-executive',
      anchor_id: 'a-executive',
      stage: 'discovery',
      entry_point: 'agent_domain_factory_provisioner',
      manager_identity_id: 'id-ali',
      manager_email: 'ali@colaberry.com',
      manager_can_reach: true,
      manager_blocker: null,
      intended_builder: 'Ali Muwwakkil',
      intended_builder_state: 'verified_active',
      agent_id: null,
      releases: 3,
      stories: 50,
      stories_verified: 0,
      build_authorizations: 0,
    };
    const bind = (opts?.bind ?? [])[0];
    if (Array.isArray(bind)) return (bind as string[]).includes('id-ali') ? [row] : [];
    if (typeof bind === 'string') return bind === 'Ali Muwwakkil' ? [row] : [];
    return [row];
  }
  // No authorization rows: the production truth is an empty table, nobody has approved a build.
  return [];
});
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => mockQuery(...(a as [string, { bind?: unknown[] }])) },
}));

import agentDomainRoutes from '../agentDomainRoutes';
import { env } from '../../../config/env';
import { loadDomainMatrix } from '../../../services/agentDomain/capabilityRecord';

const ROUTER_SRC = path.join(__dirname, '..', 'agentDomainRoutes.ts');

/** `owner` holds every section, which is the only identity that reaches the `program` route here. */
function ownerToken(): string {
  return jwt.sign(
    { id: 'test-admin', email: 'ali@colaberry.com', role: 'staff', mgmt_role: 'owner' },
    env.jwtSecret,
    { expiresIn: '5m' },
  );
}

function app(): Express {
  const a = express();
  a.use(express.json());
  a.use(agentDomainRoutes);
  return a;
}

const get = (p: string) => request(app()).get(p).set('Authorization', `Bearer ${ownerToken()}`);

const ALLOWED = [
  'capability_id', 'name', 'classification', 'implementation_state',
  'requirement_validation_state', 'starting_autonomy', 'max_permitted_autonomy',
  'human_decision', 'release_behaviour',
].sort();

describe('the program detail route publishes the records it loads', () => {
  it('returns the capability records rather than only counts', () => {
    return get('/api/admin/agent-domains/marketing').expect(200).then((res) => {
      expect(Array.isArray(res.body.capabilities)).toBe(true);
      expect(res.body.capabilities.length).toBeGreaterThan(0);
    });
  });

  it('reports the real total for the domain, read from the matrix itself', () => {
    const real = loadDomainMatrix('marketing').capabilities.length;
    return get('/api/admin/agent-domains/marketing').expect(200).then((res) => {
      expect(res.body.capability_total).toBe(real);
      expect(res.body.capabilities_returned).toBe(real);
    });
  });

  it('exposes exactly the allow-listed fields and no index-signature extra', () => {
    return get('/api/admin/agent-domains/marketing').expect(200).then((res) => {
      for (const row of res.body.capabilities) {
        expect(Object.keys(row).sort()).toEqual(ALLOWED);
      }
    });
  });

  it('preserves file order, which is what panel 2 of the story requires', () => {
    const real = loadDomainMatrix('marketing').capabilities.map((c) => c.capability_id);
    return get('/api/admin/agent-domains/marketing').expect(200).then((res) => {
      expect(res.body.capabilities.map((c: { capability_id: string }) => c.capability_id))
        .toEqual(real);
    });
  });

  it('honours capability_limit while keeping the total honest', () => {
    return get('/api/admin/agent-domains/marketing?capability_limit=4').expect(200).then((res) => {
      expect(res.body.capabilities).toHaveLength(4);
      expect(res.body.capabilities_returned).toBe(4);
      expect(res.body.capability_total).toBeGreaterThan(4);
    });
  });

  it('400s a malformed capability_limit rather than ignoring it', () => {
    return get('/api/admin/agent-domains/marketing?capability_limit=-3').expect(400);
  });

  it('still 400s an unknown domain key, before loading anything', () => {
    return get('/api/admin/agent-domains/not-a-domain').expect(400);
  });
});

describe('ONE PROJECTION, used by both handlers — the drift this ticket asked to prevent', () => {
  it('program and -mine return byte-identical capability rows for the same domain', () => {
    // `executive` is Ali's own domain, so the owner token satisfies the ownership check and both
    // handlers answer for the same key with the same identity. If the two ever grew separate field
    // lists, this is the test that fails.
    //
    // Both statuses are asserted as 200 rather than tolerated: a 403 here would make the
    // comparison vacuous, which is exactly what an earlier draft of this test did.
    return get('/api/admin/agent-domains/executive').expect(200).then((program) => {
      return get('/api/admin/agent-domains-mine/executive').expect(200).then((mine) => {
        expect(mine.body.capabilities.length).toBeGreaterThan(0);
        expect(JSON.stringify(mine.body.capabilities))
          .toBe(JSON.stringify(program.body.capabilities));
        expect(mine.body.capability_total).toBe(program.body.capability_total);
      });
    });
  });

  it('NEITHER handler spreads a capability record', () => {
    // Structural, because a spread is the failure mode that passes every behavioural test above
    // on the day it is written: today's research files happen to carry only known extras for some
    // domains, so a spread can look correct until somebody edits a JSON file.
    const code = fs.readFileSync(ROUTER_SRC, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\.\.\.c\b/);
    expect(code).not.toMatch(/\.\.\.cap\b/);
    expect(code).not.toMatch(/\.\.\.record\b/);
    expect(code).not.toMatch(/m\.capabilities\s*\.map\s*\(\s*\(?\s*c\s*\)?\s*=>\s*\(\s*\{\s*\.\.\./);
  });

  it('both handlers call the shared projection, and nothing else builds a capability row', () => {
    const code = fs.readFileSync(ROUTER_SRC, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const calls = code.match(/projectCapabilities\(/g) ?? [];
    // Two handlers, two calls. A third would mean a route grew its own copy.
    expect(calls).toHaveLength(2);
    expect(code).toMatch(/from '\.\.\/\.\.\/services\/agentDomain\/capabilityProjection'/);
  });

  it('the router is still GET-only, which the sibling suite also pins', () => {
    // Re-asserted here because this change touched the router: AF12.5 adds data to a read
    // surface, and a write verb appearing in this file would be a different ticket entirely.
    const code = fs.readFileSync(ROUTER_SRC, 'utf8');
    for (const verb of ['router.post(', 'router.put(', 'router.patch(', 'router.delete(']) {
      expect(code).not.toContain(verb);
    }
  });
});
