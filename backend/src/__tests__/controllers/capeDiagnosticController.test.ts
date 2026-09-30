import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { startDiagnostic, submitDiagnosticAttempt } from '../../services/cape/capeDiagnosticService';
import { recomputeStudentArchitectureSkill } from '../../services/cape/capeProficiencyService';
import capePortalRoutes from '../../routes/capePortalRoutes';

jest.mock('../../services/cape/capeProficiencyService', () => ({
  getLearnerSkillProfile: jest.fn(),
  recomputeStudentArchitectureSkill: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../services/cape/capeDiagnosticService', () => {
  const actual = jest.requireActual('../../services/cape/capeDiagnosticService');
  return {
    ...actual,
    startDiagnostic: jest.fn(),
    submitDiagnosticAttempt: jest.fn(),
  };
});

const mockStart = startDiagnostic as unknown as jest.Mock;
const mockSubmit = submitDiagnosticAttempt as unknown as jest.Mock;
const mockRecompute = recomputeStudentArchitectureSkill as unknown as jest.Mock;

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

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/portal/cape/diagnostic/:skillId', () => {
  it('401s an unauthenticated request', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/portal/cape/diagnostic/agents_mcp');
    expect(res.status).toBe(401);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('200s with an item set that never leaks correct_option, for an authenticated participant', async () => {
    mockStart.mockReturnValue({
      attempt_id: 'att-1', skill_id: 'agents_mcp', trigger: 'diagnostic_prompt',
      items: [{ id: 'i1', skill_id: 'agents_mcp', kind: 'recognition', prompt: 'q?', options: [{ id: 'a', label: 'A' }] }],
    });
    const app = buildApp();
    const res = await request(app)
      .get('/api/portal/cape/diagnostic/agents_mcp')
      .set('Authorization', `Bearer ${participantToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.attempt_id).toBe('att-1');
    expect(res.body.items[0].correct_option).toBeUndefined();
  });

  it('500s (not a raw stack trace) when the service throws unexpectedly', async () => {
    mockStart.mockImplementation(() => { throw new Error('boom'); });
    const app = buildApp();
    const res = await request(app)
      .get('/api/portal/cape/diagnostic/agents_mcp')
      .set('Authorization', `Bearer ${participantToken()}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/boom/);
  });
});

describe('POST /api/portal/cape/diagnostic/:skillId/submit', () => {
  it('401s an unauthenticated request', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/portal/cape/diagnostic/agents_mcp/submit').send({});
    expect(res.status).toBe(401);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('400s a malformed body (missing attempt_id) via the actual Zod schema, before calling the service', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/portal/cape/diagnostic/agents_mcp/submit')
      .set('Authorization', `Bearer ${participantToken()}`)
      .send({ answers: [] });
    expect(res.status).toBe(400);
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(mockRecompute).not.toHaveBeenCalled(); // recompute must never fire on a rejected submit
  });

  it('400s an empty answers array', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/portal/cape/diagnostic/agents_mcp/submit')
      .set('Authorization', `Bearer ${participantToken()}`)
      .send({ attempt_id: 'att-1', answers: [] });
    expect(res.status).toBe(400);
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(mockRecompute).not.toHaveBeenCalled();
  });

  it('200s with the outcome on a valid submit, and recomputes the submitted skill for the AUTHENTICATED enrollment (not a client-supplied id)', async () => {
    mockSubmit.mockResolvedValue({ outcome: 'confirmed', bridge_recommended: false, created: true });
    const app = buildApp();
    const res = await request(app)
      .post('/api/portal/cape/diagnostic/agents_mcp/submit')
      .set('Authorization', `Bearer ${participantToken('enr-1')}`)
      .send({ attempt_id: 'att-1', answers: [{ item_id: 'i1', selected_option: 'a' }] });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('confirmed');
    expect(mockSubmit).toHaveBeenCalledWith('enr-1', 'agents_mcp', 'att-1', [{ item_id: 'i1', selected_option: 'a' }], 'diagnostic_prompt');
    expect(mockRecompute).toHaveBeenCalledWith('enr-1', 'agents_mcp');
    expect(mockRecompute).toHaveBeenCalledTimes(1);
  });

  it('does NOT recompute when the underlying service rejects (recompute only follows a SUCCESSFUL submit)', async () => {
    mockSubmit.mockRejectedValue(new Error('scoring failed'));
    const app = buildApp();
    const res = await request(app)
      .post('/api/portal/cape/diagnostic/agents_mcp/submit')
      .set('Authorization', `Bearer ${participantToken('enr-1')}`)
      .send({ attempt_id: 'att-1', answers: [{ item_id: 'i1', selected_option: 'a' }] });
    expect(res.status).toBe(500);
    expect(mockRecompute).not.toHaveBeenCalled();
  });
});
