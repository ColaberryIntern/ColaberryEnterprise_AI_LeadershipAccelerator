import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { handleGetChecklistInstance, handleBypassChecklistInstance } from '../../controllers/checklistController';

// Reese Agentic AI Employee mission, Capability 6 — persistent checklist
// instances (currently: Assessment checklist only, see
// checklistDefinitions.ts). Generic by construction — works off any real
// checklist_instances row, not hardcoded to one checklist type.
const router = Router();

router.get('/api/admin/checklist-instances/:id', requireAdmin, handleGetChecklistInstance);
router.post('/api/admin/checklist-instances/:id/bypass', requireAdmin, handleBypassChecklistInstance);

export default router;
