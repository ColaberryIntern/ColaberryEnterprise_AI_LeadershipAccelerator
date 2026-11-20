import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { logFailure } from '../campusRoutes';
import { MAX_IMAGE_BYTES, MediaStoreError } from '../../services/media/mediaStore';
import { PromptGuardError } from '../../services/commsHub/thumbnails/stylePrompts';
import { JobBusyError, getJob, startJob } from '../../services/commsHub/thumbnails/thumbnailJobs';
import { ChangeNotUnderstoodError, planChange } from '../../services/commsHub/thumbnails/thumbnailChange';
import {
  STUDIO_STYLES, StudioError, THUMB_SIZES, buildRequest, chooseOption, editableEvent, generateBatch, isFamily, isTemplate,
  listOptions, optionPng, uploadOwn, type StudioStyle,
} from '../../services/commsHub/thumbnails/thumbnailStudio';
import CommsHubThumbnail from '../../models/CommsHubThumbnail';
import { actorOf } from './commsHubEventRoutes';

/**
 * The thumbnail studio (CH4.4), under /api/admin/comms-hub/events/:id/thumbnails. Generating starts a
 * background job (202 + job) that the studio polls; everything else answers directly.
 */
const Params = z.object({ id: z.string().uuid() }).strict();
const ThumbParams = z.object({ id: z.string().uuid(), thumbId: z.string().uuid() }).strict();
const JobParams = z.object({ id: z.string().uuid(), jobId: z.string().uuid() }).strict();
const GenerateBody = z.object({
  style: z.enum(STUDIO_STYLES as [StudioStyle, ...StudioStyle[]]),
  headline: z.string().trim().min(1, 'Add a headline.').max(80, 'Keep the headline to 80 characters.'),
  supporting: z.string().trim().max(120, 'Keep the supporting line to 120 characters.').nullable().optional(),
  show_when: z.boolean(),
}).strict();
const ChangeBody = z.object({ request: z.string().trim().min(3, 'Say what to change.').max(300, 'Keep the request to 300 characters.') }).strict();
const SizeQuery = z.object({ size: z.enum(THUMB_SIZES as [string, ...string[]]) });
const UploadBody = z.object({ alt_text: z.string().trim().min(3, 'Describe the picture for people who cannot see it (3 characters or more).').max(300) }).strict();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES + 1, files: 1 } });
function single(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      res.status(413).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `That picture is over the ${MAX_IMAGE_BYTES / 1024 / 1024} MB limit.` : 'Send one picture at a time.', error_class: 'MediaTooLarge' });
      return;
    }
    res.status(400).json({ error: 'The upload could not be read.', error_class: 'ValidationError' });
  });
}

function fail(res: Response, err: unknown, event: string): void {
  if (err instanceof StudioError) { res.status(err.status).json({ error: err.message }); return; }
  if (err instanceof PromptGuardError) { res.status(400).json({ error: err.message, error_class: 'ValidationError' }); return; }
  if (err instanceof ChangeNotUnderstoodError) { res.status(422).json({ error: err.message, error_class: 'NotUnderstood' }); return; }
  if (err instanceof JobBusyError) { res.status(409).json({ error: err.message }); return; }
  if (err instanceof MediaStoreError) { res.status(err.status).json({ error: err.message, error_class: err.errorClass }); return; }
  logFailure(event, err);
  res.status(500).json({ error: 'Something went wrong with the thumbnail. Try again.' });
}

const jobLog = (err: unknown): void => { if (!(err instanceof PromptGuardError)) logFailure('comms_hub_thumbnail_job_failed', err); };

export async function listRoute(req: Request, res: Response): Promise<void> {
  const p = Params.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Not an event id.' }); return; }
  try { res.json(await listOptions(p.data.id)); } catch (err) { fail(res, err, 'comms_hub_thumbnails_list_failed'); }
}

export async function generateRoute(req: Request, res: Response): Promise<void> {
  const p = Params.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Not an event id.' }); return; }
  const b = GenerateBody.safeParse(req.body ?? {});
  if (!b.success) { res.status(400).json({ error: b.error.issues[0].message, error_class: 'ValidationError' }); return; }
  try {
    const event = await editableEvent(p.data.id);
    const gen = await buildRequest(event, { headline: b.data.headline, supporting: b.data.supporting || null, showWhen: b.data.show_when }, actorOf(req));
    const job = startJob(event.id, () => generateBatch(gen, b.data.style), jobLog, isFamily(b.data.style) ? 'ai' : 'template');
    res.status(202).json({ job });
  } catch (err) { fail(res, err, 'comms_hub_thumbnails_generate_failed'); }
}

export async function jobRoute(req: Request, res: Response): Promise<void> {
  const p = JobParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Not a job id.' }); return; }
  const job = getJob(p.data.id, p.data.jobId);
  if (!job) { res.status(404).json({ error: 'That job is no longer known. Reload the options.' }); return; }
  res.json({ job });
}

export async function changeRoute(req: Request, res: Response): Promise<void> {
  const p = ThumbParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Not a thumbnail id.' }); return; }
  const b = ChangeBody.safeParse(req.body ?? {});
  if (!b.success) { res.status(400).json({ error: b.error.issues[0].message, error_class: 'ValidationError' }); return; }
  try {
    const event = await editableEvent(p.data.id);
    const row = await CommsHubThumbnail.findOne({ where: { id: p.data.thumbId, event_id: event.id } });
    if (!row || !row.asset_16x9_id) throw new StudioError('That thumbnail was not found for this event.', 404);
    const style = row.style_family;
    if (row.source === 'upload' || !(isTemplate(style) || isFamily(style))) throw new StudioError('Changes work on pictures the studio made. Upload a new picture instead.', 409);
    const inputs = (row.inputs ?? {}) as Record<string, unknown>;
    const base = {
      source: row.source as 'template' | 'ai', style,
      headline: typeof inputs.headline === 'string' ? inputs.headline : event.title,
      supporting: typeof inputs.supporting === 'string' ? inputs.supporting : null,
      showWhen: inputs.show_when === undefined ? inputs.badge != null : inputs.show_when === true,
    };
    const plan = await planChange(base, b.data.request);
    const gen = await buildRequest(event, { headline: plan.headline, supporting: plan.supporting, showWhen: plan.showWhen, artNote: plan.artNote }, actorOf(req));
    const job = startJob(event.id, () => generateBatch(gen, plan.style, 1), jobLog, isFamily(plan.style) ? 'ai' : 'template');
    res.status(202).json({ job, summary: plan.summary });
  } catch (err) { fail(res, err, 'comms_hub_thumbnail_change_failed'); }
}

export async function useRoute(req: Request, res: Response): Promise<void> {
  const p = ThumbParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Not a thumbnail id.' }); return; }
  try {
    const e = await chooseOption(p.data.id, p.data.thumbId, actorOf(req));
    res.json({ thumbnail_id: e.thumbnail_id });
  } catch (err) { fail(res, err, 'comms_hub_thumbnail_use_failed'); }
}

export async function downloadRoute(req: Request, res: Response): Promise<void> {
  const p = ThumbParams.safeParse(req.params);
  const q = SizeQuery.safeParse(req.query);
  if (!p.success || !q.success) { res.status(400).json({ error: 'Say which thumbnail and size (16x9, 1x1 or 3x1).' }); return; }
  try {
    const png = await optionPng(p.data.id, p.data.thumbId, q.data.size as (typeof THUMB_SIZES)[number]);
    res.set({ 'Content-Type': 'image/png', 'Content-Length': String(png.length), 'Content-Disposition': `attachment; filename="thumbnail-${q.data.size}.png"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    res.status(200).end(png);
  } catch (err) { fail(res, err, 'comms_hub_thumbnail_download_failed'); }
}

export async function uploadRoute(req: Request, res: Response): Promise<void> {
  const p = Params.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Not an event id.' }); return; }
  const b = UploadBody.safeParse(req.body ?? {});
  if (!b.success) { res.status(400).json({ error: b.error.issues[0].message, error_class: 'ValidationError' }); return; }
  const file = (req as Request & { file?: { buffer: Buffer } }).file;
  if (!file || !file.buffer?.length) { res.status(400).json({ error: 'Choose a picture to upload.', error_class: 'ValidationError' }); return; }
  try {
    const id = await uploadOwn(p.data.id, { bytes: file.buffer, altText: b.data.alt_text }, actorOf(req));
    res.status(201).json({ id });
  } catch (err) { fail(res, err, 'comms_hub_thumbnail_upload_failed'); }
}

const gate = requireSection('comms_hub');
const router = Router();
const base = '/api/admin/comms-hub/events/:id/thumbnails';
router.get(base, gate, listRoute);
// Fixed paths before the :thumbId ones.
router.post(`${base}/generate`, gate, generateRoute);
router.post(`${base}/upload`, gate, single, uploadRoute);
router.get(`${base}/jobs/:jobId`, gate, jobRoute);
router.post(`${base}/:thumbId/change`, gate, changeRoute);
router.post(`${base}/:thumbId/use`, gate, useRoute);
router.get(`${base}/:thumbId/download`, gate, downloadRoute);

export default router;
