import express from 'express';
import request from 'supertest';

// requireAdmin is the real gate in production (route-auth lint); here a header stands in for a valid admin JWT.
jest.mock('../../../../middlewares/authMiddleware', () => ({
  requireAdmin: (req: { headers: Record<string, string>; admin?: unknown }, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
    if (req.headers['x-test-admin'] !== 'yes') { res.status(401).json({ error: 'Unauthorized' }); return; }
    req.admin = { sub: 'admin-7', email: 'x', role: 'admin' };
    next();
  },
}));

import { buildVoiceStudioRouter } from '../../../../routes/admin/voiceStudioRoutes';
import type { TestLabDeps } from '../testLabService';

function app(enabled: boolean, start = jest.fn()) {
  const a = express();
  a.use(express.json());
  const deps = (() => ({ __fake: true })) as unknown as () => TestLabDeps;
  jest.spyOn(require('../testLabService'), 'startLiveTest').mockImplementation(start);
  a.use(buildVoiceStudioRouter(deps, () => enabled));
  a.use((_req, res) => res.status(404).json({ error: 'fell through' }));
  return a;
}

describe('Voice Studio admin route (VS2.5)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('does not exist while VOICE_TEST_ENABLED is off', async () => {
    const res = await request(app(false)).post('/api/admin/voice-studio/tests').set('x-test-admin', 'yes').send({});
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'fell through' });
  });

  it('requires an admin (401 without)', async () => {
    const start = jest.fn();
    const res = await request(app(true, start)).post('/api/admin/voice-studio/tests').send({});
    expect(res.status).toBe(401);
    expect(start).not.toHaveBeenCalled();
  });

  it('passes the body and the admin id (never an email) to the Test Lab and returns its status', async () => {
    const start = jest.fn().mockResolvedValue({ status: 202, body: { callId: 'c1', attempt: 1, outcome: 'accepted' } });
    const res = await request(app(true, start)).post('/api/admin/voice-studio/tests').set('x-test-admin', 'yes').send({ runId: 'run-123456' });
    expect(res.status).toBe(202);
    expect(start.mock.calls[0][1]).toBe('admin-7');
  });

  it('a raw phone number in the body is a 400 from the real policy (no mock)', async () => {
    jest.restoreAllMocks();
    const a = express();
    a.use(express.json());
    a.use(buildVoiceStudioRouter((() => ({ ci: () => false })) as unknown as () => TestLabDeps, () => true));
    const res = await request(a).post('/api/admin/voice-studio/tests').set('x-test-admin', 'yes')
      .send({ runId: 'run-123456', destinationId: 'test-allowed', engine: 'conversation_relay', script: 'smoke', confirm: true, to: '+15555550142' });
    expect(res.status).toBe(400);
    expect(res.body.issues[0]).toMatch(/phone numbers are never accepted/);
  });

  it('the status route validates the id', async () => {
    const res = await request(app(true)).get('/api/admin/voice-studio/tests/not-a-uuid').set('x-test-admin', 'yes');
    expect(res.status).toBe(400);
  });
});
