/**
 * CAPE Phase 6 (T014, design doc §12 "Explanation simulator"): route-level
 * test for the `use_cape_ranker` query-param passthrough added to
 * `GET /api/admin/feed-control/simulate`. `simulate()` (feedControlService.ts,
 * Phase 4) has always accepted `opts.useCapeRanker` — this route just never
 * forwarded a caller's request for it until now. First route-level test file
 * for this router (`enrollmentRoutes.test.ts` establishes the convention:
 * mount on a real Express app via supertest, mock the service layer).
 */
import express from 'express';
import request from 'supertest';

jest.mock('../../../middlewares/authMiddleware', () => ({ requireAdmin: (_req: any, _res: any, next: any) => next() }));
jest.mock('../../../services/timeline/feedControlService', () => ({
  getBoard: jest.fn(), getFeedPolicy: jest.fn(), setFeedPolicy: jest.fn(),
  routeType: jest.fn(), bulkRouteTypes: jest.fn(), routeCard: jest.fn(),
  simulate: jest.fn(), listEnrollments: jest.fn(),
}));
jest.mock('../../../services/timeline/feedPresetsService', () => ({ listPresets: jest.fn(), savePreset: jest.fn(), deletePreset: jest.fn() }));

import { simulate } from '../../../services/timeline/feedControlService';
import feedControlRoutes from '../feedControlRoutes';

const mockSimulate = simulate as unknown as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(feedControlRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSimulate.mockResolvedValue({ items: [], policy: {} });
});

describe('GET /api/admin/feed-control/simulate — use_cape_ranker passthrough', () => {
  it('defaults useCapeRanker to false when the query param is omitted (backward-compat identity — every existing caller keeps its exact prior behavior)', async () => {
    const app = makeApp();
    await request(app).get('/api/admin/feed-control/simulate').query({ enrollment_id: 'enr-1' }).expect(200);
    expect(mockSimulate).toHaveBeenCalledWith('enr-1', 12, undefined, { useCapeRanker: false });
  });

  it('forwards useCapeRanker:true when use_cape_ranker=1', async () => {
    const app = makeApp();
    await request(app).get('/api/admin/feed-control/simulate').query({ enrollment_id: 'enr-1', use_cape_ranker: '1' }).expect(200);
    expect(mockSimulate).toHaveBeenCalledWith('enr-1', 12, undefined, { useCapeRanker: true });
  });

  it('forwards useCapeRanker:true when use_cape_ranker=true (string)', async () => {
    const app = makeApp();
    await request(app).get('/api/admin/feed-control/simulate').query({ enrollment_id: 'enr-1', use_cape_ranker: 'true' }).expect(200);
    expect(mockSimulate).toHaveBeenCalledWith('enr-1', 12, undefined, { useCapeRanker: true });
  });

  it('an unrecognized use_cape_ranker value (e.g. "0") is treated as false, not a crash', async () => {
    const app = makeApp();
    await request(app).get('/api/admin/feed-control/simulate').query({ enrollment_id: 'enr-1', use_cape_ranker: '0' }).expect(200);
    expect(mockSimulate).toHaveBeenCalledWith('enr-1', 12, undefined, { useCapeRanker: false });
  });

  it('failure path: missing enrollment_id returns 400 before calling simulate', async () => {
    const app = makeApp();
    await request(app).get('/api/admin/feed-control/simulate').expect(400);
    expect(mockSimulate).not.toHaveBeenCalled();
  });
});
