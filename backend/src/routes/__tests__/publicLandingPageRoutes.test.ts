/**
 * publicLandingPageRoutes - the HTTP surface of a hosted landing page.
 *
 * END TO END, WITH NO DATABASE. Only the Sequelize models are faked: the real param schema, the
 * real content schema, the real renderer and the real theme resolution all run, so "a draft
 * never reaches the internet" is proven through a curl-shaped request rather than through a unit
 * test of a predicate somebody could stop calling.
 *
 * MOUNT ORDER IS TESTED BY BUILDING BOTH ORDERS. One app mounts this router ABOVE an
 * `adminRoutes`-shaped stand-in and expects 200; a second mounts it BELOW and expects 401. The
 * second assertion is the one that matters - it proves the stand-in's unscoped guard really does
 * swallow the request, so the first is not passing by accident. `/i/:tag` spent two weeks below
 * `adminRoutes` 401ing every visitor; this is the test that stops that happening here.
 */

import express from 'express';
import request from 'supertest';

const brands: Array<{ id: string; slug: string; name: string; default_theme_key: string | null }> = [];
const pages: Array<Record<string, unknown>> = [];

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => row[k] === v);
}

const fakeBrand = { findOne: jest.fn(async ({ where }: any) => brands.find((b) => matches(b as never, where)) ?? null) };
const fakeLandingPage = { findOne: jest.fn(async ({ where }: any) => pages.find((p) => matches(p, where)) ?? null) };

jest.mock('../../models', () => ({
  __esModule: true,
  Brand: fakeBrand,
  LandingPage: fakeLandingPage,
}));

import publicLandingPageRoutes from '../publicLandingPageRoutes';

const PUBLISHED_CONTENT = {
  title: 'Six-week AI build',
  description: 'Ship a working project, not a certificate.',
  sections: [
    { type: 'hero', headline: 'Ship an AI project in six weeks', subhead: 'Live, with a mentor.' },
    { type: 'cta', headline: 'Apply for the November cohort', cta: { label: 'Apply now', href: '/apply' } },
  ],
};

function seed(): void {
  brands.length = 0;
  pages.length = 0;
  brands.push({ id: 'b-train', slug: 'colaberry-training', name: 'Colaberry Training', default_theme_key: 'training' });
  brands.push({ id: 'b-flot', slug: 'ai-flotation', name: 'AI Flotation', default_theme_key: 'ai-flotation' });
  pages.push({
    id: 'lp-1', brand_id: 'b-train', slug: 'six-week-build', kind: 'hosted', status: 'published',
    site_slug: 'training', content: PUBLISHED_CONTENT,
  });
}

/**
 * The shape of `adminRoutes`: mounted with no path prefix, chaining sub-routers that call
 * `router.use(guard)` with NO path scope, so it answers 401 to anything that reaches it.
 */
function adminRoutesShaped(): express.Router {
  const admin = express.Router();
  admin.use((_req, res) => { res.status(401).json({ error: 'Authentication required' }); });
  return admin;
}

function appWithOrder(publicFirst: boolean): express.Express {
  const app = express();
  const admin = adminRoutesShaped();
  if (publicFirst) { app.use(publicLandingPageRoutes); app.use(admin); } else {
    app.use(admin); app.use(publicLandingPageRoutes);
  }
  return app;
}

const app = appWithOrder(true);
const URL = '/p/colaberry-training/six-week-build';

let logSpy: jest.SpyInstance;
let errSpy: jest.SpyInstance;

beforeEach(() => {
  seed();
  jest.clearAllMocks();
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { logSpy.mockRestore(); errSpy.mockRestore(); });

describe('mount order', () => {
  it('serves the page when mounted ABOVE adminRoutes', async () => {
    const res = await request(appWithOrder(true)).get(URL);
    expect(res.status).toBe(200);
  });

  it('is swallowed by the admin guard when mounted BELOW it - the bug this pins', async () => {
    const res = await request(appWithOrder(false)).get(URL);
    expect(res.status).toBe(401);
  });
});

describe('a published hosted page', () => {
  it('returns the rendered HTML', async () => {
    const res = await request(app).get(URL);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Ship an AI project in six weeks');
    expect(res.text).toContain('<title>Six-week AI build</title>');
  });

  it('carries the tracker with this row\'s site_slug', async () => {
    const res = await request(app).get(URL);
    expect(res.text).toContain('data-site="training"');
  });

  it('builds the canonical URL from the forwarded host, not the internal one', async () => {
    const res = await request(app).get(URL)
      .set('x-forwarded-proto', 'https')
      .set('x-forwarded-host', 'enterprise.colaberry.ai');
    expect(res.text).toContain('href="https://enterprise.colaberry.ai/p/colaberry-training/six-week-build"');
  });

  it('sets a CSP that permits the external tracker but no inline script', async () => {
    const res = await request(app).get(URL);
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('is cacheable, but briefly - a fixed typo must not wait an hour', async () => {
    const res = await request(app).get(URL);
    expect(res.headers['cache-control']).toBe('public, max-age=60, s-maxage=300');
  });
});

describe('what must never be served', () => {
  it('404s a draft, even though the row exists', async () => {
    pages[0].status = 'draft';
    const res = await request(app).get(URL);
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('Ship an AI project');
  });

  it('404s an archived page', async () => {
    pages[0].status = 'archived';
    expect((await request(app).get(URL)).status).toBe(404);
  });

  it('404s a legacy external_path row - those are not pages', async () => {
    pages[0].kind = 'external_path';
    expect((await request(app).get(URL)).status).toBe(404);
  });

  it('404s a page belonging to a different brand', async () => {
    const res = await request(app).get('/p/ai-flotation/six-week-build');
    expect(res.status).toBe(404);
  });

  it('404s an unknown brand', async () => {
    expect((await request(app).get('/p/no-such-brand/six-week-build')).status).toBe(404);
  });

  it('404s an unknown slug', async () => {
    expect((await request(app).get('/p/colaberry-training/no-such-page')).status).toBe(404);
  });

  it('404s a malformed slug, with the same status as an unknown one', async () => {
    // A 400 for "wrong shape" would let someone map the slug alphabet without guessing a page.
    for (const bad of ['/p/colaberry-training/Has Spaces', '/p/UPPER/six-week-build', '/p/colaberry-training/-leading-dash']) {
      expect((await request(app).get(bad)).status).toBe(404);
    }
  });

  it('never reaches the database for a malformed param', async () => {
    await request(app).get('/p/colaberry-training/Bad Slug');
    expect(fakeLandingPage.findOne).not.toHaveBeenCalled();
  });
});

describe('fail closed on content', () => {
  it('404s a published page whose content does not match the schema, and logs why', async () => {
    pages[0].content = { sections: [{ type: 'carousel', slides: [] }] };
    const res = await request(app).get(URL);

    expect(res.status).toBe(404);
    const logged = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('landing_page_content_unrenderable');
    expect(logged).toContain('six-week-build');
  });

  it('404s rather than rendering half a page from partly-valid content', async () => {
    pages[0].content = { sections: [{ type: 'hero' }] };
    const res = await request(app).get(URL);
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('class="s s-hero"');
  });

  it('500s on an unexpected failure without leaking the message', async () => {
    fakeBrand.findOne.mockRejectedValueOnce(new Error('connection terminated: secret-dsn'));
    const res = await request(app).get(URL);
    expect(res.status).toBe(500);
    expect(res.text).not.toContain('secret-dsn');
    expect(errSpy.mock.calls.map((c) => String(c[0])).join('\n')).toContain('landing_page_failed');
  });
});

describe('a page with no site_slug', () => {
  it('still serves, but warns that the view is unrecorded', async () => {
    pages[0].site_slug = null;
    const res = await request(app).get(URL);

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('/v1/track.js');
    expect(logSpy.mock.calls.map((c) => String(c[0])).join('\n')).toContain('landing_page_untracked');
  });
});
