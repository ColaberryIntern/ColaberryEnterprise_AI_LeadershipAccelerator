import cron from 'node-cron';
import { Op } from 'sequelize';
import nodemailer from 'nodemailer';
import { ScheduledEmail, Lead } from '../models';
import { env } from '../config/env';
import { logActivity } from './activityService';
import { triggerVoiceCall } from './synthflowService';
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
    metadata: { scheduled_email_id: action.id, channel: 'email', step_index: action.step_index },
  });

  console.log(`[Scheduler] Email sent to ${action.to_email}: ${action.subject}`);
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

  const result = await triggerVoiceCall({ name, phone, callType });

  if (result.success) {
    await action.update({
      status: 'sent',
      sent_at: new Date(),
      attempts_made: (action.attempts_made || 0) + 1,
      metadata: { ...(action.metadata || {}), synthflow_response: result.data },
    } as any);

    await logActivity({
      lead_id: action.lead_id,
      type: 'call',
      subject: `Sequence voice call initiated: ${action.subject}`,
      metadata: { scheduled_email_id: action.id, channel: 'voice', step_index: action.step_index, call_data: result.data },
    });

    console.log(`[Scheduler] Voice call initiated for ${phone}: ${action.subject}`);
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
  console.log(`[Scheduler] SMS (placeholder) to ${phone}: ${action.body}`);

  await action.update({
    status: 'sent',
    sent_at: new Date(),
    attempts_made: (action.attempts_made || 0) + 1,
    metadata: { ...(action.metadata || {}), sms_placeholder: true },
  } as any);

  await logActivity({
    lead_id: action.lead_id,
    type: 'sms',
    subject: `Sequence SMS queued: ${action.subject}`,
    metadata: { scheduled_email_id: action.id, channel: 'sms', step_index: action.step_index, phone },
  });

  console.log(`[Scheduler] SMS action processed for ${phone}: ${action.subject}`);
}

async function handleFallback(action: InstanceType<typeof ScheduledEmail>): Promise<void> {
  const fallback = action.fallback_channel as CampaignChannel;
  console.log(`[Scheduler] Falling back from ${action.channel} to ${fallback} for action ${action.id}`);

  await ScheduledEmail.create({
    lead_id: action.lead_id,
    sequence_id: action.sequence_id,
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
    metadata: { fallback_from: action.channel, original_action_id: action.id },
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

  console.log('[Scheduler] Multi-channel campaign scheduler started (every 5 minutes)');
  console.log('[Scheduler] Channels: email (Mandrill), voice (Synthflow), sms (placeholder)');
}
