import { Request, Response } from 'express';
import { getAgentDetail } from '../services/reese/agentDetailService';

// Agent Detail — read-only, requireAdmin-gated (route layer), same 500-on-
// unexpected-failure / never-a-raw-stack-trace posture as workLedgerHealthController.ts.
export async function getAgentDetailStats(req: Request, res: Response) {
  try {
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    if (!id) {
      res.status(400).json({ error: 'Agent id is required' });
      return;
    }
    const detail = await getAgentDetail(id);
    if (!detail) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json(detail);
  } catch (err: any) {
    console.error('[AgentDetail] Error:', err.message);
    res.status(500).json({ error: 'Failed to load agent detail' });
  }
}
