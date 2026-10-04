/**
 * agentEffectiveAccessController — R202. Mocks
 * agentEffectiveAccessService.ts wholesale (its own internals are already
 * covered by agentEffectiveAccessService.test.ts) to keep this file focused
 * on the HTTP layer: auth, status codes, Zod validation, response wiring.
 */
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

const mockResolveEffectiveAccess = jest.fn();
const mockBuildInventoryDriftReport = jest.fn();
const mockBuildToolCatalog = jest.fn();
jest.mock('../../services/workforce/agentEffectiveAccessService', () => ({
  resolveEffectiveAccess: (...a: any[]) => mockResolveEffectiveAccess(...a),
  buildInventoryDriftReport: (...a: any[]) => mockBuildInventoryDriftReport(...a),
  buildToolCatalog: (...a: any[]) => mockBuildToolCatalog(...a),
}));

import agentEffectiveAccessRoutes from '../../routes/admin/agentEffectiveAccessRoutes';
import { errorHandler } from '../../middlewares/errorHandler';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(agentEffectiveAccessRoutes);
  // The real production error handler (server.ts's own app.use(errorHandler))
  // — mounted here too, not Express's bare default, since fail()'s generic
  // fallback is next(err) and the "never leaks the raw message" guarantee is
  // this middleware's job, not the controller's own.
  app.use(errorHandler);
  return app;
}

function adminToken() {
  return jwt.sign({ sub: 'admin-1', email: 'ali@colaberry.com', role: 'super_admin' }, env.jwtSecret);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/admin/tools', () => {
  it('happy path: 200s with the real tool catalog AND the drift report, merged', async () => {
    mockBuildToolCatalog.mockResolvedValue({ generatedAt: '2026-10-01T00:00:00.000Z', tools: [{ toolName: 'read_attachments', assignedAgents: [] }] });
    mockBuildInventoryDriftReport.mockResolvedValue({ generatedAt: '2026-10-01T00:00:00.000Z', findings: [{ agentName: 'Reese', agentId: 'id-reese', description: 'x' }] });

    const res = await request(buildApp()).get('/api/admin/tools').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.tools).toHaveLength(1);
    expect(res.body.driftFindings).toHaveLength(1);
  });

  it('auth: unauthenticated request never reaches the service', async () => {
    const res = await request(buildApp()).get('/api/admin/tools');

    expect(res.status).toBe(401);
    expect(mockBuildInventoryDriftReport).not.toHaveBeenCalled();
    expect(mockBuildToolCatalog).not.toHaveBeenCalled();
  });

  it('BREAK: an unrecognized query param 400s (Contract Enforcement Layer)', async () => {
    const res = await request(buildApp()).get('/api/admin/tools?bogus=1').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(400);
    expect(mockBuildInventoryDriftReport).not.toHaveBeenCalled();
    expect(mockBuildToolCatalog).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/agents/:id/effective-access', () => {
  it('happy path: 200s with the real resolved report', async () => {
    mockResolveEffectiveAccess.mockResolvedValue({ agentId: 'agent-1', agentName: 'Reese', tools: [] });

    const res = await request(buildApp()).get('/api/admin/agents/agent-1/effective-access').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.agentName).toBe('Reese');
    expect(mockResolveEffectiveAccess).toHaveBeenCalledWith('agent-1');
  });

  it('boundary: a nonexistent agent 404s (never 200-with-null)', async () => {
    mockResolveEffectiveAccess.mockResolvedValue(null);

    const res = await request(buildApp()).get('/api/admin/agents/does-not-exist/effective-access').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(404);
  });

  it('auth: unauthenticated request never reaches the service', async () => {
    const res = await request(buildApp()).get('/api/admin/agents/agent-1/effective-access');

    expect(res.status).toBe(401);
    expect(mockResolveEffectiveAccess).not.toHaveBeenCalled();
  });

  it('failure: an unexpected service error 500s without leaking the raw message (the real errorHandler.ts, not a bare default)', async () => {
    mockResolveEffectiveAccess.mockRejectedValue(new Error('DB connection pool exhausted: 192.168.1.5'));

    const res = await request(buildApp()).get('/api/admin/agents/agent-1/effective-access').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    expect(JSON.stringify(res.body)).not.toMatch(/192\.168/);
  });
});
