import { sequelize } from '../../config/database';
import type { HealthCheck } from '../systemHealthService';

/**
 * The campaign-specific health checks (moved here by Phase 6, T609).
 *
 * ─── WHY A SECOND EXTRACTION ────────────────────────────────────────────────
 *
 * Moving `checkSequenceProgression` out took `systemHealthService.ts` from 639
 * to 565 lines, which is still over the repo's 500-line hard ceiling - and the
 * ceiling's rule is that a file over it is split BEFORE a line is added, not
 * afterwards. T609 adds a ninth check, so a second block had to leave first.
 *
 * `checkExternalAPIs` is the larger block and was the obvious candidate. It is
 * the one that must NOT move: it calls `require('../config/env')` and
 * `require('../config/database')` inside its own `try`, so relocating it would
 * re-resolve those relative paths against `services/health/` and the resulting
 * MODULE_NOT_FOUND would be caught by that `try` and reported as a routine
 * "check failed" warning. The suite would stay green and the platform would
 * quietly stop checking its own outbound mail. This function uses only the
 * top-level `sequelize` import, like the first extraction, so it moves without
 * touching a single path.
 *
 * ─── VERBATIM, AND PINNED ───────────────────────────────────────────────────
 *
 * The body is byte-identical to the lines it came from; its md5 (8db7908488e934c0bf96cfb80fa3709b)
 * and the checks it pushes are pinned by
 * `sequenceProgressionCheck.characterization.test.ts` alongside the first
 * extraction's. Only the declaration gained `export`.
 *
 * ─── ONE THING A READER SHOULD KNOW, LEFT AS IT WAS ─────────────────────────
 *
 * This "check" WRITES: it runs `UPDATE campaigns SET status = 'active' …` when
 * it finds a draft cold-outbound campaign. A health check that repairs what it
 * inspects is surprising, and worth knowing before anyone calls this function
 * from somewhere new or on a read-only replica. It is preserved exactly as it
 * was, because this task is a move: changing behaviour here would be a
 * different change needing its own reasoning and its own test.
 */

// ── 8. Campaign-Specific Checks (moved from inline health monitor) ──────────
export async function checkCampaignHealth(checks: HealthCheck[]): Promise<void> {
  try {
    // Stuck-in-processing actions
    const [stuckRows] = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM scheduled_emails WHERE status = 'processing' AND processing_started_at < NOW() - INTERVAL '10 minutes'`
    );
    const stuckCount = parseInt((stuckRows as any)[0]?.cnt || '0', 10);
    if (stuckCount > 0) {
      checks.push({ name: 'stuck_actions', severity: 'warning', detail: `${stuckCount} actions stuck in processing for over 10 minutes. The stale recovery job should clean these up.`, metric: stuckCount });
    }

    // Cold Outbound draft check
    const [coldRows] = await sequelize.query(
      `SELECT status FROM campaigns WHERE name LIKE '%Cold Outbound%' LIMIT 1`
    );
    if ((coldRows as any)[0]?.status === 'draft') {
      // Auto-fix
      await sequelize.query(`UPDATE campaigns SET status = 'active' WHERE name LIKE '%Cold Outbound%' AND status = 'draft'`);
      checks.push({
        name: 'cold_outbound_status',
        severity: 'warning',
        detail: 'Cold Outbound campaign had reverted to draft status.',
        autoFixed: 'Auto-reactivated Cold Outbound to active.',
      });
    }

    // No sends gap
    const [sendRows] = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM scheduled_emails WHERE status = 'sent' AND sent_at >= NOW() - INTERVAL '1 hour'`
    );
    const recentSends = parseInt((sendRows as any)[0]?.cnt || '0', 10);
    const [pendingRows] = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM scheduled_emails WHERE status = 'pending' AND scheduled_for <= NOW()`
    );
    const pastDuePending = parseInt((pendingRows as any)[0]?.cnt || '0', 10);

    // Only flag send gap during weekday business hours (campaigns don't send on weekends)
    const nowCT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const dayOfWeek = nowCT.getDay(); // 0=Sun, 6=Sat
    const hourCT = nowCT.getHours();
    const isBusinessHours = dayOfWeek >= 1 && dayOfWeek <= 5 && hourCT >= 8 && hourCT < 17;

    if (recentSends === 0 && pastDuePending > 0 && isBusinessHours) {
      checks.push({
        name: 'send_throughput',
        severity: 'critical',
        detail: `No sends in the last hour, but ${pastDuePending} actions are past due and waiting. The scheduler may be stalled or all actions are failing.`,
        metric: pastDuePending,
      });
    } else if (recentSends === 0 && pastDuePending > 0 && !isBusinessHours) {
      // Expected — campaigns only send during business hours
      checks.push({
        name: 'send_throughput',
        severity: 'ok',
        detail: `${pastDuePending} actions past due but outside business hours (weekdays 8AM-5PM CT). Will process when send window opens.`,
        metric: pastDuePending,
      });
    }

    // Failure spike
    const [failRows] = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM scheduled_emails WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '1 hour'`
    );
    const recentFails = parseInt((failRows as any)[0]?.cnt || '0', 10);
    if (recentFails > 5) {
      checks.push({
        name: 'action_failures',
        severity: 'warning',
        detail: `${recentFails} campaign actions failed in the last hour. Check email provider status and content generation logs.`,
        metric: recentFails,
      });
    }
  } catch (err: any) {
    checks.push({ name: 'campaign_health', severity: 'warning', detail: `Check failed: ${err.message}` });
  }
}
