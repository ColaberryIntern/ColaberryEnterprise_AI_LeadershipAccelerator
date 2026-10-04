import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { adminTenantScope, scopeAllows } from '../../modules/tenancy/adminScopeBridge';
import { WorkflowError } from '../../services/content/contentWorkflowService';
import { landingPageContentSchema } from '../../schemas/landingPageContentSchema';
import type LandingPage from '../../models/LandingPage';

/**
 * Landing page authoring API — brief in, reviewable page out.
 *
 * THE FLOW THIS IMPLEMENTS, in Ali's words: "takes input like sohail gave me... produced me the
 * attached landing page. The user should be able to address things that need to be updated...
 * Once the image is approved, we will build the actual landing page and save the link."
 *
 *   POST   /api/admin/landing-pages              a brief becomes a draft row with generated content
 *   POST   /api/admin/landing-pages/:id/revise   feedback becomes a new revision of that content
 *   PATCH  /api/admin/landing-pages/:id          hand-edit the content, slug, name or site
 *   GET    /api/admin/landing-pages/:id/preview  the REAL page, rendered, before it is public
 *   POST   /api/admin/landing-pages/:id/publish  make it live at /lp/:brand/:slug
 *   POST   /api/admin/landing-pages/:id/unpublish  take it back off the internet
 *   GET    /api/admin/landing-pages?brand_id=    the picker's list, scoped to one brand
 *
 * THE PREVIEW IS THE PAGE, NOT A PICTURE OF IT. It runs the same `renderLandingPage` the public
 * route runs, on the same row, so what gets approved is what gets served. A separate preview
 * renderer would be a second source of truth about the thing being approved, and the first time
 * the two disagreed the approval would be meaningless. It is admin-gated and `no-store`: a draft
 * is unreviewed copy and must not be reachable or cached for anyone else.
 *
 * ONLY `hosted` ROWS ARE TOUCHED HERE. The 17 legacy `external_path` rows are paths on sites
 * hosted elsewhere; they are listed (the composer still needs to pick them as destinations) but
 * they cannot be revised, previewed or published, because there is no content to render.
 *
 * TENANCY IS RESOLVED BEFORE ANY ROW IS READ, the rule brandRoutes states: the services take a
 * bare id and check nothing, so a foreign tenant's row must be invisible here - a 404, never a
 * 403, because a 403 confirms the row exists.
 */

const router = Router();
const UUID = z.string().uuid();
const NOT_FOUND = { error: 'Landing page not found', error_class: 'NotFound' };

/** Lower-case, dash-separated, and the same shape the public route will accept. */
const slugSchema = z.string().trim().regex(
  /^[a-z0-9][a-z0-9-]{0,159}$/,
  'A slug is lower-case letters, numbers and dashes, and cannot start with a dash.',
);

const CreateSchema = z.object({
  brand_id: UUID,
  /** The brief, in whatever shape it arrived. */
  source: z.string().trim().min(40).max(40_000),
  name: z.string().trim().min(1).max(100),
  slug: slugSchema.optional(),
  /** The web property this page belongs to - becomes the tracker's `data-site`. */
  site_slug: z.string().trim().regex(/^[a-z0-9-]{1,64}$/).optional(),
}).strict();

const ReviseSchema = z.object({
  feedback: z.string().trim().min(3).max(4000),
}).strict();

const PatchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  slug: slugSchema.optional(),
  site_slug: z.string().trim().regex(/^[a-z0-9-]{1,64}$/).nullable().optional(),
  content: landingPageContentSchema.optional(),
}).strict();

const PublishSchema = z.object({
  /** Required if the row has no slug yet; the URL cannot be built without one. */
  slug: slugSchema.optional(),
}).strict();

function bad(res: Response, details: unknown): void {
  res.status(400).json({ error: 'Validation failed', error_class: 'ValidationError', details });
}

/**
 * Report a failure to the caller AND to the log.
 *
 * A `WorkflowError` used to return silently - it is an expected, well-described failure, so it
 * went to the browser and nowhere else. That is exactly how the first real "Build the page" in
 * production became undiagnosable: `POST /api/admin/landing-pages` answered 502, the operator saw
 * a toast, and there was no server-side record of WHY. An expected failure is still a failure
 * somebody has to explain; "the user can see it" is not a substitute for being able to read it
 * back an hour later. Both kinds are logged now, with the level separating them.
 */
function fail(res: Response, err: unknown, event: string): void {
  if (err instanceof WorkflowError) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'landing-pages', event,
      outcome: 'failure', error_class: err.errorClass,
      context: { status: err.status, message: String(err.message).slice(0, 400) },
    }));
    res.status(err.status).json({ error: err.message, error_class: err.errorClass });
    return;
  }
  const e = err as { name?: string; message?: string };
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'landing-pages', event,
    outcome: 'failure', error_class: e?.name ?? 'Error',
    context: { message: String(e?.message ?? e).slice(0, 200) },
  }));
  res.status(500).json({ error: 'Landing page operation failed', error_class: 'InternalError' });
}

/** A row the caller may see, or null. Scope is checked before the row is used. */
async function visiblePage(req: Request, id: string): Promise<LandingPage | null> {
  const scope = await adminTenantScope(req.admin);
  if (scope.mode === 'denied') return null;
  const { LandingPage: Model } = await import('../../models');
  const page = await Model.findByPk(id);
  if (!page) return null;
  // A legacy row has no tenant at all. Those are visible to any admin: they predate tenancy and
  // the campaign destination dropdown has always listed them.
  if (page.tenant_id !== null && !scopeAllows(scope, page.tenant_id)) return null;
  return page as LandingPage;
}

function summarise(page: LandingPage) {
  return {
    id: page.id,
    name: page.name,
    kind: page.kind,
    status: page.status,
    slug: page.slug,
    path: page.path,
    brand_id: page.brand_id,
    site_slug: page.site_slug,
    published_at: page.published_at,
    repo_path: page.repo_path,
    repo_commit: page.repo_commit,
    updated_at: page.updated_at,
  };
}

/** A brief becomes a draft row. Generated, not published - it has a URL only once approved. */
router.post('/api/admin/landing-pages', requireAdmin, async (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.flatten());
  try {
    const scope = await adminTenantScope(req.admin);
    if (scope.mode === 'denied') return void res.status(404).json(NOT_FOUND);

    const { Brand, LandingPage: Model } = await import('../../models');
    const brand = await Brand.findByPk(parsed.data.brand_id);
    if (!brand || !scopeAllows(scope, brand.tenant_id)) {
      return void res.status(404).json({ error: 'Brand not found', error_class: 'NotFound' });
    }

    const { draftLandingPage } = await import('../../services/marketing/landingPageDraftService');
    const draft = await draftLandingPage({ source: parsed.data.source, brandId: parsed.data.brand_id });

    // `path` is NOT NULL and UNIQUE on this table from its path-registry days. A hosted page's
    // real address is /lp/:brand/:slug, so the legacy column is filled with that same path to
    // keep the old uniqueness meaningful instead of inventing a placeholder.
    const slug = parsed.data.slug ?? null;
    const page = await Model.create({
      tenant_id: brand.tenant_id,
      brand_id: brand.id,
      site_slug: parsed.data.site_slug ?? null,
      kind: 'hosted',
      status: 'draft',
      name: parsed.data.name,
      path: slug ? `/lp/${brand.slug}/${slug}` : `/lp/${brand.slug}/draft-${Date.now()}`,
      slug,
      content: draft.content,
      created_by: req.admin?.sub ?? null,
      is_marketing_enabled: true,
    } as never);

    res.status(201).json({
      page: summarise(page as LandingPage),
      content: draft.content,
      // The holes and the claims nothing supports, surfaced at creation rather than discovered
      // after publishing. These are the operator's to resolve; nothing is silently removed.
      placeholders: draft.placeholders,
      unverifiedClaims: draft.unverifiedClaims,
      model: draft.model,
      repaired: draft.repaired,
      droppedSections: draft.droppedSections,
    });
  } catch (err) { fail(res, err, 'landing_page_create_failed'); }
});

/** Feedback becomes a new revision of the content. The brief is re-sent, so this is a change. */
router.post('/api/admin/landing-pages/:id/revise', requireAdmin, async (req: Request, res: Response) => {
  const parsed = ReviseSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.flatten());
  try {
    const page = await visiblePage(req, String(req.params.id));
    if (!page) return void res.status(404).json(NOT_FOUND);
    if (page.kind !== 'hosted') {
      return void res.status(409).json({ error: 'This is an external path, not a page this platform builds.', error_class: 'NotHosted' });
    }
    if (!page.brand_id) {
      return void res.status(409).json({ error: 'This page has no brand, so it cannot be regenerated.', error_class: 'NoBrand' });
    }

    const source = String((req.body as { source?: unknown }).source ?? '').trim();
    const { draftLandingPage } = await import('../../services/marketing/landingPageDraftService');
    const draft = await draftLandingPage({
      // The original brief is not stored on the row, so the caller re-sends it. Without it the
      // model would rewrite from the current page alone and drift away from the real brief.
      source: source.length >= 40 ? source : JSON.stringify(page.content),
      brandId: page.brand_id,
      previous: page.content as never,
      feedback: parsed.data.feedback,
    });

    await page.update({ content: draft.content });
    res.json({
      page: summarise(page),
      content: draft.content,
      placeholders: draft.placeholders,
      unverifiedClaims: draft.unverifiedClaims,
      model: draft.model,
      repaired: draft.repaired,
      droppedSections: draft.droppedSections,
    });
  } catch (err) { fail(res, err, 'landing_page_revise_failed'); }
});

/** Hand-edit. The content goes through the same schema the public renderer parses. */
router.patch('/api/admin/landing-pages/:id', requireAdmin, async (req: Request, res: Response) => {
  const parsed = PatchSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.flatten());
  try {
    const page = await visiblePage(req, String(req.params.id));
    if (!page) return void res.status(404).json(NOT_FOUND);
    if (page.kind !== 'hosted') {
      return void res.status(409).json({ error: 'This is an external path, not a page this platform builds.', error_class: 'NotHosted' });
    }

    const patch: Record<string, unknown> = { ...parsed.data };
    // Keep the legacy `path` column in step with the slug, so the table's own uniqueness still
    // describes where the page lives.
    if (parsed.data.slug && page.brand_id) {
      const { Brand } = await import('../../models');
      const brand = await Brand.findByPk(page.brand_id);
      if (brand) patch.path = `/lp/${brand.slug}/${parsed.data.slug}`;
    }

    await page.update(patch as never);
    res.json({ page: summarise(page) });
  } catch (err) { fail(res, err, 'landing_page_patch_failed'); }
});

/**
 * The page itself, rendered, before anyone else can see it.
 *
 * Same renderer and same row as the public route, so approval means something. `no-store` and
 * admin-gated, because this is the one way to see unpublished copy.
 */
router.get('/api/admin/landing-pages/:id/preview', requireAdmin, async (req: Request, res: Response) => {
  try {
    const page = await visiblePage(req, String(req.params.id));
    if (!page) return void res.status(404).json(NOT_FOUND);
    if (page.kind !== 'hosted' || !page.brand_id) {
      return void res.status(409).json({ error: 'There is no page here to render.', error_class: 'NotHosted' });
    }

    const { Brand } = await import('../../models');
    const brand = await Brand.findByPk(page.brand_id);
    if (!brand) return void res.status(409).json({ error: 'Brand not found', error_class: 'NoBrand' });

    const { parseLandingPageContent } = await import('../../schemas/landingPageContentSchema');
    const content = parseLandingPageContent(page.content);
    if (!content.ok) {
      // Said plainly, with the reasons, because this is where it gets fixed.
      return void res.status(422).json({
        error: 'This page cannot be rendered yet.', error_class: 'UnrenderableContent', details: content.problems,
      });
    }

    const { renderLandingPage } = await import('../../services/marketing/landingPageRenderer');
    const { html, branded } = renderLandingPage({
      content: content.content,
      brand: { name: brand.name, default_theme_key: brand.default_theme_key },
      // The tracker is deliberately omitted from a preview: an operator checking their own draft
      // twenty times must not land in the analytics as twenty visits to a page nobody can reach.
      siteSlug: null,
      pageUrl: `${String(req.headers['x-forwarded-proto'] ?? 'https')}://${String(req.headers.host ?? '')}/lp/${brand.slug}/${page.slug ?? 'preview'}`,
    });

    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https: data:; base-uri 'none'; form-action 'none'");
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Said in a header rather than in the HTML: the preview must look exactly like the real
    // page, so the fact that this brand has no agreed palette cannot be written onto it.
    res.setHeader('X-Landing-Page-Branded', branded ? 'true' : 'false');
    res.status(200).type('html').send(html);
  } catch (err) { fail(res, err, 'landing_page_preview_failed'); }
});

/** Make it live. Everything the public route requires is checked here, not discovered there. */
router.post('/api/admin/landing-pages/:id/publish', requireAdmin, async (req: Request, res: Response) => {
  const parsed = PublishSchema.safeParse(req.body ?? {});
  if (!parsed.success) return bad(res, parsed.error.flatten());
  try {
    const page = await visiblePage(req, String(req.params.id));
    if (!page) return void res.status(404).json(NOT_FOUND);
    if (page.kind !== 'hosted' || !page.brand_id) {
      return void res.status(409).json({ error: 'Only a page this platform built can be published.', error_class: 'NotHosted' });
    }

    const slug = parsed.data.slug ?? page.slug;
    if (!slug) {
      return void res.status(400).json({ error: 'Give the page a slug; the URL cannot be built without one.', error_class: 'ValidationError' });
    }

    const { parseLandingPageContent } = await import('../../schemas/landingPageContentSchema');
    const content = parseLandingPageContent(page.content);
    if (!content.ok) {
      // The DB CHECK only proves content is non-empty. This is what proves it will render, and
      // it runs BEFORE the status flips - a published row that 404s is the failure to avoid.
      return void res.status(422).json({
        error: 'This page cannot be published until it renders.', error_class: 'UnrenderableContent', details: content.problems,
      });
    }

    const { Brand, LandingPage: Model } = await import('../../models');
    const brand = await Brand.findByPk(page.brand_id);
    if (!brand) return void res.status(409).json({ error: 'Brand not found', error_class: 'NoBrand' });

    // The partial unique index would refuse this anyway; checking first turns a 500 into a
    // sentence the operator can act on.
    //
    // The current row is excluded IN THE QUERY, not by comparing ids afterwards. Fetching one
    // row and checking whether it happens to be this one is a coin flip: re-publishing a page
    // that already holds its own slug matches two rows, and if the database returns this one
    // the real clash goes unseen. Found by a test that seeded exactly that pair.
    const { Op } = await import('sequelize');
    const clash = await Model.findOne({
      where: { brand_id: page.brand_id, slug, kind: 'hosted', id: { [Op.ne]: page.id } },
    });
    if (clash) {
      return void res.status(409).json({
        error: `This brand already has a page at /lp/${brand.slug}/${slug}.`, error_class: 'SlugTaken',
      });
    }

    await page.update({
      slug, status: 'published', published_at: new Date(), path: `/lp/${brand.slug}/${slug}`,
    } as never);

    res.json({ page: summarise(page), url: `/lp/${brand.slug}/${slug}` });
  } catch (err) { fail(res, err, 'landing_page_publish_failed'); }
});

/** Take it back off the internet. The row and its content are kept. */
router.post('/api/admin/landing-pages/:id/unpublish', requireAdmin, async (req: Request, res: Response) => {
  try {
    const page = await visiblePage(req, String(req.params.id));
    if (!page) return void res.status(404).json(NOT_FOUND);
    if (page.kind !== 'hosted') {
      return void res.status(409).json({ error: 'This is an external path, not a page this platform builds.', error_class: 'NotHosted' });
    }
    await page.update({ status: 'draft' } as never);
    res.json({ page: summarise(page) });
  } catch (err) { fail(res, err, 'landing_page_unpublish_failed'); }
});

/**
 * The list the composer's picker reads. Scoped to one brand on purpose: Ali's rule is that a
 * page "only shows for each brand", and a picker offering another brand's page is how a campaign
 * ends up pointing somewhere it has no business pointing.
 */
const ListSchema = z.object({
  brand_id: UUID.optional(),
  kind: z.enum(['hosted', 'external_path']).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
}).strict();

router.get('/api/admin/landing-pages', requireAdmin, async (req: Request, res: Response) => {
  const parsed = ListSchema.safeParse(req.query);
  if (!parsed.success) return bad(res, parsed.error.flatten());
  try {
    const scope = await adminTenantScope(req.admin);
    if (scope.mode === 'denied') return void res.json({ pages: [] });

    const { LandingPage: Model } = await import('../../models');
    const where: Record<string, unknown> = {};
    if (parsed.data.brand_id) where.brand_id = parsed.data.brand_id;
    if (parsed.data.kind) where.kind = parsed.data.kind;
    if (parsed.data.status) where.status = parsed.data.status;

    const rows = await Model.findAll({ where, order: [['updated_at', 'DESC']], limit: 200 });
    // Filtered after the query, like the row checks elsewhere: a legacy row carries no tenant
    // and stays visible, anything owned by another tenant does not.
    const visible = (rows as LandingPage[]).filter(
      (r) => r.tenant_id === null || scopeAllows(scope, r.tenant_id),
    );
    res.json({ pages: visible.map(summarise) });
  } catch (err) { fail(res, err, 'landing_page_list_failed'); }
});

export default router;
