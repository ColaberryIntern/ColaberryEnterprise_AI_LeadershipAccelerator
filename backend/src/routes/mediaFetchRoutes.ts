import { Router, Request, Response } from 'express';
import { MediaStoreError, read, verifySignedRequest } from '../services/media/mediaStore';

/**
 * mediaFetchRoutes — `GET /m/<brand>/<sha256>.<ext>?e=<expiry>&s=<sig>`
 *
 * PUBLIC, and it MUST be mounted BEFORE `adminRoutes` in `server.ts`. Its one consumer is a
 * provider (Instagram) fetching an image at publish time; a provider has no session, so
 * anything mounted after the unscoped admin guard 401s it. `/r/` and `/i/` learned this the
 * hard way; `mediaFetchRoutes.test.ts` builds both mount orders so a future re-order fails a
 * test rather than a publish.
 *
 * What makes a public file route safe here:
 *   - The key grammar admits exactly one shape, so there is no path to traverse.
 *   - Every request carries an HMAC over (key, expiry) that only this server can mint, and
 *     the window is minutes. A URL that leaks dies with its window; nothing is listable.
 *   - `read` re-hashes the bytes against the key, so a file altered on disk is refused rather
 *     than served.
 *   - No directory listing, no fallback, no `express.static`.
 */

const router = Router();

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
};

router.get('/m/:brand/:file', async (req: Request, res: Response) => {
  try {
    const keyPath = `${req.params.brand}/${req.params.file}`;
    const e = typeof req.query.e === 'string' ? req.query.e : undefined;
    const s = typeof req.query.s === 'string' ? req.query.s : undefined;
    const key = verifySignedRequest(keyPath, e, s);
    const bytes = await read(key);
    const ext = key.slice(key.lastIndexOf('.') + 1);
    res.set({
      'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
      'Content-Length': String(bytes.length),
      // Private and short: a provider fetches once. No shared cache should keep a copy past the
      // signature's own window.
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    });
    res.status(200).end(bytes);
  } catch (err) {
    if (err instanceof MediaStoreError) {
      // Plain text, deliberately. A provider fetching an image does not parse JSON errors,
      // and a human hitting an expired link gets a sentence instead of a stack.
      return void res.status(err.status).type('text/plain').send(err.message);
    }
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'media', event: 'media_fetch_failed',
      outcome: 'failure', error_class: (err as Error)?.name ?? 'Error',
      context: { message: String((err as Error)?.message ?? err).slice(0, 200) },
    }));
    res.status(500).type('text/plain').send('Internal Error');
  }
});

export default router;
