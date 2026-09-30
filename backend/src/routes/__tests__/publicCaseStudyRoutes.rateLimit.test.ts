/**
 * publicCaseStudyRoutes - rate limiting. T014 AC7.
 *
 * Its own file because the limit is read from the environment at module load:
 * setting it to 2 here proves a real 429 without sending 240 requests, and
 * cannot leak into the other route suites.
 *
 * THE SECOND TEST IS THE IMPORTANT ONE. `explorerSignalRoutes.ts` carries the
 * warning this follows: NEVER a bare `router.use(limiter)`. Sub-routers mount
 * without a path prefix in this app, so an unscoped middleware would rate-limit
 * every route registered after it. The test hammers an UNRELATED path mounted
 * after this router and asserts it is untouched.
 */

import express from 'express';
import request from 'supertest';
import { fakes, resetFakes, seedPublishedRecord } from '../../services/caseStudy/__tests__/publicModelFakes';

jest.mock('../../models/CaseStudy', () => ({ __esModule: true, default: fakes.studies }));
jest.mock('../../models/CaseStudyPublication', () => ({ __esModule: true, default: fakes.publications }));
jest.mock('../../models/CaseStudySnapshot', () => ({ __esModule: true, default: fakes.snapshots }));
jest.mock('../../models/CaseStudyCollection', () => ({ __esModule: true, default: fakes.collections }));

const LIST = '/api/public/case-studies';

let app: express.Express;

beforeAll(async () => {
  // Set BEFORE the router module is evaluated - `import` statements are hoisted,
  // so the router is loaded here rather than at the top of the file.
  process.env.PUBLIC_CASE_STUDY_RATE_LIMIT = '2';
  const mod = await import('../publicCaseStudyRoutes');
  app = express();
  app.use(mod.default);
  app.get('/api/unrelated/thing', (_req, res) => { res.json({ ok: true }); });
});

let logSpy: jest.SpyInstance;
beforeAll(() => { logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined); });

afterAll(() => {
  logSpy.mockRestore();
  delete process.env.PUBLIC_CASE_STUDY_RATE_LIMIT;
});

beforeEach(resetFakes);

describe('AC7 - the public read path is rate limited', () => {
  it('serves the configured number of requests, then 429s', async () => {
    seedPublishedRecord();
    const first = await request(app).get(LIST);
    const second = await request(app).get(LIST);
    const third = await request(app).get(LIST);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.body).toEqual({ error: 'Too many requests' });
  });

  it('advertises the standard RateLimit headers on every public endpoint', async () => {
    seedPublishedRecord();
    for (const url of [LIST, `${LIST}/stockout-forecasting`, '/api/public/case-study-taxonomy',
      '/api/public/case-study-collections/agents']) {
      const res = await request(app).get(url);
      expect(res.headers['ratelimit-limit'] ?? res.headers.ratelimit).toBeDefined();
      expect(res.headers['x-ratelimit-limit']).toBeUndefined();
    }
  });

  it('is PATH-SCOPED: an unrelated route mounted after it is never limited', async () => {
    for (let i = 0; i < 10; i += 1) {
      const res = await request(app).get('/api/unrelated/thing');
      expect(res.status).toBe(200);
      expect(res.headers['ratelimit-limit']).toBeUndefined();
      expect(res.headers.ratelimit).toBeUndefined();
    }
  });
});
