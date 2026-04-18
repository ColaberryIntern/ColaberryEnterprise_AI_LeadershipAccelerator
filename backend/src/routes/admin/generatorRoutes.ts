import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { getGenerator } from '../../controllers/generatorController';

const router = Router();

router.get('/api/admin/generator/:sourceSlug/:entrySlug', requireAdmin, getGenerator);

export default router;
