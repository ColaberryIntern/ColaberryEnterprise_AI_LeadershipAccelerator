import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleGetReviewQueue,
  handleReviewDecision,
  handleSuspendPublication,
} from '../../controllers/careerPublicationController';

const router = Router();

// Every route below is staff-only. This is the surface that can make a learner's
// portfolio publicly visible, so it is the last place to rely on a caller being
// well-behaved.
router.use(requireAdmin);

router.get('/api/admin/career/review-queue', handleGetReviewQueue);
router.post('/api/admin/career/review/:snapshotId', handleReviewDecision);
router.post('/api/admin/career/publication/:enrollmentId/suspend', handleSuspendPublication);

export default router;
