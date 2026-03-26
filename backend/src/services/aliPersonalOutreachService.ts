// ─── Ali Personal Outreach Service ──────────────────────────────────────────
// Sends personalized emails FROM ali@colaberry.com to high-intent leads.
// Ali sees them in his sent folder, replies go directly to him.
// NO auto-reply — Ali handles all responses personally.

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { env } from '../config/env';
import nodemailer from 'nodemailer';
import { buildCompositeContext } from './contextGraphService';
import { generateMessage } from './aiMessageService';
import { logCommunication } from './communicationLogService';
import { logActivity } from './activityService';

const ALI_SIGNATURE = `
<div style="margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 14px; color: #4a5568; font-family: Arial, sans-serif;">
  <strong>Ali Muwwakkil</strong><br>
  Managing Director<br>
  Data Scientist | AI Systems Architect<br>
  200 Chisholm Place, Suite 200 Plano, TX 75075
</div>`;

const ALI_EMAIL = 'ali@colaberry.com';
const MAX_PER_DAY = 10;

function getTransporter() {
  if (!env.mandrillApiKey) return null;
  return nodemailer.createTransport({
    host: 'smtp.mandrillapp.com',
    port: 587,
    secure: false,
    auth: { user: 'apikey', pass: env.mandrillApiKey },
  });
}

/**
 * Find high-intent leads who haven't received a personal Ali email yet.
 * Criteria (any): 3+ clicks, clicked booking link, Maya conversation >30s, hot/qualified temp
 */
export async function findHighIntentLeads(): Promise<any[]> {
  const leads = await sequelize.query(`
    SELECT DISTINCT sub.lead_id, l.name, l.email, l.company, l.title, l.lead_temperature,
      sub.click_count, sub.has_booking_click, sub.has_maya_convo
    FROM (
      SELECT io.lead_id,
        COUNT(*) FILTER (WHERE io.outcome = 'clicked') as click_count,
        COUNT(*) FILTER (WHERE io.outcome = 'clicked' AND io.metadata->>'url' LIKE '%ai-architect%') > 0 as has_booking_click,
        EXISTS (
          SELECT 1 FROM communication_logs cl
          WHERE cl.lead_id = io.lead_id AND cl.channel = 'voice'
          AND cl.provider_response->>'duration' IS NOT NULL
          AND CAST(cl.provider_response->>'duration' AS int) > 30
        ) as has_maya_convo
      FROM interaction_outcomes io
      GROUP BY io.lead_id
      HAVING COUNT(*) FILTER (WHERE io.outcome = 'clicked') >= 3
        OR COUNT(*) FILTER (WHERE io.outcome = 'clicked' AND io.metadata->>'url' LIKE '%ai-architect%') > 0
    ) sub
    JOIN leads l ON l.id = sub.lead_id
    WHERE NOT EXISTS (
      SELECT 1 FROM communication_logs cl2
      WHERE cl2.lead_id = sub.lead_id
      AND cl2.metadata->>'trigger' = 'ali_personal_outreach'
    )
    AND NOT EXISTS (
      SELECT 1 FROM strategy_calls sc WHERE sc.email = l.email
    )
    AND l.email IS NOT NULL AND l.email != ''
    ORDER BY sub.click_count DESC
  `, { type: QueryTypes.SELECT });

  return leads as any[];
}

/**
 * Generate and send a personalized email from Ali to a high-intent lead.
 */
export async function sendAliPersonalEmail(leadId: number, campaignId?: string): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn('[AliOutreach] Mandrill not configured');
    return false;
  }

  // Build composite context
  const context = await buildCompositeContext(
    leadId,
    campaignId || 'b90d7fd3-667a-41c3-8577-fd1b611c4480', // Default to Cold Outbound for context
    0,
  );

  if (!context.lead.email) {
    console.warn(`[AliOutreach] No email for lead ${leadId}`);
    return false;
  }

  // Build AI instructions based on their behavior
  const behaviors: string[] = [];
  if (context.engagement.linksClicked > 0) {
    behaviors.push(`they have clicked through to your website ${context.engagement.linksClicked} times`);
  }
  if (context.engagement.bookingAttempts > 0) {
    behaviors.push(`they tried to book a strategy call ${context.engagement.bookingAttempts} time(s)`);
  }
  if (context.engagement.voiceCallsMade > 0) {
    behaviors.push(`Maya from your team spoke with them briefly`);
  }
  if (context.engagement.emailsOpened > 3) {
    behaviors.push(`they have opened ${context.engagement.emailsOpened} of your emails`);
  }

  const behaviorSummary = behaviors.length > 0
    ? behaviors.join(', and ')
    : 'they have been engaging with your content';

  const aiInstructions = `Write a SHORT personal email from Ali Muwwakkil to ${context.lead.firstName}.
This is a personal, 1-on-1 email — not a campaign email. Keep it under 100 words.
${context.lead.company ? `They are ${context.lead.title || 'a leader'} at ${context.lead.company}.` : ''}
Specifically reference that ${behaviorSummary}.
${context.engagement.bookingAttempts > 0 ? 'Acknowledge they tried to book and make it easy for them.' : ''}
Offer to jump on a quick call. Include the booking link: https://enterprise.colaberry.ai/ai-architect
Also say they can just reply to this email.
Tone: Personal, warm, direct. Like Ali is personally writing to them.
Do NOT include a signature — it will be appended automatically.
Do NOT include opt-out language.`;

  // Generate with context graph
  const result = await generateMessage({
    channel: 'email',
    ai_instructions: aiInstructions,
    lead: {
      name: context.lead.name,
      company: context.lead.company,
      title: context.lead.title,
      industry: context.lead.industry,
    },
    campaignContext: {
      type: 'personal_outreach',
      system_prompt: 'You are Ali Muwwakkil, Managing Director of Colaberry Enterprise AI. You are personally reaching out to someone who has shown strong interest in your AI Leadership Accelerator program. Write as yourself — warm, direct, executive but approachable. No hype. No marketing language. Just a genuine personal note.',
    },
    compositeContext: context,
  });

  // Append Ali's signature
  const fullBody = `${result.body}${ALI_SIGNATURE}`;

  // Send via Mandrill as ali@colaberry.com
  try {
    const info = await transporter.sendMail({
      from: `"Ali Muwwakkil" <${ALI_EMAIL}>`,
      replyTo: ALI_EMAIL,
      to: context.lead.email,
      subject: result.subject || `Quick note, ${context.lead.firstName}`,
      html: fullBody,
      headers: {
        'X-MC-Tags': 'ali-personal-outreach',
        'X-MC-Metadata': JSON.stringify({ lead_id: leadId, trigger: 'ali_personal_outreach' }),
      },
    });

    console.log(`[AliOutreach] Sent to ${context.lead.name} (${context.lead.email}) | msgId: ${info.messageId}`);

    // Log communication
    await logCommunication({
      lead_id: leadId,
      channel: 'email',
      direction: 'outbound',
      delivery_mode: 'live',
      status: 'sent',
      to_address: context.lead.email,
      from_address: ALI_EMAIL,
      subject: result.subject || `Quick note, ${context.lead.firstName}`,
      body: fullBody,
      provider: 'mandrill',
      provider_message_id: info.messageId,
      metadata: {
        trigger: 'ali_personal_outreach',
        click_count: context.engagement.linksClicked,
        booking_attempts: context.engagement.bookingAttempts,
        auto_reply_disabled: true,
      },
    }).catch(() => {});

    // Log activity
    await logActivity({
      lead_id: leadId,
      type: 'email_sent',
      subject: `Personal email from Ali: ${result.subject || 'Quick note'}`,
      body: `Ali personally emailed ${context.lead.name} based on high intent (${context.engagement.linksClicked} clicks, ${context.engagement.bookingAttempts} booking attempts)`,
      metadata: {
        activity_subtype: 'ali_personal_outreach',
        auto_reply_disabled: true,
      },
    }).catch(() => {});

    return true;
  } catch (err: any) {
    console.error(`[AliOutreach] Failed for ${context.lead.email}: ${err.message}`);
    return false;
  }
}

/**
 * Run the Ali personal outreach cycle.
 * Called by scheduler every hour during business hours.
 */
export async function runAliPersonalOutreach(): Promise<void> {
  // Check daily cap
  const todayStr = new Date().toISOString().slice(0, 10);
  const [sentToday] = await sequelize.query(`
    SELECT COUNT(*) as cnt FROM communication_logs
    WHERE metadata->>'trigger' = 'ali_personal_outreach'
    AND created_at >= :today::date
  `, { replacements: { today: todayStr }, type: QueryTypes.SELECT }) as any[];

  const sentCount = parseInt(sentToday?.cnt || '0', 10);
  if (sentCount >= MAX_PER_DAY) {
    console.log(`[AliOutreach] Daily cap reached (${sentCount}/${MAX_PER_DAY})`);
    return;
  }

  const remaining = MAX_PER_DAY - sentCount;
  const leads = await findHighIntentLeads();

  if (leads.length === 0) {
    console.log('[AliOutreach] No new high-intent leads to contact');
    return;
  }

  console.log(`[AliOutreach] Found ${leads.length} high-intent leads, sending up to ${remaining}`);

  let sent = 0;
  for (const lead of leads.slice(0, remaining)) {
    const success = await sendAliPersonalEmail(lead.lead_id);
    if (success) sent++;
    // 30s between sends
    await new Promise(r => setTimeout(r, 30000));
  }

  if (sent > 0) {
    console.log(`[AliOutreach] Sent ${sent} personal emails from Ali (${sentCount + sent}/${MAX_PER_DAY} today)`);
  }
}
