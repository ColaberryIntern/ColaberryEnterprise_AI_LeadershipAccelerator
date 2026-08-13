import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

const recordLearnerSignal = jest.fn();
jest.mock('../../services/explorerGrowth/explorerSignalWriter', () => ({
  recordLearnerSignal: (...a: unknown[]) => recordLearnerSignal(...a),
}));

const ENR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ENR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PATH = '/api/portal/explorer-signals';

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const mod = await import('../explorerSignalRoutes');
  app.use(mod.default);
}, 60_000);

function participantToken(sub = ENR, extra: Record<string, unknown> = {}) {
  return jwt.sign({ sub, email: 'learner@example.com', cohort_id: 'c1', role: 'participant', ...extra }, env.jwtSecret);
}

beforeEach(() => {
  recordLearnerSignal.mockReset();
  recordLearnerSignal.mockResolvedValue({ outcome: 'written', written: true });
});

describe('auth', () => {
  it('401s an unauthenticated request', async () => {
    const res = await request(app).post(PATH).send({ event_type: 'portal_session' });
    expect(res.status).toBe(401);
    expect(recordLearnerSignal).not.toHaveBeenCalled();
  });

  it('403s a non-participant token', async () => {
    const adminToken = jwt.sign({ sub: 'x', email: 'a@b.c', role: 'admin' }, env.jwtSecret);
    const res = await request(app).post(PATH).set('Authorization', `Bearer ${adminToken}`).send({ event_type: 'portal_session' });
    expect(res.status).toBe(403);
    expect(recordLearnerSignal).not.toHaveBeenCalled();
  });

  it('refuses a read-only "view as member" impersonation', async () => {
    // An admin inspecting a learner's portal must not be able to manufacture
    // signals attributed to that learner.
    const res = await request(app)
      .post(PATH)
      .set('Authorization', `Bearer ${participantToken(ENR, { read_only: true })}`)
      .send({ event_type: 'portal_session' });
    expect(res.status).toBe(403);
    expect(recordLearnerSignal).not.toHaveBeenCalled();
  });
});

describe('happy path', () => {
  it('accepts a valid signal and reports the outcome', async () => {
    const res = await request(app)
      .post(PATH)
      .set('Authorization', `Bearer ${participantToken()}`)
      .send({ event_type: 'portal_session', page: '/portal/today', duration_ms: 4200 });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true, outcome: 'written' });
    expect(recordLearnerSignal).toHaveBeenCalledWith(
      expect.objectContaining({ enrollmentId: ENR, eventType: 'portal_session', page: '/portal/today', durationMs: 4200 }),
    );
  });

  it('still returns 202 when ingest is off — the learner page must not care', async () => {
    recordLearnerSignal.mockResolvedValue({ outcome: 'skipped_flag_off', written: false });
    const res = await request(app)
      .post(PATH)
      .set('Authorization', `Bearer ${participantToken()}`)
      .send({ event_type: 'portal_session' });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: false, outcome: 'skipped_flag_off' });
  });
});

describe('THE security property: enrollment id comes from the token, never the body', () => {
  it('ignores a body-supplied enrollment_id and uses the token subject', async () => {
    // Honouring a body-supplied id would let any authenticated learner write
    // signals as any other, corrupting scores, states and eventually who gets
    // contacted.
    const res = await request(app)
      .post(PATH)
      .set('Authorization', `Bearer ${participantToken(ENR)}`)
      .send({ event_type: 'portal_session', enrollment_id: OTHER_ENR, enrollmentId: OTHER_ENR });

    expect(res.status).toBe(202);
    const arg = recordLearnerSignal.mock.calls[0][0];
    expect(arg.enrollmentId).toBe(ENR);
    expect(JSON.stringify(arg)).not.toContain(OTHER_ENR);
  });
});

describe('validation', () => {
  it('400s an unknown event type', async () => {
    const res = await request(app)
      .post(PATH)
      .set('Authorization', `Bearer ${participantToken()}`)
      .send({ event_type: 'totally_made_up' });
    expect(res.status).toBe(400);
    expect(recordLearnerSignal).not.toHaveBeenCalled();
  });

  it('400s a real signal that belongs to another source table', async () => {
    // card_completed is genuine but is read from timeline_card_progress.
    // Accepting it here would let a client forge learning progress.
    const res = await request(app)
      .post(PATH)
      .set('Authorization', `Bearer ${participantToken()}`)
      .send({ event_type: 'card_completed' });
    expect(res.status).toBe(400);
    expect(recordLearnerSignal).not.toHaveBeenCalled();
  });

  it('400s a missing event_type', async () => {
    const res = await request(app).post(PATH).set('Authorization', `Bearer ${participantToken()}`).send({});
    expect(res.status).toBe(400);
  });

  it('400s a negative duration', async () => {
    const res = await request(app)
      .post(PATH)
      .set('Authorization', `Bearer ${participantToken()}`)
      .send({ event_type: 'portal_session', duration_ms: -5 });
    expect(res.status).toBe(400);
  });

  it('returns Zod v4 issues, not a bare message', async () => {
    const res = await request(app).post(PATH).set('Authorization', `Bearer ${participantToken()}`).send({});
    expect(Array.isArray(res.body.issues)).toBe(true);
  });
});
