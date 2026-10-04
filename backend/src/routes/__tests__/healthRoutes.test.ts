import express from 'express';
import request from 'supertest';

const m = {
  query: jest.fn(),
  runFullSystemHealthCheck: jest.fn(),
};

// `healthRoutes` `require()`s both of these INSIDE its handlers rather than at module
// scope, so the mocks must be registered under the paths the handlers use. That lazy
// require is also why this router can be mounted without a database at all.
jest.mock('../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => m.query(...a) } }));
jest.mock('../../services/systemHealthService', () => ({
  runFullSystemHealthCheck: (...a: unknown[]) => m.runFullSystemHealthCheck(...a),
}));

import healthRoutes from '../healthRoutes';

/**
 * `/health` and `/health/full` (Phase 6, T612).
 *
 * These two routes had no test at all, which matters more than it sounds: `/health` is
 * what the uptime monitors poll, so a change that made it answer 200 while the database
 * was unreachable would take the alarm off the wall and nothing would report it. And
 * `/health/full` is where `growth_journey` now surfaces (T609), so the phase's own
 * health check reaching a monitor at all is a property of THIS file.
 *
 * The status mapping is the load-bearing part in both: a monitor reads the CODE, not the
 * body, so `overall_status: 'critical'` -> 503 and everything else -> 200 is the
 * contract, and a `warning` answering 503 would page someone at 3am for a slow query.
 */

const app = () => {
  const a = express();
  a.use(healthRoutes);
  return a;
};

const report = (over: Record<string, unknown> = {}) => ({
  overall_status: 'ok',
  checks: [
    { name: 'database_connectivity', severity: 'ok', detail: 'Database responding (3ms).' },
    { name: 'growth_journey', severity: 'ok', detail: 'dark: nothing executing.' },
  ],
  ...over,
});

beforeEach(() => {
  m.query.mockReset().mockResolvedValue([[{ '1': 1 }], {}]);
  m.runFullSystemHealthCheck.mockReset().mockResolvedValue(report());
});

describe('GET /health - the uptime ping', () => {
  it('200 and status ok when the database answers', async () => {
    const res = await request(app()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('actually asks the database - it is not a static 200', async () => {
    // The whole point of the route. A version that returned ok without querying would
    // pass every other cell here and report a dead database as healthy.
    await request(app()).get('/health');
    expect(m.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('503 when the query rejects', async () => {
    m.query.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await request(app()).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'error', detail: 'database unreachable' });
  });

  it('503 when the query throws synchronously, not only when it rejects', async () => {
    m.query.mockImplementation(() => {
      throw new Error('pool destroyed');
    });
    expect((await request(app()).get('/health')).status).toBe(503);
  });

  it('the failure body carries no driver detail - a monitor page is a public surface', async () => {
    m.query.mockRejectedValue(new Error('password authentication failed for user "accelerator"'));
    const res = await request(app()).get('/health');
    expect(res.status).toBe(503);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('password');
    expect(text).not.toContain('accelerator');
  });
});

describe('GET /health/full - the report a monitor reads', () => {
  it('200 for ok', async () => {
    expect((await request(app()).get('/health/full')).status).toBe(200);
  });

  it('503 ONLY for critical', async () => {
    m.runFullSystemHealthCheck.mockResolvedValue(report({ overall_status: 'critical' }));
    expect((await request(app()).get('/health/full')).status).toBe(503);
  });

  it('a warning is 200, not 503 - a slow query must not page anyone', async () => {
    m.runFullSystemHealthCheck.mockResolvedValue(report({ overall_status: 'warning' }));
    expect((await request(app()).get('/health/full')).status).toBe(200);
  });

  it('includes growth_journey, so this phase reaches a monitor at all', async () => {
    const res = await request(app()).get('/health/full');
    expect(res.body.checks.map((c: { name: string }) => c.name)).toContain('growth_journey');
  });

  it('500, not 503, when the report itself blows up - a broken reporter is not a dead system', async () => {
    m.runFullSystemHealthCheck.mockRejectedValue(new Error('check exploded'));
    expect((await request(app()).get('/health/full')).status).toBe(500);
  });
});
