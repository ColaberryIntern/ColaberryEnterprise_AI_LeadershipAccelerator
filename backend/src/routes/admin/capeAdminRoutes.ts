/**
 * CAPE admin routes — the "Phase 0-1 minimal settings panel" (design doc §12):
 * view/edit the 10 skill definitions and the 4 evidence-band weights. NOT the
 * full Feed Control governance board (Phase 6).
 *
 * GET  /api/admin/cape/skill-definitions                    — current 10 defs
 * GET  /api/admin/cape/skill-definitions/:skillId/history    — version history
 * PUT  /api/admin/cape/skill-definitions/:skillId            — edit (versioned)
 * GET  /api/admin/cape/evidence-band-weights                 — current + history
 * PUT  /api/admin/cape/evidence-band-weights                 — edit (versioned, sum=1.0)
 */
import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleListSkillDefinitions, handleGetSkillDefinitionHistory, handleUpdateSkillDefinition,
  handleGetEvidenceBandWeights, handleUpdateEvidenceBandWeights,
} from '../../controllers/capeAdminController';

const router = Router();

router.get('/api/admin/cape/skill-definitions', requireAdmin, handleListSkillDefinitions);
router.get('/api/admin/cape/skill-definitions/:skillId/history', requireAdmin, handleGetSkillDefinitionHistory);
router.put('/api/admin/cape/skill-definitions/:skillId', requireAdmin, handleUpdateSkillDefinition);

router.get('/api/admin/cape/evidence-band-weights', requireAdmin, handleGetEvidenceBandWeights);
router.put('/api/admin/cape/evidence-band-weights', requireAdmin, handleUpdateEvidenceBandWeights);

export default router;
