import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { logFailure } from './campusRoutes';
import { THUMB_SIZES, publicThumbnail } from '../services/commsHub/thumbnails/thumbnailStudio';

/**
 * GET /api/comms-hub/thumbnails/:eventId/:size.png (CH4.4): the CHOSEN thumbnail of a hub event
 * members can see, for the portal Events card. PUBLIC because an <img> cannot send the portal's
 * Bearer token, so it MUST be mounted above adminRoutes in server.ts (the /m/, /r/, /i/ lesson);
 * commsHubPublicThumbnailRoutes.test.ts builds both mount orders.
 *
 * What makes it safe: it serves only the one picture already chosen to promote an event that is
 * published to the Events page (never drafts, cancelled events, other options or uploaded photos),
 * keyed by an unguessable event id; nothing is listable; bytes come from the content-addressed
 * media store, which re-hashes them on read.
 */
const Params = z.object({ eventId: z.string().uuid(), size: z.enum(THUMB_SIZES.map((s) => `${s}.png`) as [string, ...string[]]) }).strict();

const router = Router();
router.get('/api/comms-hub/thumbnails/:eventId/:size', async (req: Request, res: Response) => {
  const p = Params.safeParse(req.params);
  if (!p.success) { res.status(404).type('text/plain').send('Not found'); return; }
  try {
    const png = await publicThumbnail(p.data.eventId, p.data.size.replace(/\.png$/, '') as (typeof THUMB_SIZES)[number]);
    if (!png) { res.status(404).type('text/plain').send('Not found'); return; }
    res.set({ 'Content-Type': 'image/png', 'Content-Length': String(png.length), 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' });
    res.status(200).end(png);
  } catch (err) {
    logFailure('comms_hub_public_thumbnail_failed', err);
    res.status(500).type('text/plain').send('Internal Error');
  }
});

export default router;
