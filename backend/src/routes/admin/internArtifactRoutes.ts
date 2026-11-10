import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { getInternArtifact } from '../../services/internship/internArtifactViewer';

/**
 * Read one published intern artifact, for /admin/internship/artifact/:id, which the Internship
 * Report links so Ali can open an artifact straight from the email.
 *
 * Its own router rather than another handler in `internshipRoutes.ts`: that file is 991 lines,
 * past the 500-line ceiling, and CLAUDE.md says the next change to an oversize file splits rather
 * than adds.
 *
 * Section `internship`, the same as the console that lists these interns. The service only
 * answers for ACTIVE interns, so the id cannot be used to read any other student's portfolio;
 * every other id is a 404, which also does not confirm the artifact exists.
 */
const router = Router();
const Params = z.object({ id: z.string().uuid() });

router.get('/api/admin/internship/artifacts/:id', requireSection('internship'), async (req: Request, res: Response) => {
  const parsed = Params.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: 'Artifact id must be a UUID.' }); return; }
  try {
    const artifact = await getInternArtifact(parsed.data.id);
    if (!artifact) { res.status(404).json({ error: 'No published artifact with that id for an active intern.' }); return; }
    res.json(artifact);
  } catch (err) {
    const e = err as Error;
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: 'intern_artifact_read_failed',
      outcome: 'failure', error_class: e?.constructor?.name ?? 'UnknownError', context: { message: e?.message },
    }));
    res.status(500).json({ error: 'Could not load this artifact.' });
  }
});

export default router;
