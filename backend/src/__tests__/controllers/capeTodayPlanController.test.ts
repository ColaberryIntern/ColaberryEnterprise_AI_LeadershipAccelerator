import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { getTodayPlan } from '../../services/cape/capeTodayPlanService';
import { recordFeedback, startTestOut, CapeTodayPlanFeedbackError } from '../../services/cape/capeTodayPlanFeedbackService';
import capePortalRoutes from '../../routes/capePortalRoutes';

jest.mock('../../services/cape/capeTodayPlanService', () => ({ getTodayPlan: jest.fn() }));
jest.mock('../../services/cape/capeTodayPlanFeedbackService', () => {
  const actual = jest.requireActual('../../services/cape/capeTodayPlanFeedbackService');
  return { ...actual, recordFeedback: jest.fn(), startTestOut: jest.fn() };
});
// This route file also mounts the pre-existing skill-profile/diagnostic
// handlers — stub their services too so this suite exercises ONLY the new
// Phase 5 routes without depending on unrelated real DB reads.
jest.mock('../../services/cape/capeProficiencyService', () => ({ getLearnerSkillProfile: jest.fn() }));
jest.mock('../../services/cape/capeDiagnosticService', () => {
  const actual = jest.requireActual('../../services/cape/capeDiagnosticService');
  return { ...actual, startDiagnostic: jest.fn(), submitDiagnosticAttempt: jest.fn() };
});

const mockGetTodayPlan = getTodayPlan as unknown as jest.Mock;
const mockRecordFeedback = recordFeedback as unknown as jest.Mock;
const mockStartTestOut = startTestOut as unknown as jest.Mock;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(capePortalRoutes);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: 'internal' }));
  return app;
}

function participantToken(sub = 'enr-1') {
  return jwt.sign({ sub, email: 'student@example.com', cohort_id: 'c1', role: 'participant' }, env.jwtSecret);
}

const originalFlag = env.capeTodayPlanEnabled;

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  (env as any).capeTodayPlanEnabled = originalFlag;
});

describe('GET /api/portal/cape/today-plan', () => {
  it('404s with { ok:false, error:"disabled" } when the flag is off — even for an authenticated request', async () => {
    (env as any).capeTodayPlanEnabled = false;
    const app = buildApp();
    const res = await request(app)
      .get('/api/portal/cape/today-plan')
      .set('Authorization', `Bearer ${participantToken()}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ ok: false, error: 'disabled' });
    expect(mockGetTodayPlan).not.toHaveBeenCalled();
  });

  it('401s an unauthenticated request even when the flag is on', async () => {
    (env as any).capeTodayPlanEnabled = true;
    const app = buildApp();
    const res = await request(app).get('/api/portal/cape/today-plan');
    expect(res.status).toBe(401);
    expect(mockGetTodayPlan).not.toHaveBeenCalled();
  });

  it('200s with the plan for an authenticated participant when the flag is on', async () => {
    (env as any).capeTodayPlanEnabled = true;
    mockGetTodayPlan.mockResolvedValue({ mode: 'foundation', items: [], estimated_total_minutes: 0 });
    const app = buildApp();
    const res = await request(app)
      .get('/api/portal/cape/today-plan')
      .set('Authorization', `Bearer ${participantToken('enr-1')}`);
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('foundation');
    expect(mockGetTodayPlan).toHaveBeenCalledWith('enr-1');
  });
});

describe('POST /api/portal/cape/today-plan/feedback', () => {
  it('404s when the flag is off', async () => {
    (env as any).capeTodayPlanEnabled = false;
    const app = buildApp();
    const res = await request(app)
      .post('/api/portal/cape/today-plan/feedback')
      .set('Authorization', `Bearer ${participantToken()}`)
      .send({ ref: 'card:c1', action: 'more_like_this' });
    expect(res.status).toBe(404);
    expect(mockRecordFeedback).not.toHaveBeenCalled();
  });

  it('401s an unauthenticated request', async () => {
    (env as any).capeTodayPlanEnabled = true;
    const app = buildApp();
    const res = await request(app).post('/api/portal/cape/today-plan/feedback').send({ ref: 'card:c1', action: 'too_easy' });
    expect(res.status).toBe(401);
    expect(mockRecordFeedback).not.toHaveBeenCalled();
  });

  it('400s a malformed body (missing action) via the real Zod schema, before calling the service', async () => {
    (env as any).capeTodayPlanEnabled = true;
    const app = buildApp();
    const res = await request(app)
      .post('/api/portal/cape/today-plan/feedback')
      .set('Authorization', `Bearer ${participantToken()}`)
      .send({ ref: 'card:c1' });
    expect(res.status).toBe(400);
    expect(mockRecordFeedback).not.toHaveBeenCalled();
  });

  it('200s with { ok:true, created } on a valid feedback submission for the AUTHENTICATED enrollment', async () => {
    (env as any).capeTodayPlanEnabled = true;
    mockRecordFeedback.mockResolvedValue({ created: true, id: 'row-1' });
    const app = buildApp();
    const res = await request(app)
      .post('/api/portal/cape/today-plan/feedback')
      .set('Authorization', `Bearer ${participantToken('enr-1')}`)
      .send({ ref: 'card:c1', action: 'already_know' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, created: true });
    expect(mockRecordFeedback).toHaveBeenCalledWith({ enrollment_id: 'enr-1', ref: 'card:c1', action: 'already_know' });
  });
});

describe('POST /api/portal/cape/today-plan/test-out', () => {
  it('404s when the flag is off', async () => {
    (env as any).capeTodayPlanEnabled = false;
    const app = buildApp();
    const res = await request(app)
      .post('/api/portal/cape/today-plan/test-out')
      .set('Authorization', `Bearer ${participantToken()}`)
      .send({ ref: 'card:c1' });
    expect(res.status).toBe(404);
    expect(mockStartTestOut).not.toHaveBeenCalled();
  });

  it('401s an unauthenticated request', async () => {
    (env as any).capeTodayPlanEnabled = true;
    const app = buildApp();
    const res = await request(app).post('/api/portal/cape/today-plan/test-out').send({ ref: 'card:c1' });
    expect(res.status).toBe(401);
    expect(mockStartTestOut).not.toHaveBeenCalled();
  });

  it('400s a malformed body (missing ref)', async () => {
    (env as any).capeTodayPlanEnabled = true;
    const app = buildApp();
    const res = await request(app)
      .post('/api/portal/cape/today-plan/test-out')
      .set('Authorization', `Bearer ${participantToken()}`)
      .send({});
    expect(res.status).toBe(400);
    expect(mockStartTestOut).not.toHaveBeenCalled();
  });

  it('200s with the diagnostic start payload on a valid ref', async () => {
    (env as any).capeTodayPlanEnabled = true;
    mockStartTestOut.mockResolvedValue({ attempt_id: 'att-1', skill_id: 'rag', trigger: 'test_out', items: [] });
    const app = buildApp();
    const res = await request(app)
      .post('/api/portal/cape/today-plan/test-out')
      .set('Authorization', `Bearer ${participantToken('enr-1')}`)
      .send({ ref: 'card:c1' });
    expect(res.status).toBe(200);
    expect(res.body.trigger).toBe('test_out');
    expect(mockStartTestOut).toHaveBeenCalledWith('enr-1', 'card:c1');
  });

  it('a CapeTodayPlanFeedbackError (no resolvable skill) surfaces as its own status, not a raw 500', async () => {
    (env as any).capeTodayPlanEnabled = true;
    mockStartTestOut.mockRejectedValue(new CapeTodayPlanFeedbackError('nothing to test out of'));
    const app = buildApp();
    const res = await request(app)
      .post('/api/portal/cape/today-plan/test-out')
      .set('Authorization', `Bearer ${participantToken()}`)
      .send({ ref: 'blog:b1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nothing to test out of/);
  });
});
