/**
 * The agent-display-name router: auth per ROUTE, and the section it sits on.
 *
 * ## Why auth is asserted per route and not left to the lint
 *
 * `scripts/lint-route-auth.js` is a required CI check and it is PER FILE: it asks only whether a
 * source file contains `requireSection` anywhere. A file with one guarded route and one unguarded
 * route passes it. This file has one route today, so the lint happens to be sufficient right now
 * and will stop being sufficient the moment a second route is added here. These tests enumerate
 * the live Express stack so that day is a failing test rather than an open door.
 *
 * ## The section assertion is the point of this file
 *
 * `dashboard` is correct because this route is self-scoped: the service resolves the caller's own
 * ownership chain and 403s on anything else, exactly like the sibling `/agent-domains-mine` read
 * it sits beside. `program` would be wrong (it is the wider audience that reads the ten domains
 * without learning who builds them) and `internship` would be wrong in the other direction (that
 * wider grant exists for payloads carrying a builder's name and address; this one carries
 * neither). Neither mistake would produce a type error or a lint failure, which is why it is
 * pinned here.
 */

import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * The SERVICE is mocked, not the database. These tests are about who may call the route; a
 * Postgres connection in an auth test only creates ways for it to go green or red for the wrong
 * reason. The service's own behaviour is covered in
 * `services/agentDomain/__tests__/agentDisplayNameService.test.ts`.
 */
const mockSet = jest.fn();
jest.mock('../../../services/agentDomain/agentDisplayNameService', () => ({
  setAgentDisplayName: (...a: unknown[]) => mockSet(...a),
  AgentNotYoursError: class extends Error {},
  AgentDisplayNameTakenError: class extends Error {},
}));
jest.mock('../../../config/database', () => ({ sequelize: { fake: true } }));

import agentDisplayNameRoutes from '../agentDisplayNameRoutes';
import { env } from '../../../config/env';

const ROUTER_SRC = path.join(__dirname, '..', 'agentDisplayNameRoutes.ts');
const AGENT = '11111111-2222-4333-8444-555555555555';
const ROUTE = `/api/admin/agents/${AGENT}/display-name`;

function tokenFor(mgmtRole: string | null, role = 'staff'): string {
  const payload: Record<string, unknown> = { id: 'test-admin', email: 'test@example.test', role };
  if (mgmtRole) payload.mgmt_role = mgmtRole;
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '5m' });
}

function app(): Express {
  const a = express();
  a.use(express.json());
  a.use(agentDisplayNameRoutes);
  return a;
}

/** Every route this router registers, read from the live Express stack. */
function registeredRoutes(): Array<{ path: string; methods: string[]; handlerCount: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Express does not type its stack
  const stack = (agentDisplayNameRoutes as any).stack as Array<any>;
  return stack
    .filter((l) => l.route)
    .map((l) => ({
      path: l.route.path as string,
      methods: Object.keys(l.route.methods),
      // Includes every middleware AND the handler, so a guarded route is >= 2.
      handlerCount: l.route.stack.length as number,
    }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSet.mockResolvedValue({ agent_id: AGENT, display_name: 'Dara', unchanged: false });
});

describe('every route carries its own guard', () => {
  it('POSITIVE CONTROL: the router registers the route, so the enumeration is not empty', () => {
    const routes = registeredRoutes();
    expect(routes).toHaveLength(1);
    expect(routes[0].methods).toContain('patch');
    expect(routes[0].path).toBe('/api/admin/agents/:agentId/display-name');
  });

  it('every route has at least one middleware BEFORE its handler', () => {
    const unguarded = registeredRoutes().filter((r) => r.handlerCount < 2).map((r) => r.path);
    expect(unguarded).toEqual([]);
  });

  /**
   * MUTATION PROOF. Change `requireSection('dashboard')` in the router to `'program'` and this
   * test dies naming the section it found. The guard count is compared against the number of
   * registered routes, so a route added without a guard also fails here, which is the thing the
   * per-file lint cannot see.
   */
  it('every guard is `dashboard`, never `program` or `internship`', () => {
    const src = fs.readFileSync(ROUTER_SRC, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const sections = [...src.matchAll(/requireSection\(\s*'([a-z_]+)'\s*\)/g)].map((m) => m[1]);
    expect(sections).toHaveLength(registeredRoutes().length);
    expect(sections).toEqual(['dashboard']);
  });
});

describe('the door', () => {
  it('refuses an unauthenticated caller and never reaches the service', async () => {
    const res = await request(app()).patch(ROUTE).send({ display_name: 'Dara' });
    expect([401, 403]).toContain(res.status);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('refuses a token with no management role', async () => {
    const res = await request(app())
      .patch(ROUTE)
      .set('Authorization', `Bearer ${tokenFor(null)}`)
      .send({ display_name: 'Dara' });
    expect([401, 403]).toContain(res.status);
    expect(mockSet).not.toHaveBeenCalled();
  });
});
