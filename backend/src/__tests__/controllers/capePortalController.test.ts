import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { getLearnerSkillProfile } from '../../services/cape/capeProficiencyService';
import capePortalRoutes from '../../routes/capePortalRoutes';

jest.mock('../../services/cape/capeProficiencyService', () => ({
  getLearnerSkillProfile: jest.fn(),
}));

const mockGetProfile = getLearnerSkillProfile as unknown as jest.Mock;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(capePortalRoutes);
  return app;
}

function participantToken(sub = 'enr-1') {
  return jwt.sign({ sub, email: 'student@example.com', cohort_id: 'c1', role: 'participant' }, env.jwtSecret);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/portal/cape/skill-profile — auth path', () => {
  it('401s an unauthenticated request', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/portal/cape/skill-profile');
    expect(res.status).toBe(401);
    expect(mockGetProfile).not.toHaveBeenCalled();
  });

  it('returns 200 with the expected shape for an authenticated participant', async () => {
    mockGetProfile.mockResolvedValue({
      skills: Array.from({ length: 10 }, (_, i) => ({
        skill_id: `skill_${i}`, name: `Skill ${i}`, axis_order: i,
        placement: 0, claim: 0, knowledge: 0, application: 0, judgment: 0,
        proficiency: 0, confidence: 0, next_review_at: null,
      })),
      overall_placement: 0,
      overall_proficiency: 0,
      weights_version: 1,
    });

    const app = buildApp();
    const res = await request(app)
      .get('/api/portal/cape/skill-profile')
      .set('Authorization', `Bearer ${participantToken('enr-1')}`);

    expect(res.status).toBe(200);
    expect(res.body.skills).toHaveLength(10);
    expect(res.body).toHaveProperty('overall_proficiency');
    expect(mockGetProfile).toHaveBeenCalledWith('enr-1');
  });
});

describe('GET /api/portal/cape/skill-profile — failure path', () => {
  it('returns 500 (not a raw stack trace) when the service throws', async () => {
    mockGetProfile.mockRejectedValue(new Error('db unavailable'));
    const app = buildApp();
    // attach a trivial error handler since supertest won't otherwise see next(e)
    app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: 'internal' }));
    const res = await request(app)
      .get('/api/portal/cape/skill-profile')
      .set('Authorization', `Bearer ${participantToken('enr-1')}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/db unavailable/);
  });
});
