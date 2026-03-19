/**
 * Campaign Watchdog Service — Phases 9-10 (Monitoring Guardrails + Failsafe)
 *
 * Continuous monitoring that detects silent failures and auto-recovers:
 * - No sends in 10 min with pending actions → alert
 * - Empty queue for active campaigns → auto-rebuild
 * - High error rate → critical alert
 * - Scheduler paused too long → warning alert
 * - Stale processing actions → auto-recover
 *
 * Runs every 7 minutes via cron (see schedulerService.ts).
 */
import { Op } from 'sequelize';
import {
  Campaign,
  CampaignLead,
  ScheduledEmail,
  CommunicationLog,
} from '../models';
import { getSetting } from './settingsService';
import { emitAlert } from './alertService';
import { logAiEvent } from './aiEventService';
import { rebuildCampaignQueue } from './campaignRecoveryService';

// ── Types ────────────────────────────────────────────────────────────────────

interface WatchdogCheck {
  name: string;
  status: 'ok' | 'warning' | 'critical' | 'auto_fixed';
  detail: string;
  action?: string;
}

export interface WatchdogResult {
  timestamp: string;
  checks: WatchdogCheck[];
  autoActions: { campaignId: string; action: string; result: string }[];
  duration_ms: number;
}

// In-memory state for watchdog status endpoint
let lastWatchdogResult: WatchdogResult | null = null;

export function getLastWatchdogResult(): WatchdogResult | null {
  return lastWatchdogResult;
}

// ── Main Watchdog Loop ───────────────────────────────────────────────────────

export async function runWatchdog(): Promise<WatchdogResult> {
  const startTime = Date.now();
  const checks: WatchdogCheck[] = [];
  const autoActions: WatchdogResult['autoActions'] = [];

  try {
    // ── Check 1: No sends in 10 minutes ─────────────────────────────────
    await checkNoRecentSends(checks);

    // ── Check 2: Empty queue for active campaigns ───────────────────────
    await checkEmptyQueues(checks, autoActions);

    // ── Check 3: High error rate ────────────────────────────────────────
    await checkErrorRate(checks);

    // ── Check 4: Scheduler paused too long ──────────────────────────────
    await checkSchedulerPaused(checks);

    // ── Check 5: Stale processing actions ───────────────────────────────
    await checkStaleProcessing(checks, autoActions);
  } catch (err: any) {
    checks.push({
      name: 'watchdog_internal_error',
      status: 'critical',
      detail: `Watchdog encountered an error: ${err.message}`,
    });
  }

  const result: WatchdogResult = {
    timestamp: new Date().toISOString(),
    checks,
    autoActions,
    duration_ms: Date.now() - startTime,
  };

  lastWatchdogResult = result;

  // Log watchdog run
  const hasIssues = checks.some((c) => c.status !== 'ok');
  if (hasIssues) {
    await logAiEvent('CampaignWatchdog', 'watchdog_run', undefined, undefined, {
      checks_count: checks.length,
      issues: checks.filter((c) => c.status !== 'ok').map((c) => ({ name: c.name, status: c.status })),
      auto_actions: autoActions.length,
      duration_ms: result.duration_ms,
    }).catch(() => {});
  }

  return result;
}

// ── Check Implementations ────────────────────────────────────────────────────

async function checkNoRecentSends(checks: WatchdogCheck[]): Promise<void> {
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);

  // Count recent outbound sends
  const recentSends = await CommunicationLog.count({
    where: {
      direction: 'outbound',
      status: 'sent',
      created_at: { [Op.gte]: tenMinAgo },
    },
  });

  // Count pending actions that should have been sent
  const overduePending = await ScheduledEmail.count({
    where: {
      status: 'pending',
      scheduled_for: { [Op.lte]: new Date() },
    },
  });

  if (recentSends === 0 && overduePending > 0) {
    checks.push({
      name: 'no_recent_sends',
      status: 'warning',
      detail: `0 sends in last 10 min but ${overduePending} overdue pending actions exist`,
    });

    await emitAlert({
      type: 'warning',
      severity: 3,
      title: 'Campaign Watchdog: No sends in 10 minutes',
      description: `No outbound messages sent in the last 10 minutes, but ${overduePending} actions are overdue. The scheduler may be stalled or paused.`,
      sourceType: 'system',
      impactArea: 'campaigns',
      urgency: 'high',
      metadata: { overdue_pending: overduePending, recent_sends: 0 },
    }).catch(() => {});
  } else {
    checks.push({
      name: 'no_recent_sends',
      status: 'ok',
      detail: `${recentSends} sends in last 10 min, ${overduePending} overdue pending`,
    });
  }
}

async function checkEmptyQueues(
  checks: WatchdogCheck[],
  autoActions: WatchdogResult['autoActions'],
): Promise<void> {
  // Find active campaigns with active leads but no pending actions
  const activeCampaigns = await Campaign.findAll({
    where: { status: 'active' },
    attributes: ['id', 'name', 'sequence_id'],
  });

  let stalledCount = 0;

  for (const campaign of activeCampaigns) {
    if (!campaign.sequence_id) continue;

    const activeLeadCount = await CampaignLead.count({
      where: {
        campaign_id: campaign.id,
        status: { [Op.in]: ['enrolled', 'active'] },
      },
    });

    if (activeLeadCount === 0) continue;

    const pendingActions = await ScheduledEmail.count({
      where: {
        campaign_id: campaign.id,
        status: { [Op.in]: ['pending', 'processing'] },
      },
    });

    if (pendingActions === 0) {
      // Check if all leads have completed the sequence (not actually stalled)
      const completedLeads = await CampaignLead.count({
        where: { campaign_id: campaign.id, status: 'completed' },
      });
      const totalLeads = await CampaignLead.count({
        where: { campaign_id: campaign.id },
      });

      // Only stalled if there are non-completed leads with no pending actions
      if (activeLeadCount > 0) {
        stalledCount++;

        // Auto-rebuild queue
        try {
          const rebuild = await rebuildCampaignQueue(campaign.id);

          autoActions.push({
            campaignId: campaign.id,
            action: 'queue_rebuild',
            result: `Requeued ${rebuild.leadsRequeued} leads, created ${rebuild.actionsCreated} actions`,
          });

          await emitAlert({
            type: 'warning',
            severity: 2,
            title: `Watchdog: Auto-rebuilt queue for "${campaign.name}"`,
            description: `Campaign had ${activeLeadCount} active leads but 0 pending actions. Rebuilt queue: ${rebuild.leadsRequeued} leads re-enrolled.`,
            sourceType: 'system',
            impactArea: 'campaigns',
            entityType: 'campaign',
            entityId: campaign.id,
            urgency: 'medium',
            metadata: {
              active_leads: activeLeadCount,
              leads_requeued: rebuild.leadsRequeued,
              actions_created: rebuild.actionsCreated,
            },
          }).catch(() => {});
        } catch (err: any) {
          autoActions.push({
            campaignId: campaign.id,
            action: 'queue_rebuild_failed',
            result: err.message,
          });
        }
      }
    }
  }

  if (stalledCount > 0) {
    checks.push({
      name: 'empty_queues',
      status: 'auto_fixed',
      detail: `${stalledCount} stalled campaign(s) detected and auto-rebuilt`,
    });
  } else {
    checks.push({
      name: 'empty_queues',
      status: 'ok',
      detail: `All ${activeCampaigns.length} active campaigns have healthy queues`,
    });
  }
}

async function checkErrorRate(checks: WatchdogCheck[]): Promise<void> {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

  const [sentCount, failedCount] = await Promise.all([
    ScheduledEmail.count({
      where: { status: 'sent', sent_at: { [Op.gte]: thirtyMinAgo } },
    }),
    ScheduledEmail.count({
      where: { status: 'failed', created_at: { [Op.gte]: thirtyMinAgo } },
    }),
  ]);

  const total = sentCount + failedCount;
  if (total === 0) {
    checks.push({
      name: 'error_rate',
      status: 'ok',
      detail: 'No sends or failures in last 30 min (no data)',
    });
    return;
  }

  const errorRate = failedCount / total;

  if (errorRate > 0.2) {
    checks.push({
      name: 'error_rate',
      status: 'critical',
      detail: `Error rate ${(errorRate * 100).toFixed(1)}% (${failedCount} failed / ${total} total) in last 30 min`,
    });

    await emitAlert({
      type: 'critical',
      severity: 4,
      title: 'Campaign Watchdog: High error rate',
      description: `${(errorRate * 100).toFixed(1)}% of outbound actions failed in the last 30 minutes (${failedCount} failed out of ${total} total).`,
      sourceType: 'system',
      impactArea: 'campaigns',
      urgency: 'immediate',
      metadata: { error_rate: errorRate, failed: failedCount, sent: sentCount, total },
    }).catch(() => {});
  } else {
    checks.push({
      name: 'error_rate',
      status: 'ok',
      detail: `Error rate ${(errorRate * 100).toFixed(1)}% (${failedCount}/${total}) — within threshold`,
    });
  }
}

async function checkSchedulerPaused(checks: WatchdogCheck[]): Promise<void> {
  const paused = await getSetting('scheduler_paused');
  const isPaused = paused === true || paused === 'true';

  if (!isPaused) {
    checks.push({
      name: 'scheduler_paused',
      status: 'ok',
      detail: 'Scheduler is running',
    });
    return;
  }

  // Check how long it's been paused (look at the setting updated_at)
  // We can't easily get setting timestamp, so just alert that it's paused
  checks.push({
    name: 'scheduler_paused',
    status: 'warning',
    detail: 'Scheduler is paused — no sends will be processed. Manual resume required.',
  });

  await emitAlert({
    type: 'warning',
    severity: 3,
    title: 'Campaign Watchdog: Scheduler is paused',
    description: 'The campaign scheduler is currently paused. No outbound messages will be processed until an admin resumes it.',
    sourceType: 'system',
    impactArea: 'campaigns',
    urgency: 'high',
    metadata: { paused: true },
  }).catch(() => {});
}

async function checkStaleProcessing(
  checks: WatchdogCheck[],
  autoActions: WatchdogResult['autoActions'],
): Promise<void> {
  const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);

  const staleCount = await ScheduledEmail.count({
    where: {
      status: 'processing',
      processing_started_at: { [Op.lt]: staleThreshold },
    },
  });

  if (staleCount === 0) {
    checks.push({
      name: 'stale_processing',
      status: 'ok',
      detail: 'No stale processing actions',
    });
    return;
  }

  // Auto-recover stale actions
  const [recovered] = await ScheduledEmail.update(
    {
      status: 'pending',
      processing_started_at: null,
      processor_id: null,
    } as any,
    {
      where: {
        status: 'processing',
        processing_started_at: { [Op.lt]: staleThreshold },
      },
    },
  );

  checks.push({
    name: 'stale_processing',
    status: 'auto_fixed',
    detail: `Recovered ${recovered} stale processing actions (stuck >10 min)`,
  });

  autoActions.push({
    campaignId: 'global',
    action: 'stale_recovery',
    result: `Reset ${recovered} stale processing actions to pending`,
  });

  await logAiEvent('CampaignWatchdog', 'stale_recovery', undefined, undefined, {
    recovered: recovered,
  }).catch(() => {});
}
