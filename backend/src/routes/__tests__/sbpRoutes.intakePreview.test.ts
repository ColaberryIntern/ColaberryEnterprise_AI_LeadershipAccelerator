/**
 * POST /api/portal/sbp/intake/preview — the confirmation gate before a build
 * exists.
 *
 * The wizard's review step runs before startBuild, so there is no truth row to
 * read back. This route computes what WOULD be written from the exact inputs,
 * using the same pure functions the store uses. It needs no project, touches
 * no database, and is scoped to a participant token only.
 *
 * What this suite proves: the auth boundary holds, malformed input is refused
 * at the edge with 400, the pipeline gate applies, and a well-formed body
 * comes back grouped with human labels and the plain-words unanswered list.
 */
import express from 'express';
import request from 'supertest';

const ENROLLMENT = 'aced5b39-0000-4000-8000-000000000001';

const mockEnv = { sbpPipelineEnabled: true };
jest.mock('../../config/env', () => ({ env: mockEnv }));

// A participant only when the test says so: no header, no participant, 401.
jest.mock('../../middlewares/participantAuth', () => ({
  requireParticipant: (req: any, res: any, next: any) => {
    if (req.headers['x-test-participant'] !== 'yes') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.participant = { sub: ENROLLMENT, email: 's@test.com', role: 'participant' };
    next();
  },
}));

// The route file imports these at module load for other routes; none are
// reached by the preview, and stubbing them keeps this suite free of I/O.
jest.mock('../../models/Project', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../services/sbp/planStore', () => ({ __esModule: true, getPlan: jest.fn() }));
jest.mock('../../services/sbp/workspaceRepo', () => ({ __esModule: true, repoForProject: jest.fn() }));
jest.mock('../../services/sbp/scheduleForEnrollment', () => ({ __esModule: true, scheduleForEnrollment: jest.fn() }));
jest.mock('../../services/sbp/intakeTruthStore', () => ({
  __esModule: true,
  saveIntakeTruth: jest.fn(async () => { throw new Error('preview must never write'); }),
  saveCorrectedTruth: jest.fn(async () => { throw new Error('preview must never write'); }),
  loadIntakeTruth: jest.fn(async () => { throw new Error('preview must never read'); }),
  loadIntakeTruthAtRevision: jest.fn(async () => { throw new Error('preview must never read'); }),
}));

import sbpRoutes from '../sbpRoutes';
import { saveIntakeTruth, loadIntakeTruth } from '../../services/sbp/intakeTruthStore';

const app = express();
app.use(express.json());
app.use(sbpRoutes);

const BODY = {
  idea: 'A robot that sorts warehouse pallets by weight and destination automatically.',
  answers: [{
    id: 'g1',
    question: 'What would you want a person to check before it acts?',
    answer: 'A supervisor signs off any pallet over 800kg.',
    angle: 'THE GUARDRAIL',
  }],
  covered: [{ angle: 'THE TOOLS', evidence: 'our WMS and the dock scales' }],
};

const post = (body: unknown, participant = true) => {
  const req = request(app).post('/api/portal/sbp/intake/preview').send(body as object);
  return participant ? req.set('x-test-participant', 'yes') : req;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.sbpPipelineEnabled = true;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('the boundary', () => {
  it('refuses an unauthenticated caller before reading the body', async () => {
    const res = await post(BODY, false);
    expect(res.status).toBe(401);
  });

  it('is behind the pipeline gate like every other sbp route', async () => {
    mockEnv.sbpPipelineEnabled = false;
    const res = await post(BODY);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not enabled/);
  });

  it('refuses a body with no idea, at the edge, with 400', async () => {
    const res = await post({ ...BODY, idea: '' });
    expect(res.status).toBe(400);
  });

  it('refuses an oversized answer rather than truncating it silently', async () => {
    const res = await post({ ...BODY, answers: [{ ...BODY.answers[0], answer: 'x'.repeat(4_001) }] });
    expect(res.status).toBe(400);
  });

  it('never touches the truth store', async () => {
    await post(BODY);
    expect(saveIntakeTruth).not.toHaveBeenCalled();
    expect(loadIntakeTruth).not.toHaveBeenCalled();
  });
});

describe('the read-back', () => {
  it('returns what will be recorded, grouped, with human labels', async () => {
    const res = await post(BODY);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');

    const { review, unanswered, covered, unmapped } = res.body;
    // Idea, the guardrail answer, and the covered tools evidence: three facts.
    expect(review.items).toHaveLength(3);
    expect(review.items.every((i: any) => i.group === 'needsConfirmation')).toBe(true);
    expect(review.blocksPlanning).toBe(false);

    const guardrail = review.items.find((i: any) => i.dimension === 'approval_points');
    expect(guardrail.label).toBe('What a person checks before it acts');
    expect(guardrail.value).toBe('A supervisor signs off any pallet over 800kg.');

    expect(covered).toEqual(BODY.covered);
    expect(unmapped).toBe(0);
    // The plain-words list, from the same table Story 000 renders.
    expect(unanswered).toContain('there is no baseline, so nothing can be measured against it later');
    expect(unanswered).not.toContain('nobody has said what a person should check before this acts');
  });

  it('reports an answer it cannot file, rather than guessing a dimension for it', async () => {
    const res = await post({ ...BODY, answers: [{ ...BODY.answers[0], angle: 'SOMETHING NEW' }] });
    expect(res.status).toBe(200);
    expect(res.body.unmapped).toBe(1);
    expect(res.body.review.items).toHaveLength(2);
  });

  it('is deterministic: the same body twice gives the same review', async () => {
    const a = await post(BODY);
    const b = await post(BODY);
    expect(a.body).toEqual(b.body);
  });
});
