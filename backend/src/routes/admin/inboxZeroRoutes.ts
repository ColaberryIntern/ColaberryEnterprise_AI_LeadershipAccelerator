import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleZeroCommitments,
  handleZeroCursor,
  handleZeroDelta,
  handleZeroFocusCase,
  handleZeroHealth,
  handleZeroHeartbeat,
  handleZeroNext,
  handleZeroOverview,
  handleZeroQueue,
  handleZeroReconcile,
  handleZeroSnoozed,
  handleZeroStart,
  handleZeroStop,
  handleZeroWaiting,
} from '../../controllers/inboxZeroController';

// /inbox-zero operator API (T9a). Mounted under the /api/admin/inbox prefix
// (adminRoutes.ts) so it inherits requireSection('inbox_content') — the same
// two-layer gate as inboxCaseRoutes. Every route here is a READ of case state;
// the only writes are the operator's own lease and cursor. Approve / execute /
// verify stay on inboxCaseRoutes and their approval gates.
const router = Router();

router.post('/api/admin/inbox/zero/session/start', requireAdmin, handleZeroStart);
router.post('/api/admin/inbox/zero/session/heartbeat', requireAdmin, handleZeroHeartbeat);
router.post('/api/admin/inbox/zero/session/stop', requireAdmin, handleZeroStop);
router.post('/api/admin/inbox/zero/session/cursor', requireAdmin, handleZeroCursor);
router.get('/api/admin/inbox/zero/health', requireAdmin, handleZeroHealth);
router.get('/api/admin/inbox/zero/overview', requireAdmin, handleZeroOverview);
router.get('/api/admin/inbox/zero/delta', requireAdmin, handleZeroDelta);
router.get('/api/admin/inbox/zero/next', requireAdmin, handleZeroNext);
router.get('/api/admin/inbox/zero/queue', requireAdmin, handleZeroQueue);
router.get('/api/admin/inbox/zero/waiting', requireAdmin, handleZeroWaiting);
router.get('/api/admin/inbox/zero/commitments', requireAdmin, handleZeroCommitments);
router.get('/api/admin/inbox/zero/snoozed', requireAdmin, handleZeroSnoozed);
router.get('/api/admin/inbox/zero/cases/:caseId', requireAdmin, handleZeroFocusCase);
// T16: bounded liveness sweep. Writes only what the provider says about
// Ali's own inbox (source_live/checked_at) and dispositions evidence that has
// left it; no external effect.
router.post('/api/admin/inbox/zero/liveness/reconcile', requireAdmin, handleZeroReconcile);

export default router;
