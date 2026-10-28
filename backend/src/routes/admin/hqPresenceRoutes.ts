import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAnyAdmin } from '../../middlewares/authMiddleware';
import { HQ_PATH, staffEnrollmentOf, touchHqPresence, type AdminIdentity } from '../../services/campus/hqPresence';

/**
 * POST /api/admin/campus/here {path, share?} - the Management Portal's presence heartbeat (Campus HQ).
 *
 * The admin layout sends it on every route change and every 45 s while an admin tab is open. It marks the employee online
 * (the community heartbeat every rail reads) and places them in the HQ building on the sidebar page they have open.
 *
 * - Identity comes ONLY from the verified admin token (staffEnrollmentOf); the body cannot name anyone else.
 * - `path` is a sidebar path or null (an admin page with no sidebar entry = the lobby); anything else is a 400.
 * - A session with no linked staff enrollment (a legacy admin with no portal account) has no campus identity: 204, nothing written.
 * - Section-agnostic in mgmtSectionGate on purpose: it is about the caller's own presence, returns no data, and every
 *   admin identity needs it, like /api/admin/me.
 */
const HereBody = z.object({ path: z.string().max(128).regex(HQ_PATH).nullable(), share: z.boolean().optional() }).strict();

export async function postAdminCampusHere(req: Request, res: Response): Promise<void> {
  const parsed = HereBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: 'Invalid body', error_class: 'ValidationFailed' }); return; }
  const enrollmentId = staffEnrollmentOf((req as Request & { admin?: AdminIdentity }).admin);
  if (!enrollmentId) { res.status(204).end(); return; }
  const started = Date.now();
  try {
    await touchHqPresence(enrollmentId, parsed.data.path, parsed.data.share !== false);
    res.status(204).end();
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: 'admin_campus_here_failed',
      outcome: 'failure', duration_ms: Date.now() - started, error_class: e?.name || 'Error', context: { message: String(e?.message || err).slice(0, 200) } }));
    res.status(500).json({ error: 'Could not record presence', error_class: 'CampusPresenceUnavailable' });
  }
}

const router = Router();
router.post('/api/admin/campus/here', requireAnyAdmin, postAdminCampusHere);
export default router;
