/**
 * hireVideoController - the candidate's intro video in their studio (kit §3.2).
 *
 *   GET    /api/portal/career/portfolio-page/hire-video   the draft or published video, with coaching
 *   POST   /api/portal/career/portfolio-page/hire-video   multipart `video`: record/upload a new draft
 *   PUT    /api/portal/career/portfolio-page/hire-video   { published?, captionsWanted? }
 *   DELETE /api/portal/career/portfolio-page/hire-video
 *
 * The enrollment is ALWAYS the caller's, from the participant token.
 */
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { hireVideoTempPaths, hireVideoUpload, HIRE_VIDEO_MAX_BYTES } from '../config/hireVideoUpload';
import { deleteVideo, readStudioVideo, saveVideo, updateVideo, videoUpdateSchema } from '../services/hire/hireVideoService';

const eid = (req: Request) => req.participant!.sub;

function fail(res: Response, e: any, next: NextFunction): void {
  if (e instanceof multer.MulterError) {
    const tooBig = e.code === 'LIMIT_FILE_SIZE';
    res.status(tooBig ? 413 : 400).json({
      error: tooBig ? `That file is over ${HIRE_VIDEO_MAX_BYTES / 1024 / 1024} MB. A 90-second video is usually far smaller.` : e.message,
      error_class: 'ValidationError',
    });
    return;
  }
  if (e?.status) { res.status(e.status).json({ error: e.message, error_class: e.error_class }); return; }
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: 'hire_video_controller_error',
    outcome: 'failure', error_class: e?.name || 'Error', context: { message: String(e?.message || '').slice(0, 200) },
  }));
  next(e);
}

const cleanup = (req: Request) => Promise.all(hireVideoTempPaths(req).map((p) => fs.promises.rm(p, { force: true }).catch(() => undefined)));

export async function handleGetHireVideo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ ok: true, video: await readStudioVideo(eid(req)) }); } catch (e) { fail(res, e, next); }
}

export function handleUploadHireVideo(req: Request, res: Response, next: NextFunction): void {
  hireVideoUpload(req, res, async (uploadErr: unknown) => {
    // The temp file goes BEFORE the answer, so a client that retries at once never races a
    // half-deleted upload, and nothing is left behind on any path.
    let out: Awaited<ReturnType<typeof saveVideo>> | undefined;
    let err: unknown = uploadErr;
    if (!err && req.file?.path) {
      try { out = await saveVideo(eid(req), req.file.path); } catch (e) { err = e; }
    }
    await cleanup(req);
    if (err) { fail(res, err, next); return; }
    if (out === undefined) { res.status(400).json({ error: 'Choose a video to upload.', error_class: 'ValidationError' }); return; }
    res.json({ ok: true, video: out });
  });
}

export async function handleUpdateHireVideo(req: Request, res: Response, next: NextFunction): Promise<void> {
  const parsed = videoUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join('; ') }); return; }
  try { res.json({ ok: true, video: await updateVideo(eid(req), parsed.data) }); } catch (e) { fail(res, e, next); }
}

export async function handleDeleteHireVideo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { await deleteVideo(eid(req)); res.json({ ok: true, video: null }); } catch (e) { fail(res, e, next); }
}
