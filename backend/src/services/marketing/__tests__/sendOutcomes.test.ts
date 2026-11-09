const query = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => query(...a) } }));
// The route file also serves the campaign graph; its service loads the model graph, which this test does not need.
jest.mock('../../reporting/marketingFunnelGraphService', () => ({ buildMarketingFunnelGraph: jest.fn(), getFunnelNodeLeads: jest.fn() }));

import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { sendOutcomes, shapeSendOutcomes } from '../sendOutcomes';

/** R3 acceptance 2: the page carries a sent-and-blocked count for the same window, and zero reads as zero. */

describe('shapeSendOutcomes', () => {
  it('an empty channel is zeros, not absent fields', () => {
    expect(shapeSendOutcomes([], 30)).toEqual({ windowDays: 30, sent: 0, failed: 0, cancelled: 0, cancelledByReason: [] });
  });

  it('production 2026-11-09 shape: 0 sent, cancellations by reason, most first, unexplained kept by name', () => {
    const out = shapeSendOutcomes([
      { bucket: 'sent', reason: null, n: 0 }, { bucket: 'failed', reason: null, n: 0 },
      { bucket: 'cancelled', reason: 'legacy:global_rate_limit_exceeded', n: 9 },
      { bucket: 'cancelled', reason: 'legacy:kill_switch', n: 345 },
      { bucket: 'cancelled', reason: 'no_reason_recorded', n: 5 },
      { bucket: 'cancelled', reason: 'legacy:brand_no_relationship', n: 19555 },
    ], 30);
    expect(out.sent).toBe(0);
    expect(out.cancelled).toBe(19914);
    expect(out.cancelledByReason.map((r) => r.reason)).toEqual([
      'legacy:brand_no_relationship', 'legacy:kill_switch', 'legacy:global_rate_limit_exceeded', 'no_reason_recorded',
    ]);
  });
});

describe('sendOutcomes', () => {
  it('runs one read-only query with the window bound as a parameter (never interpolated)', async () => {
    query.mockResolvedValue([{ bucket: 'sent', reason: null, n: 4 }]);
    expect(await sendOutcomes(14)).toMatchObject({ windowDays: 14, sent: 4 });
    const [sql, opts] = query.mock.calls[0];
    expect(sql).toMatch(/make_interval\(days => :days\)/);
    expect(sql).not.toMatch(/\b14\b/);
    expect(sql).not.toMatch(/\b(UPDATE|INSERT|DELETE)\b/i);
    expect(opts).toMatchObject({ replacements: { days: 14 } });
  });
});

describe('GET /api/admin/marketing/funnel/send-outcomes', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { env } = require('../../../config/env');
  const app = () => { const a = express(); a.use(require('../../../routes/admin/marketingFunnelRoutes').default); return a; };
  const auth = `Bearer ${jwt.sign({ sub: 'a1', email: 'ops@colaberry.com', role: 'admin' }, env.jwtSecret, { expiresIn: '5m' })}`;

  it('401 without a token', async () => {
    expect((await request(app()).get('/api/admin/marketing/funnel/send-outcomes')).status).toBe(401);
  });
  it('clamps the window to 1..365 like the acquisition funnel', async () => {
    query.mockResolvedValue([]);
    const res = await request(app()).get('/api/admin/marketing/funnel/send-outcomes?days=9999').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.windowDays).toBe(365);
  });
  it('a non-numeric window is a 400 (Zod), before any query', async () => {
    query.mockClear();
    const res = await request(app()).get('/api/admin/marketing/funnel/send-outcomes?days=abc').set('Authorization', auth);
    expect(res.status).toBe(400);
    expect(res.body.error_class).toBe('ValidationError');
    expect(query).not.toHaveBeenCalled();
  });

  it('a failed query is a 500 with an error class and no data', async () => {
    query.mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(app()).get('/api/admin/marketing/funnel/send-outcomes').set('Authorization', auth);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to load send outcomes', error_class: 'InternalError' });
  });
});
