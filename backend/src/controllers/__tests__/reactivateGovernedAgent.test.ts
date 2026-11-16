import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

/**
 * THE SECOND DOOR INTO `ai_agents.enabled`.
 *
 * `mayaGoLiveRoutes.ts` gates `POST /api/admin/maya/enable` so that turning Maya ON is Ali's or a
 * super_admin's while turning her OFF stays any admin's, and `MAYA_GOVERNANCE.md` stated that as
 * a property of the system.
 *
 * It was a property of ONE ROUTE. `POST /api/admin/workforce/agents/:id/reactivate` has been
 * `requireAdmin` since 2026-08-24, calls `reactivateAgent()`, and writes `enabled: true` on any
 * agent found by id. The agent workspace's own "Reactivate" button calls it. Any admin could turn
 * Maya on by clicking the button the governance doc did not mention.
 *
 * This suite exists so that stops being true, and stays stopped. The assertions that matter are
 * the ones where the gate must NOT fire - an ungoverned agent, and a narrowing action - because a
 * gate that refuses everything passes a test that only checks it refuses.
 */

// AiAgent is NOT module-mocked. `models/index.ts` calls `AiAgent.hasMany(...)` at import time,
// and the controller reaches it through workforceService, so replacing the module with a plain
// object makes the whole suite fail to load with "hasMany is not a function". The real model is
// imported and `findByPk` is spied instead - no connection is opened, because nothing queries.
const mockReactivate = jest.fn();
jest.mock('../../services/workforce/agentReactivationService', () => {
  const actual = jest.requireActual('../../services/workforce/agentReactivationService');
  return { ...actual, reactivateAgent: (...a: unknown[]) => mockReactivate(...a) };
});

import AiAgent from '../../models/AiAgent';
import { handleReactivateAgent } from '../workforceController';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { env } from '../../config/env';
import { GOVERNED_ENABLEMENT_AGENTS, enablementRequiresAli } from '../../services/workforce/governedEnablementAgents';

const token = (email: string, role: string) =>
  `Bearer ${jwt.sign({ sub: 'u1', email, role }, env.jwtSecret, { expiresIn: '5m' })}`;
const ALI = token('ali@colaberry.com', 'admin');
const OTHER_ADMIN = token('ops@colaberry.com', 'admin');
const SUPER = token('ops2@colaberry.com', 'super_admin');

function app(): Express {
  const a = express();
  a.use(express.json());
  a.post('/api/admin/workforce/agents/:id/reactivate', requireAdmin, handleReactivateAgent);
  return a;
}

const post = (auth?: string) => {
  const r = request(app()).post('/api/admin/workforce/agents/agent-1/reactivate').send({ autonomy_level: 'communicate' });
  return auth ? r.set('Authorization', auth) : r;
};

let mockFindByPk: jest.SpyInstance;

beforeEach(() => {
  mockFindByPk = jest.spyOn(AiAgent, 'findByPk').mockResolvedValue({ id: 'agent-1', agent_name: 'Maya' } as any);
  mockReactivate.mockReset().mockResolvedValue({
    agentId: 'agent-1', agentName: 'Maya', found: true, reactivated: true, autonomyLevel: 'communicate', error: null,
  });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('reactivate, for an agent whose enablement is Ali\'s', () => {
  it('401 without a token, before any of this matters', async () => {
    expect((await post()).status).toBe(401);
  });

  it('REFUSES an ordinary admin, and does not write', async () => {
    const res = await post(OTHER_ADMIN);
    expect(res.status).toBe(403);
    expect(res.body.error_class).toBe('AuthError');
    expect(res.body.error).toMatch(/requires Ali or a super_admin/i);
    // The refusal is worthless if the write happened anyway.
    expect(mockReactivate).not.toHaveBeenCalled();
  });

  it('allows Ali', async () => {
    const res = await post(ALI);
    expect(res.status).toBe(200);
    expect(mockReactivate).toHaveBeenCalledWith('agent-1', 'communicate');
  });

  it('allows a super_admin', async () => {
    const res = await post(SUPER);
    expect(res.status).toBe(200);
    expect(mockReactivate).toHaveBeenCalledTimes(1);
  });

  it('names the agent in the refusal, so the reader knows which rule they hit', async () => {
    const res = await post(OTHER_ADMIN);
    expect(res.body.error).toContain('Maya');
  });
});

describe('CONTROL: the gate must not fire where it does not apply', () => {
  it('lets an ordinary admin reactivate an UNGOVERNED agent', async () => {
    // Without this, a gate that refuses every admin on every agent would pass the suite above.
    mockFindByPk.mockResolvedValue({ id: 'agent-9', agent_name: 'Reese' } as any);
    const res = await post(OTHER_ADMIN);
    expect(res.status).toBe(200);
    expect(mockReactivate).toHaveBeenCalledTimes(1);
  });

  it('lets an ordinary admin reactivate when the agent row cannot be found', async () => {
    // The lookup is for the NAME only. A missing row must fall through to the service, which has
    // its own not-found answer, rather than being refused as though it were governed.
    mockFindByPk.mockResolvedValue(null as any);
    mockReactivate.mockResolvedValue({
      agentId: 'agent-1', agentName: 'agent-1', found: false, reactivated: false, autonomyLevel: null, error: 'Agent not found',
    });
    const res = await post(OTHER_ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.result.found).toBe(false);
  });

  it('still validates the body before anything else', async () => {
    const res = await request(app())
      .post('/api/admin/workforce/agents/agent-1/reactivate')
      .set('Authorization', ALI)
      .send({ autonomy_level: 'not-a-level' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mockReactivate).not.toHaveBeenCalled();
  });
});

describe('the lookup fails CLOSED', () => {
  it('refuses, and does not reactivate, when the agent row cannot be READ', async () => {
    // Distinct from "the row is absent", which falls through on purpose. If the lookup THROWS we
    // cannot tell whether this agent is governed, and proceeding would be the one failure mode
    // that matters: a database blip turning an Ali-only switch into an any-admin one.
    mockFindByPk.mockRejectedValue(new Error('connection terminated'));
    const res = await post(OTHER_ADMIN);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mockReactivate).not.toHaveBeenCalled();
  });
});

describe('GOVERNED_ENABLEMENT_AGENTS', () => {
  it('is exactly Maya today', () => {
    expect([...GOVERNED_ENABLEMENT_AGENTS]).toEqual(['Maya']);
  });

  it('is frozen, so a caller cannot narrow it at runtime to get around the gate', () => {
    expect(Object.isFrozen(GOVERNED_ENABLEMENT_AGENTS)).toBe(true);
    expect(() => { (GOVERNED_ENABLEMENT_AGENTS as string[]).pop(); }).toThrow();
    expect([...GOVERNED_ENABLEMENT_AGENTS]).toEqual(['Maya']);
  });

  it('matches exactly, and treats an absent name as NOT governed', () => {
    expect(enablementRequiresAli('Maya')).toBe(true);
    expect(enablementRequiresAli('maya')).toBe(false);
    expect(enablementRequiresAli('Maya ')).toBe(false);
    expect(enablementRequiresAli('Reese')).toBe(false);
    // Unknown means "no EXTRA restriction on top of requireAdmin", not "deny". Returning true
    // here would lock admins out of agents this was never meant to cover.
    expect(enablementRequiresAli(null)).toBe(false);
    expect(enablementRequiresAli(undefined)).toBe(false);
    expect(enablementRequiresAli('')).toBe(false);
  });
});

describe('the asymmetry survives: narrowing is still any admin\'s', () => {
  it('the reset route is NOT given this gate', () => {
    // Deactivation must never wait on one person. Asserted against the source rather than by
    // calling it, because the property is "no such check was added here", which an invocation
    // cannot show.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'workforceController.ts'), 'utf8');
    const resetFn = src.slice(src.indexOf('export async function handleResetAgents'));
    const body = resetFn.slice(0, resetFn.indexOf('\nexport '));
    expect(body).not.toMatch(/enablementRequiresAli|isCoryAuthorizedIdentity/);
    // CONTROL: the same read DOES find the check on the reactivate handler, so a wrong slice
    // cannot read as a pass.
    const reactivateFn = src.slice(src.indexOf('export async function handleReactivateAgent'));
    expect(reactivateFn.slice(0, reactivateFn.indexOf('\nexport '))).toMatch(/enablementRequiresAli/);
  });
});
