import { Router, Request, Response } from 'express';
import { requireParticipant } from '../middlewares/participantAuth';
import { campusOnFor } from '../services/campus/campusPilot';
import { classifyError } from '../utils/errorClassifier';
import { canManageTv } from './colaberryTvHandlers';

/**
 * Colaberry TV for learners (Campus v20 N3, Basecamp C134). Participant-authed and behind the campus pilot, like every campus route.
 *
 *   GET /api/portal/colaberry-tv    on-air shorts this viewer may see, in play order, + can_manage
 *
 * ONE ROUTE NOW. The five /manage routes went with TV-2: TV-1 pointed the TV at the Colaberry
 * Training library and sent the Manage button to /admin/marketing/library, so the in-campus
 * playlist editor they served was already mounted nowhere, and they wrote to a table nothing reads.
 *
 * `can_manage` STILL MATTERS and is why `canManageTv` is still imported. It is the only thing
 * deciding whether the Manage button renders, so it outlived the routes it used to gate.
 */
function fail(res: Response, event: string, err: unknown): void {
  const error_class = classifyError(err);
  console.error(JSON.stringify({ level: 'error', service: 'colaberry-tv', event, outcome: 'failure', error_class, message: (err as Error)?.message?.slice(0, 200) ?? null }));
  res.status(500).json({ error: 'Colaberry TV is unavailable right now', error_class });
}

function campusGate(req: Request, res: Response): boolean {
  if (campusOnFor(req)) return true;
  res.status(403).json({ error: 'The campus is not enabled for this account', error_class: 'CampusNotEnabled' });
  return false;
}

export async function getTvRoute(req: Request, res: Response): Promise<void> {
  if (Object.keys(req.query ?? {}).length) { res.status(400).json({ error: 'Invalid query', error_class: 'ValidationFailed' }); return; }
  if (!campusGate(req, res)) return;
  try {
    const enrollmentId = req.participant!.sub;
    const { campusAudienceFor } = await import('../services/campus/campusAudience');
    const { listForViewer } = await import('../services/colaberryTv/tvService');
    const [viewer, manage] = await Promise.all([campusAudienceFor(enrollmentId), canManageTv(enrollmentId)]);
    res.json({ videos: await listForViewer(viewer), can_manage: manage });
  } catch (err) { fail(res, 'colaberry_tv_list_failed', err); }
}

const router = Router();
router.get('/api/portal/colaberry-tv', requireParticipant, getTvRoute);
export default router;
