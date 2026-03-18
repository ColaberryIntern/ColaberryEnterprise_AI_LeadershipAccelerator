// ─── Production Launch Activation ────────────────────────────────────────────
// POST /api/admin/production-activate?mode=dry-run|execute
//
// Phases:
//  1. System state validation
//  2. Payment system validation
//  3. Campaign activation
//  4. Clear system modes (test, sandbox, kill switch)
//  5. Enable campaign agents
//  6. Trigger & safety validation
//  7. Final report
//
// SAFETY: Dry-run is default. Kill switch available for emergency rollback.

import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { sequelize } from '../../config/database';
import {
  Cohort, Enrollment, Campaign, CampaignLead, ScheduledEmail, AiAgent,
} from '../../models';
import { activateCampaign } from '../../services/campaignService';
import { getSetting, setSetting } from '../../services/settingsService';
import { isKillSwitchActive } from '../../services/launchSafety';

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

function envCheck(key: string): { value: string; configured: boolean } {
  const val = process.env[key] || '';
  return { value: val ? `${val.slice(0, 3)}***` : '(not set)', configured: !!val };
}

function envExact(key: string): string {
  return process.env[key] || '';
}

// ─── Main Endpoint ──────────────────────────────────────────────────────────

router.post('/api/admin/production-activate', async (req: Request, res: Response) => {
  const mode = (req.query.mode as string) || 'dry-run';
  const isExecute = mode === 'execute';
  const report: Record<string, any> = {
    mode,
    timestamp: new Date().toISOString(),
    errors: [] as string[],
    warnings: [] as string[],
    recommendations: [] as string[],
  };

  try {
    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 1 — SYSTEM STATE VALIDATION
    // ═════════════════════════════════════════════════════════════════════════

    const systemState: Record<string, any> = {};

    // 1a. Check cohorts — no test cohorts should exist
    const allCohorts = await Cohort.findAll({ raw: true }) as any[];
    const testCohorts = allCohorts.filter((c: any) => /^Cohort\s+\d+/i.test(c.name));
    systemState.cohorts = {
      total: allCohorts.length,
      test_cohorts: testCohorts.length,
      names: allCohorts.map((c: any) => c.name),
    };
    if (testCohorts.length > 0) {
      report.errors.push(`${testCohorts.length} test cohorts still exist — run production-cleanup first`);
    }

    // 1b. Check enrollments
    const totalEnrollments = await Enrollment.count();
    systemState.enrollments = totalEnrollments;

    // 1c. Kill switch status
    const killSwitchActive = await isKillSwitchActive();
    systemState.kill_switch = killSwitchActive;
    if (killSwitchActive && !isExecute) {
      report.warnings.push('Kill switch is active — execute mode will clear it');
    }

    // 1d. Test mode / sandbox mode
    let testModeEnabled = false;
    let sandboxMode = false;
    try { testModeEnabled = (await getSetting('test_mode_enabled')) === true || (await getSetting('test_mode_enabled')) === 'true'; } catch { /* not set */ }
    try { sandboxMode = (await getSetting('sandbox_mode')) === true || (await getSetting('sandbox_mode')) === 'true'; } catch { /* not set */ }
    systemState.test_mode_enabled = testModeEnabled;
    systemState.sandbox_mode = sandboxMode;
    if (testModeEnabled) report.warnings.push('test_mode_enabled is ON — execute mode will clear it');
    if (sandboxMode) report.warnings.push('sandbox_mode is ON — execute mode will clear it');

    // 1e. All campaigns with status
    const allCampaigns = await Campaign.findAll({
      attributes: ['id', 'name', 'status', 'approval_status', 'type', 'campaign_mode', 'settings', 'channel_config', 'ramp_state'],
      order: [['name', 'ASC']],
      raw: true,
    }) as any[];

    const campaignSummary: any[] = [];
    for (const c of allCampaigns) {
      const leadCount = await CampaignLead.count({ where: { campaign_id: c.id } }).catch(() => 0);
      const settings = typeof c.settings === 'string' ? JSON.parse(c.settings) : (c.settings || {});
      const hasTestMode = settings.test_mode_enabled === true;

      let action = 'no_action';
      if (c.status === 'active') action = 'already_active';
      else if (c.status === 'draft' && (c.approval_status === 'approved' || c.approval_status === 'live')) action = 'will_activate';
      else if (c.status === 'paused') action = 'will_reactivate';
      else if (c.status === 'draft') action = 'needs_approval';
      else action = 'skip';

      if (hasTestMode) {
        report.warnings.push(`Campaign "${c.name}" has test_mode_enabled in settings`);
      }

      campaignSummary.push({
        id: c.id,
        name: c.name,
        type: c.type,
        status: c.status,
        approval_status: c.approval_status || 'none',
        campaign_mode: c.campaign_mode || 'standard',
        leads: leadCount,
        action,
        test_mode_in_settings: hasTestMode,
      });
    }

    const statusBreakdown: Record<string, number> = {};
    for (const c of campaignSummary) {
      statusBreakdown[c.status] = (statusBreakdown[c.status] || 0) + 1;
    }

    systemState.campaigns = {
      total: allCampaigns.length,
      status_breakdown: statusBreakdown,
      details: campaignSummary,
    };

    // Cold outbound specific check
    const coldOutbound = campaignSummary.find((c: any) => c.type === 'cold_outbound');
    if (coldOutbound) {
      if (coldOutbound.status === 'draft' && coldOutbound.leads === 0) {
        report.warnings.push(`Cold Outbound campaign "${coldOutbound.name}" is draft with 0 leads — needs Apollo import`);
      } else if (coldOutbound.status === 'draft' && coldOutbound.action === 'needs_approval') {
        report.warnings.push(`Cold Outbound campaign "${coldOutbound.name}" needs approval before activation`);
      }
    }

    report.phase_1_system_state = systemState;

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 2 — PAYMENT SYSTEM VALIDATION
    // ═════════════════════════════════════════════════════════════════════════

    const paymentConfig: Record<string, any> = {};

    paymentConfig.payment_mode = envExact('PAYMENT_MODE') || 'not_set';
    paymentConfig.paysimple_env = envExact('PAYSIMPLE_ENV') || 'not_set';
    paymentConfig.frontend_url = envExact('FRONTEND_URL') || 'not_set';
    paymentConfig.paysimple_api_user = envCheck('PAYSIMPLE_API_USER');
    paymentConfig.paysimple_api_key = envCheck('PAYSIMPLE_API_KEY');
    paymentConfig.paysimple_webhook_secret = envCheck('PAYSIMPLE_WEBHOOK_SECRET');

    // Payment readiness checks
    paymentConfig.is_live = paymentConfig.payment_mode === 'live' && paymentConfig.paysimple_env === 'live';

    if (paymentConfig.payment_mode !== 'live') {
      report.warnings.push(`PAYMENT_MODE is "${paymentConfig.payment_mode}" — must be "live" for production ($4,500 charges)`);
    }
    if (paymentConfig.paysimple_env !== 'live') {
      report.warnings.push(`PAYSIMPLE_ENV is "${paymentConfig.paysimple_env}" — must be "live" for production API`);
    }
    if (!paymentConfig.paysimple_api_key.configured) {
      report.errors.push('PAYSIMPLE_API_KEY is not configured');
    }
    if (!paymentConfig.paysimple_webhook_secret.configured) {
      report.warnings.push('PAYSIMPLE_WEBHOOK_SECRET is not configured — webhooks will process without signature verification');
    }
    if (paymentConfig.frontend_url !== 'https://enterprise.colaberry.ai') {
      report.warnings.push(`FRONTEND_URL is "${paymentConfig.frontend_url}" — expected "https://enterprise.colaberry.ai"`);
    }

    report.phase_2_payment = paymentConfig;

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 3 — CAMPAIGN ACTIVATION (Execute Mode Only)
    // ═════════════════════════════════════════════════════════════════════════

    if (isExecute) {
      const activationResults: Record<string, any> = {
        activated: 0,
        already_active: 0,
        needs_approval: 0,
        skipped: 0,
        errors: [] as string[],
        details: [] as any[],
      };

      for (const c of campaignSummary) {
        if (c.action === 'already_active') {
          activationResults.already_active++;
          activationResults.details.push({ name: c.name, result: 'already_active' });

        } else if (c.action === 'will_activate' || c.action === 'will_reactivate') {
          try {
            await activateCampaign(c.id);
            activationResults.activated++;
            activationResults.details.push({ name: c.name, result: 'activated' });
          } catch (err: any) {
            activationResults.errors.push(`${c.name}: ${err.message}`);
            activationResults.details.push({ name: c.name, result: `error: ${err.message}` });
            report.errors.push(`Failed to activate "${c.name}": ${err.message}`);
          }

        } else if (c.action === 'needs_approval') {
          activationResults.needs_approval++;
          activationResults.details.push({ name: c.name, result: 'needs_approval' });

        } else {
          activationResults.skipped++;
          activationResults.details.push({ name: c.name, result: 'skipped' });
        }
      }

      // Clear test_mode_enabled from individual campaign settings
      for (const c of allCampaigns) {
        const settings = typeof c.settings === 'string' ? JSON.parse(c.settings) : (c.settings || {});
        if (settings.test_mode_enabled) {
          settings.test_mode_enabled = false;
          await Campaign.update({ settings } as any, { where: { id: c.id } });
          activationResults.details.push({ name: c.name, result: 'cleared_test_mode' });
        }
      }

      report.phase_3_campaigns = activationResults;
    } else {
      const preview: Record<string, number> = {
        will_activate: campaignSummary.filter((c: any) => c.action === 'will_activate').length,
        will_reactivate: campaignSummary.filter((c: any) => c.action === 'will_reactivate').length,
        already_active: campaignSummary.filter((c: any) => c.action === 'already_active').length,
        needs_approval: campaignSummary.filter((c: any) => c.action === 'needs_approval').length,
        skip: campaignSummary.filter((c: any) => c.action === 'skip').length,
      };
      report.phase_3_campaigns = { status: 'dry-run preview', plan: preview };
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 4 — CLEAR SYSTEM MODES (Execute Mode Only)
    // ═════════════════════════════════════════════════════════════════════════

    if (isExecute) {
      const modesCleared: Record<string, boolean> = {};

      if (testModeEnabled) {
        await setSetting('test_mode_enabled', false);
        modesCleared.test_mode_enabled = true;
      }
      if (sandboxMode) {
        await setSetting('sandbox_mode', false);
        modesCleared.sandbox_mode = true;
      }
      if (killSwitchActive) {
        await setSetting('system_kill_switch', false);
        modesCleared.system_kill_switch = true;
      }

      report.phase_4_modes_cleared = Object.keys(modesCleared).length > 0
        ? modesCleared
        : { status: 'all modes already clear' };
    } else {
      report.phase_4_modes_cleared = {
        status: 'dry-run preview',
        would_clear: {
          test_mode_enabled: testModeEnabled,
          sandbox_mode: sandboxMode,
          system_kill_switch: killSwitchActive,
        },
      };
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 5 — ENABLE CAMPAIGN AGENTS (Execute Mode Only)
    // ═════════════════════════════════════════════════════════════════════════

    const campaignAgentCategories = [
      'campaign_ops', 'email', 'sms', 'voice', 'outbound', 'messaging',
      'admissions_email', 'admissions_sms', 'admissions_voice',
    ];

    const campaignAgents = await AiAgent.findAll({
      where: { category: { [Op.in]: campaignAgentCategories } },
      attributes: ['id', 'agent_name', 'category', 'enabled'],
      raw: true,
    }) as any[];

    const enabledAgents = campaignAgents.filter((a: any) => a.enabled);
    const disabledAgents = campaignAgents.filter((a: any) => !a.enabled);

    if (isExecute && disabledAgents.length > 0) {
      for (const a of disabledAgents) {
        await AiAgent.update({ enabled: true }, { where: { id: a.id } });
      }
      report.phase_5_agents = {
        total: campaignAgents.length,
        already_enabled: enabledAgents.length,
        newly_enabled: disabledAgents.length,
        enabled_names: disabledAgents.map((a: any) => a.agent_name),
      };
    } else {
      report.phase_5_agents = {
        total: campaignAgents.length,
        enabled: enabledAgents.length,
        disabled: disabledAgents.length,
        disabled_names: disabledAgents.map((a: any) => a.agent_name),
        status: isExecute ? 'all already enabled' : 'dry-run preview',
      };
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 6 — TRIGGER & SAFETY VALIDATION (Both Modes)
    // ═════════════════════════════════════════════════════════════════════════

    const validation: Record<string, any> = {};

    // 6a. Leads in multiple active campaigns
    const duplicateCampaignLeads = await sequelize.query(
      `SELECT cl.lead_id, COUNT(*) as campaign_count
       FROM campaign_leads cl
       JOIN campaigns c ON cl.campaign_id = c.id
       WHERE cl.status IN ('enrolled', 'active')
         AND c.type IN ('payment_readiness', 'warm_nurture')
         AND c.status = 'active'
       GROUP BY cl.lead_id
       HAVING COUNT(*) > 1`,
      { type: 'SELECT' as any },
    );
    validation.leads_in_multiple_campaigns = (duplicateCampaignLeads as any[]).length;
    if ((duplicateCampaignLeads as any[]).length > 0) {
      report.warnings.push(`${(duplicateCampaignLeads as any[]).length} leads enrolled in multiple active campaigns`);
    }

    // 6b. Duplicate pending scheduled emails
    const duplicateEmails = await sequelize.query(
      `SELECT lead_id, campaign_id, step_index, COUNT(*) as dup_count
       FROM scheduled_emails
       WHERE status IN ('pending', 'processing')
       GROUP BY lead_id, campaign_id, step_index
       HAVING COUNT(*) > 1`,
      { type: 'SELECT' as any },
    );
    validation.duplicate_scheduled_emails = (duplicateEmails as any[]).length;
    if ((duplicateEmails as any[]).length > 0) {
      report.errors.push(`${(duplicateEmails as any[]).length} duplicate pending scheduled emails detected`);
    }

    // 6c. Back-to-back voice calls (< 2 day gap)
    const backToBackCalls = await sequelize.query(
      `SELECT se1.lead_id, se1.scheduled_for as call1, se2.scheduled_for as call2
       FROM scheduled_emails se1
       JOIN scheduled_emails se2 ON se1.lead_id = se2.lead_id
         AND se1.campaign_id = se2.campaign_id
         AND se1.id < se2.id
       WHERE se1.channel = 'voice' AND se2.channel = 'voice'
         AND se1.status IN ('pending', 'processing')
         AND se2.status IN ('pending', 'processing')
         AND se2.scheduled_for - se1.scheduled_for < INTERVAL '2 days'`,
      { type: 'SELECT' as any },
    );
    validation.back_to_back_voice_calls = (backToBackCalls as any[]).length;
    if ((backToBackCalls as any[]).length > 0) {
      report.warnings.push(`${(backToBackCalls as any[]).length} back-to-back voice calls (< 2 day gap)`);
    }

    // 6d. Campaigns with test_mode in settings
    const testModeCampaigns = campaignSummary.filter((c: any) => c.test_mode_in_settings);
    validation.campaigns_with_test_mode = testModeCampaigns.length;

    // 6e. Pending scheduled email count
    const pendingEmails = await ScheduledEmail.count({
      where: { status: { [Op.in]: ['pending', 'processing'] } },
    }).catch(() => 0);
    validation.pending_scheduled_emails = pendingEmails;

    // 6f. Active campaigns list
    const activeCampaigns = campaignSummary.filter((c: any) => c.status === 'active' || (isExecute && (c.action === 'will_activate' || c.action === 'will_reactivate')));
    validation.active_campaign_count = activeCampaigns.length;
    validation.active_campaigns = activeCampaigns.map((c: any) => ({
      name: c.name,
      type: c.type,
      mode: c.campaign_mode,
      leads: c.leads,
    }));

    report.phase_6_trigger_validation = validation;

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 7 — RECOMMENDATIONS
    // ═════════════════════════════════════════════════════════════════════════

    if (report.errors.length === 0 && isExecute) {
      report.recommendations.push('System is LIVE. Monitor logs for 15 minutes.');
      report.recommendations.push('Kill switch available at POST /api/admin/system/kill-switch if needed.');
    }
    if (!isExecute && report.errors.length === 0) {
      report.recommendations.push('Dry-run passed. Ready to execute with ?mode=execute');
    }
    if (coldOutbound && coldOutbound.leads === 0) {
      report.recommendations.push('Import Apollo leads before activating Cold Outbound campaign.');
    }

    report.success = report.errors.length === 0;
    res.json(report);
  } catch (err: any) {
    report.success = false;
    report.errors.push(err.message || 'Unknown error');
    console.error('[ProductionActivation] Error:', err);
    res.status(500).json(report);
  }
});

export default router;
