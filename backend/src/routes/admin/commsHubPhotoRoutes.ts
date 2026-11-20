import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { logFailure } from '../campusRoutes';
import { MAX_IMAGE_BYTES, MediaStoreError } from '../../services/media/mediaStore';
import { addPhoto, listPhotos, removePhoto, PhotoRuleError } from '../../services/commsHub/eventPhotos';
import { actorOf } from './commsHubEventRoutes';

/**
 * Event pictures (CH4.1), under /api/admin/comms-hub/events/:id/photos. One file per request, held in
 * memory (never written under an operator-chosen name) and capped by multer at the library's image
 * limit before the body is even fully read.
 */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } });
const Params = z.object({ id: z.string().uuid() }).strict();
const PhotoParams = z.object({ id: z.string().uuid(), photoId: z.string().uuid() }).strict();
const Body = z.object({ alt_text: z.string().trim().min(3, 'Describe the picture for people who cannot see it (3 characters or more).').max(300) }).strict();

function single(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? `That picture is over the ${MAX_IMAGE_BYTES / 1024 / 1024} MB limit.` : 'Send one picture at a time.';
      res.status(413).json({ error: message, error_class: 'MediaTooLarge' });
      return;
    }
    res.status(400).json({ error: 'The upload could not be read.', error_class: 'ValidationError' });
  });
}

function fail(res: Response, err: unknown, event: string): void {
  if (err instanceof PhotoRuleError) { res.status(err.status).json({ error: err.message }); return; }
  if (err instanceof MediaStoreError) { res.status(err.status).json({ error: err.message, error_class: err.errorClass }); return; }
  logFailure(event, err);
  res.status(500).json({ error: 'The picture was not saved. Try again.' });
}

export async function listRoute(req: Request, res: Response): Promise<void> {
  const p = Params.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Not an event id.' }); return; }
  try { res.json({ photos: await listPhotos(p.data.id) }); } catch (err) { fail(res, err, 'comms_hub_photos_list_failed'); }
}

export async function addRoute(req: Request, res: Response): Promise<void> {
  const p = Params.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Not an event id.' }); return; }
  const b = Body.safeParse(req.body ?? {});
  if (!b.success) { res.status(400).json({ error: b.error.issues[0].message, error_class: 'ValidationError' }); return; }
  const file = (req as Request & { file?: { buffer: Buffer; originalname: string } }).file;
  if (!file || !file.buffer?.length) { res.status(400).json({ error: 'Choose a picture to upload.', error_class: 'ValidationError' }); return; }
  try {
    const photos = await addPhoto(p.data.id, { bytes: file.buffer, originalName: file.originalname || null, altText: b.data.alt_text }, actorOf(req));
    res.status(201).json({ photos });
  } catch (err) { fail(res, err, 'comms_hub_photo_add_failed'); }
}

export async function removeRoute(req: Request, res: Response): Promise<void> {
  const p = PhotoParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Not a picture id.' }); return; }
  try { res.json({ photos: await removePhoto(p.data.id, p.data.photoId, actorOf(req)) }); } catch (err) { fail(res, err, 'comms_hub_photo_remove_failed'); }
}

const gate = requireSection('comms_hub');
const router = Router();
router.get('/api/admin/comms-hub/events/:id/photos', gate, listRoute);
router.post('/api/admin/comms-hub/events/:id/photos', gate, single, addRoute);
router.delete('/api/admin/comms-hub/events/:id/photos/:photoId', gate, removeRoute);

export default router;
