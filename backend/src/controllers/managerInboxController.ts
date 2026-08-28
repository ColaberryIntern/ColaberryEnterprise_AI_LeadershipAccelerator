import { Request, Response } from 'express';
import { getManagerInboxItems } from '../services/managerInboxService';

// AI Workforce Management, Checkpoint C — requireAgentManagerOrAdmin-gated
// (route layer), same 500-on-unexpected-failure / never-a-raw-stack-trace
// posture as agentDetailController.ts.

export async function handleGetManagerInbox(req: Request, res: Response) {
  try {
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    if (!id) {
      res.status(400).json({ error: 'Agent id is required' });
      return;
    }
    const items = await getManagerInboxItems(id);
    if (!items) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json({ agentId: id, items });
  } catch (err: any) {
    console.error('[ManagerInbox] Error:', err.message);
    res.status(500).json({ error: 'Failed to load manager inbox' });
  }
}
