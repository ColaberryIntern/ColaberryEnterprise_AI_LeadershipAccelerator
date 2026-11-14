import { Op } from 'sequelize';
import MayaOutboundApproval from '../../models/MayaOutboundApproval';

/**
 * The expire-only sweep.
 *
 * -- WHAT THIS IS, AND WHAT THE THING IT IS NOT LOOKS LIKE --
 *
 * `services/workLedger/approvalRequestTimeoutJob.ts` is the same shape as this file and does
 * the opposite thing:
 *
 *     const expired = await ApprovalRequest.findAll({
 *       where: { status: 'pending', expires_at: { [Op.lt]: new Date() } },
 *     });
 *     for (const row of expired) {
 *       await approveApprovalRequest(row.id, 'system:auto_approve_timeout', 'auto_timeout');
 *     }
 *
 * It runs every fifteen minutes with no flag guard, scoped by no agent, no action and no
 * channel, and `services/reese/reeseOutreachHolds.ts` records what it cost: 851 replayed DMs to
 * 52 students between 7 Oct and 12 Nov 2026, one student 37 times, against a 7-day cadence and
 * a 12/day cap that were never consulted.
 *
 * The difference is one word. That one approves; this one expires. A message nobody decided is
 * not a message everybody agreed to.
 *
 * -- THREE INDEPENDENT REASONS THIS CANNOT APPROVE ANYTHING --
 *
 *   1. The UPDATE below writes the literal `'expired'` and no other status, and its WHERE pins
 *      the source state to `pending_approval`.
 *   2. It never writes `decided_by`, and the database would reject it if it tried to write the
 *      value a timer would use: `chk_moa_decider_is_a_person` refuses anything starting with
 *      `system:`.
 *   3. `expired` is terminal and is not in any delivery path. `approveOutbound` claims only
 *      rows still in `pending_approval`.
 *
 * -- IT IS NOT SCHEDULED, AND THAT IS ALSO DELIBERATE --
 *
 * Nothing in `schedulerService.ts` calls this. It is exported for the admin surface and for
 * tests, so the first run of this run's queue has no timer attached to it at all. When somebody
 * does schedule it, the three reasons above are what make that safe, and the containment tests
 * are what keep them true.
 */

export interface ExpirySweepResult {
  /** How many undecided messages stopped waiting. Never how many were sent. */
  expired: number;
}

/**
 * Move every undecided message past its deadline to `expired`.
 *
 * ONE conditional UPDATE rather than a read-then-write loop. The loop shape is what the
 * auto-approving sweep uses, and it has a race in it: a row read as pending can be approved by
 * a person between the read and the write. Pinning `status` in the WHERE means a message Ali
 * decided a moment ago is never expired out from under his decision.
 */
export async function sweepExpiredMayaOutbound(now: Date = new Date()): Promise<ExpirySweepResult> {
  const [expired] = await MayaOutboundApproval.update(
    { status: 'expired', updated_at: now },
    { where: { status: 'pending_approval', expires_at: { [Op.lt]: now } } },
  );
  if (expired > 0) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'info', service: 'maya',
      event: 'maya_outbound_expired', outcome: 'success',
      context: { expired, note: 'undecided messages stopped waiting; none was delivered' },
    }));
  }
  return { expired };
}
