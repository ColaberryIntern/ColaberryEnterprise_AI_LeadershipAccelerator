import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { getWorkLedgerHealth, getGovernanceShadowSummary } from '../../services/workLedger/workLedgerHealthService';
import workLedgerRoutes from '../../routes/admin/workLedgerRoutes';

jest.mock('../../services/workLedger/workLedgerHealthService', () => ({
  getWorkLedgerHealth: jest.fn(),
  getGovernanceShadowSummary: jest.fn(),
}));

const mockGetHealth = getWorkLedgerHealth as unknown as jest.Mock;
const mockGetGovernanceShadow = getGovernanceShadowSummary as unknown as jest.Mock;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(workLedgerRoutes);
  return app;
}

function adminToken() {
  return jwt.sign({ sub: 'admin-1', email: 'ali@colaberry.com', role: 'admin' }, env.jwtSecret);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/admin/dashboard/work-ledger-health — auth path', () => {
  it('401s an unauthenticated request', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/admin/dashboard/work-ledger-health');
    expect(res.status).toBe(401);
    expect(mockGetHealth).not.toHaveBeenCalled();
  });

  it('returns 200 with the health payload for an authenticated admin', async () => {
    mockGetHealth.mockResolvedValue({
      window_hours: 24,
      total_actions: 10,
      matched_actions: 9,
      orphan_count: 1,
      completeness_pct: 90,
      breakdown: [{ action: 'created', total: 10, matched: 9, orphan: 1 }],
    });

    const app = buildApp();
    const res = await request(app)
      .get('/api/admin/dashboard/work-ledger-health')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ completeness_pct: 90, orphan_count: 1, total_actions: 10 });
    expect(mockGetHealth).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/admin/dashboard/work-ledger-health — failure path', () => {
  it('returns 500 (not a raw stack trace) when the service throws', async () => {
    mockGetHealth.mockRejectedValue(new Error('db unavailable'));

    const app = buildApp();
    const res = await request(app)
      .get('/api/admin/dashboard/work-ledger-health')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
    expect(JSON.stringify(res.body)).not.toMatch(/db unavailable/);
  });
});

// ProofDesk Governance — Milestone 4 (shadow mode). Same auth/happy/failure shape as
// the pre-existing work-ledger-health route above, applied to the new endpoint.
describe('GET /api/admin/dashboard/governance-shadow — auth path', () => {
  it('401s an unauthenticated request (requireAdmin-gated, matching every other route in this file)', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/admin/dashboard/governance-shadow');
    expect(res.status).toBe(401);
    expect(mockGetGovernanceShadow).not.toHaveBeenCalled();
  });

  it('returns 200 with the governance shadow payload for an authenticated admin', async () => {
    mockGetGovernanceShadow.mockResolvedValue({
      window_hours: 24,
      total_decisions: 54,
      would_allow: 50,
      would_require_approval: 3,
      would_block: 1,
      breakdown: [{ action: 'ticket_dispatch', risk_tier: 'R3', verdict: 'would_require_approval', count: 3 }],
    });

    const app = buildApp();
    const res = await request(app)
      .get('/api/admin/dashboard/governance-shadow')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ would_require_approval: 3, would_block: 1, total_decisions: 54 });
    expect(mockGetGovernanceShadow).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/admin/dashboard/governance-shadow — failure path', () => {
  it('returns 500 (not a raw stack trace) when the service throws', async () => {
    mockGetGovernanceShadow.mockRejectedValue(new Error('db unavailable'));

    const app = buildApp();
    const res = await request(app)
      .get('/api/admin/dashboard/governance-shadow')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
    expect(JSON.stringify(res.body)).not.toMatch(/db unavailable/);
  });
});
