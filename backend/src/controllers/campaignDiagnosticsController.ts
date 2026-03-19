/**
 * Campaign Diagnostics Controller
 *
 * Admin API endpoints for campaign audit, recovery, live test, and watchdog status.
 */
import { Request, Response } from 'express';
import { Op } from 'sequelize';
import {
  auditCampaignState,
  auditCampaignLeads,
  auditOutreachPipeline,
  runFullAudit,
} from '../services/campaignActivationAuditService';
import {
  resetRampState,
  rebuildCampaignQueue,
  verifyAndResumeScheduler,
  safeActivateCampaigns,
  runFullRecovery,
} from '../services/campaignRecoveryService';
import { getLastWatchdogResult } from '../services/campaignWatchdogService';
import { ScheduledEmail, CommunicationLog } from '../models';

// ── Phase 1: Global Audit ─────────────────────────────────────────────────

export async function handleGlobalAudit(_req: Request, res: Response): Promise<void> {
  try {
    const results = await auditCampaignState();

    const summary = {
      total: results.length,
      with_issues: results.filter((r) => r.issues.length > 0).length,
      with_warnings: results.filter((r) => r.warnings.length > 0).length,
      healthy: results.filter((r) => r.issues.length === 0 && r.warnings.length === 0).length,
    };

    res.json({ summary, campaigns: results });
  } catch (err: any) {
    console.error('[CampaignDiagnostics] Global audit error:', err.message);
    res.status(500).json({ error: 'Failed to run global audit' });
  }
}

// ── Phase 1-3: Single Campaign Full Audit ─────────────────────────────────

export async function handleCampaignAudit(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const result = await runFullAudit(id);
    res.json(result);
  } catch (err: any) {
    console.error('[CampaignDiagnostics] Campaign audit error:', err.message);
    res.status(500).json({ error: 'Failed to run campaign audit' });
  }
}

// ── Phase 4: Ramp Reset ──────────────────────────────────────────────────

export async function handleRampReset(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const { resetToPhase, force } = req.body || {};

    const result = await resetRampState(id, { resetToPhase, force });
    res.json(result);
  } catch (err: any) {
    console.error('[CampaignDiagnostics] Ramp reset error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to reset ramp state' });
  }
}

// ── Phase 5: Queue Rebuild ───────────────────────────────────────────────

export async function handleQueueRebuild(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const { dryRun } = req.body || {};

    const result = await rebuildCampaignQueue(id, { dryRun: dryRun === true });
    res.json(result);
  } catch (err: any) {
    console.error('[CampaignDiagnostics] Queue rebuild error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to rebuild queue' });
  }
}

// ── Phase 6: Scheduler Verify & Resume ───────────────────────────────────

export async function handleSchedulerVerify(_req: Request, res: Response): Promise<void> {
  try {
    const result = await verifyAndResumeScheduler();
    res.json(result);
  } catch (err: any) {
    console.error('[CampaignDiagnostics] Scheduler verify error:', err.message);
    res.status(500).json({ error: 'Failed to verify scheduler' });
  }
}

// ── Phase 7: Safe Activate ───────────────────────────────────────────────

export async function handleSafeActivate(req: Request, res: Response): Promise<void> {
  try {
    const { campaignIds } = req.body || {};
    if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
      res.status(400).json({ error: 'campaignIds array is required' });
      return;
    }

    const results = await safeActivateCampaigns(campaignIds);
    res.json({ results });
  } catch (err: any) {
    console.error('[CampaignDiagnostics] Safe activate error:', err.message);
    res.status(500).json({ error: 'Failed to activate campaigns' });
  }
}

// ── Phase 4-7: Full Recovery ─────────────────────────────────────────────

export async function handleFullRecovery(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const { dryRun, resetRamp } = req.body || {};

    const result = await runFullRecovery(id, {
      dryRun: dryRun === true,
      resetRamp: resetRamp === true,
    });

    res.json(result);
  } catch (err: any) {
    console.error('[CampaignDiagnostics] Full recovery error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to run full recovery' });
  }
}

// ── Phase 8: Live Test ───────────────────────────────────────────────────

export async function handleLiveTest(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Check ScheduledEmail for recent sends
    const recentSends = await ScheduledEmail.findAll({
      where: {
        campaign_id: id,
        status: 'sent',
        sent_at: { [Op.gte]: fiveMinAgo },
      },
      attributes: ['id', 'channel', 'to_email', 'to_phone', 'sent_at', 'subject'],
      order: [['sent_at', 'DESC']],
      limit: 20,
    });

    // Check CommunicationLog for recent sends
    const recentLogs = await CommunicationLog.count({
      where: {
        campaign_id: id,
        status: 'sent',
        created_at: { [Op.gte]: fiveMinAgo },
      },
    });

    // Check pending actions
    const pendingActions = await ScheduledEmail.count({
      where: {
        campaign_id: id,
        status: 'pending',
        scheduled_for: { [Op.lte]: new Date() },
      },
    });

    const sending = recentSends.length > 0;

    res.json({
      sending,
      messages_sent_last_5min: recentSends.length,
      communication_logs_last_5min: recentLogs,
      pending_overdue_actions: pendingActions,
      recent_sends: recentSends.map((s: any) => ({
        id: s.id,
        channel: s.channel,
        to: s.to_email || s.to_phone,
        subject: s.subject,
        sent_at: s.sent_at,
      })),
      verdict: sending
        ? 'PASS — Campaign is actively sending messages'
        : pendingActions > 0
          ? 'WAITING — Overdue actions exist but none sent yet (scheduler may be processing)'
          : 'FAIL — No recent sends and no overdue actions',
    });
  } catch (err: any) {
    console.error('[CampaignDiagnostics] Live test error:', err.message);
    res.status(500).json({ error: 'Failed to run live test' });
  }
}

// ── Watchdog Status ──────────────────────────────────────────────────────

export async function handleWatchdogStatus(_req: Request, res: Response): Promise<void> {
  try {
    const lastResult = getLastWatchdogResult();

    if (!lastResult) {
      res.json({
        running: false,
        message: 'Watchdog has not run yet since last server restart',
      });
      return;
    }

    const issueCount = lastResult.checks.filter((c) => c.status !== 'ok').length;

    res.json({
      running: true,
      last_run: lastResult.timestamp,
      duration_ms: lastResult.duration_ms,
      checks_count: lastResult.checks.length,
      issues_found: issueCount,
      auto_actions_taken: lastResult.autoActions.length,
      checks: lastResult.checks,
      auto_actions: lastResult.autoActions,
    });
  } catch (err: any) {
    console.error('[CampaignDiagnostics] Watchdog status error:', err.message);
    res.status(500).json({ error: 'Failed to get watchdog status' });
  }
}
