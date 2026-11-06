/**
 * The two hire-only settings, over HTTP.
 *
 *   PUT /api/portal/career/portfolio-page/availability          the LEARNER's own words
 *   PUT /api/admin/career/portfolio-page/:enrollmentId/spotlight  ADMIN only
 *
 * Auth is asserted through the REAL routers and middleware (no token = refused before the
 * controller). Validation is asserted through the real controller with a stubbed session,
 * because the point is what a signed-in caller can and cannot make it do - in particular
 * that a learner cannot reach someone else's row by naming it.
 */
jest.mock('../../services/hire/hireListingSettings', () => {
  const actual = jest.requireActual('../../services/hire/hireListingSettings');
  return {
    availabilitySchema: actual.availabilitySchema,
    readHireListingSettings: jest.fn(),
    setHireAvailability: jest.fn().mockResolvedValue({ availability: { status: 'open', label: 'Open' }, spotlight: false }),
    setHireSpotlight: jest.fn().mockResolvedValue({ availability: null, spotlight: true }),
  };
});

import express from 'express';
import request from 'supertest';
import careerPortfolioRoutes from '../careerPortfolioRoutes';
import careerReviewRoutes from '../admin/careerReviewRoutes';
import { handleSetMyAvailability, handleSetHireSpotlight } from '../../controllers/hireListingController';
import { setHireAvailability, setHireSpotlight } from '../../services/hire/hireListingSettings';

const MINE = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function asLearner() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).participant = { sub: MINE }; next(); }); // the session, stubbed
  app.put('/availability', handleSetMyAvailability);
  return app;
}
function asAdmin() {
  const app = express();
  app.use(express.json());
  app.put('/spotlight/:enrollmentId', handleSetHireSpotlight);
  return app;
}

beforeEach(() => { (setHireAvailability as jest.Mock).mockClear(); (setHireSpotlight as jest.Mock).mockClear(); });

describe('auth, through the real routers', () => {
  const real = () => { const a = express(); a.use(express.json()); a.use(careerPortfolioRoutes); a.use(careerReviewRoutes); return a; };

  it('refuses availability without a learner session', async () => {
    const res = await request(real()).put('/api/portal/career/portfolio-page/availability').send({ availability: null });
    expect([401, 403]).toContain(res.status);
    expect(setHireAvailability).not.toHaveBeenCalled();
  });

  it('refuses spotlight without an admin session', async () => {
    const res = await request(real()).put(`/api/admin/career/portfolio-page/${OTHER}/spotlight`).send({ spotlight: true });
    expect([401, 403]).toContain(res.status);
    expect(setHireSpotlight).not.toHaveBeenCalled();
  });
});

describe('availability - the learner\'s own row only', () => {
  it('writes the caller\'s row, from the session', async () => {
    const res = await request(asLearner()).put('/availability').send({ availability: { status: 'open', label: 'Open' } });
    expect(res.status).toBe(200);
    expect(setHireAvailability).toHaveBeenCalledWith(MINE, { status: 'open', label: 'Open' });
  });

  it('answers 400 for an unknown status', async () => {
    const res = await request(asLearner()).put('/availability').send({ availability: { status: 'busy', label: 'Busy' } });
    expect(res.status).toBe(400);
    expect(setHireAvailability).not.toHaveBeenCalled();
  });

  it('answers 400 when the body names another enrollment - a learner cannot target someone else', async () => {
    const res = await request(asLearner()).put('/availability').send({ enrollmentId: OTHER, availability: null });
    expect(res.status).toBe(400);
    expect(setHireAvailability).not.toHaveBeenCalled();
  });

  it('answers 400 for a missing availability key, and clears on an explicit null', async () => {
    expect((await request(asLearner()).put('/availability').send({})).status).toBe(400);
    expect((await request(asLearner()).put('/availability').send({ availability: null })).status).toBe(200);
    expect(setHireAvailability).toHaveBeenCalledWith(MINE, null);
  });
});

describe('spotlight - validated before it reaches a query', () => {
  it('answers 400 for a malformed enrollment id', async () => {
    const res = await request(asAdmin()).put('/spotlight/not-a-uuid').send({ spotlight: true });
    expect(res.status).toBe(400);
    expect(setHireSpotlight).not.toHaveBeenCalled();
  });

  it('answers 400 for anything but exactly { spotlight: boolean }', async () => {
    expect((await request(asAdmin()).put(`/spotlight/${OTHER}`).send({ spotlight: 'yes' })).status).toBe(400);
    expect((await request(asAdmin()).put(`/spotlight/${OTHER}`).send({ spotlight: true, availability: null })).status).toBe(400);
    expect(setHireSpotlight).not.toHaveBeenCalled();
  });

  it('sets it for a valid request', async () => {
    const res = await request(asAdmin()).put(`/spotlight/${OTHER}`).send({ spotlight: true });
    expect(res.status).toBe(200);
    expect(setHireSpotlight).toHaveBeenCalledWith(OTHER, true);
  });
});
