import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleStartSimulation,
  handleGetSimulation,
  handlePauseSimulation,
  handleResumeSimulation,
  handleSkipStep,
  handleJumpToStep,
  handleRespondAsLead,
  handleAdvanceStep,
  handleCancelSimulation,
  handleGetSimulationHistory,
} from '../../controllers/campaignSimulationController';

const router = Router();

// Start a new simulation
router.post('/api/admin/simulations/campaigns/:id/start', requireAdmin, handleStartSimulation);

// Get simulation state (polling endpoint)
router.get('/api/admin/simulations/:simId', requireAdmin, handleGetSimulation);

// Simulation controls
router.post('/api/admin/simulations/:simId/pause', requireAdmin, handlePauseSimulation);
router.post('/api/admin/simulations/:simId/resume', requireAdmin, handleResumeSimulation);
router.post('/api/admin/simulations/:simId/skip', requireAdmin, handleSkipStep);
router.post('/api/admin/simulations/:simId/jump', requireAdmin, handleJumpToStep);
router.post('/api/admin/simulations/:simId/respond', requireAdmin, handleRespondAsLead);
router.post('/api/admin/simulations/:simId/advance', requireAdmin, handleAdvanceStep);
router.post('/api/admin/simulations/:simId/cancel', requireAdmin, handleCancelSimulation);

// Simulation history for a campaign
router.get('/api/admin/simulations/campaigns/:id/history', requireAdmin, handleGetSimulationHistory);

export default router;
