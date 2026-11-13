import { Op, fn, col, where as sqlWhere } from 'sequelize';
import ApprovalRequest from '../../models/ApprovalRequest';

/**
 * Held autonomous outreach is still outreach, so it must count against the cadence and the daily cap.
 *
 * A send the authorization gate HOLDS deliberately writes no ReeseOutreach row (a hold is not a contact). But a hold
 * is not inert: `system:auto_approve_timeout` approves it a few hours later and approvalRequestReplayService performs
 * the DM. Before this module, wasContactedWithinCadence() and countAutonomousSendsToday() read ONLY ReeseOutreach, so
 * neither saw a held-then-replayed send, and the next sweep held the same student again. Measured on production,
 * 7 Oct to 12 Nov 2026: 851 replayed DMs to 52 students, one student 37 times, against a 7-day cadence and a 12/day
 * cap that were never consulted. The sweep was switched off on 13 Nov until this shipped.
 *
 * A row counts when it is the same action for the same student and is still live: `pending` (it will be decided or
 * auto-approved) or `approved` (it was, or is about to be, sent). `rejected` and `expired` never sent and do not count.
 */
const ACTION = 'reese_autonomous_outreach';
const LIVE: Array<'pending' | 'approved'> = ['pending', 'approved'];

/** True when a live held or replayed outreach for this student was created within the last `days` days. */
export async function hasLiveHeldOutreachWithin(enrollmentId: string, days: number, now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const row = await ApprovalRequest.findOne({
    where: {
      action: ACTION,
      status: { [Op.in]: LIVE },
      created_at: { [Op.gte]: since },
      [Op.and]: [sqlWhere(fn('jsonb_extract_path_text', col('prepared_action'), 'studentEnrollmentId'), enrollmentId)],
    },
    attributes: ['id'],
  });
  return Boolean(row);
}

/** Live held or replayed outreach rows created since the start of today (UTC), the same day boundary the send cap uses. */
export async function countLiveHeldOutreachToday(now = new Date()): Promise<number> {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return ApprovalRequest.count({
    where: { action: ACTION, status: { [Op.in]: LIVE }, created_at: { [Op.gte]: start } },
  });
}
