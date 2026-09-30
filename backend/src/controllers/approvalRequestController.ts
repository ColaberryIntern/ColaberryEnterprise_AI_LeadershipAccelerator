import { Request, Response } from 'express';
import { z } from 'zod';
import {
  listPendingApprovalRequests,
  approveApprovalRequest,
  rejectApprovalRequest,
  bulkApproveApprovalRequests,
} from '../services/workLedger/approvalRequestResolutionService';

// Real-enforcement scoping, Phase 1 slice 1 — admin-only (requireAdmin at
// the route layer), same 500-on-unexpected-failure / never-a-raw-stack-trace
// posture as managerInboxController.ts.

export async function handleListApprovalRequests(_req: Request, res: Response) {
  try {
    const items = await listPendingApprovalRequests();
    res.json({ items });
  } catch (err: any) {
    console.error('[ApprovalRequests] List error:', err.message);
    res.status(500).json({ error: 'Failed to load pending approval requests' });
  }
}

export async function handleApproveApprovalRequest(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const adminEmail = (req as any).admin?.email || 'unknown';
    const result = await approveApprovalRequest(id, adminEmail);
    if (result.outcome === 'not_found') return res.status(404).json({ error: 'Approval request not found' });
    if (result.outcome === 'not_pending') return res.status(400).json({ error: `Already ${result.row?.status}` });
    res.json({ success: true, row: result.row });
  } catch (err: any) {
    console.error('[ApprovalRequests] Approve error:', err.message);
    res.status(500).json({ error: 'Failed to approve request' });
  }
}

export async function handleRejectApprovalRequest(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const adminEmail = (req as any).admin?.email || 'unknown';
    const result = await rejectApprovalRequest(id, adminEmail);
    if (result.outcome === 'not_found') return res.status(404).json({ error: 'Approval request not found' });
    if (result.outcome === 'not_pending') return res.status(400).json({ error: `Already ${result.row?.status}` });
    res.json({ success: true, row: result.row });
  } catch (err: any) {
    console.error('[ApprovalRequests] Reject error:', err.message);
    res.status(500).json({ error: 'Failed to reject request' });
  }
}

const bulkApproveSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});

export async function handleBulkApproveApprovalRequests(req: Request, res: Response) {
  try {
    const parsed = bulkApproveSchema.parse(req.body || {});
    const adminEmail = (req as any).admin?.email || 'unknown';
    const result = await bulkApproveApprovalRequests(parsed.ids, adminEmail);
    res.json(result);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', issues: err.issues });
    console.error('[ApprovalRequests] Bulk approve error:', err.message);
    res.status(500).json({ error: 'Failed to bulk-approve requests' });
  }
}
