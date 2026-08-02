import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../../config/env';
import capeAdminRoutes from '../../../routes/admin/capeAdminRoutes';
import { updateSkillDefinition } from '../../../services/cape/capeSkillDefinitionsService';
import { updateWeights, getCurrentWeightsRow, getWeightsHistory } from '../../../services/cape/capeEvidenceBandWeightsService';

jest.mock('../../../services/cape/capeSkillDefinitionsService', () => ({
  listCurrentSkillDefinitions: jest.fn(async () => []),
  getSkillDefinitionHistory: jest.fn(async () => []),
  updateSkillDefinition: jest.fn(),
}));
jest.mock('../../../services/cape/capeEvidenceBandWeightsService', () => ({
  getCurrentWeightsRow: jest.fn(),
  getWeightsHistory: jest.fn(async () => []),
  updateWeights: jest.fn(),
}));

const mockUpdateSkillDefinition = updateSkillDefinition as unknown as jest.Mock;
const mockUpdateWeights = updateWeights as unknown as jest.Mock;
const mockGetCurrentWeights = getCurrentWeightsRow as unknown as jest.Mock;
const mockGetWeightsHistory = getWeightsHistory as unknown as jest.Mock;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(capeAdminRoutes);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ ok: false, error: 'internal' }));
  return app;
}

function adminToken() {
  return jwt.sign({ sub: 'admin-1', email: 'ali@colaberry.com', role: 'admin' }, env.jwtSecret);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCurrentWeights.mockResolvedValue({ version: 1, claim_weight: 0.2, knowledge_weight: 0.25, application_weight: 0.35, judgment_weight: 0.2 });
});

describe('PUT /api/admin/cape/skill-definitions/:skillId', () => {
  it('401s an unauthenticated request', async () => {
    const app = buildApp();
    const res = await request(app).put('/api/admin/cape/skill-definitions/prompting').send({ name: 'x' });
    expect(res.status).toBe(401);
    expect(mockUpdateSkillDefinition).not.toHaveBeenCalled();
  });

  it('happy path: a valid edit returns 200 with the versioned result', async () => {
    mockUpdateSkillDefinition.mockResolvedValue({ definition: { skill_id: 'prompting', version: 2 }, versioned: true });
    const app = buildApp();
    const res = await request(app)
      .put('/api/admin/cape/skill-definitions/prompting')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Prompt Engineering' });
    expect(res.status).toBe(200);
    expect(res.body.versioned).toBe(true);
  });

  it('failure/boundary: an empty body (no fields to change) is rejected 400 before touching the service', async () => {
    const app = buildApp();
    const res = await request(app)
      .put('/api/admin/cape/skill-definitions/prompting')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({});
    expect(res.status).toBe(400);
    expect(mockUpdateSkillDefinition).not.toHaveBeenCalled();
  });

  it('failure/boundary: unknown skillId maps the service 404 through to the response', async () => {
    const err: any = new Error('no current skill definition for "bogus"');
    err.status = 404;
    mockUpdateSkillDefinition.mockRejectedValue(err);
    const app = buildApp();
    const res = await request(app)
      .put('/api/admin/cape/skill-definitions/bogus')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/admin/cape/evidence-band-weights', () => {
  it('happy path: valid weights (sum 1.0) return 200', async () => {
    mockUpdateWeights.mockResolvedValue({ weights: { version: 2 }, versioned: true });
    const app = buildApp();
    const res = await request(app)
      .put('/api/admin/cape/evidence-band-weights')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ claim_weight: 0.25, knowledge_weight: 0.25, application_weight: 0.3, judgment_weight: 0.2 });
    expect(res.status).toBe(200);
    expect(mockUpdateWeights).toHaveBeenCalledTimes(1);
  });

  it('failure/boundary: weights not summing to 1.0 are rejected 400 before the service is called', async () => {
    const app = buildApp();
    const res = await request(app)
      .put('/api/admin/cape/evidence-band-weights')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ claim_weight: 0.2, knowledge_weight: 0.2, application_weight: 0.2, judgment_weight: 0.2 });
    expect(res.status).toBe(400);
    expect(mockUpdateWeights).not.toHaveBeenCalled();
  });

  it('idempotency: PUT with identical current values returns versioned:false', async () => {
    mockUpdateWeights.mockResolvedValue({ weights: { version: 1 }, versioned: false });
    const app = buildApp();
    const res = await request(app)
      .put('/api/admin/cape/evidence-band-weights')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ claim_weight: 0.2, knowledge_weight: 0.25, application_weight: 0.35, judgment_weight: 0.2 });
    expect(res.status).toBe(200);
    expect(res.body.versioned).toBe(false);
  });
});

describe('GET /api/admin/cape/evidence-band-weights', () => {
  it('returns current + history', async () => {
    mockGetWeightsHistory.mockResolvedValue([{ version: 1 }]);
    const app = buildApp();
    const res = await request(app)
      .get('/api/admin/cape/evidence-band-weights')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.current.version).toBe(1);
    expect(res.body.history).toHaveLength(1);
  });
});
