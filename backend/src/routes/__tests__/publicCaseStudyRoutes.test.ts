/**
 * publicCaseStudyRoutes - the HTTP surface. T014 AC1, AC2, AC3, AC4, AC5, AC8.
 *
 * END TO END, WITH NO DATABASE. The Sequelize models are the only thing mocked:
 * the real store, the real filter engine and the real projection all run, so
 * "a draft never reaches the internet" is proven through a `curl`-shaped request
 * rather than through a unit test of a predicate somebody might stop calling.
 *
 * AC1 IS TESTED BY BUILDING BOTH ORDERS. One app mounts this router ABOVE an
 * `adminRoutes`-shaped stand-in and expects 200; a second app mounts it BELOW
 * and expects 401. The second assertion is the one that matters - it proves the
 * stand-in's unscoped guard really does swallow the request, so the first
 * assertion is not passing by accident, and a future re-order fails loudly.
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { PRIVATE_REPO_URL, SENTINELS, internalSnapshotContent } from '../../services/caseStudy/__tests__/publicFixtures';
import { fakes, resetFakes, seedPublishedRecord } from '../../services/caseStudy/__tests__/publicModelFakes';

jest.mock('../../models/CaseStudy', () => ({ __esModule: true, default: fakes.studies }));
jest.mock('../../models/CaseStudyPublication', () => ({ __esModule: true, default: fakes.publications }));
jest.mock('../../models/CaseStudySnapshot', () => ({ __esModule: true, default: fakes.snapshots }));
jest.mock('../../models/CaseStudyCollection', () => ({ __esModule: true, default: fakes.collections }));

import publicCaseStudyRoutes from '../publicCaseStudyRoutes';

const LIST = '/api/public/case-studies';
const DETAIL = '/api/public/case-studies/stockout-forecasting';
const TAXONOMY = '/api/public/case-study-taxonomy';

/**
 * The shape of `adminRoutes`: mounted with no path prefix, chaining sub-routers
 * that call `router.use(guard)` with NO path scope, so it answers 401 to any
 * request that reaches it. `publicCaseStudyRoutes.mount.test.ts` asserts that
 * the real admin sub-routers are still written this way.
 */
function adminRoutesShaped(): express.Router {
  const admin = express.Router();
  admin.use((_req, res) => { res.status(401).json({ error: 'Authentication required' }); });
  return admin;
}

const appWithOrder = (publicFirst: boolean): express.Express => {
  const app = express();
  const admin = adminRoutesShaped();
  if (publicFirst) { app.use(publicCaseStudyRoutes); app.use(admin); } else {
    app.use(admin); app.use(publicCaseStudyRoutes);
  }
  return app;
};

const app = appWithOrder(true);

// The router emits one structured access log per request by design. Silenced so
// a few hundred requests do not bury the suite's own output; the 500 test below
// reuses this spy to read what was actually logged.
let logSpy: jest.SpyInstance;
beforeAll(() => { logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined); });
afterAll(() => { logSpy.mockRestore(); });

beforeEach(() => { resetFakes(); logSpy.mockClear(); });

/* ------------------------------------------------------------------ AC1 --- */

describe('AC1 - mounted above adminRoutes, an unauthenticated GET is 200', () => {
  it.each([LIST, DETAIL, TAXONOMY])('200s an anonymous GET %s', async (url) => {
    seedPublishedRecord();
    const res = await request(appWithOrder(true)).get(url);
    expect(res.status).toBe(200);
  });

  it('401s when mounted BELOW adminRoutes - the order is what saves it', async () => {
    seedPublishedRecord();
    const res = await request(appWithOrder(false)).get(LIST);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Authentication required' });
  });

  it('sends no auth header and still gets the record back', async () => {
    seedPublishedRecord();
    const res = await request(app).get(LIST);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].slug).toBe('stockout-forecasting');
  });
});

/* ------------------------------------------------------------------ AC2 --- */

describe('AC2 - nothing internal survives the HTTP boundary', () => {
  it.each(SENTINELS.map((s) => [s.what, s.value]))(
    'the detail response never contains the %s',
    async (_what, value) => {
      seedPublishedRecord();
      const res = await request(app).get(DETAIL);
      expect(res.status).toBe(200);
      expect(res.text).not.toContain(value as string);
    },
  );

  it('the list response never contains a private repository URL', async () => {
    seedPublishedRecord();
    const res = await request(app).get(LIST);
    expect(res.text).not.toContain(PRIVATE_REPO_URL);
  });

  it('renders the one public repository and counts the two it withholds', async () => {
    seedPublishedRecord();
    const res = await request(app).get(DETAIL);
    expect(res.body.caseStudy.repositories).toHaveLength(1);
    expect(res.body.caseStudy.privateRepositoryCount).toBe(2);
  });
});

/* ------------------------------------------------------------------ AC3 --- */

describe('AC3 - draft, review, archived and unpublished are never returned', () => {
  const invisible = async (): Promise<void> => {
    const list = await request(app).get(LIST);
    expect(list.status).toBe(200);
    expect(list.body.items).toEqual([]);
    expect(list.body.total).toBe(0);
    const detail = await request(app).get(DETAIL);
    expect(detail.status).toBe(404);
  };

  it('a DRAFT Case Study is invisible', async () => {
    seedPublishedRecord({ study: { status: 'draft' } });
    await invisible();
  });

  it('a Case Study in REVIEW is invisible', async () => {
    seedPublishedRecord({ study: { status: 'review' } });
    await invisible();
  });

  it('an ARCHIVED Case Study is invisible', async () => {
    seedPublishedRecord({ study: { status: 'archived', archived_at: new Date() } });
    await invisible();
  });

  it('an UNPUBLISHED publication is invisible', async () => {
    seedPublishedRecord({ publication: { status: 'unpublished' } });
    await invisible();
  });

  it('a publication still in draft is invisible', async () => {
    seedPublishedRecord({ publication: { status: 'draft' } });
    await invisible();
  });

  it('a pin to a DRAFT snapshot is invisible', async () => {
    seedPublishedRecord({ snapshot: { status: 'draft', approved_by: null, approved_at: null } });
    await invisible();
  });

  it('the same fixture, unbroken, IS visible - so the tests above are not vacuous', async () => {
    seedPublishedRecord();
    expect((await request(app).get(LIST)).body.items).toHaveLength(1);
    expect((await request(app).get(DETAIL)).status).toBe(200);
  });
});

/* ------------------------------------------------------------------ AC4 --- */

describe('AC4 - surface isolation', () => {
  it('a training-only publication is invisible to the enterprise surface', async () => {
    seedPublishedRecord({ publication: { surface_key: 'training' } });
    const list = await request(app).get(LIST);
    expect(list.body.items).toEqual([]);
    expect((await request(app).get(DETAIL)).status).toBe(404);
  });

  it('the taxonomy of another surface does not bleed through', async () => {
    seedPublishedRecord({ publication: { surface_key: 'training' } });
    const res = await request(app).get(TAXONOMY);
    expect(res.status).toBe(200);
    expect(res.body.facets.stack).toEqual([]);
    expect(res.body.surface.key).toBe('enterprise');
  });

  it('every response declares the surface it resolved', async () => {
    seedPublishedRecord();
    expect((await request(app).get(LIST)).body.surface.key).toBe('enterprise');
    expect((await request(app).get(DETAIL)).body.caseStudy.surfaceKey).toBe('enterprise');
  });
});

/* ------------------------------------------------------------------ AC5 --- */

describe('AC5 - a public read never calls GitHub', () => {
  it('does not invoke the injectable fetch during any of the four endpoints', async () => {
    seedPublishedRecord();
    // The analyzer's `fetchImpl` seam defaults to the global, so the global IS
    // the injection point a public read would have to reach through.
    const globals = globalThis as unknown as Record<string, unknown>;
    const original = globals.fetch;
    const trap = jest.fn(() => { throw new Error('a public read attempted a network call'); });
    globals.fetch = trap;
    try {
      for (const url of [LIST, DETAIL, TAXONOMY, '/api/public/case-study-collections/agents']) {
        await request(app).get(url);
      }
      expect(trap).not.toHaveBeenCalled();
    } finally {
      globals.fetch = original;
    }
  });

  it.each([
    'src/routes/publicCaseStudyRoutes.ts',
    'src/schemas/publicCaseStudySchema.ts',
    'src/services/caseStudy/caseStudyPublicProjection.ts',
    'src/services/caseStudy/caseStudyPublicSections.ts',
    'src/services/caseStudy/caseStudyFilterService.ts',
    'src/services/caseStudy/caseStudySurfaceProfiles.ts',
    'src/services/caseStudy/caseStudyPublicStore.ts',
  ])('%s contains no call to fetch and no repository-reader import', (file) => {
    const source = fs.readFileSync(path.join(__dirname, '../../..', file), 'utf8');
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/caseStudyRepo(Reader|Analyzer)/);
    expect(source).not.toMatch(/githubService|api\.github\.com|octokit/i);
  });
});

/* ------------------------------------------------------------------ AC8 --- */

describe('AC8 - the 404 is uniform, byte for byte', () => {
  const bodies = async (): Promise<{ status: number; text: string; type: string }[]> => {
    const urls = [
      '/api/public/case-studies/no-such-record-at-all',
      '/api/public/case-studies/stockout-forecasting',
      '/api/public/case-studies/NOT_A_VALID_SLUG',
    ];
    const out = [];
    for (const url of urls) {
      const res = await request(app).get(url);
      out.push({ status: res.status, text: res.text, type: String(res.headers['content-type']) });
    }
    return out;
  };

  it('an unknown slug and a published-but-not-on-this-surface slug are indistinguishable', async () => {
    // Seeded on `training`, so the record EXISTS but is not on this surface.
    seedPublishedRecord({ publication: { surface_key: 'training' } });
    const [unknown, wrongSurface, malformed] = await bodies();

    expect(unknown.status).toBe(404);
    expect(wrongSurface.status).toBe(404);
    expect(unknown.status).toBe(wrongSurface.status);
    expect(unknown.text).toBe(wrongSurface.text);
    expect(Buffer.from(unknown.text).equals(Buffer.from(wrongSurface.text))).toBe(true);
    expect(unknown.type).toBe(wrongSurface.type);
    // A malformed slug is the same answer again: the status never says WHY.
    expect(malformed.status).toBe(404);
    expect(malformed.text).toBe(unknown.text);
  });

  it('a draft record 404s with the same bytes as an unknown slug', async () => {
    seedPublishedRecord({ study: { status: 'draft' } });
    const draft = await request(app).get(DETAIL);
    const unknown = await request(app).get('/api/public/case-studies/no-such-record-at-all');
    expect(draft.status).toBe(404);
    expect(draft.text).toBe(unknown.text);
  });

  it('an unknown collection 404s with the same bytes', async () => {
    const unknownCollection = await request(app).get('/api/public/case-study-collections/nope');
    const unknownSlug = await request(app).get('/api/public/case-studies/no-such-record-at-all');
    expect(unknownCollection.status).toBe(404);
    expect(unknownCollection.text).toBe(unknownSlug.text);
  });

  it('the 404 body carries no reason, no slug and no surface', async () => {
    const res = await request(app).get('/api/public/case-studies/no-such-record-at-all');
    expect(res.body).toEqual({ error: 'Not found' });
    expect(res.text).not.toContain('no-such-record-at-all');
    expect(res.text).not.toContain('enterprise');
  });
});

/* ------------------------------------------------------------- failures --- */

describe('a read failure is generic', () => {
  it('returns 500 without echoing the error message', async () => {
    const boom = new Error('connect ECONNREFUSED 10.0.0.7:5432 as user accelerator');
    boom.name = 'SequelizeConnectionRefusedError';
    const spy = jest.spyOn(fakes.publications, 'findAll').mockRejectedValue(boom);
    try {
      const res = await request(app).get(LIST);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Unable to load case studies' });
      expect(res.text).not.toContain('ECONNREFUSED');
      expect(res.text).not.toContain('accelerator');
      const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).toContain('UpstreamUnavailable');
      expect(logged).not.toContain('ECONNREFUSED');
    } finally {
      spy.mockRestore();
    }
  });
});

/* --------------------------------------------------------------- content --- */

describe('the payload it does return', () => {
  it('carries the surface profile, the ledger and a consent-resolved label', async () => {
    seedPublishedRecord();
    const res = await request(app).get(LIST);
    expect(res.body.surface.hero.title).toBe('What we shipped, and who built it.');
    expect(res.body.surface.cta.href).toBe('/lab');
    expect(res.body.ledger).toEqual({
      projects: 1, verifiedOutcomes: 1, publicRepositories: 1, shipped: 1,
    });
    expect(res.body.items[0].organizationLabel).toBe('A national grocery distributor');
    expect(res.body.items[0].verificationClass).toBe('verified');
  });

  it('hides an illustrative record from the default index but serves it on request', async () => {
    const illustrative = internalSnapshotContent({
      heroMetrics: [{
        key: 'demo', label: 'Demo figure', valueDisplay: '3x', metricType: 'delivery',
        isHeadline: true, publishable: true,
        verification: { class: 'illustrative', method: 'internal' },
        measurement: { limitations: [] },
      }],
      situation: undefined, measurement: undefined,
      identity: {
        slug: 'stockout-forecasting', title: 'A sample record',
        organizationIdentityMode: 'hidden', organizationNamingConsent: false,
        builderIdentityMode: 'anonymous', builderNamingConsent: false,
      },
    });
    seedPublishedRecord({ content: illustrative });
    expect((await request(app).get(LIST)).body.items).toEqual([]);
    const asked = await request(app).get(`${LIST}?verification=illustrative`);
    expect(asked.body.items).toHaveLength(1);
    // It is still reachable directly - a sample page is labelled, not hidden.
    expect((await request(app).get(DETAIL)).status).toBe(200);
  });
});
