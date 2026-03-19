import cron from 'node-cron';
import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import { ScheduledEmail, Lead, Cohort, Campaign, CampaignLead, StrategyCall, Enrollment, AiAgent, AiAgentActivityLog } from '../models';
import { env } from '../config/env';
import { logActivity } from './activityService';
import { triggerVoiceCall } from './synthflowService';
import { generateMessage, buildConversationHistory } from './aiMessageService';
import { recordActionOutcome } from './interactionService';
import { computeInsights } from './icpInsightService';
import { cancelPrepNudge, enrollInNoShowRecovery } from './strategyPrepService';
import { advancePipelineStage } from './pipelineService';
import { detectSignalsForRecentSessions } from './behavioralSignalService';
import { recomputeRecentIntentScores } from './intentScoringService';
import { evaluateBehavioralTriggers } from './behavioralTriggerService';
import { recomputeActiveOpportunityScores } from './opportunityScoringService';
import { getSetting } from './settingsService';
import { evaluateSend } from './communicationSafetyService';
import type { SendChannel } from './communicationSafetyService';
import { sendSmsViaGhl, addContactNote } from './ghlService';
import { logCommunication } from './communicationLogService';
import type { CampaignChannel } from '../models/ScheduledEmail';
import {
  getUpcomingSessions, getSessionsToMarkLive, getSessionsToMarkCompleted,
  detectAbsentParticipants, computeAllReadinessScores,
} from './acceleratorService';
import { sendSessionReminder, sendMissedSessionEmail, sendAbsenceAlert } from './emailService';

/**
 * Instrumentation wrapper for cron jobs.
 * Checks the agent registry for enabled/paused status, generates a trace_id,
 * measures duration, logs to ai_agent_activity_logs, and updates agent metrics.
 */
async function instrumentCronJob(agentName: string, fn: () => Promise<void>): Promise<void> {
  let agent: InstanceType<typeof AiAgent> | null = null;
  try {
    agent = await AiAgent.findOne({ where: { agent_name: agentName } });
  } catch {
    // If registry lookup fails, run the job anyway (don't break existing behavior)
    await fn();
    return;
  }

  // If agent not in registry, run untracked
  if (!agent) {
    await fn();
    return;
  }

  // Check enabled and paused status
  if (!agent.enabled || agent.status === 'paused') return;

  const traceId = uuidv4();
  const start = Date.now();
  let result: 'success' | 'failed' = 'success';
  let errorMsg: string | null = null;
  let stackTrace: string | null = null;

  try {
    await agent.update({ status: 'running' });
    await fn();
  } catch (err: any) {
    result = 'failed';
    errorMsg = err.message || String(err);
    stackTrace = err.stack || null;
  }

  const duration = Date.now() - start;
  const newRunCount = (agent.run_count || 0) + 1;
  const newAvgDuration = agent.avg_duration_ms
    ? Math.round((agent.avg_duration_ms * (newRunCount - 1) + duration) / newRunCount)
    : duration;

  const updateFields: Record<string, any> = {
    status: 'idle',
    run_count: newRunCount,
    avg_duration_ms: newAvgDuration,
    last_run_at: new Date(),
  };
  if (result === 'failed') {
    updateFields.error_count = (agent.error_count || 0) + 1;
    updateFields.last_error = errorMsg;
    updateFields.last_error_at = new Date();
  }

  try {
    await agent.update(updateFields);
    await AiAgentActivityLog.create({
      id: uuidv4(),
      agent_id: agent.id,
      action: agentName,
      result,
      confidence: null,
      reason: result === 'failed' ? errorMsg : `Completed in ${duration}ms`,
      details: null,
      trace_id: traceId,
      duration_ms: duration,
      stack_trace: stackTrace,
      created_at: new Date(),
    } as any);
  } catch (logErr: any) {
    console.error(`[Scheduler] Failed to log instrumentation for ${agentName}:`, logErr.message);
  }
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    // Prefer Mandrill SMTP relay when API key is set
    if (env.mandrillApiKey) {
      transporter = nodemailer.createTransport({
        host: 'smtp.mandrillapp.com',
        port: 587,
        secure: false,
        auth: {
          user: 'apikey',
          pass: env.mandrillApiKey,
        },
      });
      console.log('[Scheduler] Using Mandrill SMTP relay for email delivery');
    } else if (env.smtpUser && env.smtpPass) {
      transporter = nodemailer.createTransport({
        host: env.smtpHost,
        port: env.smtpPort,
        secure: env.smtpPort === 465,
        auth: {
          user: env.smtpUser,
          pass: env.smtpPass,
        },
      });
    }
  }
  return transporter;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '  - ')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Get the next open cohort for dynamic context */
async function getNextCohort(): Promise<{ name: string; start_date: string; seats_remaining: number } | null> {
  const cohort = await Cohort.findOne({
    where: { status: 'open' },
    order: [['start_date', 'ASC']],
  });
  if (!cohort) return null;
  return {
    name: cohort.name,
    start_date: cohort.start_date,
    seats_remaining: cohort.max_seats - cohort.seats_taken,
  };
}

/** Attempt AI generation for an action. Returns true if content was generated. */
async function generateAIContent(action: InstanceType<typeof ScheduledEmail>): Promise<boolean> {
  // If no AI instructions, skip AI generation (backward compat — use existing body)
  if (!action.ai_instructions) return false;

  try {
    const lead = await Lead.findByPk(action.lead_id);
    if (!lead) return false;

    const channel = (action.channel || 'email') as CampaignChannel;
    const conversationHistory = await buildConversationHistory(action.lead_id);
    const nextCohort = await getNextCohort();

    // Load campaign context if linked
    let campaignContext: any = undefined;
    let campaignRef: any = null;
    if (action.campaign_id) {
      campaignRef = await Campaign.findByPk(action.campaign_id);
      if (campaignRef) {
        campaignContext = {
          type: campaignRef.type,
          name: campaignRef.name,
          step_goal: action.metadata?.step_goal || undefined,
          step_number: action.step_index,
          total_steps: undefined, // Could be loaded from sequence if needed
          system_prompt: campaignRef.ai_system_prompt || undefined,
        };
      }
    }

    // Autonomous mode: variant selection
    if (campaignRef && (campaignRef as any).campaign_mode === 'autonomous') {
      try {
        const { selectVariantForSend } = require('./campaignEvolutionService');
        const variant = await selectVariantForSend(action.campaign_id, action.step_index, channel);
        if (variant) {
          // Use variant's override instructions if available
          if (variant.ai_instructions_override) {
            (action as any).ai_instructions = variant.ai_instructions_override;
          }
          // Track which variant was used
          const meta = { ...(action.metadata || {}), variant_id: variant.id, variant_label: variant.variant_label };
          await action.update({ metadata: meta });
          await variant.increment('sends');
        }
        // Increment sends_since_last_evolution
        const evoConfig = (campaignRef as any).evolution_config;
        if (evoConfig) {
          evoConfig.sends_since_last_evolution = (evoConfig.sends_since_last_evolution || 0) + 1;
          await campaignRef.update({ evolution_config: evoConfig });
        }
      } catch (evoErr: any) {
        // Non-critical — proceed with original content
        console.warn(`[Scheduler] Variant selection failed for ${action.id}:`, evoErr.message);
      }
    }

    // Build enriched lead data for AI personalization
    const leadData: Record<string, any> = {
      name: lead.name,
      company: lead.company || undefined,
      title: lead.title || undefined,
      industry: lead.industry || undefined,
      lead_score: lead.lead_score || undefined,
      source_type: lead.lead_source_type || undefined,
      interest_area: lead.interest_area || undefined,
      email: lead.email,
      phone: lead.phone || undefined,
      technology_stack: lead.technology_stack || undefined,
      annual_revenue: lead.annual_revenue || undefined,
      employee_count: lead.employee_count || undefined,
      company_size: lead.company_size || undefined,
      lead_temperature: lead.lead_temperature || undefined,
      pipeline_stage: lead.pipeline_stage || undefined,
      status: lead.status || undefined,
      interest_level: lead.interest_level || undefined,
      evaluating_90_days: lead.evaluating_90_days || undefined,
      notes: lead.notes || undefined,
      linkedin_url: lead.linkedin_url || undefined,
      source: lead.source || undefined,
      form_type: lead.form_type || undefined,
      alumni_context: lead.alumni_context || undefined,
    };

    // Load ICP profile intelligence (pain indicators, buying signals) for this campaign
    if (action.campaign_id) {
      try {
        const { ICPProfile } = require('../models');
        const profiles = await ICPProfile.findAll({
          where: { campaign_id: action.campaign_id },
          order: [['role', 'ASC']],
          limit: 1,
        });
        if (profiles.length > 0) {
          if (profiles[0].pain_indicators?.length) leadData.pain_indicators = profiles[0].pain_indicators;
          if (profiles[0].buying_signals?.length) leadData.buying_signals = profiles[0].buying_signals;
        }
      } catch (err: any) {
        // Non-critical — proceed without ICP intelligence
      }
    }

    // Look up the lead's upcoming strategy call for appointment-aware messaging
    let appointmentContext: { scheduled_at: string; timezone: string; meet_link: string } | undefined;
    try {
      const strategyCall = await StrategyCall.findOne({
        where: { lead_id: action.lead_id, scheduled_at: { [Op.gte]: new Date() } },
        order: [['scheduled_at', 'ASC']],
      });
      if (strategyCall) {
        appointmentContext = {
          scheduled_at: (strategyCall as any).scheduled_at.toISOString(),
          timezone: (strategyCall as any).timezone || 'America/Chicago',
          meet_link: (strategyCall as any).meet_link || '',
        };
      }
    } catch { /* non-critical */ }

    const result = await generateMessage({
      channel: channel as 'email' | 'sms' | 'voice',
      ai_instructions: action.ai_instructions,
      tone: action.metadata?.ai_tone || undefined,
      context_notes: action.metadata?.ai_context_notes || undefined,
      lead: leadData as any,
      conversationHistory,
      campaignContext,
      cohortContext: nextCohort ? {
        name: nextCohort.name,
        start_date: nextCohort.start_date,
        seats_remaining: nextCohort.seats_remaining,
      } : undefined,
      appointmentContext,
    });

    // Update the action with AI-generated content
    const updates: Record<string, any> = {
      body: result.body,
      ai_generated: true,
      metadata: {
        ...(action.metadata || {}),
        ai_tokens_used: result.tokens_used,
        ai_model: result.model,
      },
    };
    if (result.subject && channel === 'email') {
      updates.subject = result.subject;
    }

    await action.update(updates);
    // Reload to get fresh values
    await action.reload();

    console.log(`[Scheduler] AI generated ${channel} content for action ${action.id} (${result.tokens_used} tokens)`);
    return true;
  } catch (err: any) {
    console.error(`[Scheduler] AI generation failed for action ${action.id}:`, err.message);
    // If existing body has content, we can fall back to it
    if (action.body && action.body.trim().length > 0) {
      console.log(`[Scheduler] Falling back to template content for action ${action.id}`);
      return false;
    }
    // No fallback content available — throw to trigger retry/fallback
    throw new Error(`AI generation failed and no fallback content: ${err.message}`);
  }
}

/** Check if a voice call is within the campaign's call schedule */
/**
 * Check if current time is within a schedule window (timezone-aware).
 * Used for voice calls, email, and SMS send windows.
 */
function isWithinScheduleWindow(
  tz: string,
  startTime: string,
  endTime: string,
  activeDays: number[],
): boolean {
  try {
    const nowStr = new Date().toLocaleString('en-US', { timeZone: tz });
    const nowInTz = new Date(nowStr);
    const day = nowInTz.getDay(); // 0=Sun, 1=Mon...
    const hours = nowInTz.getHours();
    const minutes = nowInTz.getMinutes();

    if (!activeDays.includes(day)) return false;

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const currentMinutes = hours * 60 + minutes;
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } catch {
    return true; // On error, allow the send
  }
}

function isWithinCallSchedule(settings: Record<string, any>): boolean {
  return isWithinScheduleWindow(
    settings.call_timezone || 'America/Chicago',
    settings.call_time_start || '09:00',
    settings.call_time_end || '17:00',
    settings.call_active_days || [1, 2, 3, 4, 5],
  );
}

/**
 * Check if current time is within the email/SMS send window.
 * Uses send_time_start/end if configured, otherwise defaults to 08:00-21:00 CT.
 * Active days default to Mon-Sat (1-6) for email/SMS.
 */
function isWithinSendWindow(settings: Record<string, any>): boolean {
  return isWithinScheduleWindow(
    settings.send_timezone || settings.call_timezone || 'America/Chicago',
    settings.send_time_start || '08:00',
    settings.send_time_end || '21:00',
    settings.send_active_days || settings.call_active_days || [1, 2, 3, 4, 5, 6],
  );
}

/** Get campaign settings (with defaults) from a campaign record */
function getCampaignSettingsFromRecord(campaign: any): Record<string, any> {
  const defaults = {
    test_mode_enabled: false,
    test_email: '',
    test_phone: '',
    delay_between_sends: 120,
    max_leads_per_cycle: 10,
    call_time_start: '09:00',
    call_time_end: '17:00',
    call_timezone: 'America/Chicago',
    call_active_days: [1, 2, 3, 4, 5],
    max_call_duration: 300,
    max_daily_calls: 50,
    voicemail_enabled: true,
    pass_prior_conversations: true,
  };
  return { ...defaults, ...(campaign.settings || {}) };
}

async function processScheduledActions(): Promise<void> {
  const processorId = `proc_${process.pid}_${Date.now()}`;

  // Atomically claim pending actions using FOR UPDATE SKIP LOCKED
  // This prevents race conditions if multiple scheduler instances run concurrently
  let pendingActions: InstanceType<typeof ScheduledEmail>[];
  try {
    const t = await sequelize.transaction();
    try {
      const claimed = await sequelize.query(`
        UPDATE scheduled_emails
        SET status = 'processing',
            processing_started_at = NOW(),
            processor_id = :processorId
        WHERE id IN (
          SELECT id FROM scheduled_emails
          WHERE status = 'pending'
            AND scheduled_for <= NOW()
            AND attempts_made < max_attempts
          ORDER BY scheduled_for ASC
          LIMIT 50
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `, {
        replacements: { processorId },
        type: QueryTypes.SELECT,
        transaction: t,
      });
      await t.commit();

      // Wrap raw results as ScheduledEmail instances
      pendingActions = claimed.map((row: any) => ScheduledEmail.build(row, { isNewRecord: false }));
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err: any) {
    console.error(`[Scheduler] Failed to claim actions:`, err.message);
    return;
  }

  if (pendingActions.length === 0) return;

  console.log(`[Scheduler] Processing ${pendingActions.length} scheduled actions (${processorId})`);

  // Group actions by campaign and apply per-campaign pacing
  const campaignCache: Record<string, any> = {};
  const campaignProcessed: Record<string, number> = {};
  const dailyCallCount: Record<string, number> = {};

  for (const action of pendingActions) {
    const channel = (action.channel || 'email') as CampaignChannel;
    const campaignId = action.campaign_id || '_none_';

    // Load campaign settings (cached)
    let campaignSettings: Record<string, any> = {};
    if (action.campaign_id && !campaignCache[campaignId]) {
      const campaign = await Campaign.findByPk(action.campaign_id);
      if (campaign) {
        campaignCache[campaignId] = campaign;
        campaignSettings = getCampaignSettingsFromRecord(campaign);
      }
    } else if (campaignCache[campaignId]) {
      campaignSettings = getCampaignSettingsFromRecord(campaignCache[campaignId]);
    }

    // Guard: skip actions for non-active campaigns (archived, paused, completed, draft)
    const cachedCampaign = campaignCache[campaignId];
    if (cachedCampaign && cachedCampaign.status !== 'active') {
      await action.update({ status: 'cancelled' } as any);
      console.log(`[Scheduler] Cancelled action ${action.id} — campaign ${campaignId} is ${cachedCampaign.status}`);
      continue;
    }

    // Guard: skip payment_readiness actions if enrollment is already paid
    if (cachedCampaign && cachedCampaign.type === 'payment_readiness' && action.to_email) {
      const paidEnrollment = await Enrollment.findOne({
        where: { email: action.to_email, payment_status: 'paid' },
      });
      if (paidEnrollment) {
        await action.update({ status: 'cancelled' } as any);
        console.log(`[Scheduler] Cancelled payment reminder ${action.id} — enrollment already paid (${action.to_email})`);
        continue;
      }
    }

    // Guard: cancel payment_readiness actions if cohort has already started
    if (cachedCampaign && cachedCampaign.type === 'payment_readiness' && action.metadata?.cohort_start_date) {
      const cohortStart = new Date(action.metadata.cohort_start_date);
      if (new Date() >= cohortStart) {
        await action.update({ status: 'cancelled' } as any);
        console.log(`[Scheduler] Cancelled payment reminder ${action.id} — cohort already started (${action.metadata.cohort_start_date})`);
        continue;
      }
    }

    // Pacing: limit actions per campaign per cycle
    const maxPerCycle = campaignSettings.max_leads_per_cycle || 10;
    campaignProcessed[campaignId] = (campaignProcessed[campaignId] || 0);
    if (campaignProcessed[campaignId] >= maxPerCycle) {
      continue; // Skip — will be picked up next cycle
    }

    // Send window: skip email/SMS actions outside business hours (default 8 AM - 9 PM CT)
    if ((channel === 'email' || channel === 'sms') && action.campaign_id && Object.keys(campaignSettings).length > 0) {
      if (!isWithinSendWindow(campaignSettings)) {
        // Reset to pending so it's retried during business hours
        await action.update({ status: 'pending', processing_started_at: null, processor_id: null } as any);
        console.log(`[Scheduler] ${channel} action ${action.id} outside send window, deferred to business hours`);
        continue;
      }
    }

    // Call schedule: skip voice actions outside call window
    if (channel === 'voice' && action.campaign_id && Object.keys(campaignSettings).length > 0) {
      if (!isWithinCallSchedule(campaignSettings)) {
        await action.update({ status: 'pending', processing_started_at: null, processor_id: null } as any);
        console.log(`[Scheduler] Voice action ${action.id} outside call window, deferring`);
        continue;
      }
      // Daily call limit check
      dailyCallCount[campaignId] = (dailyCallCount[campaignId] || 0);
      const maxDailyCalls = campaignSettings.max_daily_calls || 50;
      if (dailyCallCount[campaignId] >= maxDailyCalls) {
        console.log(`[Scheduler] Daily call limit reached for campaign ${campaignId}`);
        continue;
      }
      dailyCallCount[campaignId]++;
    }

    try {
      // Step 0: Test action safety guard — block test actions targeting real domains
      if (action.is_test_action) {
        const testDomain = env.campaignTestEmailDomain;
        const email = action.to_email || '';
        const isTestDomain = email.endsWith(testDomain);

        if (!isTestDomain) {
          await action.update({
            status: 'cancelled',
            metadata: {
              ...(action.metadata || {}),
              blocked_reason: 'test_action_non_test_domain',
              blocked_email: email,
            },
          } as any);
          console.error(`[Scheduler] TEST EMAIL BLOCKED — action ${action.id} targeted non-test domain: ${email}`);
          continue;
        }
      }

      // Step 1: AI content generation (for all channels)
      await generateAIContent(action);

      // Step 2: Communication safety check (test mode, unsubscribe, rate limit)
      const safetyDecision = await evaluateSend({
        leadId: action.lead_id,
        campaignId: action.campaign_id,
        channel: channel as SendChannel,
        toEmail: action.to_email,
        toPhone: action.to_phone,
        source: 'scheduler',
      });

      if (!safetyDecision.allowed) {
        await action.update({
          status: 'cancelled',
          metadata: { ...(action.metadata || {}), blocked_reason: safetyDecision.blockedReason },
        } as any);
        console.log(`[Scheduler] BLOCKED action ${action.id}: ${safetyDecision.blockedReason}`);
        continue;
      }

      if (safetyDecision.redirect) {
        if (safetyDecision.redirect.email && channel === 'email') {
          await action.update({
            to_email: safetyDecision.redirect.email,
            subject: `[TEST → ${action.to_email}] ${action.subject}`,
          } as any);
          await action.reload();
        }
        if (safetyDecision.redirect.phone && (channel === 'voice' || channel === 'sms')) {
          await action.update({
            to_phone: safetyDecision.redirect.phone,
            subject: `[TEST] ${action.subject}`,
          } as any);
          await action.reload();
        }
        console.log(`[Scheduler] TEST MODE: action ${action.id} redirected (${safetyDecision.deliveryMode})`);
      }

            // Step 3: Send via appropriate channel
      switch (channel) {
        case 'email':
          await processEmailAction(action);
          break;
        case 'voice':
          await processVoiceAction(action);
          break;
        case 'sms':
          await processSmsAction(action);
          break;
        default:
          console.warn(`[Scheduler] Unknown channel: ${channel} for action ${action.id}`);
          await action.update({ status: 'failed' } as any);
      }

      campaignProcessed[campaignId]++;

      // Pacing delay between sends
      const delayMs = (campaignSettings.delay_between_sends || 0) * 1000;
      if (delayMs > 0 && delayMs <= 30000) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    } catch (error: any) {
      console.error(`[Scheduler] Failed to process action ${action.id} (${channel}):`, error.message);

      const newAttempts = (action.attempts_made || 0) + 1;
      const maxAttempts = action.max_attempts || 1;

      if (newAttempts < maxAttempts) {
        // Retry: reset to pending, reschedule 30 minutes later
        const retryAt = new Date(Date.now() + 30 * 60 * 1000);
        await action.update({
          status: 'pending',
          attempts_made: newAttempts,
          scheduled_for: retryAt,
          processing_started_at: null,
          processor_id: null,
        } as any);
        console.log(`[Scheduler] Retry ${newAttempts}/${maxAttempts} for action ${action.id}, next at ${retryAt.toISOString()}`);
      } else if (action.fallback_channel) {
        await handleFallback(action);
      } else {
        await action.update({ status: 'failed', attempts_made: newAttempts, processing_started_at: null, processor_id: null } as any);
        await logActivity({
          lead_id: action.lead_id,
          type: 'system',
          subject: `Sequence ${channel} failed: ${action.subject}`,
          metadata: { scheduled_email_id: action.id, channel, error: error.message },
        });
      }
    }
  }
}

/**
 * Recover stale actions stuck in 'processing' for more than 10 minutes.
 * Resets them to 'pending' so they can be re-claimed.
 */
async function recoverStaleActions(): Promise<number> {
  const staleThreshold = new Date(Date.now() - 10 * 60 * 1000); // 10 min
  const [count] = await ScheduledEmail.update(
    { status: 'pending', processing_started_at: null, processor_id: null } as any,
    {
      where: {
        status: 'processing',
        processing_started_at: { [Op.lt]: staleThreshold },
      },
    },
  );
  if (count > 0) console.log(`[Scheduler] Recovered ${count} stale actions`);
  return count;
}

async function processEmailAction(action: InstanceType<typeof ScheduledEmail>): Promise<void> {
  const mailer = getTransporter();
  if (!mailer) {
    console.warn('[Scheduler] SMTP not configured. Skipping email.');
    return;
  }

  // Resolve per-campaign sender email and inject tracking
  let senderEmail = env.emailFrom;
  let senderName = 'Colaberry Enterprise AI';
  let emailBody = action.body;

  if (action.campaign_id) {
    const campaign = await Campaign.findByPk(action.campaign_id, { attributes: ['channel', 'type', 'settings'] });
    if (campaign) {
      // Auto-inject campaign tracking into all site links
      emailBody = injectCampaignTracking(
        emailBody,
        action.campaign_id,
        campaign.channel || 'email',
        campaign.type || 'campaign',
      );
      // Use per-campaign sender if configured
      const settings = (campaign as any).settings || {};
      if (settings.sender_email) senderEmail = settings.sender_email;
      if (settings.sender_name) senderName = settings.sender_name;
    }
  }

  const html = wrapEmailHtml(emailBody);
  const info = await mailer.sendMail({
    from: `"${senderName}" <${senderEmail}>`,
    replyTo: `"${senderName}" <${senderEmail}>`,
    to: action.to_email,
    subject: action.subject,
    html,
    text: stripHtml(html),
    headers: {
      'X-MC-Metadata': JSON.stringify({ scheduled_email_id: action.id }),
      'List-Unsubscribe': `<mailto:${senderEmail}?subject=unsubscribe>`,
      'X-MC-Tags': 'campaign-sequence',
    },
  });

  console.log(`[Scheduler] Email sent to: ${action.to_email} from: ${senderEmail} | msgId: ${info.messageId} | accepted: ${info.accepted} | rejected: ${info.rejected}`);

  await action.update({
    status: 'sent',
    sent_at: new Date(),
    attempts_made: (action.attempts_made || 0) + 1,
    body: html,
  } as any);

  await logActivity({
    lead_id: action.lead_id,
    type: 'email_sent',
    subject: `Sequence email sent: ${action.subject}`,
    metadata: {
      scheduled_email_id: action.id,
      channel: 'email',
      step_index: action.step_index,
      ai_generated: action.ai_generated || false,
    },
  });

  // Record interaction outcome for ICP intelligence
  await recordActionOutcome(action, 'sent');

  // Unified communication log
  logCommunication({
    lead_id: action.lead_id,
    campaign_id: action.campaign_id || null,
    channel: 'email',
    delivery_mode: 'live',
    status: 'sent',
    to_address: action.to_email,
    from_address: senderEmail,
    subject: action.subject,
    body: action.body,
    provider: 'mandrill',
    provider_message_id: info.messageId,
    provider_response: { accepted: info.accepted, rejected: info.rejected },
    metadata: { scheduled_email_id: action.id, step_index: action.step_index, ai_generated: action.ai_generated || false },
  }).catch((err) => console.warn('[Scheduler] Comm log failed:', err.message));

  console.log(`[Scheduler] Email sent to ${action.to_email}: ${action.subject} (AI: ${action.ai_generated || false})`);

  // Auto-advance pipeline: new_lead → contacted
  advancePipelineStage(action.lead_id, 'contacted', `campaign_email_sent:${action.id}`).catch(
    (err) => console.error('[Scheduler] Pipeline advance failed:', err.message)
  );
}

async function processVoiceAction(action: InstanceType<typeof ScheduledEmail>): Promise<void> {
  if (!env.enableVoiceCalls) {
    console.log('[Scheduler] Voice calls disabled. Marking as skipped.');
    await action.update({
      status: 'sent',
      sent_at: new Date(),
      attempts_made: (action.attempts_made || 0) + 1,
      metadata: { ...(action.metadata || {}), skipped: true, reason: 'voice_disabled' },
    } as any);
    return;
  }

  const phone = action.to_phone;
  if (!phone) {
    console.warn(`[Scheduler] No phone for voice action ${action.id}. Trying fallback.`);
    if (action.fallback_channel) {
      await handleFallback(action);
    } else {
      await action.update({
        status: 'sent',
        sent_at: new Date(),
        attempts_made: (action.attempts_made || 0) + 1,
        metadata: { ...(action.metadata || {}), skipped: true, reason: 'no_phone' },
      } as any);
    }
    return;
  }

  const lead = await Lead.findByPk(action.lead_id);
  const name = lead?.name || 'there';
  const callType = (action.voice_agent_type === 'welcome' ? 'welcome' : 'interest') as 'welcome' | 'interest';

  // Use AI-generated body as the voice prompt if AI generated, otherwise use stored voice_prompt template
  let prompt: string | undefined;

  if (action.ai_generated && action.body) {
    // AI already generated the voice prompt instructions
    prompt = action.body;
  } else {
    // Fallback: hydrate legacy voice_prompt template
    const conversationHistory = await buildConversationHistory(action.lead_id);
    const nextCohort = await getNextCohort();
    const voicePrompt = action.metadata?.voice_prompt as string | undefined;

    if (voicePrompt) {
      prompt = voicePrompt
        .replace(/\{\{name\}\}/g, name)
        .replace(/\{\{company\}\}/g, lead?.company || 'your organization')
        .replace(/\{\{title\}\}/g, lead?.title || '')
        .replace(/\{\{cohort_name\}\}/g, nextCohort?.name || 'our next cohort')
        .replace(/\{\{cohort_start\}\}/g, nextCohort?.start_date || 'soon')
        .replace(/\{\{seats_remaining\}\}/g, String(nextCohort?.seats_remaining ?? 'limited'))
        .replace(/\{\{conversation_history\}\}/g, conversationHistory)
        .replace(/\{\{referred_by\}\}/g, (lead as any)?.alumni_context?.referred_by_name || '');
    }
  }

  const nextCohort = await getNextCohort();
  const conversationHistory = await buildConversationHistory(action.lead_id);

  const context = {
    lead_name: name,
    lead_company: lead?.company || undefined,
    lead_title: lead?.title || undefined,
    lead_email: lead?.email || undefined,
    lead_score: lead?.lead_score || undefined,
    lead_interest: lead?.interest_area || undefined,
    cohort_name: nextCohort?.name || undefined,
    cohort_start_date: nextCohort?.start_date || undefined,
    cohort_seats_remaining: nextCohort?.seats_remaining,
    conversation_history: conversationHistory,
    step_goal: action.metadata?.step_goal as string || undefined,
  };

  const result = await triggerVoiceCall({ name, phone, callType, prompt, context });

  if (result.success) {
    await action.update({
      status: 'sent',
      sent_at: new Date(),
      attempts_made: (action.attempts_made || 0) + 1,
      metadata: {
        ...(action.metadata || {}),
        synthflow_response: result.data,
        prompt_sent: !!prompt,
        ai_generated: action.ai_generated || false,
      },
    } as any);

    await logActivity({
      lead_id: action.lead_id,
      type: 'call',
      subject: `Sequence voice call initiated: ${action.subject}`,
      metadata: {
        scheduled_email_id: action.id,
        channel: 'voice',
        step_index: action.step_index,
        call_data: result.data,
        cohort: nextCohort?.name,
        ai_generated: action.ai_generated || false,
      },
    });

    // Record interaction outcome for ICP intelligence
    await recordActionOutcome(action, 'sent', { voice_call: true });

    // Unified communication log
    logCommunication({
      lead_id: action.lead_id,
      campaign_id: action.campaign_id || null,
      channel: 'voice',
      delivery_mode: 'live',
      status: 'sent',
      to_address: phone,
      subject: action.subject,
      body: prompt || null,
      provider: 'synthflow',
      provider_message_id: result.data?.call_id || result.data?.id || null,
      provider_response: result.data,
      metadata: { scheduled_email_id: action.id, step_index: action.step_index, ai_generated: action.ai_generated || false },
    }).catch((err) => console.warn('[Scheduler] Comm log failed:', err.message));

    console.log(`[Scheduler] Voice call initiated for ${phone}: ${action.subject} (AI: ${action.ai_generated || false})`);

    // Auto-advance pipeline: new_lead → contacted
    advancePipelineStage(action.lead_id, 'contacted', `campaign_voice_sent:${action.id}`).catch(
      (err) => console.error('[Scheduler] Pipeline advance failed:', err.message)
    );
  } else {
    throw new Error(result.error || 'Voice call failed');
  }
}

async function processSmsAction(action: InstanceType<typeof ScheduledEmail>): Promise<void> {
  const phone = action.to_phone;
  if (!phone) {
    console.warn(`[Scheduler] No phone for SMS action ${action.id}. Trying fallback.`);
    if (action.fallback_channel) {
      await handleFallback(action);
    } else {
      await action.update({
        status: 'sent',
        sent_at: new Date(),
        attempts_made: (action.attempts_made || 0) + 1,
        metadata: { ...(action.metadata || {}), skipped: true, reason: 'no_phone' },
      } as any);
    }
    return;
  }

  // Send SMS via GHL if enabled, otherwise log as placeholder
  const ghlEnabled = await getSetting('ghl_enabled');
  const lead = await Lead.findByPk(action.lead_id);

  if (ghlEnabled && lead?.ghl_contact_id) {
    const result = await sendSmsViaGhl(lead.ghl_contact_id, action.body || '');
    if (!result.success) {
      console.warn(`[Scheduler] GHL SMS failed for lead ${action.lead_id}: ${result.error}`);
    }
    // Add GHL note documenting the SMS
    await addContactNote(
      lead.ghl_contact_id,
      `📱 SMS Sent: ${action.subject || 'Campaign message'}\n${(action.body || '').substring(0, 500)}`
    ).catch(() => {});
    console.log(`[Scheduler] SMS sent via GHL for lead ${action.lead_id}: ${action.subject}`);
  } else {
    console.log(`[Scheduler] SMS to ${phone}: ${action.body?.substring(0, 160)} (no GHL — placeholder)`);
  }

  await action.update({
    status: 'sent',
    sent_at: new Date(),
    attempts_made: (action.attempts_made || 0) + 1,
    metadata: { ...(action.metadata || {}), ghl_sent: !!(ghlEnabled && lead?.ghl_contact_id), ai_generated: action.ai_generated || false },
  } as any);

  await logActivity({
    lead_id: action.lead_id,
    type: 'sms',
    subject: `Sequence SMS queued: ${action.subject}`,
    metadata: {
      scheduled_email_id: action.id,
      channel: 'sms',
      step_index: action.step_index,
      phone,
      ai_generated: action.ai_generated || false,
    },
  });

  // Record interaction outcome for ICP intelligence
  await recordActionOutcome(action, 'sent', { sms: true });

  // Unified communication log
  logCommunication({
    lead_id: action.lead_id,
    campaign_id: action.campaign_id || null,
    channel: 'sms',
    delivery_mode: (ghlEnabled && lead?.ghl_contact_id) ? 'live' : 'simulated',
    status: 'sent',
    to_address: phone,
    body: action.body || null,
    provider: 'ghl',
    provider_response: { ghl_sent: !!(ghlEnabled && lead?.ghl_contact_id) },
    metadata: { scheduled_email_id: action.id, step_index: action.step_index, ai_generated: action.ai_generated || false },
  }).catch((err) => console.warn('[Scheduler] Comm log failed:', err.message));

  console.log(`[Scheduler] SMS action processed for ${phone}: ${action.subject} (AI: ${action.ai_generated || false})`);

  // Auto-advance pipeline: new_lead → contacted
  advancePipelineStage(action.lead_id, 'contacted', `campaign_sms_sent:${action.id}`).catch(
    (err) => console.error('[Scheduler] Pipeline advance failed:', err.message)
  );
}

async function handleFallback(action: InstanceType<typeof ScheduledEmail>): Promise<void> {
  const fallback = action.fallback_channel as CampaignChannel;
  console.log(`[Scheduler] Falling back from ${action.channel} to ${fallback} for action ${action.id}`);

  await ScheduledEmail.create({
    lead_id: action.lead_id,
    sequence_id: action.sequence_id,
    campaign_id: action.campaign_id || null,
    step_index: action.step_index,
    channel: fallback,
    subject: action.subject,
    body: action.body,
    to_email: action.to_email,
    to_phone: action.to_phone,
    voice_agent_type: fallback === 'voice' ? (action.voice_agent_type || 'interest') : undefined,
    max_attempts: 1,
    attempts_made: 0,
    fallback_channel: null,
    scheduled_for: new Date(Date.now() + 5 * 60 * 1000),
    status: 'pending',
    ai_instructions: action.ai_instructions || null,
    metadata: {
      ...(action.metadata || {}),
      fallback_from: action.channel,
      original_action_id: action.id,
    },
  } as any);

  await action.update({
    status: 'failed',
    attempts_made: (action.attempts_made || 0) + 1,
    metadata: { ...(action.metadata || {}), fallback_created: fallback },
  } as any);

  await logActivity({
    lead_id: action.lead_id,
    type: 'system',
    subject: `Channel fallback: ${action.channel} → ${fallback}`,
    metadata: { scheduled_email_id: action.id, from_channel: action.channel, to_channel: fallback },
  });
}

/**
 * Auto-inject campaign tracking params into all site links in email HTML.
 * Any href pointing to enterprise.colaberry.ai gets utm_source, utm_medium,
 * utm_campaign, and cid appended — so every click is attributed automatically.
 */
function injectCampaignTracking(
  html: string,
  campaignId: string,
  channel: string,
  campaignType: string,
): string {
  const SITE_PATTERN = /href="(https?:\/\/enterprise\.colaberry\.ai[^"]*)"/gi;

  return html.replace(SITE_PATTERN, (_match, rawUrl: string) => {
    try {
      const url = new URL(rawUrl);
      // Don't overwrite if already has cid (manually set tracking link)
      if (url.searchParams.has('cid')) return `href="${rawUrl}"`;

      url.searchParams.set('utm_source', channel || 'email');
      url.searchParams.set('utm_medium', campaignType || 'campaign');
      url.searchParams.set('utm_campaign', campaignId);
      url.searchParams.set('cid', campaignId);
      return `href="${url.toString()}"`;
    } catch {
      return `href="${rawUrl}"`;
    }
  });
}

function wrapEmailHtml(body: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #2d3748; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a365d; font-size: 24px; }
    h2 { color: #1a365d; font-size: 18px; margin-top: 24px; }
    .cta { display: inline-block; background: #1a365d; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #718096; }
  </style>
</head>
<body>
  ${body}
  <div class="footer">
    <p>Colaberry Enterprise AI Division<br>
    AI Leadership | Architecture | Implementation | Advisory</p>
    <p style="font-size: 12px; color: #a0aec0; margin-top: 12px;">If you no longer wish to receive these emails, reply with "unsubscribe" or <a href="mailto:${env.emailFrom}?subject=unsubscribe" style="color: #a0aec0;">click here to opt out</a>.</p>
  </div>
</body>
</html>
  `.trim();
}

/** Detect no-show strategy calls (30+ min past scheduled time, still 'scheduled') */
async function detectNoShows(): Promise<void> {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

  const noShows = await StrategyCall.findAll({
    where: {
      status: 'scheduled',
      scheduled_at: { [Op.lt]: thirtyMinAgo },
    },
  });

  if (noShows.length === 0) return;

  console.log(`[Scheduler] Detected ${noShows.length} no-show strategy call(s)`);

  for (const call of noShows) {
    try {
      await call.update({ status: 'no_show' });
      console.log(`[Scheduler] Marked call ${call.id} as no_show (was scheduled for ${call.scheduled_at})`);

      if (call.lead_id) {
        // Auto-complete CampaignLead — the call has passed
        await CampaignLead.update(
          { status: 'completed', completed_at: new Date(), outcome: 'no_show' } as any,
          { where: { lead_id: call.lead_id, status: 'active' } }
        );

        // Cancel any pending nudge actions
        await cancelPrepNudge(call.lead_id);

        // Enroll in no-show recovery campaign
        await enrollInNoShowRecovery(call.lead_id);

        await logActivity({
          lead_id: call.lead_id,
          type: 'system',
          subject: 'Strategy call no-show detected',
          metadata: {
            strategy_call_id: call.id,
            scheduled_at: call.scheduled_at,
            action: 'enrolled_in_no_show_recovery',
          },
        });
      }
    } catch (err: any) {
      console.error(`[Scheduler] No-show processing failed for call ${call.id}:`, err.message);
    }
  }
}

export function startScheduler(): void {
  // Process pending actions every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    instrumentCronJob('ScheduledActionsProcessor', () => processScheduledActions()).catch((err) => {
      console.error('[Scheduler] Unexpected error:', err);
    });
  });

  // Recover stale processing actions every 15 minutes
  cron.schedule('*/15 * * * *', () => {
    recoverStaleActions().catch((err) => {
      console.error('[Scheduler] Stale recovery error:', err);
    });
  });

  // Detect no-show strategy calls every 15 minutes
  cron.schedule('2,17,32,47 * * * *', () => {
    instrumentCronJob('NoShowDetector', () => detectNoShows()).catch((err) => {
      console.error('[Scheduler] No-show detection error:', err);
    });
  });

  // Compute ICP insights daily at 2 AM, then auto-refresh active ICP profiles
  cron.schedule('0 2 * * *', () => {
    instrumentCronJob('ICPInsightComputer', async () => {
      console.log('[Scheduler] Running daily ICP insight computation...');
      await computeInsights(90);

      // Auto-refresh stats for ICP profiles linked to active campaigns
      const { refreshProfileStats } = require('./icpProfileService');
      const { ICPProfile } = require('../models');
      const activeProfiles = await ICPProfile.findAll({
        include: [{ model: Campaign, as: 'campaign', where: { status: 'active' }, required: true }],
      });
      if (activeProfiles.length > 0) {
        console.log(`[Scheduler] Refreshing stats for ${activeProfiles.length} active ICP profile(s)...`);
        for (const profile of activeProfiles) {
          await refreshProfileStats(profile.id).catch((err: any) =>
            console.error(`[Scheduler] Profile stats refresh error (${profile.id}):`, err.message),
          );
        }
        console.log('[Scheduler] ICP profile stats refresh complete');
      }
    }).catch((err) => {
      console.error('[Scheduler] ICP insight computation error:', err);
    });
  });

  // Behavioral signal detection: analyze closed sessions every 10 minutes
  cron.schedule('*/10 * * * *', () => {
    instrumentCronJob('BehavioralSignalDetector', async () => {
      if (!env.enableVisitorTracking) return;
      const signalsDetected = await detectSignalsForRecentSessions();
      if (signalsDetected > 0) {
        console.log(`[Scheduler] Detected ${signalsDetected} behavioral signal(s) from recent sessions`);
      }
    }).catch((err: any) => {
      console.error('[Scheduler] Behavioral signal detection error:', err.message);
    });
  });

  // Intent score recomputation: update scores for visitors with recent signals every 15 minutes
  cron.schedule('7,22,37,52 * * * *', () => {
    instrumentCronJob('IntentScoreRecomputer', async () => {
      if (!env.enableVisitorTracking) return;
      const scored = await recomputeRecentIntentScores();
      if (scored > 0) {
        console.log(`[Scheduler] Recomputed intent scores for ${scored} visitor(s)`);
      }
    }).catch((err: any) => {
      console.error('[Scheduler] Intent score recomputation error:', err.message);
    });
  });

  // Behavioral trigger evaluation: every 10 minutes (after signal detection)
  cron.schedule('5,15,25,35,45,55 * * * *', () => {
    instrumentCronJob('BehavioralTriggerEvaluator', async () => {
      if (!env.enableVisitorTracking) return;
      const enrolled = await evaluateBehavioralTriggers();
      if (enrolled > 0) {
        console.log(`[Scheduler] Behavioral triggers enrolled ${enrolled} lead(s)`);
      }
    }).catch((err: any) => {
      console.error('[Scheduler] Behavioral trigger evaluation error:', err.message);
    });
  });

  // Visitor data retention: delete page_events older than 90 days
  cron.schedule('0 3 * * *', () => {
    instrumentCronJob('PageEventCleanup', async () => {
      const { PageEvent } = require('../models');
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const deleted = await PageEvent.destroy({
        where: { timestamp: { [Op.lt]: cutoff } },
      });
      if (deleted > 0) {
        console.log(`[Scheduler] Cleaned up ${deleted} page events older than 90 days`);
      }
    }).catch((err: any) => {
      console.error('[Scheduler] Page event cleanup failed:', err.message);
    });
  });

  // Chat message retention: delete chat_messages older than 180 days
  cron.schedule('30 3 * * *', () => {
    instrumentCronJob('ChatMessageCleanup', async () => {
      const { ChatMessage } = require('../models');
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 180);
      const deleted = await ChatMessage.destroy({
        where: { timestamp: { [Op.lt]: cutoff } },
      });
      if (deleted > 0) {
        console.log(`[Scheduler] Cleaned up ${deleted} chat messages older than 180 days`);
      }
    }).catch((err: any) => {
      console.error('[Scheduler] Chat message cleanup failed:', err.message);
    });
  });

  console.log('[Scheduler] AI-powered multi-channel campaign scheduler started (every 5 minutes)');
  console.log('[Scheduler] Channels: email (Mandrill), voice (Synthflow), sms (placeholder)');
  console.log('[Scheduler] AI generation: enabled for actions with ai_instructions');
  console.log('[Scheduler] No-show detection: every 15 minutes');
  console.log('[Scheduler] ICP insight computation: daily at 2 AM');
  console.log('[Scheduler] Page event data retention cleanup: daily at 3 AM (90-day retention)');
  console.log('[Scheduler] Behavioral signal detection: every 10 minutes');
  console.log('[Scheduler] Intent score recomputation: every 15 minutes');
  console.log('[Scheduler] Behavioral trigger evaluation: every 10 minutes (offset)');
  console.log('[Scheduler] Chat message retention cleanup: daily at 3:30 AM (180-day retention)');

  // Opportunity score recomputation — every 20 minutes (offset from other jobs)
  cron.schedule('3,23,43 * * * *', () => {
    instrumentCronJob('OpportunityScoreRecomputer', async () => {
      const scored = await recomputeActiveOpportunityScores();
      if (scored > 0) {
        console.log(`[Scheduler] Recomputed opportunity scores for ${scored} lead(s)`);
      }
    }).catch((err: any) => {
      console.error('[Scheduler] Opportunity score recomputation error:', err.message);
    });
  });
  console.log('[Scheduler] Opportunity score recomputation: every 20 minutes');

  // Email digest — check every hour at :00
  cron.schedule('0 * * * *', () => {
    instrumentCronJob('EmailDigest', async () => {
      const { getSetting } = require('./settingsService');
      const enabled = await getSetting('digest_enabled');
      if (!enabled) return;

      const frequency = (await getSetting('digest_frequency')) || 'daily';
      const sendHour = parseInt(String(await getSetting('digest_send_hour') ?? 7), 10);
      const sendDay = parseInt(String(await getSetting('digest_send_day') ?? 1), 10);

      const now = new Date();
      if (now.getHours() !== sendHour) return;
      if (frequency === 'weekly' && now.getDay() !== sendDay) return;

      console.log(`[Scheduler] Generating ${frequency} digest email...`);
      const { compileDigestData } = require('./digestService');
      const { sendDigestEmail } = require('./emailService');
      const data = await compileDigestData(frequency);
      await sendDigestEmail(data);
      console.log(`[Scheduler] ${frequency} digest email sent successfully`);
    }).catch((err: any) => {
      console.error('[Scheduler] Digest email failed:', err.message);
    });
  });
  console.log('[Scheduler] Email digest: hourly check (sends at configured hour/day)');

  // -- Accelerator Session Lifecycle --

  // Session reminders: check every 30 minutes
  cron.schedule('*/30 * * * *', () => {
    instrumentCronJob('SessionReminders', async () => {
      // 24-hour reminders
      const upcoming24h = await getUpcomingSessions(24);
      for (const session of upcoming24h) {
        const enrollments = await Enrollment.findAll({
          where: { cohort_id: session.cohort_id, status: 'active' },
        });
        for (const e of enrollments) {
          await sendSessionReminder({
            to: e.email,
            fullName: e.full_name,
            sessionTitle: session.title,
            sessionNumber: session.session_number,
            sessionDate: session.session_date,
            startTime: session.start_time,
            meetingLink: session.meeting_link || null,
            materialsJson: session.materials_json || null,
            isOneHour: false,
          }).catch((err: any) => console.error(`[Scheduler] Session reminder failed for ${e.email}:`, err.message));
        }
        if (enrollments.length > 0) {
          console.log(`[Scheduler] Sent 24h reminders for session ${session.session_number} to ${enrollments.length} participant(s)`);
        }
      }

      // 1-hour reminders
      const upcoming1h = await getUpcomingSessions(1);
      for (const session of upcoming1h) {
        const enrollments = await Enrollment.findAll({
          where: { cohort_id: session.cohort_id, status: 'active' },
        });
        for (const e of enrollments) {
          await sendSessionReminder({
            to: e.email,
            fullName: e.full_name,
            sessionTitle: session.title,
            sessionNumber: session.session_number,
            sessionDate: session.session_date,
            startTime: session.start_time,
            meetingLink: session.meeting_link || null,
            materialsJson: session.materials_json || null,
            isOneHour: true,
          }).catch((err: any) => console.error(`[Scheduler] Session 1h reminder failed for ${e.email}:`, err.message));
        }
        if (enrollments.length > 0) {
          console.log(`[Scheduler] Sent 1h reminders for session ${session.session_number} to ${enrollments.length} participant(s)`);
        }
      }
    }).catch((err: any) => {
      console.error('[Scheduler] Session reminder error:', err.message);
    });
  });

  // Auto-mark sessions as live (15 min before start) and completed (30 min after end)
  cron.schedule('*/5 * * * *', () => {
    instrumentCronJob('SessionLifecycle', async () => {
      const toLive = await getSessionsToMarkLive();
      for (const session of toLive) {
        await session.update({ status: 'live' });
        console.log(`[Scheduler] Session ${session.session_number} "${session.title}" marked as live`);
      }

      const toComplete = await getSessionsToMarkCompleted();
      for (const session of toComplete) {
        await session.update({ status: 'completed' });
        console.log(`[Scheduler] Session ${session.session_number} "${session.title}" marked as completed`);

        // Post-completion: detect absences, send recap emails, recompute readiness
        const absentees = await detectAbsentParticipants(session.id);
        for (const { enrollment, consecutiveMisses, missedTitles } of absentees) {
          // Send missed session recap
          await sendMissedSessionEmail({
            to: enrollment.email,
            fullName: enrollment.full_name,
            sessionTitle: session.title,
            sessionNumber: session.session_number,
            sessionDate: session.session_date,
            recordingUrl: session.recording_url || null,
            materialsJson: session.materials_json || null,
            consecutiveMisses,
          }).catch((err: any) => console.error(`[Scheduler] Missed session email failed for ${enrollment.email}:`, err.message));

          // Alert admin if 2+ consecutive absences
          if (consecutiveMisses >= 2) {
            const cohort = await (await import('../models')).Cohort.findByPk(session.cohort_id);
            await sendAbsenceAlert({
              enrollmentName: enrollment.full_name,
              enrollmentEmail: enrollment.email,
              enrollmentCompany: enrollment.company,
              cohortName: cohort?.name || 'Unknown Cohort',
              consecutiveMisses,
              missedSessions: missedTitles,
            }).catch((err: any) => console.error(`[Scheduler] Absence alert failed for ${enrollment.full_name}:`, err.message));
          }
        }

        if (absentees.length > 0) {
          console.log(`[Scheduler] Session ${session.session_number}: ${absentees.length} absent, recap emails sent`);
        }

        // Recompute readiness scores for all active enrollments in this cohort
        await computeAllReadinessScores(session.cohort_id).catch((err: any) =>
          console.error(`[Scheduler] Readiness recompute failed for cohort ${session.cohort_id}:`, err.message)
        );
        console.log(`[Scheduler] Readiness scores recomputed for cohort ${session.cohort_id}`);
      }
    }).catch((err: any) => {
      console.error('[Scheduler] Session lifecycle error:', err.message);
    });
  });

  console.log('[Scheduler] Accelerator: session reminders every 30 min (24h + 1h before)');
  console.log('[Scheduler] Accelerator: session lifecycle (live/completed) every 5 min');
  console.log('[Scheduler] Accelerator: post-session absence detection + readiness recompute');

  // ── Alumni Lifecycle Processor (daily 6 AM CT / 11 UTC) ──────────────
  const { detectInactiveLeads, detectReengagementComplete } = require('./campaignLifecycleService');

  cron.schedule('0 11 * * *', () => {
    instrumentCronJob('AlumniLifecycleProcessor', async () => {
      await detectInactiveLeads();
      await detectReengagementComplete();
    }).catch((err: any) => {
      console.error('[Scheduler] Alumni lifecycle error:', err.message);
    });
  });

  console.log('[Scheduler] Alumni: lifecycle processor daily at 6 AM CT (11 UTC)');

  // ── Autonomous Ramp Evaluator (every 2 hours) ─────────────────────────
  const { runRampEvaluator } = require('./autonomousRampService');

  cron.schedule('0 */2 * * *', () => {
    instrumentCronJob('AutonomousRampEvaluator', async () => {
      await runRampEvaluator();
    }).catch((err: any) => {
      console.error('[Scheduler] Autonomous ramp evaluator error:', err.message);
    });
  });
  console.log('[Scheduler] Autonomous ramp evaluator: every 2 hours');

  // ── Campaign Evolution Engine (every 4 hours) ─────────────────────────
  const { runEvolutionEngine } = require('./campaignEvolutionService');

  cron.schedule('0 */4 * * *', () => {
    instrumentCronJob('CampaignEvolutionEngine', async () => {
      await runEvolutionEngine();
    }).catch((err: any) => {
      console.error('[Scheduler] Campaign evolution engine error:', err.message);
    });
  });
  console.log('[Scheduler] Campaign evolution engine: every 4 hours');

  // AI Operations Layer scheduler (async — reads schedules from governance DB)
  const { startAIOpsScheduler } = require('./aiOpsScheduler');
  startAIOpsScheduler().catch((err: any) => {
    console.error('[Scheduler] AI Ops scheduler startup error:', err.message);
  });
}

// ---------------------------------------------------------------------------
// Scheduler control API (Phase F — Admin Safety Controls)
// ---------------------------------------------------------------------------

let lastCycleAt: Date | null = null;
let lastCycleProcessed = 0;

/** Pause the scheduler by setting a system setting flag. */
export async function pauseScheduler(adminId?: string): Promise<void> {
  const { setSetting } = require('./settingsService');
  await setSetting('scheduler_paused', true, adminId);
  console.log(`[Scheduler] PAUSED by ${adminId || 'system'}`);
}

/** Resume the scheduler by clearing the pause flag. */
export async function resumeScheduler(adminId?: string): Promise<void> {
  const { setSetting } = require('./settingsService');
  await setSetting('scheduler_paused', false, adminId);
  console.log(`[Scheduler] RESUMED by ${adminId || 'system'}`);
}

/** Get the current scheduler status. */
export async function getSchedulerStatus(): Promise<{
  paused: boolean;
  last_cycle_at: string | null;
  pending_actions: number;
  processing_actions: number;
}> {
  const { getSetting: getSettingFn } = require('./settingsService');
  const paused = await getSettingFn('scheduler_paused');

  const pendingCount = await ScheduledEmail.count({
    where: { status: 'pending', scheduled_for: { [Op.lte]: new Date() } },
  });
  const processingCount = await ScheduledEmail.count({
    where: { status: 'processing' },
  });

  return {
    paused: paused === true || paused === 'true',
    last_cycle_at: lastCycleAt?.toISOString() || null,
    pending_actions: pendingCount,
    processing_actions: processingCount,
  };
}

/** Get launch readiness assessment. */
export async function getLaunchReadiness(): Promise<{
  pending_actions: { email: number; sms: number; voice: number };
  active_campaigns: number;
  enrolled_leads: number;
  channels_configured: { email: boolean; sms: boolean; voice: boolean };
  blockers: string[];
  safe_to_launch: boolean;
}> {
  const { getSetting: gs } = require('./settingsService');

  const [emailCount, smsCount, voiceCount] = await Promise.all([
    ScheduledEmail.count({ where: { status: 'pending', channel: 'email' } }),
    ScheduledEmail.count({ where: { status: 'pending', channel: 'sms' } }),
    ScheduledEmail.count({ where: { status: 'pending', channel: 'voice' } }),
  ]);

  const activeCampaigns = await Campaign.count({ where: { status: 'active' } });
  const enrolledLeads = await CampaignLead.count({ where: { status: 'active' } });

  const smtpUser = await gs('smtp_user');
  const synthflowKey = await gs('synthflow_api_key');
  const ghlEnabled = await gs('ghl_enabled');

  const emailConfigured = !!smtpUser;
  const voiceConfigured = !!synthflowKey;
  const smsConfigured = ghlEnabled === true || ghlEnabled === 'true';

  const blockers: string[] = [];
  if (!emailConfigured && emailCount > 0) blockers.push('SMTP not configured but email actions pending');
  if (!voiceConfigured && voiceCount > 0) blockers.push('Synthflow not configured but voice actions pending');
  if (!smsConfigured && smsCount > 0) blockers.push('GHL not enabled but SMS actions pending');

  // Check for test leads enrolled in active campaigns
  const testLeadEnrollments = await sequelize.query(
    `SELECT COUNT(*) as count FROM campaign_leads cl
     JOIN leads l ON cl.lead_id = l.id
     WHERE l.source = 'campaign_test' AND cl.status = 'active'`,
    { type: QueryTypes.SELECT },
  ) as any[];
  const testLeadCount = parseInt(testLeadEnrollments[0]?.count || '0', 10);
  if (testLeadCount > 0) blockers.push(`${testLeadCount} test lead(s) enrolled in active campaigns`);

  return {
    pending_actions: { email: emailCount, sms: smsCount, voice: voiceCount },
    active_campaigns: activeCampaigns,
    enrolled_leads: enrolledLeads,
    channels_configured: { email: emailConfigured, sms: smsConfigured, voice: voiceConfigured },
    blockers,
    safe_to_launch: blockers.length === 0,
  };
}
