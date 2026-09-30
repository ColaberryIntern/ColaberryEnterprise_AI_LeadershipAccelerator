/**
 * CAPE Phase 6 admin routes — the Feed Control governance board (design doc
 * §12, §16 Phase 6): skill coverage heatmap, learner-stage (lifecycle-mode)
 * policies, pacing controls, and the explanation simulator's persona/lookup
 * support. NOT the Phase 0-1 minimal settings panel (`capeAdminRoutes.ts`) —
 * a sibling surface, same `requireAdmin` pattern.
 *
 * GET  /api/admin/cape/governance/policy                       — current Stage-4/pacing knobs
 * GET  /api/admin/cape/governance/policy/history                — version history
 * PUT  /api/admin/cape/governance/policy                        — edit (versioned)
 * GET  /api/admin/cape/governance/lifecycle-modes                — current mix per mode (5)
 * GET  /api/admin/cape/governance/lifecycle-modes/:mode/history  — version history for one mode
 * PUT  /api/admin/cape/governance/lifecycle-modes/:mode          — edit one mode's mix (versioned)
 * GET  /api/admin/cape/governance/heatmap                        — 50 types x 10 skills matrix
 * GET  /api/admin/cape/governance/personas                       — 5 simulator personas
 * GET  /api/admin/cape/governance/lookup?query=                  — email/ID lookup for the simulator
 */
import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleGetGovernancePolicy, handleGetGovernancePolicyHistory, handleUpdateGovernancePolicy,
  handleListLifecycleModePolicies, handleGetLifecycleModePolicyHistory, handleUpdateLifecycleModePolicy,
  handleGetSkillCoverageHeatmap, handleListPersonas, handleLookupEnrollment,
} from '../../controllers/capeGovernanceController';

const router = Router();

router.get('/api/admin/cape/governance/policy', requireAdmin, handleGetGovernancePolicy);
router.get('/api/admin/cape/governance/policy/history', requireAdmin, handleGetGovernancePolicyHistory);
router.put('/api/admin/cape/governance/policy', requireAdmin, handleUpdateGovernancePolicy);

router.get('/api/admin/cape/governance/lifecycle-modes', requireAdmin, handleListLifecycleModePolicies);
router.get('/api/admin/cape/governance/lifecycle-modes/:mode/history', requireAdmin, handleGetLifecycleModePolicyHistory);
router.put('/api/admin/cape/governance/lifecycle-modes/:mode', requireAdmin, handleUpdateLifecycleModePolicy);

router.get('/api/admin/cape/governance/heatmap', requireAdmin, handleGetSkillCoverageHeatmap);
router.get('/api/admin/cape/governance/personas', requireAdmin, handleListPersonas);
router.get('/api/admin/cape/governance/lookup', requireAdmin, handleLookupEnrollment);

export default router;
