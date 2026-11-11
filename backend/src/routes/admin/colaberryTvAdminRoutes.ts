import { Router, Request, Response } from 'express';
import { requireSection } from '../../middlewares/authMiddleware';
import { manageHandlers } from '../colaberryTvHandlers';

/**
 * Colaberry TV playlist from the admin console (Campus v20 N3, Basecamp C134). The same handlers as the campus manager, behind
 * requireSection('campaigns') on every route (inline, so mgmtSectionGate.guardedPathsAreClassified checks each one) and, above it,
 * mgmtSectionGate (PATH_SECTION maps /api/admin/colaberry-tv to 'campaigns').
 */
const actorOf = (req: Request): string => `admin:${String((req.admin as { email?: string } | undefined)?.email ?? 'unknown').toLowerCase()}`;
const as = (h: (req: Request, res: Response, actor: string) => Promise<void>) => (req: Request, res: Response) => h(req, res, actorOf(req));

const router = Router();
router.get('/api/admin/colaberry-tv', requireSection('campaigns'), as(manageHandlers.list));
router.post('/api/admin/colaberry-tv', requireSection('campaigns'), as(manageHandlers.add));
router.put('/api/admin/colaberry-tv/order', requireSection('campaigns'), as(manageHandlers.order));
router.patch('/api/admin/colaberry-tv/:id', requireSection('campaigns'), as(manageHandlers.update));
router.delete('/api/admin/colaberry-tv/:id', requireSection('campaigns'), as(manageHandlers.remove));
export default router;
