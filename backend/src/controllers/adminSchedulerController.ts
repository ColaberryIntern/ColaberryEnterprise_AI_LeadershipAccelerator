import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { getSetting, setSetting } from '../services/settingsService';
import { logActivity } from '../services/activityService';
import ScheduledEmail from '../models/ScheduledEmail';
import { CampaignLead } from '../models';
import { validateCampaignForPublish } from '../services/campaignLinkService';

// ─── Pause Scheduler ────────────────────────────────────────────────────────

export async function handlePauseScheduler(req: Request, res: Response): Promise<void> {
  try {
    const adminId = (req as any).adminId;
    await setSetting('scheduler_paused', true, adminId);

    await logActivity({
      lead_id: 0,
      type: 'system',
      subject: 'Scheduler paused',
      body: `Scheduler paused by admin`,
      metadata: { admin_id: adminId, action: 'scheduler_pause' },
    }).catch(() => {});

    console.log(`[SchedulerControl] Scheduler paused by admin ${adminId}`);
    res.json({ paused: true });
  } catch (err: any) {
    console.error('[SchedulerControl] Pause error:', err.message);
    res.status(500).json({ error: 'Failed to pause scheduler' });
  }
}

// ─── Resume Scheduler ───────────────────────────────────────────────────────

export async function handleResumeScheduler(req: Request, res: Response): Promise<void> {
  try {
    const adminId = (req as any).adminId;
    await setSetting('scheduler_paused', false, adminId);

    await logActivity({
      lead_id: 0,
      type: 'system',
      subject: 'Scheduler resumed',
      body: `Scheduler resumed by admin`,
      metadata: { admin_id: adminId, action: 'scheduler_resume' },
    }).catch(() => {});

    console.log(`[SchedulerControl] Scheduler resumed by admin ${adminId}`);
    res.json({ paused: false });
  } catch (err: any) {
    console.error('[SchedulerControl] Resume error:', err.message);
    res.status(500).json({ error: 'Failed to resume scheduler' });
  }
}

// ─── Scheduler Status ───────────────────────────────────────────────────────

export async function handleGetSchedulerStatus(_req: Request, res: Response): Promise<void> {
  try {
    const paused = await getSetting('scheduler_paused');
    const lastRun = await getSetting('scheduler_last_run');

    const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);

    const [pendingCount, processingCount, staleCount] = await Promise.all([
      ScheduledEmail.count({ where: { status: 'pending' } }),
      ScheduledEmail.count({ where: { status: 'processing' } }),
      ScheduledEmail.count({
        where: {
          status: 'processing',
          processing_started_at: { [Op.lt]: staleThreshold },
        },
      }),
    ]);

    res.json({
      paused: paused === true || paused === 'true',
      pending_count: pendingCount,
      processing_count: processingCount,
      stale_count: staleCount,
      last_run: lastRun || null,
    });
  } catch (err: any) {
    console.error('[SchedulerControl] Status error:', err.message);
    res.status(500).json({ error: 'Failed to get scheduler status' });
  }
}

// ─── Launch Readiness ───────────────────────────────────────────────────────

export async function handleGetLaunchReadiness(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const checks: { name: string; passed: boolean; detail: string }[] = [];
    const warnings: string[] = [];

    // 1. Run existing publish validation
    const validation = await validateCampaignForPublish(id as string);
    for (const error of validation.errors) {
      checks.push({ name: 'publish_validation', passed: false, detail: error });
    }
    if (validation.valid) {
      checks.push({ name: 'publish_validation', passed: true, detail: 'All publish checks passed' });
    }

    // 2. Check enrolled leads
    const enrolledCount = await CampaignLead.count({
      where: { campaign_id: id, status: 'active' },
    });
    checks.push({
      name: 'enrolled_leads',
      passed: enrolledCount > 0,
      detail: enrolledCount > 0
        ? `${enrolledCount} active lead(s) enrolled`
        : 'No active leads enrolled in this campaign',
    });

    // 3. Check test mode
    const testMode = await getSetting('test_mode_enabled');
    if (testMode === true || testMode === 'true') {
      warnings.push('Test mode is enabled — sends will be redirected to test addresses');
    }

    // 4. Check scheduler pause
    const paused = await getSetting('scheduler_paused');
    if (paused === true || paused === 'true') {
      warnings.push('Scheduler is currently paused — no sends will be processed');
    }

    const ready = checks.every((c) => c.passed) && warnings.length === 0;

    res.json({ ready, checks, warnings });
  } catch (err: any) {
    console.error('[SchedulerControl] Launch readiness error:', err.message);
    res.status(500).json({ error: 'Failed to check launch readiness' });
  }
}
