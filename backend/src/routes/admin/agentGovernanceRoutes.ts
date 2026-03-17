import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleGetProposedActions,
  handleApproveProposal,
  handleRejectProposal,
  handleGetProposalPreview,
  handleActivateAgent,
  handleGetPendingAgents,
  handleEmergencyStop,
  handleResumeAgents,
  handleGetWriteAudits,
  handleGetPermissions,
  handleGetAgentHealth,
  handleGetSafetyAlerts,
} from '../../controllers/agentGovernanceController';

const router = Router();

// Proposed agent actions (approval workflow)
router.get('/api/admin/agent-actions', requireAdmin, handleGetProposedActions);
router.post('/api/admin/agent-actions/:id/approve', requireAdmin, handleApproveProposal);
router.post('/api/admin/agent-actions/:id/reject', requireAdmin, handleRejectProposal);
router.get('/api/admin/agent-actions/:id/preview', requireAdmin, handleGetProposalPreview);

// Agent activation (dynamic agent approval)
router.get('/api/admin/agents/pending', requireAdmin, handleGetPendingAgents);
router.post('/api/admin/agents/:id/activate', requireAdmin, handleActivateAgent);

// Emergency controls
router.post('/api/admin/agents/emergency-stop', requireAdmin, handleEmergencyStop);
router.post('/api/admin/agents/resume', requireAdmin, handleResumeAgents);

// Audit & permissions
router.get('/api/admin/agent-audits', requireAdmin, handleGetWriteAudits);
router.get('/api/admin/agent-permissions', requireAdmin, handleGetPermissions);

// Health dashboard
router.get('/api/admin/agent-health', requireAdmin, handleGetAgentHealth);

// Safety alerts
router.get('/api/admin/agent-safety-alerts', requireAdmin, handleGetSafetyAlerts);

export default router;
