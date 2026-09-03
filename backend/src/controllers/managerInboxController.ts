import { Request, Response } from 'express';
import { getManagerInboxItems, approveManagerInboxItem, rejectManagerInboxItem } from '../services/managerInboxService';

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

// AI Agent Dashboard redesign, Checkpoint B (2026-09-02) — the real,
// agent-scoped approve/reject actions this inbox has needed since it shipped
// read-only. Same auth gate as the GET above (requireAgentManagerOrAdmin at
// the route layer), plus a same-agent ownership check inside the service —
// a proposal id from a different agent 404s, it never silently acts on it.

export async function handleApproveManagerInboxItem(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const proposalId = req.params.proposalId as string;
    const { notes } = req.body;
    const adminEmail = (req as any).admin?.email || 'unknown';

    const result = await approveManagerInboxItem(id, proposalId, adminEmail, notes || null);
    if (result.outcome === 'not_found') return res.status(404).json({ error: 'Proposal not found for this agent' });
    if (result.outcome === 'not_pending') return res.status(400).json({ error: `Proposal is already ${result.item?.status}` });
    if (result.outcome === 'expired') return res.status(400).json({ error: 'Proposal has expired' });

    res.json({ success: true, applied: result.applied, item: result.item });
  } catch (err: any) {
    console.error('[ManagerInbox] Approve error:', err.message);
    res.status(500).json({ error: 'Failed to approve proposal' });
  }
}

export async function handleRejectManagerInboxItem(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const proposalId = req.params.proposalId as string;
    const { notes } = req.body;
    const adminEmail = (req as any).admin?.email || 'unknown';

    const result = await rejectManagerInboxItem(id, proposalId, adminEmail, notes || null);
    if (result.outcome === 'not_found') return res.status(404).json({ error: 'Proposal not found for this agent' });
    if (result.outcome === 'not_pending') return res.status(400).json({ error: `Proposal is already ${result.item?.status}` });

    res.json({ success: true, item: result.item });
  } catch (err: any) {
    console.error('[ManagerInbox] Reject error:', err.message);
    res.status(500).json({ error: 'Failed to reject proposal' });
  }
}
