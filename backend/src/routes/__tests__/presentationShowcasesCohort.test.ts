/**
 * C138 (D4): GET /api/portal/showcases passes the viewer's cohort and staff flag to the gallery, the same source its sibling
 * routes use. Before this, a cohort-audience showcase (the admin default) never reached the classmates it was approved for,
 * because canView had no viewer cohort to compare. The audience rule itself (canView) is unchanged and tested elsewhere.
 */
jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
const mockVisible = jest.fn();
jest.mock('../../services/presentation/showcaseGallery', () => ({ listVisibleShowcases: (...a: unknown[]) => mockVisible(...a) }));

import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { env } from '../../config/env';
import presentationPortalRoutes from '../presentationPortalRoutes';

const flags = env as unknown as { projectApiEnabled: boolean; presentationStudioEnabled: boolean };
const saved = { projectApiEnabled: flags.projectApiEnabled, presentationStudioEnabled: flags.presentationStudioEnabled };
const COHORT = 'c0000000-0000-4000-8000-000000000001';
const token = (extra: Record<string, unknown> = {}) => jwt.sign({ sub: 'enr-9', email: 'l@example.com', role: 'participant', cohort_id: COHORT, ...extra }, env.jwtSecret, { expiresIn: '5m' });
const app = (): Express => { const a = express(); a.use(express.json()); a.use(presentationPortalRoutes); return a; };

beforeEach(() => {
  mockVisible.mockReset();
  flags.projectApiEnabled = true;
  flags.presentationStudioEnabled = true;
});
afterAll(() => Object.assign(flags, saved));

it('passes the viewer enrollment, cohort and a false staff flag', async () => {
  mockVisible.mockResolvedValue([{ id: 's1' }]);
  const res = await request(app()).get('/api/portal/showcases').set('Authorization', `Bearer ${token()}`);
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ items: [{ id: 's1' }] });
  expect(mockVisible).toHaveBeenCalledWith({ enrollmentId: 'enr-9', cohortId: COHORT, isStaff: false });
});

it('a learner with no cohort passes null, so cohort-audience showcases stay hidden from them', async () => {
  mockVisible.mockResolvedValue([]);
  await request(app()).get('/api/portal/showcases').set('Authorization', `Bearer ${token({ cohort_id: undefined })}`);
  expect(mockVisible).toHaveBeenCalledWith({ enrollmentId: 'enr-9', cohortId: null, isStaff: false });
});

it('still 401 without a token, never reading', async () => {
  expect((await request(app()).get('/api/portal/showcases')).status).toBe(401);
  expect(mockVisible).not.toHaveBeenCalled();
});
