import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { bypassChecklistInstance, ChecklistInstanceNotFoundError } from '../../services/checklist/checklistBypassService';
import checklistRoutes from '../../routes/admin/checklistRoutes';

jest.mock('../../services/checklist/checklistBypassService', () => {
  const actual = jest.requireActual('../../services/checklist/checklistBypassService');
  return { ...actual, bypassChecklistInstance: jest.fn() };
});

const mockFindByPk = jest.fn();
jest.mock('../../models/ChecklistInstance', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockFindByPk(...a) },
}));

const mockBypassChecklistInstance = bypassChecklistInstance as unknown as jest.Mock;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(checklistRoutes);
  return app;
}

function adminToken() {
  return jwt.sign({ sub: 'admin-1', email: 'ali@colaberry.com', role: 'super_admin' }, env.jwtSecret);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/admin/checklist-instances/:id', () => {
  it('happy path: 200s with the real checklist instance', async () => {
    mockFindByPk.mockResolvedValue({ id: 'checklist-1', complete: true });

    const res = await request(buildApp()).get('/api/admin/checklist-instances/checklist-1').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('checklist-1');
  });

  it('boundary: a nonexistent instance 404s', async () => {
    mockFindByPk.mockResolvedValue(null);

    const res = await request(buildApp()).get('/api/admin/checklist-instances/does-not-exist').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(404);
  });

  it('auth: no token 401s', async () => {
    const res = await request(buildApp()).get('/api/admin/checklist-instances/checklist-1');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/admin/checklist-instances/:id/bypass', () => {
  it('happy path: passes the authenticated admin\'s real email as the authorizing actor', async () => {
    mockBypassChecklistInstance.mockResolvedValue({ granted: true, instance: { id: 'checklist-1', bypassed_by_email: 'ali@colaberry.com' } });

    const res = await request(buildApp())
      .post('/api/admin/checklist-instances/checklist-1/bypass')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ reason: 'Identity confirmed manually via a direct call with the student.' });

    expect(res.status).toBe(200);
    expect(mockBypassChecklistInstance).toHaveBeenCalledWith('checklist-1', 'ali@colaberry.com', 'Identity confirmed manually via a direct call with the student.');
  });

  it('BREAK: an empty reason 400s before the service is ever called', async () => {
    const res = await request(buildApp())
      .post('/api/admin/checklist-instances/checklist-1/bypass')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ reason: '' });

    expect(res.status).toBe(400);
    expect(mockBypassChecklistInstance).not.toHaveBeenCalled();
  });

  it('a real refusal from the service (e.g. reason too short) 400s with the refusal detail, not a 500', async () => {
    mockBypassChecklistInstance.mockResolvedValue({ granted: false, refusals: [{ rule: 'reason_insufficient', detail: 'too short' }] });

    const res = await request(buildApp())
      .post('/api/admin/checklist-instances/checklist-1/bypass')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ reason: 'short but valid per schema' });

    expect(res.status).toBe(400);
    expect(res.body.refusals[0].rule).toBe('reason_insufficient');
  });

  it('boundary: a nonexistent checklist instance 404s', async () => {
    mockBypassChecklistInstance.mockRejectedValue(new ChecklistInstanceNotFoundError('does-not-exist'));

    const res = await request(buildApp())
      .post('/api/admin/checklist-instances/does-not-exist/bypass')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ reason: 'A real, sufficiently long reason here.' });

    expect(res.status).toBe(404);
  });

  it('auth: no token 401s and never reaches the service', async () => {
    const res = await request(buildApp())
      .post('/api/admin/checklist-instances/checklist-1/bypass')
      .send({ reason: 'A real, sufficiently long reason here.' });

    expect(res.status).toBe(401);
    expect(mockBypassChecklistInstance).not.toHaveBeenCalled();
  });
});
