import fs from 'fs';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { contentRangeHeader, parseRange, rangeLength } from '../services/presentation/byteRange';
import { resolveStaffRecording } from '../services/presentation/recordingPlayback';
import { isStaffTicket, verifyRecordingTicket } from '../services/presentation/recordingTicket';
import { ensureThumbnail } from '../services/presentation/recordingThumbnail';

/**
 * The BYTES of an intern demo video for the admin video viewer: the <video> element's source and
 * its poster, with HTTP Range so the viewer can seek.
 *
 * WHY THIS IS NOT AN ADMIN ROUTE. A <video src> request carries no Authorization header, and
 * adminRoutes chains sub-routers that run `router.use(requireAdmin)` over every path, so any URL
 * under it would 401 before reaching a handler. The authority instead travels in the URL: a signed
 * STAFF ticket bound to this one recording (services/presentation/recordingTicket.ts), minted only
 * by GET /api/admin/internship/videos/:id after the `internship` section gate. A learner's ticket
 * fails isStaffTicket; a ticket for another recording, tampered, or expired fails verify. Every
 * refusal is the same 404, so a guessed id learns nothing. Mounted in server.ts ABOVE adminRoutes,
 * exactly like the learner playback routes (presentationPlaybackRoutes).
 */
const router = Router();
const Params = z.object({ id: z.string().uuid() });

function authorized(req: Request): string | null {
  const parsed = Params.safeParse(req.params);
  if (!parsed.success) return null;
  const claims = verifyRecordingTicket(typeof req.query.t === 'string' ? req.query.t : null);
  return claims && isStaffTicket(claims) && claims.recordingId === parsed.data.id ? parsed.data.id : null;
}

function logFailure(event: string, err: unknown, id: string): void {
  const e = err as Error;
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'backend', event, outcome: 'failure', error_class: e?.constructor?.name ?? 'UnknownError', context: { id, message: e?.message } }));
}

router.get('/api/internship-video/:id/file', async (req: Request, res: Response) => {
  const id = authorized(req);
  if (!id) { res.status(404).json({ error: 'Not found' }); return; }
  try {
    const r = await resolveStaffRecording(id);
    if (!r.ok) { res.status(r.reason === 'file_missing' ? 409 : 404).json({ error: r.reason === 'file_missing' ? 'The video file is not on the server.' : 'Not found' }); return; }
    const { filePath, sizeBytes, mimeType, downloadName } = r.recording;
    const outcome = parseRange(req.headers.range, sizeBytes);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="${downloadName.replace(/["\\]/g, '_')}"`);
    if (outcome.kind === 'unsatisfiable') { res.setHeader('Content-Range', `bytes */${sizeBytes}`); res.status(416).end(); return; }
    const stream = outcome.kind === 'partial'
      ? (res.status(206), res.setHeader('Content-Range', contentRangeHeader(outcome.range, sizeBytes)), res.setHeader('Content-Length', String(rangeLength(outcome.range))), fs.createReadStream(filePath, { start: outcome.range.start, end: outcome.range.end }))
      : (res.setHeader('Content-Length', String(sizeBytes)), fs.createReadStream(filePath));
    stream.on('error', (err) => { logFailure('intern_video_stream_failed', err, id); if (!res.headersSent) res.status(500).end(); else res.destroy(); });
    stream.pipe(res);
  } catch (err) {
    logFailure('intern_video_file_failed', err, id);
    if (!res.headersSent) res.status(500).json({ error: 'Could not stream this video.' });
  }
});

router.get('/api/internship-video/:id/thumbnail', async (req: Request, res: Response) => {
  const id = authorized(req);
  if (!id) { res.status(404).json({ error: 'Not found' }); return; }
  try {
    const r = await resolveStaffRecording(id);
    if (!r.ok) { res.status(404).json({ error: 'Not found' }); return; }
    const poster = await ensureThumbnail(r.recording.recordingId, r.recording.filePath, r.recording.durationSeconds);
    // A camera-off take has no frame worth showing; the player simply shows no poster.
    if (!poster) { res.status(404).json({ error: 'No thumbnail' }); return; }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, no-store');
    fs.createReadStream(poster.path).pipe(res);
  } catch (err) {
    logFailure('intern_video_thumbnail_failed', err, id);
    if (!res.headersSent) res.status(500).end();
  }
});

export default router;
