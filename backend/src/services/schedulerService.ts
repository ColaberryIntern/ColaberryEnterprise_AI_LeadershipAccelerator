import cron from 'node-cron';
import { Op } from 'sequelize';
import nodemailer from 'nodemailer';
import { ScheduledEmail } from '../models';
import { env } from '../config/env';
import { logActivity } from './activityService';

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

async function processScheduledEmails(): Promise<void> {
  const mailer = getTransporter();
  if (!mailer) {
    return;
  }

  const now = new Date();
  const pendingEmails = await ScheduledEmail.findAll({
    where: {
      status: 'pending',
      scheduled_for: { [Op.lte]: now },
    },
    limit: 10, // Process in batches
    order: [['scheduled_for', 'ASC']],
  });

  if (pendingEmails.length === 0) return;

  console.log(`[Scheduler] Processing ${pendingEmails.length} scheduled emails`);

  for (const email of pendingEmails) {
    try {
      await mailer.sendMail({
        from: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
        to: email.to_email,
        subject: email.subject,
        html: wrapEmailHtml(email.body),
      });

      await email.update({ status: 'sent', sent_at: new Date() } as any);

      // Log activity
      await logActivity({
        lead_id: email.lead_id,
        type: 'email_sent',
        subject: `Sequence email sent: ${email.subject}`,
        metadata: { scheduled_email_id: email.id, step_index: email.step_index },
      });

      console.log(`[Scheduler] Sent email to ${email.to_email}: ${email.subject}`);
    } catch (error: any) {
      console.error(`[Scheduler] Failed to send email ${email.id}:`, error.message);
      await email.update({ status: 'failed' } as any);

      await logActivity({
        lead_id: email.lead_id,
        type: 'system',
        subject: `Sequence email failed: ${email.subject}`,
        metadata: { scheduled_email_id: email.id, error: error.message },
      });
    }
  }
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
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    processScheduledEmails().catch((err) => {
      console.error('[Scheduler] Unexpected error:', err);
    });
  });

  console.log('[Scheduler] Follow-up email scheduler started (every 5 minutes)');
}
