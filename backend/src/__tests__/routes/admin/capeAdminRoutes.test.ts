import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../../config/env';
import capeAdminRoutes from '../../../routes/admin/capeAdminRoutes';
import { updateSkillDefinition } from '../../../services/cape/capeSkillDefinitionsService';
import { updateWeights, getCurrentWeightsRow, getWeightsHistory } from '../../../services/cape/capeEvidenceBandWeightsService';
import { resolveMappingForCard, createOrVersionMapping, assertCardExists } from '../../../services/cape/capeCurriculumSkillMapService';

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
jest.mock('../../../services/cape/capeCurriculumSkillMapService', () => ({
  resolveMappingForCard: jest.fn(),
  createOrVersionMapping: jest.fn(),
  assertCardExists: jest.fn(),
  CapeCurriculumSkillMapNotFoundError: class extends Error { status = 404; },
}));

const mockUpdateSkillDefinition = updateSkillDefinition as unknown as jest.Mock;
const mockUpdateWeights = updateWeights as unknown as jest.Mock;
const mockGetCurrentWeights = getCurrentWeightsRow as unknown as jest.Mock;
const mockGetWeightsHistory = getWeightsHistory as unknown as jest.Mock;
const mockResolveMappingForCard = resolveMappingForCard as unknown as jest.Mock;
const mockCreateOrVersionMapping = createOrVersionMapping as unknown as jest.Mock;
const mockAssertCardExists = assertCardExists as unknown as jest.Mock;

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
  mockAssertCardExists.mockResolvedValue(undefined);
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

const validImpacts = [{ skill_id: 'agents_mcp', weight: 1, bands: ['application'], credit_strength: 'high', evidence_required: true, max_credit: 15 }];

describe('GET /api/admin/cape/curriculum-skill-maps/card/:cardId', () => {
  it('401s an unauthenticated request', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/admin/cape/curriculum-skill-maps/card/11111111-1111-4111-8111-111111111111');
    expect(res.status).toBe(401);
    expect(mockResolveMappingForCard).not.toHaveBeenCalled();
  });

  it('happy path: returns the resolved contract + source', async () => {
    mockResolveMappingForCard.mockResolvedValue({ contract: { skill_impacts: validImpacts }, source: 'type_default', map_id: 'm1', version: 1 });
    const app = buildApp();
    const res = await request(app)
      .get('/api/admin/cape/curriculum-skill-maps/card/11111111-1111-4111-8111-111111111111')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('type_default');
  });

  it('failure/boundary: an unknown cardId returns 404', async () => {
    const err: any = new Error('Timeline card "bogus" not found');
    err.status = 404;
    mockResolveMappingForCard.mockRejectedValue(err);
    const app = buildApp();
    const res = await request(app)
      .get('/api/admin/cape/curriculum-skill-maps/card/bogus')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/admin/cape/curriculum-skill-maps/card/:cardId', () => {
  it('401s an unauthenticated request', async () => {
    const app = buildApp();
    const res = await request(app).put('/api/admin/cape/curriculum-skill-maps/card/11111111-1111-4111-8111-111111111111').send({ skill_impacts: validImpacts });
    expect(res.status).toBe(401);
    expect(mockCreateOrVersionMapping).not.toHaveBeenCalled();
  });

  it('happy path: creates a card override and returns its version', async () => {
    mockCreateOrVersionMapping.mockResolvedValue({ id: 'm2', version: 2 });
    const app = buildApp();
    const res = await request(app)
      .put('/api/admin/cape/curriculum-skill-maps/card/11111111-1111-4111-8111-111111111111')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ skill_impacts: validImpacts, prerequisite_skills: [], recommended_range: { min: 20, max: 70 }, reviewable: true });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(2);
    expect(res.body.source).toBe('card_override');
    expect(mockAssertCardExists).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
  });

  it('failure/boundary: invalid weights (not summing to 1.0) are rejected 400 before assertCardExists/createOrVersionMapping run', async () => {
    const app = buildApp();
    const res = await request(app)
      .put('/api/admin/cape/curriculum-skill-maps/card/11111111-1111-4111-8111-111111111111')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ skill_impacts: [{ ...validImpacts[0], weight: 0.4 }], prerequisite_skills: [], recommended_range: { min: 20, max: 70 }, reviewable: true });
    expect(res.status).toBe(400);
    expect(mockAssertCardExists).not.toHaveBeenCalled();
    expect(mockCreateOrVersionMapping).not.toHaveBeenCalled();
  });

  it('failure/boundary: an unknown cardId returns 404 (assertCardExists rejects before any write)', async () => {
    const err: any = new Error('Timeline card "22222222-2222-4222-8222-222222222222" not found');
    err.status = 404;
    mockAssertCardExists.mockRejectedValue(err);
    const app = buildApp();
    const res = await request(app)
      .put('/api/admin/cape/curriculum-skill-maps/card/22222222-2222-4222-8222-222222222222')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ skill_impacts: validImpacts, prerequisite_skills: [], recommended_range: { min: 20, max: 70 }, reviewable: true });
    expect(res.status).toBe(404);
    expect(mockCreateOrVersionMapping).not.toHaveBeenCalled();
  });

  it('security: the request body cannot override scope_type/card_id — the URL param always wins', async () => {
    mockCreateOrVersionMapping.mockResolvedValue({ id: 'm3', version: 1 });
    const app = buildApp();
    await request(app)
      .put('/api/admin/cape/curriculum-skill-maps/card/11111111-1111-4111-8111-111111111111')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ scope_type: 'type', type_slug: 'knowledge_check', card_id: 'someone-elses-card', skill_impacts: validImpacts, prerequisite_skills: [], recommended_range: { min: 20, max: 70 }, reviewable: true });
    const [callArg] = mockCreateOrVersionMapping.mock.calls[0];
    expect(callArg.scope_type).toBe('card');
    expect(callArg.card_id).toBe('11111111-1111-4111-8111-111111111111');
  });
});
