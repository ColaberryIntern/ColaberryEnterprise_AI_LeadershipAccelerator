/**
 * Admin review of the headline a candidate proposed in their Hire studio, over HTTP.
 * Auth through the REAL router (no admin token = refused before the controller); validation
 * and the stale-draft 409 through the real controller with a stubbed admin session.
 */
jest.mock('../../services/hire/hireHeadlineReview', () => {
  const actual = jest.requireActual('../../services/hire/hireHeadlineReview');
  return { ...actual, listHeadlineDrafts: jest.fn(), decideHeadline: jest.fn() };
});

import express from 'express';
import request from 'supertest';
import careerReviewRoutes from '../admin/careerReviewRoutes';
import { handleDecideHeadline, handleListHeadlineDrafts } from '../../controllers/hireHeadlineController';
import { decideHeadline, HeadlineReviewError, listHeadlineDrafts } from '../../services/hire/hireHeadlineReview';

const EID = '22222222-2222-4222-8222-222222222222';
const decide = decideHeadline as jest.Mock;
const list = listHeadlineDrafts as jest.Mock;

function asAdmin() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).admin = { sub: 'a1', email: 'ali@colaberry.com' }; next(); });
  app.get('/drafts', handleListHeadlineDrafts);
  app.post('/drafts/:enrollmentId', handleDecideHeadline);
  return app;
}

beforeEach(() => { decide.mockReset().mockResolvedValue(undefined); list.mockReset(); });

describe('auth, through the real router', () => {
  const real = () => { const a = express(); a.use(express.json()); a.use(careerReviewRoutes); return a; };

  it('refuses the list and a decision without an admin session', async () => {
    expect([401, 403]).toContain((await request(real()).get('/api/admin/career/hire-headline-drafts')).status);
    const res = await request(real()).post(`/api/admin/career/hire-headline-drafts/${EID}`).send({ decision: 'approve', draft: 'x' });
    expect([401, 403]).toContain(res.status);
    expect(list).not.toHaveBeenCalled();
    expect(decide).not.toHaveBeenCalled();
  });
});

describe('decisions', () => {
  it('lists the pending drafts', async () => {
    list.mockResolvedValue([{ enrollmentId: EID, name: 'Ann', slug: 'ann', live: 'Analyst', draft: 'AI Systems Architect', updatedAt: '2026-11-13T00:00:00.000Z' }]);
    const res = await request(asAdmin()).get('/drafts');
    expect(res.status).toBe(200);
    expect(res.body.drafts[0].draft).toBe('AI Systems Architect');
  });

  it('approves the reviewed text, recording who did it', async () => {
    const res = await request(asAdmin()).post(`/drafts/${EID}`).send({ decision: 'approve', draft: ' AI Systems Architect ' });
    expect(res.status).toBe(200);
    expect(decide).toHaveBeenCalledWith(EID, 'approve', 'AI Systems Architect', 'ali@colaberry.com');
  });

  it('answers 400 for a bad id, an unknown decision, a missing or oversized draft, or an extra field', async () => {
    const app = asAdmin();
    for (const [id, body] of [
      ['nope', { decision: 'approve', draft: 'x' }],
      [EID, { decision: 'publish', draft: 'x' }],
      [EID, { decision: 'approve' }],
      [EID, { decision: 'approve', draft: 'x'.repeat(91) }],
      [EID, { decision: 'approve', draft: 'x', title: 'y' }],
    ] as const) {
      expect((await request(app).post(`/drafts/${id}`).send(body)).status).toBe(400);
    }
    expect(decide).not.toHaveBeenCalled();
  });

  it('passes the service 409 through when the draft changed since the admin read it', async () => {
    decide.mockRejectedValue(new HeadlineReviewError('This headline changed or was already decided; reload the list', 409, 'StaleDraft'));
    const res = await request(asAdmin()).post(`/drafts/${EID}`).send({ decision: 'reject', draft: 'Old text' });
    expect(res.status).toBe(409);
    expect(res.body.error_class).toBe('StaleDraft');
  });
});
