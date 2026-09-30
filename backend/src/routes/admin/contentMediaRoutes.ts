import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { adminTenantScope, scopeAllows } from '../../modules/tenancy/adminScopeBridge';
import { WorkflowError } from '../../services/content/contentWorkflowService';
import { MediaStoreError, MAX_VIDEO_BYTES } from '../../services/media/mediaStore';
import { attachMedia, detachMedia, listItemMedia } from '../../services/media/mediaAssetService';

/**
 * Attach media to a content item (ESC-003, Option A).
 *
 * MULTER KEEPS THE FILE IN MEMORY, deliberately. The existing upload configs write straight to
 * disk under a multer-chosen name; here the bytes must be hashed, sniffed and EXIF-stripped
 * BEFORE they get a name, because the name IS the hash. Memory storage hands the service a
 * Buffer, the service hands the store the normalised bytes, and nothing raw ever touches the
 * volume. The cost is one file's bytes in RAM per request, bounded by the 200 MB cap; the
 * backend runs with a 512 MB heap ceiling (docker-compose), so two concurrent max-size videos
 * would be tight. Accepted for now and stated; a streaming path is the follow-up if video
 * uploads become routine.
 */

const router = Router();
const UUID = z.string().uuid();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 1 },
});

/** Multer's own errors are 400s with a reason, never 500s. */
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

const AttachBody = z.object({
  alt_text: z.string().trim().min(3).max(300),
}).strict();

function fail(res: Response, err: unknown, event: string): void {
  if (err instanceof WorkflowError) return void res.status(err.status).json({ error: err.message, error_class: err.errorClass });
  if (err instanceof MediaStoreError) return void res.status(err.status).json({ error: err.message, error_class: err.errorClass });
  const e = err as { name?: string; message?: string };
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'media', event, outcome: 'failure',
    error_class: e?.name ?? 'Error', context: { message: String(e?.message ?? err).slice(0, 200) },
  }));
  res.status(500).json({ error: 'The media operation failed.', error_class: 'InternalError' });
}

async function loadScopedItem(req: Request, id: string) {
  const { ContentItem } = await import('../../models');
  const scope = await adminTenantScope(req.admin);
  const item = await ContentItem.findByPk(id);
  if (!item || !scopeAllows(scope, item.tenant_id)) return null;
  return item;
}

router.get('/api/admin/content/:id/media', requireAdmin, async (req: Request, res: Response) => {
  const id = UUID.safeParse(req.params.id);
  if (!id.success) return void res.status(400).json({ error: 'Content id must be a UUID', error_class: 'ValidationError' });
  try {
    const item = await loadScopedItem(req, id.data);
    if (!item) return void res.status(404).json({ error: 'Content item not found', error_class: 'NotFound' });
    res.json({ media: await listItemMedia(id.data) });
  } catch (err) { fail(res, err, 'media_list_failed'); }
});

router.post('/api/admin/content/:id/media', requireAdmin, uploadSingle('file'), async (req: Request, res: Response) => {
  const id = UUID.safeParse(req.params.id);
  if (!id.success) return void res.status(400).json({ error: 'Content id must be a UUID', error_class: 'ValidationError' });
  const body = AttachBody.safeParse(req.body ?? {});
  if (!body.success) {
    return void res.status(400).json({
      error: 'Describe the image for people who cannot see it (alt text, 3 to 300 characters).',
      error_class: 'AltTextRequired',
    });
  }
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) return void res.status(400).json({ error: 'Attach a file in the "file" field.', error_class: 'ValidationError' });

  try {
    const item = await loadScopedItem(req, id.data);
    if (!item) return void res.status(404).json({ error: 'Content item not found', error_class: 'NotFound' });
    const attached = await attachMedia({
      contentItemId: id.data,
      bytes: file.buffer,
      claimedMimeType: file.mimetype,
      originalFilename: file.originalname ?? null,
      altText: body.data.alt_text,
      uploadedBy: req.admin?.sub ?? null,
    });
    res.status(201).json({ media: attached });
  } catch (err) { fail(res, err, 'media_attach_failed'); }
});

router.delete('/api/admin/content/:id/media/:assetId', requireAdmin, async (req: Request, res: Response) => {
  const id = UUID.safeParse(req.params.id);
  const assetId = UUID.safeParse(req.params.assetId);
  if (!id.success || !assetId.success) return void res.status(400).json({ error: 'Ids must be UUIDs', error_class: 'ValidationError' });
  try {
    const item = await loadScopedItem(req, id.data);
    if (!item) return void res.status(404).json({ error: 'Content item not found', error_class: 'NotFound' });
    await detachMedia(id.data, assetId.data);
    res.json({ media: await listItemMedia(id.data) });
  } catch (err) { fail(res, err, 'media_detach_failed'); }
});

export default router;
