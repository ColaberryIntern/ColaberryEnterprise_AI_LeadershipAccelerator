import { Op } from 'sequelize';
import { ApprovalRequest } from '../../models';
import { approveApprovalRequest } from './approvalRequestResolutionService';

// Real-enforcement scoping, Phase 1 (2026-09-20) — the default path (nobody
// objects) still releases a held action within a bounded window, not
// indefinitely. Calls the SAME approveApprovalRequest() the admin UI's
// "Approve" button calls — one real code path, so it inherits the exact same
// replay + idempotency guard (approvalRequestReplayService.ts) for free, not
// a second, parallel "auto-approve and separately replay" implementation.

const decidedBy = 'system:auto_approve_timeout';

export async function sweepExpiredApprovalRequests(): Promise<void> {
  const expired = await ApprovalRequest.findAll({
    where: { status: 'pending', expires_at: { [Op.lt]: new Date() } },
  });

  for (const row of expired) {
    await approveApprovalRequest(row.id, decidedBy, 'auto_timeout');
  }
}
