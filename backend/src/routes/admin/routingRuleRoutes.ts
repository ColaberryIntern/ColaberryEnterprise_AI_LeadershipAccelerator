import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  listRoutingRules, createRoutingRule, updateRoutingRule, deleteRoutingRule,
} from '../../controllers/adminLeadSourceController';

const router = Router();

router.get('/api/admin/routing-rules', requireAdmin, listRoutingRules);
router.post('/api/admin/routing-rules', requireAdmin, createRoutingRule);
router.patch('/api/admin/routing-rules/:id', requireAdmin, updateRoutingRule);
router.delete('/api/admin/routing-rules/:id', requireAdmin, deleteRoutingRule);

export default router;
