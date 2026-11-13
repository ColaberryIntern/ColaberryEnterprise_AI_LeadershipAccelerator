import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { adminTenantScope, scopeAllows } from '../../modules/tenancy/adminScopeBridge';
import { WorkflowError } from '../../services/content/contentWorkflowService';
import { MediaStoreError, MAX_VIDEO_BYTES } from '../../services/media/mediaStore';
import { attachExistingAsset } from '../../services/media/mediaAssetService';
import {
  archiveLibraryAsset,
  createLinkAsset,
  searchLibrary,
  toLibraryView,
  updateLibraryAsset,
  uploadLibraryFile,
} from '../../services/media/mediaLibraryService';

/**
 * The media library API (LIB-2): one place holding both uploaded files and links, searchable,
 * taggable, and usable from the composer without re-uploading anything.
 *
 * THE ROUTES ARE THIN ON PURPOSE. Validation shape lives in Zod here; every rule that could be
 * wrong lives in mediaLibraryService, where it is unit-tested without a request. A route that
 * decides things is a route whose decisions are only ever tested through HTTP.
 *
 * SCOPING IS NOT OPTIONAL. Every handler resolves the admin's tenant scope and refuses anything
 * outside it, and the lookup helper returns null rather than the row, so a handler cannot
 * accidentally operate on an asset it only half-checked.
 *
 * NGINX, AND A TRAP THIS FILE CANNOT FIX. nginx's default client_max_body_size is 1 MB, and the
 * raise in nginx/nginx.conf is a regex location matching ONLY
 * `^/api/admin/content/[0-9a-f-]{36}/media$`. The file-upload route below is a different path, so
 * until an nginx location covers it, an upload over 1 MB is a 413 with an HTML body from the
 * edge - multer's cap never reached, and the error unrecognisable to the client. That file
 * records the same mistake happening twice before (the gov `attest-zip` path "was added AFTER
 * this block and missed the list"). Changing nginx is an escalation-tier change under CLAUDE.md,
 * so it is raised rather than done here.
 */

const router = Router();
const UUID = z.string().uuid();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 1 },
});

/** Multer's own errors are 400s and 413s with a reason, never 500s. */
function uploadSingle(field: string) {
  const handler = upload.single(field);
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        const message = err.code === 'LIMIT_FILE_SIZE'
          ? `That file is over the ${MAX_VIDEO_BYTES / 1024 / 1024} MB limit.`
          : `Upload rejected: ${err.message}.`;
        return void res.status(413).json({ error: message, error_class: 'MediaTooLarge' });
      }
      return void res.status(400).json({ error: 'The upload could not be read.', error_class: 'ValidationError' });
    });
  };
}

function fail(res: Response, err: unknown, event: string): void {
  if (err instanceof WorkflowError) return void res.status(err.status).json({ error: err.message, error_class: err.errorClass });
  if (err instanceof MediaStoreError) return void res.status(err.status).json({ error: err.message, error_class: err.errorClass });
  const e = err as { name?: string; message?: string };
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'media-library', event, outcome: 'failure',
    error_class: e?.name ?? 'Error', context: { message: String(e?.message ?? err).slice(0, 200) },
  }));
  res.status(500).json({ error: 'The library operation failed.', error_class: 'InternalError' });
}

const badRequest = (res: Response, message: string, errorClass = 'ValidationError') =>
  void res.status(400).json({ error: message, error_class: errorClass });

/** An ISO date, or null to clear it. Rejected before any business logic sees it. */
const IsoDate = z.string().datetime().nullable();
const Tags = z.array(z.string()).max(25);

const ListQuery = z.object({
  brand_id: UUID.optional(),
  kind: z.enum(['file', 'link']).optional(),
  mime_family: z.string().regex(/^[a-z]+$/).optional(),
  tag: z.string().trim().min(1).max(40).optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().min(0).optional(),
  include_archived: z.enum(['true', 'false']).optional(),
}).strict();

const LinkBody = z.object({
  brand_id: UUID.nullable().optional(),
  url: z.string().min(1).max(2048),
  alt_text: z.string().trim().min(3).max(300),
  tags: Tags.optional(),
  rights_holder: z.string().trim().max(300).nullable().optional(),
  rights_expires_at: IsoDate.optional(),
}).strict();

const FileBody = z.object({
  brand_id: UUID,
  alt_text: z.string().trim().min(3).max(300),
  // multipart/form-data carries everything as strings, so tags arrive JSON-encoded.
  tags: z.string().optional(),
  rights_holder: z.string().trim().max(300).optional(),
  rights_expires_at: z.string().datetime().optional(),
}).strict();

const PatchBody = z.object({
  alt_text: z.string().trim().min(3).max(300).optional(),
  tags: Tags.optional(),
  rights_holder: z.string().trim().max(300).nullable().optional(),
  rights_expires_at: IsoDate.optional(),
}).strict().refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change.' });

const ExistingBody = z.object({ media_asset_id: UUID }).strict();

/**
 * Load an asset the caller is allowed to touch, or null.
 *
 * Returns null for "does not exist" AND for "exists but is not yours", so the route answers 404
 * either way. A distinct 403 would confirm the id is real and whose it is.
 */
async function loadScopedAsset(req: Request, id: string) {
  const { MediaAsset } = await import('../../models');
  const scope = await adminTenantScope(req.admin);
  const asset = await MediaAsset.findByPk(id);
  if (!asset || !scopeAllows(scope, asset.tenant_id)) return null;
  return asset;
}

type TenantResolution = { ok: true; tenantId: string } | { ok: false; status: number; error: string };

/**
 * Which tenant does this write belong to?
 *
 * `AdminTenantScope` is a union - `denied`, `scoped { tenantIds[] }`, or `migration_open` for a
 * platform super admin - and NONE of them carries a single tenant id. So the tenant is derived
 * rather than read off the scope:
 *
 *   - given a brand, the BRAND's tenant is the answer, checked against the scope. A brand knows
 *     which tenant it belongs to; trusting a client-supplied tenant would not be a check at all.
 *   - with no brand, only an operator scoped to exactly one tenant is unambiguous. A super admin
 *     (`migration_open`) has every tenant available and therefore no implied one, which is why
 *     they must name a brand rather than having one guessed for them.
 */
async function resolveWriteTenant(req: Request, brandId: string | null | undefined): Promise<TenantResolution> {
  const scope = await adminTenantScope(req.admin);
  if (scope.mode === 'denied') return { ok: false, status: 403, error: 'No tenant in scope.' };

  if (brandId) {
    const { Brand } = await import('../../models');
    const brand = await Brand.findByPk(brandId);
    // Same answer for "no such brand" and "not yours", so this cannot be used to discover which
    // brand ids exist.
    if (!brand || !scopeAllows(scope, brand.tenant_id)) {
      return { ok: false, status: 404, error: 'That brand is not available.' };
    }
    return { ok: true, tenantId: brand.tenant_id };
  }

  if (scope.mode === 'scoped' && scope.tenantIds.length === 1) {
    return { ok: true, tenantId: scope.tenantIds[0] };
  }
  return {
    ok: false,
    status: 400,
    error: 'Say which brand this belongs to: your access covers more than one.',
  };
}

router.get('/api/admin/marketing/library', requireAdmin, async (req: Request, res: Response) => {
  const query = ListQuery.safeParse(req.query ?? {});
  if (!query.success) return badRequest(res, 'Those filters are not valid.');
  try {
    const tenant = await resolveWriteTenant(req, query.data.brand_id ?? null);
    if (!tenant.ok) return void res.status(tenant.status).json({ error: tenant.error, error_class: 'Forbidden' });
    const page = await searchLibrary({
      tenantId: tenant.tenantId,
      brandId: query.data.brand_id,
      kind: query.data.kind,
      mimeFamily: query.data.mime_family,
      tag: query.data.tag,
      q: query.data.q,
      limit: query.data.limit,
      offset: query.data.offset,
      includeArchived: query.data.include_archived === 'true',
    });
    res.json(page);
  } catch (err) { fail(res, err, 'library_list_failed'); }
});

router.post('/api/admin/marketing/library/link', requireAdmin, async (req: Request, res: Response) => {
  const body = LinkBody.safeParse(req.body ?? {});
  if (!body.success) return badRequest(res, 'A link and a short description are required.');
  try {
    const tenant = await resolveWriteTenant(req, body.data.brand_id ?? null);
    if (!tenant.ok) return void res.status(tenant.status).json({ error: tenant.error, error_class: 'Forbidden' });
    const asset = await createLinkAsset({
      tenantId: tenant.tenantId,
      brandId: body.data.brand_id ?? null,
      url: body.data.url,
      altText: body.data.alt_text,
      tags: body.data.tags,
      rightsHolder: body.data.rights_holder ?? null,
      rightsExpiresAt: body.data.rights_expires_at ? new Date(body.data.rights_expires_at) : null,
      uploadedBy: req.admin?.sub ?? null,
    });
    res.status(201).json({ asset: toLibraryView(asset) });
  } catch (err) { fail(res, err, 'library_link_failed'); }
});

router.post('/api/admin/marketing/library/file', requireAdmin, uploadSingle('file'), async (req: Request, res: Response) => {
  const body = FileBody.safeParse(req.body ?? {});
  if (!body.success) return badRequest(res, 'A brand and a short description are required.');
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) return badRequest(res, 'Attach a file in the "file" field.');

  let tags: string[] | undefined;
  if (body.data.tags !== undefined) {
    try {
      const parsed = JSON.parse(body.data.tags);
      if (!Array.isArray(parsed)) throw new Error('not an array');
      tags = parsed.map(String);
    } catch {
      return badRequest(res, 'Tags must be a JSON array of strings.');
    }
  }

  try {
    const tenant = await resolveWriteTenant(req, body.data.brand_id);
    if (!tenant.ok) return void res.status(tenant.status).json({ error: tenant.error, error_class: 'Forbidden' });
    const { asset, reused } = await uploadLibraryFile({
      tenantId: tenant.tenantId,
      brandId: body.data.brand_id,
      bytes: file.buffer,
      claimedMimeType: file.mimetype,
      originalFilename: file.originalname ?? null,
      altText: body.data.alt_text,
      tags,
      rightsHolder: body.data.rights_holder ?? null,
      rightsExpiresAt: body.data.rights_expires_at ? new Date(body.data.rights_expires_at) : null,
      uploadedBy: req.admin?.sub ?? null,
    });
    // 200 on reuse, 201 on create: the client can tell "already had it" from "added it", and
    // re-uploading the same bytes is a success rather than a conflict.
    res.status(reused ? 200 : 201).json({ asset: toLibraryView(asset), reused });
  } catch (err) { fail(res, err, 'library_upload_failed'); }
});

router.patch('/api/admin/marketing/library/:id', requireAdmin, async (req: Request, res: Response) => {
  const id = UUID.safeParse(req.params.id);
  if (!id.success) return badRequest(res, 'Asset id must be a UUID.');
  const body = PatchBody.safeParse(req.body ?? {});
  if (!body.success) return badRequest(res, 'Those changes are not valid.');
  try {
    const asset = await loadScopedAsset(req, id.data);
    if (!asset) return void res.status(404).json({ error: 'That asset is not in the library.', error_class: 'NotFound' });
    const updated = await updateLibraryAsset(asset, {
      altText: body.data.alt_text,
      tags: body.data.tags,
      rightsHolder: body.data.rights_holder,
      rightsExpiresAt: body.data.rights_expires_at === undefined
        ? undefined
        : (body.data.rights_expires_at === null ? null : new Date(body.data.rights_expires_at)),
    });
    res.json({ asset: toLibraryView(updated) });
  } catch (err) { fail(res, err, 'library_update_failed'); }
});

router.post('/api/admin/marketing/library/:id/archive', requireAdmin, async (req: Request, res: Response) => {
  const id = UUID.safeParse(req.params.id);
  if (!id.success) return badRequest(res, 'Asset id must be a UUID.');
  try {
    const asset = await loadScopedAsset(req, id.data);
    if (!asset) return void res.status(404).json({ error: 'That asset is not in the library.', error_class: 'NotFound' });
    res.json({ asset: toLibraryView(await archiveLibraryAsset(asset)) });
  } catch (err) { fail(res, err, 'library_archive_failed'); }
});

/**
 * Attach something already in the library to a post (LIB-4).
 *
 * Lives here rather than in contentMediaRoutes because it is a library operation: it creates no
 * asset and uploads nothing. The service refuses a link with a 422 that says a link publishes as
 * a link post.
 */
router.post('/api/admin/content/:id/media/existing', requireAdmin, async (req: Request, res: Response) => {
  const id = UUID.safeParse(req.params.id);
  if (!id.success) return badRequest(res, 'Content id must be a UUID.');
  const body = ExistingBody.safeParse(req.body ?? {});
  if (!body.success) return badRequest(res, 'media_asset_id is required and must be a UUID.');
  try {
    const { ContentItem } = await import('../../models');
    const scope = await adminTenantScope(req.admin);
    const item = await ContentItem.findByPk(id.data);
    if (!item || !scopeAllows(scope, item.tenant_id)) {
      return void res.status(404).json({ error: 'Content item not found', error_class: 'NotFound' });
    }
    const attached = await attachExistingAsset({ contentItemId: id.data, mediaAssetId: body.data.media_asset_id });
    res.status(attached.alreadyAttached ? 200 : 201).json({ media: attached });
  } catch (err) { fail(res, err, 'library_attach_existing_failed'); }
});

export default router;
