/**
 * publicCaseStudyRoutes - filter validation and saved collections. T014 AC6.
 *
 * NO DATABASE. Models mocked; the real Zod schema, filter engine and store run.
 *
 * THE RULE UNDER TEST: an unknown filter VALUE is a 400. Not a 500, and - the
 * failure that actually costs something - not a silently dropped clause that
 * widens the query to the whole surface. Each rejection test below is paired
 * with a positive one, so a schema that rejected everything would fail too.
 */

import express from 'express';
import request from 'supertest';
import { internalSnapshotContent } from '../../services/caseStudy/__tests__/publicFixtures';
import { fakes, resetFakes, seedPublishedRecord } from '../../services/caseStudy/__tests__/publicModelFakes';

jest.mock('../../models/CaseStudy', () => ({ __esModule: true, default: fakes.studies }));
jest.mock('../../models/CaseStudyPublication', () => ({ __esModule: true, default: fakes.publications }));
jest.mock('../../models/CaseStudySnapshot', () => ({ __esModule: true, default: fakes.snapshots }));
jest.mock('../../models/CaseStudyCollection', () => ({ __esModule: true, default: fakes.collections }));

import publicCaseStudyRoutes from '../publicCaseStudyRoutes';

const LIST = '/api/public/case-studies';

const app = express();
app.use(publicCaseStudyRoutes);

// The router emits one structured access log per request by design. Silenced so
// a few hundred requests do not bury the suite's own output.
let logSpy: jest.SpyInstance;
beforeAll(() => { logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined); });
afterAll(() => { logSpy.mockRestore(); });

beforeEach(resetFakes);

/* --------------------------------------------------------- rejected input --- */

describe('AC6 - an unknown filter value is a 400', () => {
  it.each([
    ['built_by', 'gremlins'],
    ['verification', 'trust-me'],
    ['method', 'vibes'],
    ['verification_method', 'vibes'],
    ['status', 'probably-shipped'],
    ['repo_visibility', 'semi-private'],
    ['sort', 'by-vibes'],
  ])('rejects ?%s=%s with 400', async (key, value) => {
    seedPublishedRecord();
    const res = await request(app).get(`${LIST}?${key}=${value}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid filters');

    // It names the PARAMETER that was wrong...
    expect(res.body.invalidParameters).toEqual([key]);

    // ...and does NOT publish the accepted vocabulary. Echoing raw Zod issues
    // here handed every enum this API knows to anyone who sent a junk value —
    // including `ai_flotation_team`, a surface that has not launched. A public
    // 400 owes the caller the parameter name, not the platform's taxonomy.
    const body = JSON.stringify(res.body);
    expect(res.body.issues).toBeUndefined();
    expect(body).not.toContain('ai_flotation_team');
    expect(body).not.toContain(value); // nor the rejected value echoed back
  });

  it('rejects `pending` as a verification class - it is not publicly representable', async () => {
    seedPublishedRecord();
    const res = await request(app).get(`${LIST}?verification=pending`);
    expect(res.status).toBe(400);
  });

  it('rejects a mixed list where only one member is unknown', async () => {
    seedPublishedRecord();
    const res = await request(app).get(`${LIST}?verification=verified,trust-me`);
    expect(res.status).toBe(400);
  });

  it('rejects an out-of-range page or limit rather than clamping silently', async () => {
    seedPublishedRecord();
    expect((await request(app).get(`${LIST}?limit=9999`)).status).toBe(400);
    expect((await request(app).get(`${LIST}?limit=0`)).status).toBe(400);
    expect((await request(app).get(`${LIST}?page=0`)).status).toBe(400);
    expect((await request(app).get(`${LIST}?page=not-a-number`)).status).toBe(400);
  });

  it('never answers a malformed filter with a 500', async () => {
    seedPublishedRecord();
    for (const q of ['sort=;drop', 'built_by[]=x', 'verification=%00', 'limit=-1']) {
      const res = await request(app).get(`${LIST}?${q}`);
      expect(res.status).not.toBe(500);
    }
  });
});

/* --------------------------------------------------------- accepted input --- */

describe('AC6 - the filters that are supposed to work, work', () => {
  it.each([
    ['capability', 'agentic-forecasting'],
    ['industry', 'retail-distribution'],
    ['stack', 'typescript,postgres'],
    ['program', 'enterprise-accelerator'],
    ['deliverable', 'architecture'],
    ['built_by', 'colaberry_team'],
    ['verification', 'verified'],
    ['method', 'repo'],
    ['verification_method', 'repo'],
    ['status', 'shipped'],
    ['featured', 'true'],
    ['sort', 'newest'],
    ['page', '1'],
    ['limit', '5'],
  ])('accepts ?%s=%s and still returns the record', async (key, value) => {
    seedPublishedRecord();
    const res = await request(app).get(`${LIST}?${key}=${value}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it('accepts the same axis as repeated params and as a comma list', async () => {
    seedPublishedRecord();
    const csv = await request(app).get(`${LIST}?stack=typescript,rust`);
    const repeated = await request(app).get(`${LIST}?stack=typescript&stack=rust`);
    expect(csv.body.items).toHaveLength(1);
    expect(repeated.body.items).toHaveLength(1);
  });

  it('ignores unknown query KEYS - analytics params must not 400 a marketing page', async () => {
    seedPublishedRecord();
    const res = await request(app).get(`${LIST}?utm_source=linkedin&gclid=abc&fbclid=def`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it('a known filter with a value nobody published narrows to zero, never to everything', async () => {
    seedPublishedRecord();
    const res = await request(app).get(`${LIST}?capability=quantum-teleportation`);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
  });
});

/* -------------------------------------------------- the admin-only facet --- */

describe('AC6 - repo_visibility is validated and then ignored', () => {
  it('accepts the parameter (spec §19 lists it) but does not honour it', async () => {
    seedPublishedRecord();
    const withFilter = await request(app).get(`${LIST}?repo_visibility=private`);
    const without = await request(app).get(LIST);
    expect(withFilter.status).toBe(200);
    expect(withFilter.body.items).toEqual(without.body.items);
  });

  it('cannot be used to enumerate records backed by private repositories', async () => {
    // TWO records that genuinely differ on the axis. The previous version of
    // this test seeded ONE record carrying public, private and unknown repos at
    // once, so `?repo_visibility=private` and `=public` could never differ no
    // matter what the code did — it passed even when the filter was deliberately
    // allowed to discriminate. A test that cannot fail is not a guard.
    // Built from the REAL fixture with only the repositories swapped, so the
    // record stays valid everywhere else in the pipeline and the ONLY difference
    // between the two is the axis under test.
    const repoAt = (visibility: 'public' | 'private') => internalSnapshotContent({
      identity: { ...(internalSnapshotContent().identity as object), slug: `${visibility}-backed` },
      repositories: [{
        repoOwner: 'acme', repoName: `${visibility}-repo`,
        repoUrl: `https://github.com/acme/${visibility}-repo`,
        role: 'primary', visibility, accessStatus: 'connected',
        allowPublicRepoLink: visibility === 'public',
      }],
    });

    seedPublishedRecord({ study: { slug: 'public-backed' }, content: repoAt('public') });
    seedPublishedRecord({ study: { slug: 'private-backed' }, content: repoAt('private') });

    const privateOnly = await request(app).get(`${LIST}?repo_visibility=private`);
    const publicOnly = await request(app).get(`${LIST}?repo_visibility=public`);
    const unfiltered = await request(app).get(LIST);

    // Non-vacuity: both records really are visible, so "identical" is not
    // "identically empty".
    expect(unfiltered.body.items.length).toBe(2);
    const slugs = (r: { body: { items: Array<{ slug: string }> } }) =>
      r.body.items.map((i) => i.slug).sort();

    expect(slugs(privateOnly)).toEqual(['private-backed', 'public-backed']);
    expect(slugs(publicOnly)).toEqual(['private-backed', 'public-backed']);
    expect(slugs(privateOnly)).toEqual(slugs(unfiltered));
  });
});

/* ------------------------------------------------------------ collections --- */

describe('saved collections', () => {
  const seedCollection = (over: Record<string, unknown> = {}) => fakes.collections.seed({
    id: 'col-1', slug: 'agents', surface_key: 'enterprise', status: 'published',
    title: 'Agent builds', description: 'Agentic work.',
    filter_config: { capability: ['agentic-forecasting'] },
    sort_config: { sort: 'newest' },
    ...over,
  });

  it('renders a published collection through the same pipeline as the index', async () => {
    seedPublishedRecord();
    seedCollection();
    const res = await request(app).get('/api/public/case-study-collections/agents');
    expect(res.status).toBe(200);
    expect(res.body.collection).toEqual({
      slug: 'agents', title: 'Agent builds', description: 'Agentic work.',
    });
    expect(res.body.items).toHaveLength(1);
  });

  it('a collection cannot surface a record the index would hide', async () => {
    seedPublishedRecord({ study: { status: 'draft' } });
    seedCollection();
    const res = await request(app).get('/api/public/case-study-collections/agents');
    expect(res.body.items).toEqual([]);
  });

  it('a collection whose filters match nothing returns an empty page, not the surface', async () => {
    seedPublishedRecord();
    seedCollection({ filter_config: { capability: ['nothing-matches-this'] } });
    const res = await request(app).get('/api/public/case-study-collections/agents');
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('an unknown ?collection= on the index is a 404, never an ignored clause', async () => {
    seedPublishedRecord();
    const res = await request(app).get(`${LIST}?collection=no-such-collection`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('a draft collection is a 404 on both entry points', async () => {
    seedPublishedRecord();
    seedCollection({ status: 'draft' });
    expect((await request(app).get('/api/public/case-study-collections/agents')).status).toBe(404);
    expect((await request(app).get(`${LIST}?collection=agents`)).status).toBe(404);
  });
});

/* -------------------------------------------------------------- taxonomy --- */

describe('the taxonomy endpoint', () => {
  it('reports an empty facet set for an empty library rather than a hardcoded menu', async () => {
    const res = await request(app).get('/api/public/case-study-taxonomy');
    expect(res.status).toBe(200);
    expect(res.body.facets).toEqual({
      capabilities: [], industries: [], stack: [], programs: [],
      builtBy: [], verificationClasses: [],
    });
  });

  it('counts only what is actually published', async () => {
    seedPublishedRecord();
    seedPublishedRecord({
      study: { slug: 'hidden-one', status: 'draft' },
      content: internalSnapshotContent(),
    });
    const res = await request(app).get('/api/public/case-study-taxonomy');
    // Equal counts tie-break on slug, so the order is alphabetical and stable.
    expect(res.body.facets.stack).toEqual([
      { slug: 'postgres', label: 'postgres', count: 1 },
      { slug: 'typescript', label: 'typescript', count: 1 },
    ]);
    expect(res.body.facets.verificationClasses).toEqual([{ slug: 'verified', count: 1 }]);
  });
});
