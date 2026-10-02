/**
 * The landing page authoring API: brief in, reviewable page out.
 *
 * END TO END, WITH NO DATABASE AND NO MODEL. Only the models, the admin guard and the generator
 * are faked; the real Zod schemas, the real content schema and the real renderer all run. So
 * "a draft is never public", "an unrenderable page cannot be published" and "another tenant's
 * page is invisible" are proven through curl-shaped requests rather than by unit-testing a
 * predicate someone could stop calling.
 */

import express from 'express';
import request from 'supertest';

const draftLandingPage = jest.fn();
jest.mock('../../../services/marketing/landingPageDraftService', () => ({ draftLandingPage }));

jest.mock('../../../middlewares/authMiddleware', () => ({
  requireAdmin: (req: any, _res: any, next: any) => { req.admin = { sub: 'admin-1', email: 'a@b.c' }; next(); },
  adminAllowedSections: () => [],
}));

let scopeMode: 'all' | 'denied' = 'all';
let allowedTenant: string | null = 't-1';
jest.mock('../../../modules/tenancy/adminScopeBridge', () => ({
  adminTenantScope: async () => ({ mode: scopeMode }),
  scopeAllows: (_scope: any, tenantId: string | null) => allowedTenant === null || tenantId === allowedTenant,
}));

type Row = Record<string, any>;
const rows: Row[] = [];
const brandsById: Record<string, Row> = {};

function makeRow(data: Row): Row {
  const row: Row = {
    ...data,
    update: jest.fn(async (patch: Row) => { Object.assign(row, patch); return row; }),
  };
  return row;
}

/** Brand and page ids are real UUIDs because the routes validate them as such. */
const BRAND = '11111111-1111-4111-8111-111111111111';
const PAGE = '22222222-2222-4222-8222-222222222222';
const OTHER_PAGE = '33333333-3333-4333-8333-333333333333';

/**
 * Honours a `{ [Op.ne]: value }` clause, because the publish clash check depends on it. A mock
 * that ignored the operator would pass whether or not the route excluded the current row - which
 * is exactly the bug this suite caught.
 */
function whereMatches(row: Row, where: Record<string, any>): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const ne = Object.getOwnPropertySymbols(v).find((sym) => String(sym).includes('ne'));
      if (ne) return row[k] !== (v as any)[ne];
    }
    return row[k] === v;
  });
}

const LandingPage = {
  findByPk: jest.fn(async (id: string) => rows.find((r) => r.id === id) ?? null),
  findOne: jest.fn(async ({ where }: any) => rows.find((r) => whereMatches(r, where)) ?? null),
  findAll: jest.fn(async ({ where }: any) => rows.filter((r) => whereMatches(r, where ?? {}))),
  create: jest.fn(async (data: Row) => { const r = makeRow({ id: 'lp-new', ...data }); rows.push(r); return r; }),
};
const Brand = { findByPk: jest.fn(async (id: string) => brandsById[id] ?? null) };

jest.mock('../../../models', () => ({ LandingPage, Brand }));

import landingPageRoutes from '../landingPageRoutes';

const app = express();
app.use(express.json());
app.use(landingPageRoutes);

const GOOD_CONTENT = {
  title: 'Six-week AI build',
  sections: [
    { type: 'hero', headline: 'Ship an AI project in six weeks' },
    { type: 'cta', headline: 'Apply', cta: { label: 'Apply now', href: '/apply' } },
  ],
};

const BRIEF = 'A six-week cohort for working data analysts who want to ship a real AI project, live on Thursdays.';

beforeEach(() => {
  jest.clearAllMocks();
  scopeMode = 'all';
  allowedTenant = 't-1';
  rows.length = 0;
  Object.keys(brandsById).forEach((k) => delete brandsById[k]);
  brandsById[BRAND] = { id: BRAND, slug: 'colaberry-training', name: 'Colaberry Training', tenant_id: 't-1', default_theme_key: 'training' };
  rows.push(makeRow({
    id: PAGE, tenant_id: 't-1', brand_id: BRAND, kind: 'hosted', status: 'draft',
    name: 'Six-week build', slug: 'six-week-build', path: '/lp/colaberry-training/six-week-build',
    site_slug: 'training', content: GOOD_CONTENT, published_at: null, repo_path: null,
    repo_commit: null, updated_at: new Date(),
  }));
  draftLandingPage.mockResolvedValue({
    content: GOOD_CONTENT, placeholders: ['[price]'], unverifiedClaims: [], model: 'gpt-4o-mini', repaired: false,
  });
});

describe('creating a page from a brief', () => {
  it('generates content and stores it as a DRAFT, never published', async () => {
    const res = await request(app).post('/api/admin/landing-pages')
      .send({ brand_id: BRAND, source: BRIEF, name: 'Six-week build', slug: 'six-week-build', site_slug: 'training' });

    expect(res.status).toBe(201);
    expect(res.body.page.status).toBe('draft');
    expect(res.body.page.kind).toBe('hosted');
    expect(LandingPage.create.mock.calls[0][0].status).toBe('draft');
  });

  it('hands back the placeholders and unsupported claims at creation time', async () => {
    draftLandingPage.mockResolvedValue({
      content: GOOD_CONTENT, placeholders: ['[start date]'], unverifiedClaims: ['price $2,400'],
      model: 'gpt-4o-mini', repaired: true,
    });
    const res = await request(app).post('/api/admin/landing-pages')
      .send({ brand_id: BRAND, source: BRIEF, name: 'X' });

    expect(res.body.placeholders).toEqual(['[start date]']);
    expect(res.body.unverifiedClaims).toEqual(['price $2,400']);
    expect(res.body.repaired).toBe(true);
  });

  it('inherits the brand\'s tenant rather than taking one from the body', async () => {
    await request(app).post('/api/admin/landing-pages').send({ brand_id: BRAND, source: BRIEF, name: 'X' });
    expect(LandingPage.create.mock.calls[0][0].tenant_id).toBe('t-1');
  });

  it('refuses a brief too short to work from, without calling the generator', async () => {
    const res = await request(app).post('/api/admin/landing-pages')
      .send({ brand_id: BRAND, source: 'make a page', name: 'X' });
    expect(res.status).toBe(400);
    expect(draftLandingPage).not.toHaveBeenCalled();
  });

  it('refuses an unknown slug shape', async () => {
    const res = await request(app).post('/api/admin/landing-pages')
      .send({ brand_id: BRAND, source: BRIEF, name: 'X', slug: 'Not A Slug' });
    expect(res.status).toBe(400);
  });

  it('404s a brand in another tenant - never a 403, which would confirm it exists', async () => {
    allowedTenant = 't-other';
    const res = await request(app).post('/api/admin/landing-pages').send({ brand_id: BRAND, source: BRIEF, name: 'X' });
    expect(res.status).toBe(404);
    expect(draftLandingPage).not.toHaveBeenCalled();
  });

  it('rejects an unknown field rather than ignoring it', async () => {
    const res = await request(app).post('/api/admin/landing-pages')
      .send({ brand_id: BRAND, source: BRIEF, name: 'X', status: 'published' });
    expect(res.status).toBe(400);
  });
});

describe('revising', () => {
  it('sends the previous content and the feedback to the generator', async () => {
    const res = await request(app).post(`/api/admin/landing-pages/${PAGE}/revise`)
      .send({ feedback: 'Make the headline about the mentor review.' });

    expect(res.status).toBe(200);
    const call = draftLandingPage.mock.calls[0][0];
    expect(call.previous).toEqual(GOOD_CONTENT);
    expect(call.feedback).toContain('mentor review');
  });

  it('persists the new content on the row', async () => {
    const revised = { sections: [{ type: 'hero', headline: 'Reviewed by a mentor' }] };
    draftLandingPage.mockResolvedValue({ content: revised, placeholders: [], unverifiedClaims: [], model: 'm', repaired: false });
    await request(app).post(`/api/admin/landing-pages/${PAGE}/revise`).send({ feedback: 'change it' });
    expect(rows[0].content).toEqual(revised);
  });

  it('409s an external_path row - there is no content to regenerate', async () => {
    rows[0].kind = 'external_path';
    const res = await request(app).post(`/api/admin/landing-pages/${PAGE}/revise`).send({ feedback: 'change it' });
    expect(res.status).toBe(409);
    expect(res.body.error_class).toBe('NotHosted');
  });

  it('404s another tenant\'s page', async () => {
    allowedTenant = 't-other';
    const res = await request(app).post(`/api/admin/landing-pages/${PAGE}/revise`).send({ feedback: 'change it' });
    expect(res.status).toBe(404);
  });
});

describe('the preview is the real page', () => {
  it('renders the same HTML the public route would', async () => {
    const res = await request(app).get(`/api/admin/landing-pages/${PAGE}/preview`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Ship an AI project in six weeks');
  });

  it('is never cached and never indexed - it is unreviewed copy', async () => {
    const res = await request(app).get(`/api/admin/landing-pages/${PAGE}/preview`);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
  });

  it('omits the tracker, so previewing a draft does not pollute the analytics', async () => {
    const res = await request(app).get(`/api/admin/landing-pages/${PAGE}/preview`);
    expect(res.text).not.toContain('/v1/track.js');
  });

  it('reports whether the brand had a real palette in a header, not on the page', async () => {
    // The preview has to look exactly like the live page, so this cannot be written into the HTML.
    const res = await request(app).get(`/api/admin/landing-pages/${PAGE}/preview`);
    expect(res.headers['x-landing-page-branded']).toBe('false');
  });

  it('422s with the reasons when the content will not render', async () => {
    rows[0].content = { sections: [{ type: 'carousel' }] };
    const res = await request(app).get(`/api/admin/landing-pages/${PAGE}/preview`);
    expect(res.status).toBe(422);
    expect(res.body.error_class).toBe('UnrenderableContent');
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('404s another tenant\'s page', async () => {
    allowedTenant = 't-other';
    expect((await request(app).get(`/api/admin/landing-pages/${PAGE}/preview`)).status).toBe(404);
  });
});

describe('publishing', () => {
  it('flips the status, stamps the time and returns the URL', async () => {
    const res = await request(app).post(`/api/admin/landing-pages/${PAGE}/publish`).send({});

    expect(res.status).toBe(200);
    expect(res.body.url).toBe('/lp/colaberry-training/six-week-build');
    expect(rows[0].status).toBe('published');
    expect(rows[0].published_at).toBeInstanceOf(Date);
  });

  it('refuses to publish content that would 404 on the public route', async () => {
    // This is the check that matters: the DB CHECK only proves content is non-empty.
    rows[0].content = { sections: [{ type: 'hero' }] };
    const res = await request(app).post(`/api/admin/landing-pages/${PAGE}/publish`).send({});

    expect(res.status).toBe(422);
    expect(rows[0].status).toBe('draft');
  });

  it('refuses to publish without a slug, because the URL cannot be built', async () => {
    rows[0].slug = null;
    const res = await request(app).post(`/api/admin/landing-pages/${PAGE}/publish`).send({});
    expect(res.status).toBe(400);
    expect(rows[0].status).toBe('draft');
  });

  it('accepts a slug at publish time', async () => {
    rows[0].slug = null;
    const res = await request(app).post(`/api/admin/landing-pages/${PAGE}/publish`).send({ slug: 'november-cohort' });
    expect(res.status).toBe(200);
    expect(res.body.url).toBe('/lp/colaberry-training/november-cohort');
  });

  it('explains a slug clash instead of letting the unique index 500', async () => {
    rows.push(makeRow({ id: OTHER_PAGE, tenant_id: 't-1', brand_id: BRAND, kind: 'hosted', status: 'published', slug: 'six-week-build' }));
    const res = await request(app).post(`/api/admin/landing-pages/${PAGE}/publish`).send({});
    expect(res.status).toBe(409);
    expect(res.body.error_class).toBe('SlugTaken');
    expect(res.body.error).toContain('/lp/colaberry-training/six-week-build');
  });

  it('409s an external_path row', async () => {
    rows[0].kind = 'external_path';
    expect((await request(app).post(`/api/admin/landing-pages/${PAGE}/publish`).send({})).status).toBe(409);
  });

  it('unpublish takes it off the internet but keeps the content', async () => {
    rows[0].status = 'published';
    const res = await request(app).post(`/api/admin/landing-pages/${PAGE}/unpublish`).send({});
    expect(res.status).toBe(200);
    expect(rows[0].status).toBe('draft');
    expect(rows[0].content).toEqual(GOOD_CONTENT);
  });
});

describe('hand-editing', () => {
  it('accepts content that passes the public schema', async () => {
    const res = await request(app).patch(`/api/admin/landing-pages/${PAGE}`)
      .send({ content: { sections: [{ type: 'text', paragraphs: ['Rewritten by hand.'] }] } });
    expect(res.status).toBe(200);
    expect(rows[0].content.sections[0].type).toBe('text');
  });

  it('refuses content with an unsafe link, exactly as the generator path would', async () => {
    const res = await request(app).patch(`/api/admin/landing-pages/${PAGE}`)
      .send({ content: { sections: [{ type: 'cta', headline: 'Go', cta: { label: 'x', href: 'javascript:alert(1)' } }] } });
    expect(res.status).toBe(400);
  });

  it('keeps the legacy path column in step with a new slug', async () => {
    await request(app).patch(`/api/admin/landing-pages/${PAGE}`).send({ slug: 'new-slug' });
    expect(rows[0].path).toBe('/lp/colaberry-training/new-slug');
  });
});

describe('the picker list', () => {
  it('is scoped to one brand, so a campaign cannot point at another brand\'s page', async () => {
    const res = await request(app).get(`/api/admin/landing-pages?brand_id=${BRAND}`);
    expect(res.status).toBe(200);
    expect(LandingPage.findAll.mock.calls[0][0].where).toEqual({ brand_id: BRAND });
  });

  it('hides another tenant\'s rows but keeps the legacy, tenant-less ones', async () => {
    rows.push(makeRow({ id: 'lp-legacy', tenant_id: null, kind: 'external_path', name: 'Legacy path', status: 'draft' }));
    rows.push(makeRow({ id: 'lp-foreign', tenant_id: 't-other', kind: 'hosted', name: 'Theirs', status: 'published' }));

    const res = await request(app).get('/api/admin/landing-pages');
    const ids = res.body.pages.map((p: any) => p.id);

    expect(ids).toContain(PAGE);
    expect(ids).toContain('lp-legacy');
    expect(ids).not.toContain('lp-foreign');
  });

  it('returns nothing at all for a denied scope', async () => {
    scopeMode = 'denied';
    const res = await request(app).get('/api/admin/landing-pages');
    expect(res.body.pages).toEqual([]);
  });

  it('rejects an unknown filter rather than ignoring it', async () => {
    expect((await request(app).get('/api/admin/landing-pages?published=true')).status).toBe(400);
  });
});
