import fs from 'fs';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { createAttempt, enqueueAttempt, getAttempt, readAloudCount } from '../services/careerPrep/attempts';
import { NotFoundError } from '../services/careerPrep/sessions';
import { lineById, lineFor } from '../services/careerPrep/readAloudLines';
import { logFailure } from '../routes/campusRoutes';

/**
 * Career Prep v27 (CP4.4): upload a recorded "Try" answer and read its score. The upload middleware
 * (prepAttemptUpload) runs in the route; `guardUpload` turns its errors into plain answers (413 too large,
 * 400 not a video) instead of an HTML error page. The uploaded file is either handed to the scoring queue
 * (which deletes it) or deleted here, on every path.
 *
 * CP5.8: a read-aloud warm-up is the same upload with `lineId` (audio only). GET .../read-aloud/line gives the line to read:
 * the student's count of scored read-alouds picks the next one, so the lines rotate.
 */
const Params = z.object({ id: z.string().uuid() }).strict();
const AttemptParams = z.object({ id: z.string().uuid(), attemptId: z.string().uuid() }).strict();
const Body = z.object({
  segmentIndex: z.coerce.number().int().min(0).max(20), clientKey: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  lineId: z.string().regex(/^ra-\d{2}$/).optional(),
}).strict();

const drop = (req: Request) => (req.file?.path ? fs.promises.rm(req.file.path, { force: true }).catch(() => undefined) : Promise.resolve());

export function guardUpload(mw: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => mw(req, res, (err?: unknown) => {
    if (!err) { next(); return; }
    const e = err as { code?: string; status?: number; message?: string };
    void drop(req);
    if (e.code === 'LIMIT_FILE_SIZE') { res.status(413).json({ error: 'That recording is too large. Keep an answer under 100 MB.' }); return; }
    if (e.status === 400) { res.status(400).json({ error: e.message ?? 'That file is not a video.' }); return; }
    logFailure('career_prep_attempt_upload_failed', err);
    res.status(500).json({ error: 'Could not receive the recording. Try again.' });
  });
}

export async function postAttempt(req: Request, res: Response): Promise<void> {
  const p = Params.safeParse(req.params);
  const b = Body.safeParse(req.body);
  if (!p.success || !b.success || !req.file?.path) { await drop(req); res.status(400).json({ error: 'Record an answer to upload.' }); return; }
  const line = b.data.lineId ? lineById(b.data.lineId) : undefined;
  if (b.data.lineId && !line) { await drop(req); res.status(400).json({ error: 'That read-aloud line does not exist.' }); return; }
  // Audio only ever comes from the read-aloud warm-up; a Try answer without a line must be a video.
  if (!line && /^audio\//i.test(req.file.mimetype ?? '')) { await drop(req); res.status(400).json({ error: 'A Try answer needs the camera: record a video.' }); return; }
  try {
    const { attempt, created } = await createAttempt(req.participant!.sub, p.data.id, b.data.segmentIndex, b.data.clientKey, line?.id);
    if (created) void enqueueAttempt(attempt.id, req.participant!.sub, req.file.path, line ? { readAloudLine: line } : {}); else await drop(req);
    res.status(created ? 202 : 200).json({ attempt });
  } catch (err) {
    await drop(req);
    if (err instanceof NotFoundError) { res.status(404).json({ error: 'Not found' }); return; }
    logFailure('career_prep_attempt_create_failed', err);
    res.status(500).json({ error: 'Could not save the recording. Try again.' });
  }
}

export async function getAttemptStatus(req: Request, res: Response): Promise<void> {
  const p = AttemptParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'Not a valid attempt.' }); return; }
  try { res.json({ attempt: await getAttempt(req.participant!.sub, p.data.id, p.data.attemptId) }); } catch (err) {
    if (err instanceof NotFoundError) { res.status(404).json({ error: 'Not found' }); return; }
    logFailure('career_prep_attempt_read_failed', err);
    res.status(500).json({ error: 'Could not load the score.' });
  }
}

/** CP5.8: the line this student reads next (rotation by their count of scored read-alouds). */
export async function getReadAloudLine(req: Request, res: Response): Promise<void> {
  try {
    res.json({ line: lineFor(await readAloudCount(req.participant!.sub)) });
  } catch (err) {
    logFailure('career_prep_read_aloud_line_failed', err);
    res.status(500).json({ error: 'Could not load the line to read.' });
  }
}
