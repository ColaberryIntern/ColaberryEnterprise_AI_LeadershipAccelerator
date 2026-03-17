/**
 * Proposal Cleanup Service
 *
 * Runs daily to auto-expire pending proposals older than 7 days.
 * Expired proposals cannot be approved — enforced here and in handleApproveProposal.
 */

import { Op } from 'sequelize';
import ProposedAgentAction from '../models/ProposedAgentAction';
import { logAiEvent } from './aiEventService';

const SERVICE_NAME = 'ProposalCleanupService';

/**
 * Expire all pending proposals whose expires_at has passed.
 * Returns the number of proposals expired.
 */
export async function expireStaleProposals(): Promise<number> {
  const now = new Date();

  const [expiredCount] = await ProposedAgentAction.update(
    { status: 'expired' },
    {
      where: {
        status: 'pending',
        expires_at: { [Op.lt]: now },
      },
    },
  );

  if (expiredCount > 0) {
    await logAiEvent(SERVICE_NAME, 'proposals_expired', undefined, undefined, {
      expired_count: expiredCount,
      timestamp: now.toISOString(),
    });
    console.log(`[${SERVICE_NAME}] Expired ${expiredCount} stale proposals`);
  }

  return expiredCount;
}

/**
 * Get counts of proposals by status for monitoring.
 */
export async function getProposalStats(): Promise<Record<string, number>> {
  const pending = await ProposedAgentAction.count({ where: { status: 'pending' } });
  const approved = await ProposedAgentAction.count({ where: { status: 'approved' } });
  const rejected = await ProposedAgentAction.count({ where: { status: 'rejected' } });
  const expired = await ProposedAgentAction.count({ where: { status: 'expired' } });
  const applied = await ProposedAgentAction.count({ where: { status: 'applied' } });

  return { pending, approved, rejected, expired, applied };
}
