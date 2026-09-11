/**
 * openclawShortLinkRoutes: `/i/:tag` is public, and the mount order is what keeps it so.
 *
 * Built the same way as publicCaseStudyRoutes.test.ts: one app mounts the router ABOVE an
 * `adminRoutes`-shaped stand-in and expects the redirect; a second mounts it BELOW and
 * expects the 401 that production served every outreach visitor for two weeks. The second
 * assertion proves the guard really swallows the request, so the first is not passing by
 * accident.
 */

import express from 'express';
import request from 'supertest';

const mockFindOne = jest.fn();
const mockVisitorCreate = jest.fn();
const mockResponseUpdate = jest.fn();

jest.mock('../../models', () => ({
  OpenclawResponse: { findOne: (...a: unknown[]) => mockFindOne(...a) },
  Visitor: { create: (...a: unknown[]) => mockVisitorCreate(...a) },
}));

import openclawShortLinkRoutes from '../openclawShortLinkRoutes';

function adminRoutesShaped(): express.Router {
  const admin = express.Router();
  admin.use((_req, res) => { res.status(401).json({ error: 'Authentication required' }); });
  return admin;
}

function appWithOrder(publicFirst: boolean): express.Express {
  const app = express();
  const admin = adminRoutesShaped();
  if (publicFirst) { app.use(openclawShortLinkRoutes); app.use(admin); } else {
    app.use(admin); app.use(openclawShortLinkRoutes);
  }
  return app;
}

function knownResponse() {
  return {
    short_id: 'abc123',
    platform: 'reddit',
    utm_params: { utm_campaign: 'camp-x', utm_source: 'reddit', utm_medium: 'social' },
    engagement_metrics: { clicks: 2 },
    update: (...a: unknown[]) => mockResponseUpdate(...a),
  };
}

let warnSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;
beforeEach(() => {
  mockFindOne.mockReset();
  mockVisitorCreate.mockReset().mockResolvedValue({});
  mockResponseUpdate.mockReset().mockResolvedValue({});
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { warnSpy.mockRestore(); errorSpy.mockRestore(); });

describe('mount order', () => {
  it('redirects an anonymous visitor when mounted ABOVE adminRoutes', async () => {
    mockFindOne.mockResolvedValue(knownResponse());
    const res = await request(appWithOrder(true)).get('/i/abc123');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/ai-architect');
  });

  it('401s when mounted BELOW adminRoutes - the production bug this file fixes', async () => {
    mockFindOne.mockResolvedValue(knownResponse());
    const res = await request(appWithOrder(false)).get('/i/abc123');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Authentication required' });
    expect(mockFindOne).not.toHaveBeenCalled();
  });
});

describe('behaviour (unchanged from the inline handler)', () => {
  it('bumps the click count and records a visitor with the response UTMs', async () => {
    mockFindOne.mockResolvedValue(knownResponse());
    await request(appWithOrder(true)).get('/i/abc123').set('User-Agent', 'Mozilla/5.0').set('Referer', 'https://reddit.com/r/x');
    expect(mockResponseUpdate).toHaveBeenCalledTimes(1);
    expect(mockResponseUpdate.mock.calls[0][0].engagement_metrics).toEqual({ clicks: 3 });
    const visitor = mockVisitorCreate.mock.calls[0][0];
    expect(visitor).toMatchObject({ campaign_id: 'camp-x', source: 'reddit', medium: 'social', landing_page: '/ai-architect', referrer: 'https://reddit.com/r/x' });
  });

  it('sends an unknown tag to the landing page and writes nothing', async () => {
    mockFindOne.mockResolvedValue(null);
    const res = await request(appWithOrder(true)).get('/i/nope');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/ai-architect');
    expect(mockVisitorCreate).not.toHaveBeenCalled();
    expect(mockResponseUpdate).not.toHaveBeenCalled();
  });

  it('a failed visitor row is logged, not swallowed, and the visitor still lands', async () => {
    mockFindOne.mockResolvedValue(knownResponse());
    mockVisitorCreate.mockRejectedValue(new Error('visitors table locked'));
    const res = await request(appWithOrder(true)).get('/i/abc123');
    expect(res.status).toBe(302);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warnSpy.mock.calls[0][0])).toMatchObject({ event: 'visitor_attribution_failed', outcome: 'partial' });
    expect(mockResponseUpdate).toHaveBeenCalledTimes(1);
  });

  it('a lookup failure is logged as an error and still redirects rather than 500ing', async () => {
    mockFindOne.mockRejectedValue(new Error('db down'));
    const res = await request(appWithOrder(true)).get('/i/abc123');
    expect(res.status).toBe(302);
    expect(JSON.parse(errorSpy.mock.calls[0][0])).toMatchObject({ event: 'short_link_redirect_failed', outcome: 'failure' });
  });
});
