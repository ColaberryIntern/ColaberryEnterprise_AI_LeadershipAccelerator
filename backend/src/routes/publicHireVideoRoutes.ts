/**
 * publicHireVideoRoutes - `GET /api/public/hire/video/<assetId>/(stream|poster|captions)[?t=<preview>]`
 *
 * Plays a candidate's intro video on hire.refactored.ai, and a draft in their own studio.
 *
 *   - A PUBLISHED asset is public, cacheable for five minutes (its id changes on every upload, so
 *     a cached copy can never outlive the video it belongs to).
 *   - A DRAFT needs the studio's signed `?t=` token and is never cached. Anything else is a 404,
 *     the same answer as a missing file, so the route does not confirm that a draft exists.
 *
 * EXTENSIONLESS ON PURPOSE. nginx has regex locations for `\.(mp4|webm)$`, `\.jpe?g$` and `\.vtt$`
 * that would win over the `/api/` prefix and answer from the static root with a 404 (what /m/ and
 * /bm/ each hit in production). Without an extension the path stays on `/api/`.
 *
 * CROSS-ORIGIN BY DESIGN. The page is hire.refactored.ai and the file is on the platform origin.
 * helmet's default `Cross-Origin-Resource-Policy: same-origin` would block the poster and video,
 * so these responses say `cross-origin`; CORS is already open (`cors()` in server.ts), which the
 * `<video crossorigin>` needed for a cross-origin caption track relies on.
 *
 * Range requests (seeking, iOS playback) come from `res.sendFile`.
 */
import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { isVideoFileKind } from '../services/hire/hireVideoFiles';
import { resolveVideoFile } from '../services/hire/hireVideoService';

async function serve(req: Request, res: Response): Promise<void> {
  const { id, kind } = req.params;
  try {
    const file = isVideoFileKind(kind) ? await resolveVideoFile(String(id), kind, req.query.t) : null;
    if (!file) { res.status(404).set('Cache-Control', 'no-store').json({ error: 'Not found' }); return; }
    res.set({
      'Content-Type': file.type,
      'Cache-Control': file.published ? 'public, max-age=300' : 'private, no-store',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    if (!file.published) res.set('X-Robots-Tag', 'noindex, nofollow');
    res.sendFile(file.path, { acceptRanges: true, dotfiles: 'deny', headers: { 'Content-Type': file.type } }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Not found' });
    });
  } catch (err: unknown) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: 'public_hire_video_failed',
      outcome: 'failure', error_class: err instanceof Error ? err.name : 'Error', context: { kind },
    }));
    if (!res.headersSent) res.status(500).json({ error: 'Unable to load this just now' });
  }
}

/** A factory so each test mounts its own rate-limit store. Playback makes many range requests: generous, still bounded. */
export function createHireVideoRouter(): Router {
  const router = Router();
  const limiter = rateLimit({ windowMs: 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false });
  router.get('/api/public/hire/video/:id/:kind', limiter, serve);
  return router;
}

export default createHireVideoRouter();
