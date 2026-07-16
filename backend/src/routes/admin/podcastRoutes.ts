import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { listPodcastsAdmin, triggerPodcastRefresh } from '../../controllers/podcastController';

const router = Router();

router.get('/api/admin/podcasts', requireAdmin, listPodcastsAdmin);
router.post('/api/admin/podcasts/refresh', requireAdmin, triggerPodcastRefresh);

export default router;
