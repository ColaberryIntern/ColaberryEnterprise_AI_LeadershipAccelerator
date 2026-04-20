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
import { sendSmsViaGhl, addContactNote, syncLeadToGhl } from './ghlService';
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

    // Build Composite Context Graph for grounded AI generation
    let compositeContext: any = undefined;
    if (action.campaign_id) {
      try {
        const { buildCompositeContext } = require('./contextGraphService');
        compositeContext = await buildCompositeContext(action.lead_id, action.campaign_id, action.step_index || 0);
      } catch (ctxErr: any) {
        console.warn(`[Scheduler] Context graph build failed for action ${action.id}: ${ctxErr.message}`);
        // Non-critical — falls back to legacy prompt builder
      }
    }

    // If scheduled_email metadata carries original_campaign_type (stamped by Ali outreach
    // enrollment), inject it into the composite context as a fallback so AI instructions
    // that reference metadata.original_campaign_type see it even if context graph missed it.
    const metaOrigType = action.metadata?.original_campaign_type;
    if (metaOrigType && compositeContext && compositeContext.campaign) {
      // Only override if context graph returned the generic 'executive_outreach'
      if (compositeContext.campaign.type === 'executive_outreach') {
        compositeContext.campaign.type = metaOrigType;
        const isAlumni = metaOrigType.includes('alumni');
        const isCold = metaOrigType.includes('cold');
        compositeContext.campaign.senderRelationship = isAlumni
          ? 'This lead is a Colaberry Data Analytics/BI bootcamp graduate. They have NOT taken the AI Leadership Accelerator — it is a completely new program. Reference their data analytics background and career growth through Colaberry. Be warm but do NOT say they went through the Accelerator or imply prior familiarity with this program.'
          : isCold
          ? 'This is a COLD prospect. They do NOT know Ali or Colaberry. Do not presume familiarity. Be professional and reference their role/company.'
          : compositeContext.campaign.senderRelationship;
      }
    }

    // Build context_notes with original_campaign_type for AI instruction references
    let contextNotes = action.metadata?.ai_context_notes || '';
    if (metaOrigType) {
      contextNotes = `${contextNotes ? contextNotes + '\n' : ''}ORIGINAL CAMPAIGN TYPE: ${metaOrigType}`;
    }

    const result = await generateMessage({
      channel: channel as 'email' | 'sms' | 'voice',
      ai_instructions: action.ai_instructions,
      tone: action.metadata?.ai_tone || undefined,
      context_notes: contextNotes || undefined,
      lead: leadData as any,
      conversationHistory,
      campaignContext,
      cohortContext: nextCohort ? {
        name: nextCohort.name,
        start_date: nextCohort.start_date,
        seats_remaining: nextCohort.seats_remaining,
      } : undefined,
      appointmentContext,
      compositeContext,
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
    settings.send_time_end || '17:00',
    settings.send_active_days || settings.call_active_days || [1, 2, 3, 4, 5],
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

// ── Auto-Pacing: spread emails evenly across the send window ──────────────

const pacedLimitCache = new Map<string, { limit: number; ts: number }>();
const PACED_CACHE_TTL = 5 * 60 * 1000; // cache per scheduler cycle (5 min)

async function calculatePacedLimit(
  campaignId: string,
  settings: Record<string, any>,
): Promise<number> {
  const fallback = settings.max_leads_per_cycle || 10;

  // Return cached value if fresh (avoids re-querying every action in the same cycle)
  const cached = pacedLimitCache.get(campaignId);
  if (cached && Date.now() - cached.ts < PACED_CACHE_TTL) return cached.limit;

  try {
    // Count pending actions for this campaign that are due today
    const tz = settings.send_timezone || settings.call_timezone || 'America/Chicago';
    const nowStr = new Date().toLocaleString('en-US', { timeZone: tz });
    const nowLocal = new Date(nowStr);

    const endOfDay = new Date(nowLocal);
    endOfDay.setHours(23, 59, 59, 999);

    const pendingToday = await ScheduledEmail.count({
      where: {
        campaign_id: campaignId,
        status: 'pending',
        scheduled_for: { [Op.lte]: endOfDay },
      },
    });

    if (pendingToday === 0) {
      pacedLimitCache.set(campaignId, { limit: fallback, ts: Date.now() });
      return fallback;
    }

    // Calculate hours remaining in send window
    const sendEnd = settings.send_time_end || '17:00';
    const [endH, endM] = sendEnd.split(':').map(Number);
    const endMinutes = endH * 60 + endM;
    const nowMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();
    const minutesRemaining = Math.max(0, endMinutes - nowMinutes);

    if (minutesRemaining <= 60) {
      // Less than 1 hour left — send remaining to catch up
      pacedLimitCache.set(campaignId, { limit: fallback, ts: Date.now() });
      return fallback;
    }

    const hoursRemaining = minutesRemaining / 60;
    const targetPerHour = Math.ceil(pendingToday / hoursRemaining);
    const cyclesPerHour = 12; // scheduler runs every 5 min
    const limit = Math.max(1, Math.ceil(targetPerHour / cyclesPerHour));

    pacedLimitCache.set(campaignId, { limit, ts: Date.now() });
    return limit;
  } catch {
    return fallback;
  }
}

async function processScheduledActions(): Promise<void> {
  const processorId = `proc_${process.pid}_${Date.now()}`;

  // Atomically claim pending actions using FOR UPDATE SKIP LOCKED
  // This prevents race conditions if multiple scheduler instances run concurrently
  let pendingActions: InstanceType<typeof ScheduledEmail>[];
  try {
    const t = await sequelize.transaction();
    try {
      // Round-robin across campaigns: pick up to 10 per campaign, 40 total
      // Two-step: first identify IDs (with window function), then lock+update
      const candidates = await sequelize.query(`
        SELECT id FROM (
          SELECT id, scheduled_for, ROW_NUMBER() OVER (PARTITION BY campaign_id ORDER BY scheduled_for ASC) as rn
          FROM scheduled_emails
          WHERE status = 'pending'
            AND scheduled_for <= NOW()
            AND attempts_made < max_attempts
        ) ranked
        WHERE rn <= 10
        ORDER BY rn, scheduled_for ASC
        LIMIT 40
      `, { type: QueryTypes.SELECT, transaction: t });

      const candidateIds = (candidates as any[]).map((r: any) => r.id);
      if (candidateIds.length === 0) {
        await t.commit();
        // Still write heartbeat even when nothing to process
        try {
          const { setSetting } = require('./settingsService');
          await setSetting('scheduler_heartbeat', new Date().toISOString());
        } catch { /* non-blocking */ }
        return;
      }

      const claimed = await sequelize.query(`
        UPDATE scheduled_emails
        SET status = 'processing',
            processing_started_at = NOW(),
            processor_id = :processorId
        WHERE id IN (:ids)
          AND status = 'pending'
        RETURNING *
      `, {
        replacements: { processorId, ids: candidateIds },
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

  // Interleave actions across campaigns to spread API load
  // Instead of [A,A,A,B,B,B] process as [A,B,A,B,A,B]
  const byCampaign: Record<string, typeof pendingActions> = {};
  for (const a of pendingActions) {
    const cid = a.campaign_id || '_none_';
    (byCampaign[cid] = byCampaign[cid] || []).push(a);
  }
  const interleaved: typeof pendingActions = [];
  const queues = Object.values(byCampaign);
  let maxLen = 0;
  for (const q of queues) if (q.length > maxLen) maxLen = q.length;
  for (let i = 0; i < maxLen; i++) {
    for (const q of queues) {
      if (i < q.length) interleaved.push(q[i]);
    }
  }

  // Group actions by campaign and apply per-campaign pacing
  const campaignCache: Record<string, any> = {};
  const campaignProcessed: Record<string, number> = {};
  const dailyCallCount: Record<string, number> = {};

  for (const action of interleaved) {
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
      await action.update({
        status: 'cancelled',
        metadata: { ...(action.metadata || {}), blocked_reason: `campaign_${cachedCampaign.status}` },
      } as any);
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

    // Pacing: spread emails evenly across the send window
    const maxPerCycle = await calculatePacedLimit(campaignId, campaignSettings);
    campaignProcessed[campaignId] = (campaignProcessed[campaignId] || 0);
    if (campaignProcessed[campaignId] >= maxPerCycle) {
      // Reset back to pending so it can be picked up next cycle (don't leave stuck in processing)
      await action.update({ status: 'pending', processing_started_at: null, processor_id: null } as any);
      continue;
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
        // Reset back to pending so it can be picked up next cycle
        await action.update({ status: 'pending', processing_started_at: null, processor_id: null } as any);
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

      // Step 1: AI content generation (for all channels) — 60s timeout to prevent hanging
      await Promise.race([
        generateAIContent(action),
        new Promise((_, reject) => setTimeout(() => reject(new Error('AI content generation timed out after 60s')), 60000)),
      ]);

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

      // Cross-campaign daily cap: max 1 outbound communication per lead per 24h (all channels)
      // Exception: if the lead REPLIED today, we can continue the conversation
      {
        const [capCheck] = await sequelize.query(
          `SELECT
            (SELECT COUNT(*) FROM communication_logs WHERE lead_id = :leadId AND direction = 'outbound' AND created_at::date = CURRENT_DATE) as outbound_today,
            (SELECT COUNT(*) FROM communication_logs WHERE lead_id = :leadId AND direction = 'inbound' AND created_at::date = CURRENT_DATE) as inbound_today`,
          { replacements: { leadId: action.lead_id }, type: QueryTypes.SELECT }
        ) as any[];
        const outboundToday = parseInt(capCheck?.outbound_today || '0', 10);
        const inboundToday = parseInt(capCheck?.inbound_today || '0', 10);
        if (outboundToday >= 1 && inboundToday === 0) {
          const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
          tomorrow.setHours(14, 0, 0, 0);
          await action.update({ status: 'pending', scheduled_for: tomorrow, processing_started_at: null, processor_id: null } as any);
          console.log(`[Scheduler] Daily cap: lead ${action.lead_id} already got ${outboundToday} touch(es) today (no reply), deferred`);
          continue;
        }
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
          // GHL SMS ramp: enforce daily limit by level
          try {
            const SMS_LIMITS: Record<number, number> = { 1: 100, 2: 250, 3: 500, 4: 750, 5: 1500, 6: 2250, 7: 3000, 8: 3000 };
            const settingsSvc = require('./settingsService');
            let ghlSmsLevel = parseInt(await settingsSvc.getSetting('ghl_sms_level') || '2', 10);

            // Auto-promote: check if we sent enough yesterday to unlock next level
            const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
            const [yesterdaySent] = await sequelize.query(
              "SELECT COUNT(*) as cnt FROM communication_logs WHERE channel = 'sms' AND direction = 'outbound' AND created_at::date = :yesterday",
              { replacements: { yesterday: yesterdayStr }, type: QueryTypes.SELECT },
            ) as any[];
            const yesterdayCount = parseInt(yesterdaySent?.cnt || '0', 10);
            const currentLimit = SMS_LIMITS[ghlSmsLevel] || 250;
            if (yesterdayCount >= currentLimit && ghlSmsLevel < 8) {
              ghlSmsLevel++;
              await settingsSvc.setSetting('ghl_sms_level', String(ghlSmsLevel));
              console.log(`[Scheduler] GHL SMS auto-promoted to Level ${ghlSmsLevel} (${SMS_LIMITS[ghlSmsLevel]}/day) — sent ${yesterdayCount} yesterday`);
            }

            const smsLimit = SMS_LIMITS[ghlSmsLevel] || 250;
            const todayDateStr = new Date().toISOString().slice(0, 10);
            const [smsSentToday] = await sequelize.query(
              "SELECT COUNT(*) as cnt FROM communication_logs WHERE channel = 'sms' AND direction = 'outbound' AND created_at::date = :today",
              { replacements: { today: todayDateStr }, type: QueryTypes.SELECT },
            ) as any[];
            const sentCount = parseInt(smsSentToday?.cnt || '0', 10);
            if (sentCount >= smsLimit) {
              console.log(`[Scheduler] SMS daily ramp cap reached (${sentCount}/${smsLimit}, GHL level ${ghlSmsLevel})`);
              await action.update({ status: 'pending', processing_started_at: null, processor_id: null } as any);
              break;
            }

            // Ensure body is populated before sending
            await action.reload();
            if (!action.body || action.body.trim().length === 0) {
              console.warn(`[Scheduler] SMS action ${action.id} has no body after AI generation — skipping`);
              await action.update({ status: 'pending', processing_started_at: null, processor_id: null } as any);
              break;
            }

            console.log(`[Scheduler] SMS action ${action.id} sending (body: ${action.body?.length} chars, level ${ghlSmsLevel}, ${sentCount}/${smsLimit})`);
            await processSmsAction(action);
          } catch (smsErr: any) {
            console.error(`[Scheduler] SMS processing error for ${action.id}: ${smsErr.message}`);
            await action.update({ status: 'failed', metadata: { ...(action.metadata || {}), error: smsErr.message } } as any);
          }
          break;
        default:
          console.warn(`[Scheduler] Unknown channel: ${channel} for action ${action.id}`);
          await action.update({ status: 'failed' } as any);
      }

      // Event-driven sequencing: schedule the next step after successful send
      try {
        await action.reload();
        if (action.status === 'sent') {
          const { scheduleNextStep } = require('./sequenceService');
          const nextAction = await scheduleNextStep(action);
          if (nextAction) {
            console.log(`[Scheduler] Next step ${nextAction.step_index} (${nextAction.channel}) for lead ${action.lead_id} at ${nextAction.scheduled_for}`);
          }
        }
      } catch (err: any) {
        console.error(`[Scheduler] Failed to schedule next step for action ${action.id}:`, err.message);
        // Track failure in settings for health monitor visibility
        try {
          const { getSetting, setSetting } = require('./settingsService');
          const count = parseInt(await getSetting('schedule_next_step_failures') || '0', 10);
          await setSetting('schedule_next_step_failures', String(count + 1));
        } catch { /* non-blocking */ }
      }

      campaignProcessed[campaignId]++;

      // Base delay between ALL actions (prevents API call stacking across campaigns)
      await new Promise((r) => setTimeout(r, 5000));

      // Additional per-campaign pacing delay
      const delayMs = (campaignSettings.delay_between_sends || 0) * 1000;
      if (delayMs > 5000 && delayMs <= 180000) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    } catch (error: any) {
      console.error(`[Scheduler] Failed to process action ${action.id} (${channel}):`, error.message);

      const newAttempts = (action.attempts_made || 0) + 1;
      const maxAttempts = action.max_attempts || 2;

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

  // Update scheduler heartbeat for liveness monitoring
  try {
    const { setSetting } = require('./settingsService');
    await setSetting('scheduler_heartbeat', new Date().toISOString());
  } catch { /* heartbeat write failure is non-blocking */ }
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
  let campaignType = '';

  if (action.campaign_id) {
    const campaign = await Campaign.findByPk(action.campaign_id, { attributes: ['channel', 'type', 'settings'] });
    if (campaign) {
      campaignType = campaign.type || '';
      // Auto-inject campaign tracking into all site links
      emailBody = injectCampaignTracking(
        emailBody,
        action.campaign_id,
        campaign.channel || 'email',
        campaignType || 'campaign',
        action.lead_id,
      );
      // Use per-campaign sender if configured
      const settings = (campaign as any).settings || {};
      if (settings.sender_email) senderEmail = settings.sender_email;
      if (settings.sender_name) senderName = settings.sender_name;

      // Append Ali's signature for executive_outreach campaigns
      if (settings.ali_signature && campaignType === 'executive_outreach') {
        const { ALI_SIGNATURE } = require('./aliPersonalOutreachService');
        emailBody = `${emailBody}${ALI_SIGNATURE}`;
      }
    }
  }

  // Build metadata for Mandrill headers
  const mcMetadata: Record<string, any> = { scheduled_email_id: action.id };
  if (campaignType === 'executive_outreach') {
    mcMetadata.trigger = 'ali_personal_outreach';
    mcMetadata.lead_id = action.lead_id;
  }

  // Executive outreach: minimal wrapper (personal email feel, no corporate footer)
  let html = campaignType === 'executive_outreach'
    ? wrapPersonalEmailHtml(emailBody, { campaignId: action.campaign_id, campaignType, leadId: action.lead_id })
    : wrapEmailHtml(emailBody, { campaignId: action.campaign_id, campaignType, leadId: action.lead_id });

  // Deterministic validator for Ali personal emails — ensure no corporate artifacts
  if (campaignType === 'executive_outreach') {
    html = html
      .replace(/<p[^>]*>\s*Best,?\s*<\/p>/gi, '')
      .replace(/<p[^>]*>\s*Warm regards,?\s*<\/p>/gi, '')
      .replace(/<p[^>]*>\s*Sincerely,?\s*<\/p>/gi, '')
      .replace(/<p[^>]*>\s*Best regards,?\s*<\/p>/gi, '')
      .replace(/<p[^>]*>\s*The Colaberry[^<]*<\/p>/gi, '')
      .replace(/<p[^>]*>\s*Colaberry Enterprise[^<]*Team\s*<\/p>/gi, '')
      .replace(/Colaberry Enterprise AI Division[^<]*/gi, '')
      .replace(/AI Leadership \| Architecture \| Implementation \| Advisory/gi, '')
      .replace(/If you no longer wish to receive[^<]*/gi, '')
      .replace(/click here to opt out/gi, '')
      .replace(/<p>\s*<\/p>/g, '');
  }
  // Reply-To: use reply subdomain so Mandrill catches inbound replies
  // For Ali personal outreach, reply goes to ali@colaberry.com directly (he handles personally)
  const replyDomain = env.mandrillInboundDomain || 'reply.colaberry.com';
  const replyToAddr = campaignType === 'executive_outreach'
    ? 'ali@colaberry.com'
    : senderEmail.replace(/@[^@]+$/, '@' + replyDomain);
  const mailOptions: any = {
    from: `"${senderName}" <${senderEmail}>`,
    replyTo: `"${senderName}" <${replyToAddr}>`,
    to: action.to_email,
    subject: action.subject,
    html,
    text: stripHtml(html),
    headers: {
      'X-MC-Metadata': JSON.stringify(mcMetadata),
      'List-Unsubscribe': `<mailto:${senderEmail}?subject=unsubscribe>`,
      'X-MC-Tags': action.campaign_id ? `campaign-sequence,${mcMetadata.trigger || 'campaign'}` : 'campaign-sequence',
    },
  };

  const info = await mailer.sendMail(mailOptions);

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
    metadata: {
      scheduled_email_id: action.id,
      step_index: action.step_index,
      ai_generated: action.ai_generated || false,
      ...(mcMetadata.trigger ? { trigger: mcMetadata.trigger } : {}),
    },
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

  // Send SMS via GHL — sync lead to GHL first if no contact ID
  const ghlEnabled = await getSetting('ghl_enabled');
  const lead = await Lead.findByPk(action.lead_id);
  let ghlContactId = lead?.ghl_contact_id || null;

  if (ghlEnabled && lead && !ghlContactId) {
    try {
      const syncResult = await syncLeadToGhl(lead, 'campaign_sms', false, true);
      ghlContactId = syncResult.contactId;
    } catch (syncErr: any) {
      console.warn(`[Scheduler] GHL sync failed for lead ${action.lead_id}: ${syncErr.message}`);
    }
  }

  if (ghlEnabled && ghlContactId) {
    const result = await sendSmsViaGhl(ghlContactId, action.body || '');
    if (!result.success) {
      console.warn(`[Scheduler] GHL SMS failed for lead ${action.lead_id}: ${result.error}`);
    }
    await addContactNote(
      ghlContactId,
      `📱 SMS Sent: ${action.subject || 'Campaign message'}\n${(action.body || '').substring(0, 500)}`
    ).catch(() => {});
    console.log(`[Scheduler] SMS sent via GHL for lead ${action.lead_id}: ${action.subject}`);
  } else {
    console.log(`[Scheduler] SMS to ${phone}: ${action.body?.substring(0, 160)} (GHL disabled or sync failed)`);
  }

  await action.update({
    status: 'sent',
    sent_at: new Date(),
    attempts_made: (action.attempts_made || 0) + 1,
    metadata: { ...(action.metadata || {}), ghl_sent: !!(ghlEnabled && ghlContactId), ai_generated: action.ai_generated || false },
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
    delivery_mode: (ghlEnabled && ghlContactId) ? 'live' : 'simulated',
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
  leadId?: number,
): string {
  const SITE_PATTERN = /href="(https?:\/\/(enterprise|advisor)\.colaberry\.ai[^"]*)"/gi;

  return html.replace(SITE_PATTERN, (_match, rawUrl: string) => {
    try {
      const url = new URL(rawUrl);
      // Don't overwrite if already has cid (manually set tracking link)
      if (url.searchParams.has('cid')) return `href="${rawUrl}"`;

      url.searchParams.set('utm_source', channel || 'email');
      url.searchParams.set('utm_medium', campaignType || 'campaign');
      url.searchParams.set('utm_campaign', campaignId);
      url.searchParams.set('cid', campaignId);
      if (leadId) url.searchParams.set('lid', String(leadId));
      return `href="${url.toString()}"`;
    } catch {
      return `href="${rawUrl}"`;
    }
  });
}

/** Minimal wrapper for personal emails — no corporate footer, no unsubscribe, looks like Gmail/Outlook */
function wrapPersonalEmailHtml(body: string, tracking?: { campaignId?: string; campaignType?: string; leadId?: number }): string {
  // Aggressively strip ANY team/company sign-offs the AI generates
  let cleaned = body
    // Strip "The Colaberry Enterprise AI team" and all variants (with or without HTML tags)
    .replace(/The Colaberry[^<\n]*(team|division|group)[^<\n]*/gi, '')
    .replace(/Colaberry Enterprise AI[^<\n]*(team|division)[^<\n]*/gi, '')
    // Strip common generic sign-offs that precede the team name
    .replace(/(Looking forward to connecting!?\s*)/gi, '')
    .replace(/(Best,?\s*\n?\s*$)/gim, '')
    .replace(/(Best regards,?\s*\n?\s*$)/gim, '')
    .replace(/(Warm regards,?\s*\n?\s*$)/gim, '')
    .replace(/(Sincerely,?\s*\n?\s*$)/gim, '')
    // Strip in HTML paragraph tags
    .replace(/<p>\s*(Best,?|Warm regards,?|Sincerely,?|Looking forward[^<]*)\s*<\/p>/gi, '')
    .replace(/<p>\s*The Colaberry[^<]*<\/p>/gi, '')
    .replace(/<p>\s*Colaberry Enterprise[^<]*<\/p>/gi, '')
    // Clean up empty paragraphs left behind
    .replace(/<p>\s*<\/p>/g, '')
    .replace(/\n{3,}/g, '\n\n');
  // Build tracked advisor URL for PS line
  const advisorParams: string[] = [];
  if (tracking?.campaignType) { advisorParams.push('utm_source=email', `utm_medium=${tracking.campaignType}`); }
  if (tracking?.campaignId) { advisorParams.push(`utm_campaign=${tracking.campaignId}`); }
  if (tracking?.leadId) { advisorParams.push(`lid=${tracking.leadId}`); }
  const advisorUrl = 'https://advisor.colaberry.ai/advisory/' + (advisorParams.length ? '?' + advisorParams.join('&') : '');

  // Gmail-style plain email: Arial 14px, #222 text, no special formatting
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: Arial, sans-serif; font-size: 14px; color: #222222; line-height: 1.5; margin: 0; padding: 0;">
  <div style="max-width: 600px; padding: 12px 0;">
    ${cleaned}
    <p style="font-size: 12px; color: #a0aec0; margin-top: 16px;">PS - Curious what AI could look like at your company? <a href="${advisorUrl}" style="color: #3b82f6;">Try our 5-minute AI org designer</a></p>
  </div>
</body>
</html>
  `.trim();
}

function wrapEmailHtml(body: string, tracking?: { campaignId?: string; campaignType?: string; leadId?: number }): string {
  const advisorParams: string[] = [];
  if (tracking?.campaignType) { advisorParams.push('utm_source=email', `utm_medium=${tracking.campaignType}`); }
  if (tracking?.campaignId) { advisorParams.push(`utm_campaign=${tracking.campaignId}`); }
  if (tracking?.leadId) { advisorParams.push(`lid=${tracking.leadId}`); }
  const advisorUrl = 'https://advisor.colaberry.ai/advisory/' + (advisorParams.length ? '?' + advisorParams.join('&') : '');

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
    <p style="font-size: 13px; margin-top: 12px;"><a href="${advisorUrl}" style="color: #3b82f6; text-decoration: none; font-weight: 600;">Design Your AI Organization in 5 Minutes &rarr;</a></p>
    <p>Colaberry Enterprise AI Division<br>
    AI Leadership | Architecture | Implementation | Advisory</p>
    <p style="font-size: 12px; color: #a0aec0; margin-top: 12px;">If you no longer wish to receive these emails, reply with "unsubscribe" or <a href="mailto:${env.emailFrom}?subject=unsubscribe" style="color: #a0aec0;">click here to opt out</a>.</p>
  </div>
</body>
</html>
  `.trim();
}

/** Detect no-show strategy calls (2+ hours past scheduled time, still 'scheduled') */
async function detectNoShows(): Promise<void> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const noShows = await StrategyCall.findAll({
    where: {
      status: 'scheduled',
      scheduled_at: { [Op.lt]: twoHoursAgo },
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

// ─── Cold Outbound Phase Graduation ──────────────────────────────────────────
// Checks leads who completed a phase sequence and graduates them to the next phase
// based on engagement (opens/clicks). Leads with zero engagement are dropped.

async function checkPhaseGraduation(): Promise<void> {
  const { enrollLeadInSequence } = require('./sequenceService');

  // Phase transitions: Phase 1 → Phase 2, Phase 2 → Phase 3
  const transitions = [
    {
      from_type: 'cold_outbound',
      to_type: 'cold_outbound_phase2',
      label: 'Phase 1 → Phase 2',
      min_opens: 2,
      min_clicks: 1,
      operator: 'OR' as const,
    },
    {
      from_type: 'cold_outbound_phase2',
      to_type: 'cold_outbound_phase3',
      label: 'Phase 2 → Phase 3',
      min_opens: 1,
      min_clicks: 0,
      operator: 'OR' as const,
    },
  ];

  let totalGraduated = 0;
  let totalDropped = 0;

  for (const transition of transitions) {
    try {
      // Find the destination campaign
      const destCampaign = await Campaign.findOne({ where: { type: transition.to_type, status: 'active' } });
      if (!destCampaign) {
        console.log(`[PhaseGrad] No active campaign for ${transition.to_type} — skipping ${transition.label}`);
        continue;
      }

      // Find leads who completed the source phase (all steps sent, no pending actions)
      // and are not already enrolled in the destination campaign
      const [completedLeads] = await sequelize.query(`
        SELECT DISTINCT cl.lead_id, cl.campaign_id as source_campaign_id,
          COALESCE(opens.open_count, 0) as open_count,
          COALESCE(clicks.click_count, 0) as click_count
        FROM campaign_leads cl
        JOIN campaigns c ON c.id = cl.campaign_id
        WHERE c.type = :fromType
          AND cl.status = 'completed'
          -- Not already graduated to destination
          AND NOT EXISTS (
            SELECT 1 FROM campaign_leads cl2
            JOIN campaigns c2 ON c2.id = cl2.campaign_id
            WHERE cl2.lead_id = cl.lead_id AND c2.type = :toType
          )
          -- Completed within last 7 days (don't graduate ancient leads)
          AND cl.updated_at > NOW() - interval '7 days'
        -- Count opens for this lead in the source campaign
        LEFT JOIN LATERAL (
          SELECT COUNT(*) as open_count FROM interaction_outcomes io
          WHERE io.lead_id = cl.lead_id AND io.campaign_id = cl.campaign_id AND io.outcome = 'opened'
        ) opens ON true
        -- Count clicks for this lead in the source campaign
        LEFT JOIN LATERAL (
          SELECT COUNT(*) as click_count FROM interaction_outcomes io
          WHERE io.lead_id = cl.lead_id AND io.campaign_id = cl.campaign_id AND io.outcome = 'clicked'
        ) clicks ON true
        LIMIT 50
      `, {
        replacements: { fromType: transition.from_type, toType: transition.to_type },
        type: QueryTypes.SELECT,
      }) as any[];

      if (completedLeads.length === 0) continue;

      let graduated = 0;
      let dropped = 0;

      for (const lead of completedLeads) {
        const opens = parseInt(lead.open_count || '0', 10);
        const clicks = parseInt(lead.click_count || '0', 10);

        // Check engagement criteria
        let meetsThreshold = false;
        if (transition.operator === 'OR') {
          meetsThreshold = opens >= transition.min_opens || clicks >= transition.min_clicks;
        } else {
          meetsThreshold = opens >= transition.min_opens && clicks >= transition.min_clicks;
        }

        if (meetsThreshold) {
          // Graduate: enroll in next phase
          try {
            await enrollLeadInSequence(lead.lead_id, destCampaign.sequence_id, destCampaign.id);
            graduated++;
            console.log(`[PhaseGrad] ${transition.label}: graduated lead ${lead.lead_id} (opens: ${opens}, clicks: ${clicks})`);
          } catch (err: any) {
            console.warn(`[PhaseGrad] Failed to graduate lead ${lead.lead_id}: ${err.message}`);
          }
        } else {
          // Drop: zero or insufficient engagement
          dropped++;
          console.log(`[PhaseGrad] ${transition.label}: dropped lead ${lead.lead_id} (opens: ${opens}, clicks: ${clicks} — below threshold)`);
        }
      }

      totalGraduated += graduated;
      totalDropped += dropped;

      if (graduated > 0 || dropped > 0) {
        console.log(`[PhaseGrad] ${transition.label}: ${graduated} graduated, ${dropped} dropped`);
      }
    } catch (err: any) {
      console.error(`[PhaseGrad] ${transition.label} error: ${err.message}`);
    }
  }

  if (totalGraduated > 0 || totalDropped > 0) {
    console.log(`[PhaseGrad] Total: ${totalGraduated} graduated, ${totalDropped} dropped`);
  }
}

export function startScheduler(): void {
  // Process pending actions every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    instrumentCronJob('ScheduledActionsProcessor', () => processScheduledActions()).catch((err) => {
      console.error('[Scheduler] Unexpected error:', err);
    });
  });

  // Reap idle preview stacks every 5 minutes (stops stacks untouched for 30 min).
  cron.schedule('*/5 * * * *', async () => {
    try {
      const { reapIdlePreviewStacks } = await import('./previewStackReaper');
      const result = await reapIdlePreviewStacks();
      if (result.stopped.length > 0) {
        console.log(`[PreviewReaper] Stopped ${result.stopped.length} idle stacks:`, result.stopped.join(', '));
      }
    } catch (err: any) {
      console.error('[PreviewReaper] error:', err?.message);
    }
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

  // Campaign watchdog: detect silent failures and auto-recover every 7 minutes
  cron.schedule('*/7 * * * *', () => {
    instrumentCronJob('CampaignWatchdog', async () => {
      const { runWatchdog } = require('./campaignWatchdogService');
      await runWatchdog();
    }).catch((err: any) => {
      console.error('[Scheduler] Campaign watchdog error:', err.message);
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

  // Mandrill open/click poll — webhooks are unreliable because older webhooks
  // (school system) consume open/click events before ours. Poll API every 30 min.
  cron.schedule('5,35 * * * *', () => {
    instrumentCronJob('MandrillOpenClickPoll', async () => {
      const axios = require('axios');
      const apiKey = env.mandrillApiKey;
      if (!apiKey) return;
      const { InteractionOutcome, Lead } = require('../models');
      const today = new Date().toISOString().split('T')[0];
      try {
        const r = await axios.post('https://mandrillapp.com/api/1.0/messages/search.json', {
          key: apiKey, query: '*', date_from: today, date_to: today, limit: 100,
        });
        let opens = 0, clicks = 0;
        for (const msg of r.data) {
          const lead = await Lead.findOne({ where: { email: msg.email.toLowerCase() } });
          if (!lead) continue;
          if (msg.opens > 0) {
            const exists = await InteractionOutcome.findOne({
              where: { lead_id: lead.id, outcome: 'opened', created_at: { [Op.gte]: new Date(today) } },
            });
            if (!exists) {
              await InteractionOutcome.create({
                lead_id: lead.id, outcome: 'opened', channel: 'email',
                metadata: { subject: msg.subject, backfilled: true, source: 'mandrill_poll' },
              } as any);
              opens++;
            }
          }
          if (msg.clicks > 0) {
            const exists = await InteractionOutcome.findOne({
              where: { lead_id: lead.id, outcome: 'clicked', created_at: { [Op.gte]: new Date(today) } },
            });
            if (!exists) {
              await InteractionOutcome.create({
                lead_id: lead.id, outcome: 'clicked', channel: 'email',
                metadata: { subject: msg.subject, backfilled: true, source: 'mandrill_poll' },
              } as any);
              clicks++;
            }
          }
        }
        if (opens > 0 || clicks > 0) {
          console.log(`[Mandrill Poll] Backfilled ${opens} opens, ${clicks} clicks`);
        }
      } catch (err: any) {
        console.error('[Mandrill Poll] Error:', err.message);
      }
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

  // -- Campaign Graduation (Phase 1 → 2 → 3) every 6 hours --
  cron.schedule('0 */6 * * *', () => {
    instrumentCronJob('CampaignGraduation', async () => {
      const { runGraduationCycle } = require('./campaignGraduationService');
      const result = await runGraduationCycle();
      if (result.phase1_to_2 > 0 || result.phase2_to_3 > 0) {
        console.log(`[Scheduler] Campaign graduation: ${result.phase1_to_2} Phase1→2, ${result.phase2_to_3} Phase2→3`);
      }
    }).catch((err: any) => {
      console.error('[Scheduler] Campaign graduation error:', err.message);
    });
  });
  console.log('[Scheduler] Campaign graduation: every 6 hours');

  // -- Inbox Chief of Staff --
  try {
    const { startInboxScheduler } = require('./inbox/inboxScheduler');
    startInboxScheduler();
    console.log('[Scheduler] Inbox COS scheduler started (sync 60s, classify 65s, digest 4h, learning 24h)');
  } catch (err: any) {
    console.error('[Scheduler] Inbox COS scheduler failed to start:', err.message);
  }

  // -- Accelerator Session Lifecycle --

  // Session reminders: check every 30 minutes (with dedup to prevent spam)
  const sentReminders = new Set<string>(); // Track "sessionId-type" to prevent re-sending
  cron.schedule('*/30 * * * *', () => {
    instrumentCronJob('SessionReminders', async () => {
      // 24-hour reminders
      const upcoming24h = await getUpcomingSessions(24);
      for (const session of upcoming24h) {
        const dedupKey = `${session.id}-24h`;
        if (sentReminders.has(dedupKey)) continue; // Already sent this reminder
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
          sentReminders.add(dedupKey);
          console.log(`[Scheduler] Sent 24h reminders for session ${session.session_number} to ${enrollments.length} participant(s)`);
        }
      }

      // 1-hour reminders
      const upcoming1h = await getUpcomingSessions(1);
      for (const session of upcoming1h) {
        const dedupKey1h = `${session.id}-1h`;
        if (sentReminders.has(dedupKey1h)) continue; // Already sent this reminder
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
          sentReminders.add(dedupKey1h);
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

  // ── Hot Lead Escalation (every 15 min, weekdays 9AM-5PM CT) ─────────────
  // Maya calls within ~15 min of interest. Max 50 calls/day. Newest first.
  cron.schedule('3,18,33,48 14-22 * * 1-5', () => {
    instrumentCronJob('HotLeadEscalation', async () => {
      // Daily cap: max 50 calls per day
      const settingsSvc = require('./settingsService');
      const todayStr = new Date().toISOString().slice(0, 10);
      const lastDate = await settingsSvc.getSetting('hot_lead_calls_date');
      let callsToday = parseInt(await settingsSvc.getSetting('hot_lead_calls_today') || '0', 10);
      if (lastDate !== todayStr) {
        callsToday = 0;
        await settingsSvc.setSetting('hot_lead_calls_date', todayStr);
        await settingsSvc.setSetting('hot_lead_calls_today', '0');
      }
      if (callsToday >= 100) {
        console.log(`[HotLead] Daily cap reached (${callsToday}/100)`);
        return;
      }
      const remaining = 100 - callsToday;
      const perCycle = 5; // Max 5 calls per 15-min cycle to spread throughout the day

      // Find hot leads — prioritize newest engagement, cap by per-cycle limit
      const [hotLeads] = await sequelize.query(`
        SELECT DISTINCT sub.lead_id, l.name, l.email, l.phone,
          l.company as lead_company, l.title as lead_title,
          cl_camp.campaign_id as active_campaign_id, c.name as campaign_name
        FROM (
          SELECT lead_id FROM interaction_outcomes
          WHERE outcome = 'opened'
          GROUP BY lead_id HAVING COUNT(*) >= 2
          UNION
          SELECT DISTINCT lead_id FROM interaction_outcomes WHERE outcome = 'clicked'
        ) sub
        JOIN leads l ON l.id = sub.lead_id
        LEFT JOIN campaign_leads cl_camp ON cl_camp.lead_id = sub.lead_id AND cl_camp.status = 'active'
        LEFT JOIN campaigns c ON c.id = cl_camp.campaign_id
        WHERE l.lead_temperature IS DISTINCT FROM 'hot'
          AND NOT EXISTS (
            SELECT 1 FROM communication_logs comm
            WHERE comm.lead_id = sub.lead_id
            AND comm.channel = 'voice'
            AND comm.metadata->>'trigger' = 'hot_lead_escalation'
          )
          AND NOT EXISTS (
            SELECT 1 FROM campaign_leads cl_ali
            JOIN campaigns c_ali ON c_ali.id = cl_ali.campaign_id
            WHERE cl_ali.lead_id = sub.lead_id
            AND c_ali.type = 'executive_outreach'
            AND cl_ali.enrolled_at > NOW() - interval '48 hours'
          )
        ORDER BY sub.lead_id DESC
        LIMIT ${Math.min(perCycle, remaining)}
      `);

      if ((hotLeads as any[]).length === 0) return;

      console.log(`[HotLead] Found ${(hotLeads as any[]).length} hot leads for outreach (${callsToday}/50 today)`);

      const { triggerVoiceCall } = require('./synthflowService');
      const { logCommunication } = require('./communicationLogService');
      const Lead = require('../models').Lead;
      const CampaignLead = require('../models').CampaignLead;
      const strategyCampaignId = '673d0ddf-78fc-44ab-b25e-858ef322d335'; // Strategy Call Readiness

      let called = 0;
      for (const lead of hotLeads as any[]) {
        try {
          // Mark lead as hot (with temperature history)
          const { classifyLeadManual } = require('./leadClassificationService');
          await classifyLeadManual(lead.lead_id, 'hot', 'system:hot_lead_escalation').catch(() => {
            // Fallback to direct update if classifyLeadManual fails
            Lead.update({ lead_temperature: 'hot' }, { where: { id: lead.lead_id } });
          });

          // Skip voice call if no phone — still mark as hot
          if (!lead.phone) {
            console.log(`[HotLead] Marked ${lead.name} as hot (no phone — email-only lead)`);
            continue;
          }

          // Skip if Ali emailed this lead in the last 48 hours (Maya/Ali coordination)
          try {
            const [recentAliEmail] = await sequelize.query(`
              SELECT 1 FROM scheduled_emails se
              JOIN campaigns c ON c.id = se.campaign_id
              WHERE c.type = 'executive_outreach'
                AND se.lead_id = :leadId
                AND se.status = 'sent'
                AND se.sent_at > NOW() - interval '48 hours'
              LIMIT 1
            `, { replacements: { leadId: lead.lead_id }, type: QueryTypes.SELECT }) as any[];
            if (recentAliEmail) {
              console.log(`[HotLead] Skipping ${lead.name} — Ali emailed in last 48h (Maya/Ali coordination)`);
              continue;
            }
          } catch { /* non-critical — proceed with call if check fails */ }

          // Build campaign-aware prompt for Maya
          const firstName = (lead.name || '').split(' ')[0];
          const isAlumni = (lead.campaign_name || '').includes('Alumni');
          const isCold = (lead.campaign_name || '').includes('Cold Outbound');

          // Check if Ali personally emailed this lead (executive_outreach campaign)
          let aliEmailedThisLead = false;
          try {
            const [aliCheck] = await sequelize.query(`
              SELECT 1 FROM campaign_leads cl JOIN campaigns c ON c.id = cl.campaign_id
              WHERE cl.lead_id = :leadId AND c.type = 'executive_outreach' LIMIT 1
            `, { replacements: { leadId: lead.lead_id }, type: QueryTypes.SELECT }) as any[];
            aliEmailedThisLead = !!aliCheck;
          } catch { /* non-critical */ }

          const companyInfo = lead.lead_company ? ` at ${lead.lead_company}` : '';
          const titleInfo = lead.lead_title ? ` (${lead.lead_title})` : '';

          const campaignContext = aliEmailedThisLead
            ? `${lead.name}${titleInfo} works${companyInfo}. Ali Muwwakkil, our Managing Director, personally emailed them a few days ago because they showed strong interest in the program. They have not replied to Ali's email yet. You are following up on Ali's behalf.`
            : isAlumni
            ? `${lead.name} is a Colaberry alumni who is part of the Alumni AI Champion program. They were reached out to about helping others in their network get into AI leadership training through the referral program. They have been opening and engaging with emails about the Alumni AI Champion program.`
            : isCold
            ? `${lead.name}${titleInfo} works${companyInfo}. They received cold outreach emails about the Enterprise AI Leadership Accelerator — a 3-week program to build and deploy real AI systems. They opened multiple emails showing strong interest in AI systems and leadership.`
            : `${lead.name} showed interest in the Colaberry Enterprise AI Leadership Accelerator program.`;

          const coldOpening = lead.lead_company
            ? `Hi ${firstName}, this is Maya from Colaberry Enterprise AI. I noticed that someone from ${lead.lead_company} has been engaging with our content about building AI systems and I wanted to reach out personally to see how we can help your team.`
            : `Hi ${firstName}, this is Maya from Colaberry Enterprise AI. I saw that you showed some interest in our content about building AI systems and I wanted to reach out personally to see if I can answer any questions.`;

          const aliOpening = `Hi ${firstName}, this is Maya from Colaberry Enterprise AI. I'm calling because Ali Muwwakkil, our Managing Director, personally reached out to you recently about our AI Leadership program. He asked me to follow up and see if you had any questions or if there's a good time to connect.`;

          const openingLine = aliEmailedThisLead
            ? aliOpening
            : isAlumni
            ? `Hi ${firstName}, this is Maya from Colaberry. I noticed you have been engaging with our Alumni AI Champion program and I wanted to reach out personally to see if you had any questions about the referral program or how you can help others in your network get into AI leadership.`
            : coldOpening;

          const talkingPoints = isAlumni
            ? [
              '- Ask if they have any questions about the Alumni AI Champion referral program',
              '- The referral program helps them recommend colleagues and people in their network for AI leadership training',
              '- As a Colaberry alumni, they understand the value of the training and are well positioned to identify people who would benefit',
              '- Next cohort starts April 14th with limited seats',
              '- Ask if they know anyone who might benefit from learning to build and deploy AI systems',
              '- Offer to schedule a 30-minute strategy call with the Business Development team to discuss the referral program in detail',
            ]
            : [
              '- Ask what caught their attention or what challenges they are facing with AI in their organization',
              '- The program helps data professionals and leaders build and deploy real AI systems in 3 weeks',
              '- Next cohort starts April 14th with limited seats available',
              '- Companies can sponsor their teams for corporate training',
              '- Offer to schedule a 30-minute strategy call with the Business Development team to discuss how the program can help their team',
            ];

          const prompt = [
            'You are Maya, the AI Admissions Director for the Colaberry Enterprise AI Leadership Accelerator.',
            '',
            `LEAD CONTEXT: ${campaignContext}`,
            `CAMPAIGN: ${lead.campaign_name || 'Unknown'}`,
            '',
            `Be warm, conversational, and professional. Start by saying "${openingLine}"`,
            '',
            'Your goal is to schedule a 30-minute strategy call between them and our Business Development team.',
            '',
            'Key talking points:',
            ...talkingPoints,
            '',
            'If they agree to schedule a call, say "Great, I will send you a link to book a 30-minute strategy call with our Business Development team."',
            'If they are not interested right now, thank them warmly and let them know they can reach out anytime.',
            'Keep the call conversational. Do not rush.',
          ].join('\n');

          // Normalize phone: strip non-digits, prepend +1 if 10 digits
          let phone = (lead.phone || '').replace(/[^0-9]/g, '');
          if (phone.length === 10) phone = '+1' + phone;
          else if (phone.length === 11 && phone.startsWith('1')) phone = '+' + phone;
          else if (!phone.startsWith('+')) phone = '+' + phone;

          const result = await triggerVoiceCall({
            name: lead.name,
            phone,
            callType: 'interest',
            prompt,
            context: {
              lead_name: lead.name,
              lead_email: lead.email,
              step_goal: 'Book 30-min strategy call with Business Development team',
            },
          });

          if (result.success && !result.data?.skipped) {
            called++;
            // Log the call under the lead's active campaign
            await logCommunication({
              lead_id: lead.lead_id,
              campaign_id: lead.active_campaign_id || null,
              channel: 'voice',
              direction: 'outbound',
              delivery_mode: 'live',
              status: 'sent',
              to_address: lead.phone,
              subject: 'Hot lead interest call — schedule 30-min BD strategy call',
              provider: 'synthflow',
              provider_message_id: result.data?.call_id || null,
              metadata: {
                trigger: 'hot_lead_escalation',
                lead_temperature: 'hot',
                campaign_name: lead.campaign_name || 'unknown',
                previous_campaign_id: lead.active_campaign_id || null,
                goal: 'Book 30-min strategy call with Business Development team',
              },
            }).catch(() => {});
            console.log(`[HotLead] 📞 Called ${lead.name} (${lead.phone})`);
            callsToday++;
            await settingsSvc.setSetting('hot_lead_calls_today', String(callsToday));
          }
        } catch (err: any) {
          console.warn(`[HotLead] Failed to call ${lead.name}: ${err.message}`);
        }

        // 60s between calls — spread calls throughout the cycle
        await new Promise((r) => setTimeout(r, 60000));
      }

      if (called > 0) {
        console.log(`[HotLead] Made ${called} calls (${callsToday}/50 today)`);
      }
    }).catch((err: any) => {
      console.error('[Scheduler] Hot lead escalation error:', err.message);
    });
  });
  console.log('[Scheduler] Hot lead escalation: every 15 min (50/day cap, newest first)');

  // ── Ali Personal Outreach (hourly during business hours, weekdays) ────────
  // Sends personalized emails FROM ali@colaberry.com to high-intent leads.
  // No auto-reply — Ali handles all responses personally.
  cron.schedule('20 14-22 * * 1-5', () => { // :20 past each hour, 9AM-5PM CT
    instrumentCronJob('AliPersonalOutreach', async () => {
      const { runAliPersonalOutreach } = require('./aliPersonalOutreachService');
      await runAliPersonalOutreach();
    }).catch((err: any) => {
      console.error('[Scheduler] Ali personal outreach error:', err.message);
    });
  });
  console.log('[Scheduler] Ali personal outreach: hourly during business hours (max 10/day)');

  // ── Cold Outbound Phase Graduation (daily at 7 AM CT = 12:00 UTC) ─────────
  // Checks leads who completed Phase 1 or Phase 2 and auto-enrolls them in the next phase
  // based on engagement criteria (opens, clicks).
  cron.schedule('0 12 * * *', () => {
    instrumentCronJob('ColdOutboundPhaseGraduation', async () => {
      await checkPhaseGraduation();
    }).catch((err: any) => {
      console.error('[Scheduler] Phase graduation error:', err.message);
    });
  });
  console.log('[Scheduler] Cold outbound phase graduation: daily at 7 AM CT (12:00 UTC)');

  // ── Autonomous Ramp Evaluator (8 AM CT weekdays = 13:00 UTC Mon-Fri) ──
  const { runRampEvaluator } = require('./autonomousRampService');

  cron.schedule('0 13 * * 1-5', () => {
    instrumentCronJob('AutonomousRampEvaluator', async () => {
      await runRampEvaluator();
    }).catch((err: any) => {
      console.error('[Scheduler] Autonomous ramp evaluator error:', err.message);
    });
  });
  console.log('[Scheduler] Autonomous ramp evaluator: 8 AM CT weekdays (13:00 UTC Mon-Fri)');

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

  // ── Comprehensive System Health Monitor (every 15 min on weekdays) ──────────
  // Covers: campaigns, sequences, scheduler, DB, memory, email delivery, APIs, nginx
  // Suppress alerts for first 5 min after startup (avoids spam during deploys/restarts)
  let lastHealthAlertAt = Date.now();

  cron.schedule('3,18,33,48 * * * 1-5', () => {
    instrumentCronJob('SystemHealthMonitor', async () => {
      const nowCT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      const hour = nowCT.getHours();
      if (hour < 7 || hour >= 18) return; // Extended window: 7AM-6PM CT

      const { runFullSystemHealthCheck, formatHealthReportText } = require('./systemHealthService');
      const report = await runFullSystemHealthCheck();

      const issues = report.checks.filter((c: any) => c.severity !== 'ok');
      const criticals = report.checks.filter((c: any) => c.severity === 'critical');
      const autoFixed = report.checks.filter((c: any) => c.autoFixed);

      if (issues.length === 0) {
        console.log(`[SystemHealth] ✓ All ${report.checks.length} checks passed (${report.duration_ms}ms)`);
        return;
      }

      // Log all issues
      for (const check of issues) {
        const icon = check.severity === 'critical' ? '🔴' : '🟡';
        console.warn(`[SystemHealth] ${icon} ${check.name}: ${check.detail}`);
        if (check.autoFixed) console.log(`[SystemHealth] ✅ Auto-fixed: ${check.autoFixed}`);
      }

      // Alert on critical issues or auto-fixes
      const shouldAlert = criticals.length > 0 || autoFixed.length > 0;
      if (!shouldAlert) return;

      const timeSinceLastAlert = Date.now() - lastHealthAlertAt;
      const twoHoursMs = 2 * 60 * 60 * 1000;

      if (timeSinceLastAlert <= twoHoursMs) {
        console.log(`[SystemHealth] Alert suppressed (last alert ${Math.round(timeSinceLastAlert / 60000)}m ago, cooldown: 120m)`);
        return;
      }

      lastHealthAlertAt = Date.now();
      const reportText = formatHealthReportText(report);

      // Build Cory's voice prompt with full context
      const alertPrompt = [
        'You are Cory, the AI operations manager for the Colaberry Enterprise AI Leadership Accelerator platform.',
        'You are calling Ali, the system owner, to report on system health issues detected by the automated monitoring system.',
        'Be concise, professional, and direct. Start by saying "Hi Ali, this is Cory, your AI operations manager. I\'m calling because the system health monitor flagged some issues that need your attention."',
        '',
        reportText,
        '',
        'After explaining the situation, ask if Ali has any questions or wants you to take any specific action.',
        'If asked about the system, provide details based on what you know from the health report. If asked something you do not know, say so honestly.',
        'At the end of the call, let Ali know you are also sending a summary email with all the details to ali@colaberry.com.',
      ].join('\n');

      // Check if Synthflow itself is one of the critical issues — if so, skip voice call
      const synthflowDown = criticals.some((c: any) => c.name === 'synthflow_api');

      // Voice call (skip if Synthflow is the problem — can't call about being unable to call)
      if (env.adminAlertPhone && !synthflowDown) {
        try {
          const { triggerVoiceCall } = require('./synthflowService');
          const result = await triggerVoiceCall({
            name: 'Ali',
            phone: env.adminAlertPhone,
            callType: 'interest',
            prompt: alertPrompt,
            context: {
              lead_name: 'Ali',
              step_goal: `System health alert: ${criticals.length} critical, ${issues.length - criticals.length} warning`,
            },
          });
          if (result.success) {
            console.log(`[SystemHealth] 📞 Alert call initiated to ${env.adminAlertPhone}`);
          } else {
            console.error(`[SystemHealth] Alert call failed: ${result.error}`);
          }
        } catch (callErr: any) {
          console.error(`[SystemHealth] Failed to initiate alert call: ${callErr.message}`);
        }
      } else if (synthflowDown) {
        console.warn(`[SystemHealth] ⚠️ Synthflow is down — cannot call Ali. Email-only alert.`);
      }

      // Email (always — written record + critical fallback when voice is down)
      try {
        const { sendAlertEmail } = require('./emailService');
        const emailSubject = criticals.length > 0
          ? `🔴 System Health Alert: ${criticals.length} critical issue(s)`
          : `🟡 System Health Update: ${autoFixed.length} auto-fix(es) applied`;
        await sendAlertEmail('ali@colaberry.com', {
          type: 'system_health',
          severity: criticals.length > 0 ? 9 : 5,
          title: emailSubject,
          description: reportText,
          impact_area: 'System Operations',
          source_type: 'SystemHealthMonitor',
          urgency: criticals.length > 0 ? 'critical' : 'medium',
          created_at: new Date(),
        });
        console.log(`[SystemHealth] 📧 Alert email sent to ali@colaberry.com`);
      } catch (emailErr: any) {
        console.error(`[SystemHealth] Alert email failed: ${emailErr.message}`);
      }
    }).catch((err: any) => {
      console.error('[Scheduler] System health monitor error:', err.message);
    });
  });
  console.log('[Scheduler] System health monitor: every 15 min (weekdays 7AM-6PM CT, Cory voice + email alerts)');

  // ── Cold Outbound startup reactivation ──────────────────────────────
  // Cold Outbound reverts to draft on container restart — fix on startup
  (async () => {
    try {
      const coldOutbound = await Campaign.findOne({ where: { name: { [Op.like]: '%Cold Outbound%' } } });
      if (coldOutbound && (coldOutbound as any).status === 'draft') {
        await (coldOutbound as any).update({ status: 'active' });
        console.log('[Scheduler] Cold Outbound was in draft — auto-reactivated on startup');
      }
    } catch (err: any) {
      console.error('[Scheduler] Cold Outbound startup check failed:', err.message);
    }
  })();

  // AI Operations Layer scheduler (async — reads schedules from governance DB)
  const { startAIOpsScheduler } = require('./aiOpsScheduler');
  startAIOpsScheduler().catch((err: any) => {
    console.error('[Scheduler] AI Ops scheduler startup error:', err.message);
  });

  // Autonomous ingest insights — regenerate suggestion cards every 6 hours.
  // Never auto-applies; an admin must click Apply unless AUTONOMOUS_AUTOAPPLY=true.
  cron.schedule('0 */6 * * *', () => {
    (async () => {
      try {
        const { runInsightsJob } = require('../jobs/autonomousIngestInsights');
        await runInsightsJob();
      } catch (err: any) {
        console.error('[Scheduler] Autonomous ingest insights error:', err?.message);
      }
    })();
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
