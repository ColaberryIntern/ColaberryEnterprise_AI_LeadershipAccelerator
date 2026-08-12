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
 *
 * CAPE Phase 3 (design doc §7, §12 Timeline editor card-level override):
 * GET  /api/admin/cape/curriculum-skill-maps/card/:cardId    — resolved mapping + source
 * PUT  /api/admin/cape/curriculum-skill-maps/card/:cardId    — create a card override (versioned)
 */
import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleListSkillDefinitions, handleGetSkillDefinitionHistory, handleUpdateSkillDefinition,
  handleGetEvidenceBandWeights, handleUpdateEvidenceBandWeights,
  handleGetCardSkillMapping, handleUpsertCardSkillMapping,
} from '../../controllers/capeAdminController';

const router = Router();

router.get('/api/admin/cape/skill-definitions', requireAdmin, handleListSkillDefinitions);
router.get('/api/admin/cape/skill-definitions/:skillId/history', requireAdmin, handleGetSkillDefinitionHistory);
router.put('/api/admin/cape/skill-definitions/:skillId', requireAdmin, handleUpdateSkillDefinition);

router.get('/api/admin/cape/evidence-band-weights', requireAdmin, handleGetEvidenceBandWeights);
router.put('/api/admin/cape/evidence-band-weights', requireAdmin, handleUpdateEvidenceBandWeights);

router.get('/api/admin/cape/curriculum-skill-maps/card/:cardId', requireAdmin, handleGetCardSkillMapping);
router.put('/api/admin/cape/curriculum-skill-maps/card/:cardId', requireAdmin, handleUpsertCardSkillMapping);

export default router;
