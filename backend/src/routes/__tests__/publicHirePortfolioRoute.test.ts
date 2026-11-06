/**
 * GET /api/public/portfolios/:slug with and without ?surface=hire.
 *
 * The two properties that matter: WITHOUT the parameter the route is exactly what it was
 * (the same service call, the same body, the same headers), and WITH it a person who is
 * not reachable on Hire gets a 404 byte-identical to an unknown slug's.
 */
jest.mock('../../services/career/careerPortfolioPageService', () => ({ getPublicPortfolioBySlug: jest.fn() }));
jest.mock('../../services/hire/hirePortfolio', () => ({ getHirePortfolio: jest.fn() }));

import express from 'express';
import request from 'supertest';
import router from '../publicCareerPortfolioRoutes';
import { getPublicPortfolioBySlug } from '../../services/career/careerPortfolioPageService';
import { getHirePortfolio } from '../../services/hire/hirePortfolio';

const mockPortfolio = getPublicPortfolioBySlug as unknown as jest.Mock;
const mockHire = getHirePortfolio as unknown as jest.Mock;
const app = () => { const a = express(); a.use(router); return a; };
const PORTFOLIO = { identity: { full_name: 'Ann Lee' }, projects: [] };

beforeEach(() => { mockPortfolio.mockReset(); mockHire.mockReset(); });

describe('without ?surface - unchanged', () => {
  it('serves the portfolio exactly as before, and never touches the hire service', async () => {
    mockPortfolio.mockResolvedValue({ portfolio: PORTFOLIO, indexable: true });
    const res = await request(app()).get('/api/public/portfolios/ann-lee');
    expect(res.status).toBe(200);
    expect(res.text).toBe(JSON.stringify({ ok: true, portfolio: PORTFOLIO }));
    expect(res.headers['cache-control']).toBe('public, max-age=120');
    expect(res.headers['x-robots-tag']).toBeUndefined();
    expect(mockPortfolio).toHaveBeenCalledWith('ann-lee');
    expect(mockHire).not.toHaveBeenCalled();
  });

  it('treats an unknown surface value as no surface', async () => {
    mockPortfolio.mockResolvedValue({ portfolio: PORTFOLIO, indexable: false });
    const res = await request(app()).get('/api/public/portfolios/ann-lee').query({ surface: 'enterprise' });
    expect(res.text).toBe(JSON.stringify({ ok: true, portfolio: PORTFOLIO }));
    expect(mockHire).not.toHaveBeenCalled();
  });
});

describe('?surface=hire', () => {
  it('serves the portfolio plus the hire block for a reachable person', async () => {
    const hire = { signature: null, caseStudies: [], availability: null, spotlight: false, indexable: true };
    mockHire.mockResolvedValue({ portfolio: PORTFOLIO, hire });
    const res = await request(app()).get('/api/public/portfolios/ann-lee').query({ surface: 'hire' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, portfolio: PORTFOLIO, hire });
    expect(res.headers['x-robots-tag']).toBeUndefined();
    expect(mockPortfolio).not.toHaveBeenCalled();
  });

  it('sends noindex for an unlisted (reachable, not indexable) person', async () => {
    mockHire.mockResolvedValue({ portfolio: PORTFOLIO, hire: { indexable: false } });
    const res = await request(app()).get('/api/public/portfolios/ann-lee').query({ surface: 'hire' });
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
  });

  it('answers a not-listed person with a 404 byte-identical to an unknown slug', async () => {
    mockHire.mockResolvedValue(null);
    const notListed = await request(app()).get('/api/public/portfolios/ann-lee').query({ surface: 'hire' });
    mockPortfolio.mockResolvedValue(null);
    const unknown = await request(app()).get('/api/public/portfolios/nobody-here');
    const malformed = await request(app()).get('/api/public/portfolios/%3Cx%3E').query({ surface: 'hire' });
    expect(notListed.status).toBe(404);
    expect(notListed.text).toBe(unknown.text);
    expect(malformed.status).toBe(404);
    expect(malformed.text).toBe(unknown.text);
  });

  it('answers a database failure with the portfolio route\'s own 500 shape', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockHire.mockRejectedValue(new Error('db down'));
    const res = await request(app()).get('/api/public/portfolios/ann-lee').query({ surface: 'hire' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Unable to load this portfolio' });
  });
});
