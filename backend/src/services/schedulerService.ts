import cron from 'node-cron';
import { Op } from 'sequelize';
import nodemailer from 'nodemailer';
import { ScheduledEmail, Lead, Cohort, Campaign, StrategyCall } from '../models';
import { env } from '../config/env';
import { logActivity } from './activityService';
import { triggerVoiceCall } from './synthflowService';
import { generateMessage, buildConversationHistory } from './aiMessageService';
import { recordActionOutcome } from './interactionService';
import { computeInsights } from './icpInsightService';
import { cancelPrepNudge, enrollInNoShowRecovery } from './strategyPrepService';
import type { CampaignChannel } from '../models/ScheduledEmail';

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter && env.smtpUser && env.smtpPass) {
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
  return transporter;
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
    if (action.campaign_id) {
      const campaign = await Campaign.findByPk(action.campaign_id);
      if (campaign) {
        campaignContext = {
          type: campaign.type,
          name: campaign.name,
          step_goal: action.metadata?.step_goal || undefined,
          step_number: action.step_index,
          total_steps: undefined, // Could be loaded from sequence if needed
          system_prompt: campaign.ai_system_prompt || undefined,
        };
      }
    }

    const result = await generateMessage({
      channel: channel as 'email' | 'sms' | 'voice',
      ai_instructions: action.ai_instructions,
      tone: action.metadata?.ai_tone || undefined,
      context_notes: action.metadata?.ai_context_notes || undefined,
      lead: {
        name: lead.name,
        company: lead.company || undefined,
        title: lead.title || undefined,
        industry: lead.industry || undefined,
        lead_score: lead.lead_score || undefined,
        source_type: lead.lead_source_type || undefined,
        interest_area: lead.interest_area || undefined,
        email: lead.email,
        phone: lead.phone || undefined,
      },
      conversationHistory,
      campaignContext,
      cohortContext: nextCohort ? {
        name: nextCohort.name,
        start_date: nextCohort.start_date,
        seats_remaining: nextCohort.seats_remaining,
      } : undefined,
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
function isWithinCallSchedule(settings: Record<string, any>): boolean {
  const tz = settings.call_timezone || 'America/Chicago';
  const startTime = settings.call_time_start || '09:00';
  const endTime = settings.call_time_end || '17:00';
  const activeDays: number[] = settings.call_active_days || [1, 2, 3, 4, 5];

  try {
    // Get current time in the campaign's timezone
    const nowStr = new Date().toLocaleString('en-US', { timeZone: tz });
    const nowInTz = new Date(nowStr);
    const day = nowInTz.getDay(); // 0=Sun, 1=Mon...
    const hours = nowInTz.getHours();
    const minutes = nowInTz.getMinutes();

    // Check active day
    if (!activeDays.includes(day)) return false;

    // Check time window
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const currentMinutes = hours * 60 + minutes;
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } catch {
    return true; // On error, allow the call
  }
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
  const now = new Date();
  const pendingActions = await ScheduledEmail.findAll({
    where: {
      status: 'pending',
      scheduled_for: { [Op.lte]: now },
    },
    limit: 50, // Fetch more, will be limited per-campaign
    order: [['scheduled_for', 'ASC']],
  });

  if (pendingActions.length === 0) return;

  console.log(`[Scheduler] Processing ${pendingActions.length} scheduled actions`);

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

    // Pacing: limit actions per campaign per cycle
    const maxPerCycle = campaignSettings.max_leads_per_cycle || 10;
    campaignProcessed[campaignId] = (campaignProcessed[campaignId] || 0);
    if (campaignProcessed[campaignId] >= maxPerCycle) {
      continue; // Skip — will be picked up next cycle
    }

    // Call schedule: skip voice actions outside call window
    if (channel === 'voice' && action.campaign_id && Object.keys(campaignSettings).length > 0) {
      if (!isWithinCallSchedule(campaignSettings)) {
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
      // Step 1: AI content generation (for all channels)
      await generateAIContent(action);

      // Step 2: Apply test mode overrides
      if (campaignSettings.test_mode_enabled) {
        if (campaignSettings.test_email && (channel === 'email')) {
          await action.update({ to_email: campaignSettings.test_email, subject: `[TEST] ${action.subject}` } as any);
          await action.reload();
        }
        if (campaignSettings.test_phone && (channel === 'voice' || channel === 'sms')) {
          await action.update({ to_phone: campaignSettings.test_phone, subject: `[TEST] ${action.subject}` } as any);
          await action.reload();
        }
        console.log(`[Scheduler] TEST MODE: action ${action.id} redirected`);
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
        // Retry: reschedule 30 minutes later
        const retryAt = new Date(now.getTime() + 30 * 60 * 1000);
        await action.update({
          attempts_made: newAttempts,
          scheduled_for: retryAt,
        } as any);
        console.log(`[Scheduler] Retry ${newAttempts}/${maxAttempts} for action ${action.id}, next at ${retryAt.toISOString()}`);
      } else if (action.fallback_channel) {
        await handleFallback(action);
      } else {
        await action.update({ status: 'failed', attempts_made: newAttempts } as any);
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

async function processEmailAction(action: InstanceType<typeof ScheduledEmail>): Promise<void> {
  const mailer = getTransporter();
  if (!mailer) {
    console.warn('[Scheduler] SMTP not configured. Skipping email.');
    return;
  }

  await mailer.sendMail({
    from: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    to: action.to_email,
    subject: action.subject,
    html: wrapEmailHtml(action.body),
    headers: {
      'X-MC-Metadata': JSON.stringify({ scheduled_email_id: action.id }),
    },
  });

  await action.update({
    status: 'sent',
    sent_at: new Date(),
    attempts_made: (action.attempts_made || 0) + 1,
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

  console.log(`[Scheduler] Email sent to ${action.to_email}: ${action.subject} (AI: ${action.ai_generated || false})`);
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
        .replace(/\{\{conversation_history\}\}/g, conversationHistory);
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

    console.log(`[Scheduler] Voice call initiated for ${phone}: ${action.subject} (AI: ${action.ai_generated || false})`);
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

  // SMS integration placeholder — when a provider (Twilio, etc.) is configured, replace this
  console.log(`[Scheduler] SMS to ${phone}: ${action.body?.substring(0, 160)}`);

  await action.update({
    status: 'sent',
    sent_at: new Date(),
    attempts_made: (action.attempts_made || 0) + 1,
    metadata: { ...(action.metadata || {}), sms_placeholder: true, ai_generated: action.ai_generated || false },
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

  console.log(`[Scheduler] SMS action processed for ${phone}: ${action.subject} (AI: ${action.ai_generated || false})`);
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
    processScheduledActions().catch((err) => {
      console.error('[Scheduler] Unexpected error:', err);
    });
  });

  // Detect no-show strategy calls every 15 minutes
  cron.schedule('*/15 * * * *', () => {
    detectNoShows().catch((err) => {
      console.error('[Scheduler] No-show detection error:', err);
    });
  });

  // Compute ICP insights daily at 2 AM
  cron.schedule('0 2 * * *', () => {
    console.log('[Scheduler] Running daily ICP insight computation...');
    computeInsights(90).catch((err) => {
      console.error('[Scheduler] ICP insight computation error:', err);
    });
  });

  console.log('[Scheduler] AI-powered multi-channel campaign scheduler started (every 5 minutes)');
  console.log('[Scheduler] Channels: email (Mandrill), voice (Synthflow), sms (placeholder)');
  console.log('[Scheduler] AI generation: enabled for actions with ai_instructions');
  console.log('[Scheduler] No-show detection: every 15 minutes');
  console.log('[Scheduler] ICP insight computation: daily at 2 AM');
}
