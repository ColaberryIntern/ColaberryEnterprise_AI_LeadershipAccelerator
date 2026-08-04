import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { getWorkLedgerHealth, getGovernanceShadowSummary } from '../../services/workLedger/workLedgerHealthService';
import { computeAgentTrustByCapability } from '../../services/outcomes/agentTrustService';
import { computeCostToProof } from '../../services/outcomes/costToProofService';
import { computeRelatedWorkClusters } from '../../services/outcomes/relatedWorkClusteringService';
import { getOutcomeMeasurementsSummary } from '../../services/outcomes/outcomeMeasurementService';
import { generateExecutiveNarrative } from '../../services/outcomes/executiveNarrativeService';
import workLedgerRoutes from '../../routes/admin/workLedgerRoutes';

jest.mock('../../services/workLedger/workLedgerHealthService', () => ({
  getWorkLedgerHealth: jest.fn(),
  getGovernanceShadowSummary: jest.fn(),
}));
jest.mock('../../services/outcomes/agentTrustService', () => ({
  computeAgentTrustByCapability: jest.fn(),
}));
jest.mock('../../services/outcomes/costToProofService', () => ({
  computeCostToProof: jest.fn(),
}));
jest.mock('../../services/outcomes/relatedWorkClusteringService', () => ({
  computeRelatedWorkClusters: jest.fn(),
}));
jest.mock('../../services/outcomes/outcomeMeasurementService', () => ({
  getOutcomeMeasurementsSummary: jest.fn(),
}));
jest.mock('../../services/outcomes/executiveNarrativeService', () => ({
  generateExecutiveNarrative: jest.fn(),
}));

const mockGetHealth = getWorkLedgerHealth as unknown as jest.Mock;
const mockGetGovernanceShadow = getGovernanceShadowSummary as unknown as jest.Mock;
const mockAgentTrust = computeAgentTrustByCapability as unknown as jest.Mock;
const mockCostToProof = computeCostToProof as unknown as jest.Mock;
const mockClusters = computeRelatedWorkClusters as unknown as jest.Mock;
const mockOutcomeSummary = getOutcomeMeasurementsSummary as unknown as jest.Mock;
const mockNarrative = generateExecutiveNarrative as unknown as jest.Mock;

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

// ProofDesk Outcomes & Learning — Milestone 5. Same auth/happy/failure shape as every
// route above, applied to the 5 new endpoints.

describe('GET /api/admin/dashboard/agent-trust', () => {
  it('401s an unauthenticated request', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/admin/dashboard/agent-trust');
    expect(res.status).toBe(401);
    expect(mockAgentTrust).not.toHaveBeenCalled();
  });

  it('returns 200 with the trust payload for an authenticated admin', async () => {
    mockAgentTrust.mockResolvedValue([
      { agent_name: 'CurriculumQAAgent', capability: 'curriculum.qa_check', risk_tier: 'R1', total: 3, succeeded: 2, failed: 1, success_rate: 0.667, status: 'sufficient_data' },
    ]);

    const app = buildApp();
    const res = await request(app).get('/api/admin/dashboard/agent-trust').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.agents).toHaveLength(1);
    expect(mockAgentTrust).toHaveBeenCalledTimes(1);
  });

  it('returns 500 (not a raw stack trace) when the service throws', async () => {
    mockAgentTrust.mockRejectedValue(new Error('db unavailable'));
    const app = buildApp();
    const res = await request(app).get('/api/admin/dashboard/agent-trust').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/db unavailable/);
  });
});

describe('GET /api/admin/dashboard/cost-to-proof', () => {
  it('401s an unauthenticated request', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/admin/dashboard/cost-to-proof');
    expect(res.status).toBe(401);
    expect(mockCostToProof).not.toHaveBeenCalled();
  });

  it('returns 200 with the cost-to-proof payload for an authenticated admin', async () => {
    mockCostToProof.mockResolvedValue([
      { capability: 'curriculum.qa_check', verified_count: 2, avg_duration_to_proof_ms: 2000, status: 'sufficient_data', cost_usd_note: 'cost_usd is not populated...' },
    ]);
    const app = buildApp();
    const res = await request(app).get('/api/admin/dashboard/cost-to-proof').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.capabilities).toHaveLength(1);
  });

  it('returns 500 (not a raw stack trace) when the service throws', async () => {
    mockCostToProof.mockRejectedValue(new Error('db unavailable'));
    const app = buildApp();
    const res = await request(app).get('/api/admin/dashboard/cost-to-proof').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/db unavailable/);
  });
});

describe('GET /api/admin/dashboard/related-work-clusters', () => {
  it('401s an unauthenticated request', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/admin/dashboard/related-work-clusters');
    expect(res.status).toBe(401);
    expect(mockClusters).not.toHaveBeenCalled();
  });

  it('returns 200 with the clusters payload for an authenticated admin', async () => {
    mockClusters.mockResolvedValue({ entity_clusters: [], resource_clusters: [] });
    const app = buildApp();
    const res = await request(app).get('/api/admin/dashboard/related-work-clusters').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ entity_clusters: [], resource_clusters: [] });
  });

  it('returns 500 (not a raw stack trace) when the service throws', async () => {
    mockClusters.mockRejectedValue(new Error('db unavailable'));
    const app = buildApp();
    const res = await request(app).get('/api/admin/dashboard/related-work-clusters').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/db unavailable/);
  });
});

describe('GET /api/admin/dashboard/outcome-measurements', () => {
  it('401s an unauthenticated request', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/admin/dashboard/outcome-measurements');
    expect(res.status).toBe(401);
    expect(mockOutcomeSummary).not.toHaveBeenCalled();
  });

  it('returns 200 with the summary payload for an authenticated admin', async () => {
    mockOutcomeSummary.mockResolvedValue({ scheduled: 1, observed: 2, stable: 1, recurrence_detected: 0, insufficient_data: 1 });
    const app = buildApp();
    const res = await request(app).get('/api/admin/dashboard/outcome-measurements').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ scheduled: 1, observed: 2 });
  });

  it('returns 500 (not a raw stack trace) when the service throws', async () => {
    mockOutcomeSummary.mockRejectedValue(new Error('db unavailable'));
    const app = buildApp();
    const res = await request(app).get('/api/admin/dashboard/outcome-measurements').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/db unavailable/);
  });
});

describe('GET /api/admin/dashboard/executive-narrative', () => {
  it('401s an unauthenticated request', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/admin/dashboard/executive-narrative');
    expect(res.status).toBe(401);
    expect(mockNarrative).not.toHaveBeenCalled();
  });

  it('defaults to window=day when omitted, returns 200', async () => {
    mockNarrative.mockResolvedValue({ window: 'day', honest_empty: true });
    const app = buildApp();
    const res = await request(app).get('/api/admin/dashboard/executive-narrative').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(mockNarrative).toHaveBeenCalledWith('day');
  });

  it('accepts window=week', async () => {
    mockNarrative.mockResolvedValue({ window: 'week', honest_empty: true });
    const app = buildApp();
    const res = await request(app).get('/api/admin/dashboard/executive-narrative?window=week').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(mockNarrative).toHaveBeenCalledWith('week');
  });

  it('rejects a malformed window with 400, never a 500 or silent default (Contract Enforcement)', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/admin/dashboard/executive-narrative?window=month').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
    expect(mockNarrative).not.toHaveBeenCalled();
  });

  it('returns 500 (not a raw stack trace) when the service throws', async () => {
    mockNarrative.mockRejectedValue(new Error('db unavailable'));
    const app = buildApp();
    const res = await request(app).get('/api/admin/dashboard/executive-narrative').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/db unavailable/);
  });
});
