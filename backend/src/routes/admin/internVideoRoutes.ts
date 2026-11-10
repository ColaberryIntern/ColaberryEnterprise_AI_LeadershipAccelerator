import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { getInternVideo } from '../../services/internship/internVideoViewer';

/**
 * One intern demo video for /admin/internship/video/:id (Ali, 10 Nov 2026: "I should also have a
 * video viewer where I can see/watch/interact with that artifact").
 *
 * Section `internship`, like the artifact viewer. The response carries ticketed URLs for the bytes,
 * served by routes/internVideoStreamRoutes.ts: a <video src> cannot send the admin Authorization
 * header, so the authority travels in a signed, recording-bound staff ticket minted HERE, after
 * this gate. Not an active intern's ingested recording = 404 (which also does not confirm the id).
 */
const router = Router();
const Params = z.object({ id: z.string().uuid() });

router.get('/api/admin/internship/videos/:id', requireSection('internship'), async (req: Request, res: Response) => {
  const parsed = Params.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: 'Video id must be a UUID.' }); return; }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the auth middleware attaches the admin claims untyped
    const who = (req as any).admin;
    const staffIdentity = String(who?.email || who?.sub || who?.id || 'admin');
    const video = await getInternVideo(parsed.data.id, staffIdentity);
    if (!video) { res.status(404).json({ error: 'No recorded video with that id for an active intern.' }); return; }
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(video);
  } catch (err) {
    const e = err as Error;
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: 'intern_video_read_failed',
      outcome: 'failure', error_class: e?.constructor?.name ?? 'UnknownError', context: { message: e?.message },
    }));
    res.status(500).json({ error: 'Could not load this video.' });
  }
});

export default router;
