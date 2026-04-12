import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';

const router = Router();

// List agent mappings for a capability
router.get('/api/admin/capability-agents/:capabilityId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { getAgentsForCapability } = await import('../../services/capabilityAgentMapService');
    const maps = await getAgentsForCapability(req.params.capabilityId as string);
    res.json(maps);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Get full history for a capability (including unlinked)
router.get('/api/admin/capability-agents/:capabilityId/history', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { getAgentHistory } = await import('../../services/capabilityAgentMapService');
    res.json(await getAgentHistory(req.params.capabilityId as string));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Reverse lookup: which capabilities use a specific agent?
router.get('/api/admin/agent-capabilities/:agentName', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { getCapabilitiesForAgent } = await import('../../services/capabilityAgentMapService');
    res.json(await getCapabilitiesForAgent(req.params.agentName as string));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Link an agent to a capability
router.post('/api/admin/capability-agents/:capabilityId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { agent_name, feature_id, role, config } = req.body;
    if (!agent_name) { res.status(400).json({ error: 'agent_name required' }); return; }
    const { linkAgent } = await import('../../services/capabilityAgentMapService');
    const map = await linkAgent(req.params.capabilityId as string, agent_name, { featureId: feature_id, role, config, linkedBy: 'admin' });
    res.json(map);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Unlink an agent from a capability
router.delete('/api/admin/capability-agents/:capabilityId/:agentName', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { unlinkAgent } = await import('../../services/capabilityAgentMapService');
    await unlinkAgent(req.params.capabilityId as string, req.params.agentName as string);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Sync mapping table from existing linked_agents arrays
router.post('/api/admin/capability-agents/sync', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { syncFromLinkedAgents } = await import('../../services/capabilityAgentMapService');
    const result = await syncFromLinkedAgents();
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
