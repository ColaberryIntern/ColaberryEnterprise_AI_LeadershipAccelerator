import cron from 'node-cron';
import { Op } from 'sequelize';
import nodemailer from 'nodemailer';
import { ScheduledEmail, Lead, Cohort, Campaign } from '../models';
import { env } from '../config/env';
import { logActivity } from './activityService';
import { triggerVoiceCall } from './synthflowService';
import { generateMessage, buildConversationHistory } from './aiMessageService';
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

async function processScheduledActions(): Promise<void> {
  const now = new Date();
  const pendingActions = await ScheduledEmail.findAll({
    where: {
      status: 'pending',
      scheduled_for: { [Op.lte]: now },
    },
    limit: 10,
    order: [['scheduled_for', 'ASC']],
  });

  if (pendingActions.length === 0) return;

  console.log(`[Scheduler] Processing ${pendingActions.length} scheduled actions`);

  for (const action of pendingActions) {
    const channel = (action.channel || 'email') as CampaignChannel;

    try {
      // Step 1: AI content generation (for all channels)
      await generateAIContent(action);

      // Step 2: Send via appropriate channel
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

export function startScheduler(): void {
  cron.schedule('*/5 * * * *', () => {
    processScheduledActions().catch((err) => {
      console.error('[Scheduler] Unexpected error:', err);
    });
  });

  console.log('[Scheduler] AI-powered multi-channel campaign scheduler started (every 5 minutes)');
  console.log('[Scheduler] Channels: email (Mandrill), voice (Synthflow), sms (placeholder)');
  console.log('[Scheduler] AI generation: enabled for actions with ai_instructions');
}
