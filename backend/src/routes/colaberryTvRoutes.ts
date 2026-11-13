import { Router, Request, Response } from 'express';
import { requireParticipant } from '../middlewares/participantAuth';
import { campusOnFor } from '../services/campus/campusPilot';
import { classifyError } from '../utils/errorClassifier';
import { canManageTv, manageHandlers } from './colaberryTvHandlers';

/**
 * Colaberry TV for learners (Campus v20 N3, Basecamp C134). Participant-authed and behind the campus pilot, like every campus route.
 *
 *   GET  /api/portal/colaberry-tv                 on-air shorts this viewer may see, in play order, + can_manage
 *   GET|POST /api/portal/colaberry-tv/manage      the full playlist / add a link            (staff with the `campaigns` section)
 *   PATCH|DELETE /api/portal/colaberry-tv/manage/:id, PUT /api/portal/colaberry-tv/manage/order
 *
 * The manage routes exist on the portal because staff manage the TV from inside the campus, where they hold a participant token,
 * not an admin one. They are gated on the same `campaigns` section the admin console's /api/admin/colaberry-tv uses (shared
 * handlers, colaberryTvHandlers.ts), and FAIL CLOSED: a section lookup that throws is a 403. Read-only "view as" tokens are refused
 * on writes by requireParticipant.
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

/** Portal manage gate: the campus, then the `campaigns` section (fail closed). Sets the audit actor. */
async function portalManage(req: Request, res: Response): Promise<string | null> {
  if (!campusGate(req, res)) return null;
  const enrollmentId = req.participant!.sub;
  if (!(await canManageTv(enrollmentId))) {
    res.status(403).json({ error: 'Only staff with Campaigns access can manage Colaberry TV', error_class: 'NotTvManager' });
    return null;
  }
  return `enrollment:${enrollmentId}`;
}

const wrap = (h: (req: Request, res: Response, actor: string) => Promise<void>) => async (req: Request, res: Response): Promise<void> => {
  const actor = await portalManage(req, res);
  if (actor) await h(req, res, actor);
};

export const manageListRoute = wrap(manageHandlers.list);
export const manageAddRoute = wrap(manageHandlers.add);
export const manageUpdateRoute = wrap(manageHandlers.update);
export const manageOrderRoute = wrap(manageHandlers.order);
export const manageRemoveRoute = wrap(manageHandlers.remove);

const router = Router();
router.get('/api/portal/colaberry-tv', requireParticipant, getTvRoute);
router.get('/api/portal/colaberry-tv/manage', requireParticipant, manageListRoute);
router.post('/api/portal/colaberry-tv/manage', requireParticipant, manageAddRoute);
router.put('/api/portal/colaberry-tv/manage/order', requireParticipant, manageOrderRoute);
router.patch('/api/portal/colaberry-tv/manage/:id', requireParticipant, manageUpdateRoute);
router.delete('/api/portal/colaberry-tv/manage/:id', requireParticipant, manageRemoveRoute);
export default router;
