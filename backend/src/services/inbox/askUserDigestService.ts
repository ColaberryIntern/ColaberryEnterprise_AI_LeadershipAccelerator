/**
 * Ask-User Digest Service — Collects pending ASK_USER emails and sends
 * an HTML digest email with inline action links for quick triage.
 */
import jwt from 'jsonwebtoken';
import { Op, literal } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import InboxClassification from '../../models/InboxClassification';
import InboxEmail from '../../models/InboxEmail';
import InboxDigestLog from '../../models/InboxDigestLog';
import { logAuditEvent } from './inboxAuditService';

const LOG_PREFIX = '[InboxCOS][Digest]';

const DIGEST_RECIPIENTS = ['ali@colaberry.com', 'ali_muwwakkil@hotmail.com'];

// ─── Main Digest Function ──────────────────────────────────────────────────

/**
 * Queries pending ASK_USER classifications that have not been included in a
 * previous digest, builds an HTML email with action buttons, and sends it.
 */
export async function sendPendingDigests(): Promise<{ sent: boolean; count: number }> {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error(`${LOG_PREFIX} JWT_SECRET not configured — cannot generate digest action tokens`);
    return { sent: false, count: 0 };
  }

  // 1. Find all email_ids that have already been included in a digest
  const existingDigests = await InboxDigestLog.findAll({
    attributes: ['email_ids'],
  });

  const alreadyDigestedIds = new Set<string>();
  for (const digest of existingDigests) {
    const ids = digest.email_ids;
    if (Array.isArray(ids)) {
      ids.forEach((id: string) => alreadyDigestedIds.add(id));
    }
  }

  // 2. Query ASK_USER classifications not yet digested
  const pendingClassifications = await InboxClassification.findAll({
    where: {
      state: 'ASK_USER',
    },
    order: [['classified_at', 'DESC']],
  });

  // Filter out already-digested email_ids
  const undigestedClassifications = pendingClassifications.filter(
    (c) => !alreadyDigestedIds.has(c.email_id)
  );

  if (undigestedClassifications.length === 0) {
    console.log(`${LOG_PREFIX} No pending ASK_USER emails to digest`);
    return { sent: false, count: 0 };
  }

  // 3. Load the full emails
  const emailIds = undigestedClassifications.map((c) => c.email_id);
  const emails = await InboxEmail.findAll({
    where: { id: { [Op.in]: emailIds } },
  });

  const emailMap = new Map(emails.map((e) => [e.id, e]));

  // 4. Generate a short-lived JWT (24h expiry) for action links
  const batchId = uuidv4();
  const token = jwt.sign({ batch_id: batchId, email_ids: emailIds }, jwtSecret, {
    expiresIn: '24h',
  });

  const apiBase = process.env.APP_BASE_URL || 'https://enterprise.colaberry.ai';

  // 5. Build HTML for each email card
  const emailCards = undigestedClassifications
    .map((classification) => {
      const email = emailMap.get(classification.email_id);
      if (!email) return '';

      const bodyPreview = email.body_text
        ? email.body_text.substring(0, 150).replace(/</g, '&lt;').replace(/>/g, '&gt;')
        : '(no body)';
      const fromName = escapeHtml(email.from_name || '');
      const fromAddress = escapeHtml(email.from_address);
      const subject = escapeHtml(email.subject);
      const confidence = classification.confidence ?? 0;
      const reasoning = escapeHtml(classification.reasoning || 'No reasoning');

      const inboxUrl = `${apiBase}/api/admin/inbox/digest-action?token=${encodeURIComponent(token)}&emailId=${email.id}&action=inbox`;
      const automationUrl = `${apiBase}/api/admin/inbox/digest-action?token=${encodeURIComponent(token)}&emailId=${email.id}&action=automation`;
      const holdUrl = `${apiBase}/api/admin/inbox/digest-action?token=${encodeURIComponent(token)}&emailId=${email.id}&action=hold`;

      return `<div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
  <div style="font-weight: bold;">From: ${fromName} &lt;${fromAddress}&gt;</div>
  <div>Subject: ${subject}</div>
  <div style="color: #718096; font-size: 13px; margin: 8px 0;">${bodyPreview}...</div>
  <div style="font-size: 12px; color: #a0aec0;">Confidence: ${confidence}% &mdash; ${reasoning}</div>
  <div style="margin-top: 12px;">
    <a href="${inboxUrl}" style="background: #38a169; color: white; padding: 6px 16px; border-radius: 4px; text-decoration: none; margin-right: 8px;">Show Me</a>
    <a href="${automationUrl}" style="background: #718096; color: white; padding: 6px 16px; border-radius: 4px; text-decoration: none; margin-right: 8px;">Dismiss</a>
    <a href="${holdUrl}" style="background: #e2e8f0; color: #2d3748; padding: 6px 16px; border-radius: 4px; text-decoration: none;">Keep Holding</a>
  </div>
</div>`;
    })
    .filter(Boolean)
    .join('\n');

  const count = undigestedClassifications.length;

  // 6. Wrap in full HTML email template
  const digestHtml = buildDigestTemplate(count, emailCards);

  // 7. Send via email transport
  const sentSuccessfully = await sendDigestEmail(
    `Inbox COS: ${count} email${count !== 1 ? 's' : ''} need your decision`,
    digestHtml,
    DIGEST_RECIPIENTS
  );

  if (!sentSuccessfully) {
    console.error(`${LOG_PREFIX} Failed to send digest email`);
    return { sent: false, count };
  }

  // 8. Create digest log
  await InboxDigestLog.create({
    email_ids: emailIds,
    digest_html: digestHtml,
    sent_to: DIGEST_RECIPIENTS.join(', '),
    sent_at: new Date(),
    actions_taken: [],
  });

  // 9. Log audit event
  await logAuditEvent({
    action: 'digest_sent',
    actor: 'system',
    metadata: {
      batch_id: batchId,
      email_count: count,
      recipients: DIGEST_RECIPIENTS,
      email_ids: emailIds,
    },
  });

  console.log(`${LOG_PREFIX} Digest sent with ${count} emails to ${DIGEST_RECIPIENTS.join(', ')}`);

  return { sent: true, count };
}

// ─── HTML Template ─────────────────────────────────────────────────────────

function buildDigestTemplate(count: number, emailCards: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Inbox COS Digest</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f7fafc; margin: 0; padding: 20px;">
  <div style="max-width: 640px; margin: 0 auto; background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="margin-bottom: 20px;">
      <h2 style="color: #1a365d; margin: 0 0 4px 0;">Inbox Chief of Staff</h2>
      <p style="color: #718096; margin: 0; font-size: 14px;">${count} email${count !== 1 ? 's' : ''} need${count === 1 ? 's' : ''} your decision</p>
    </div>
    <div>
      ${emailCards}
    </div>
    <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #a0aec0;">
      Action links expire in 24 hours. Unactioned emails will appear in the next digest.
    </div>
  </div>
</body>
</html>`;
}

// ─── Email Sending ─────────────────────────────────────────────────────────

/**
 * Sends the digest email via the existing nodemailer transport.
 * Imports emailService lazily to avoid circular dependencies.
 */
async function sendDigestEmail(
  subject: string,
  html: string,
  recipients: string[]
): Promise<boolean> {
  try {
    // Use nodemailer directly, same pattern as emailService.ts
    const nodemailer = await import('nodemailer');
    const { env } = await import('../../config/env');

    const transporter = env.mandrillApiKey
      ? nodemailer.default.createTransport({
          host: 'smtp.mandrillapp.com',
          port: 587,
          secure: false,
          auth: {
            user: 'apikey',
            pass: env.mandrillApiKey,
          },
        })
      : env.smtpUser && env.smtpPass
        ? nodemailer.default.createTransport({
            host: env.smtpHost,
            port: env.smtpPort,
            secure: env.smtpPort === 465,
            auth: {
              user: env.smtpUser,
              pass: env.smtpPass,
            },
          })
        : null;

    if (!transporter) {
      console.warn(`${LOG_PREFIX} SMTP not configured — digest email not sent`);
      return false;
    }

    for (const recipient of recipients) {
      const info = await transporter.sendMail({
        from: `"Inbox COS" <${env.emailFrom}>`,
        to: recipient,
        subject,
        html,
        text: stripHtml(html),
      });

      console.log(
        `${LOG_PREFIX} Digest email sent to ${recipient} | msgId=${info.messageId}`
      );
    }

    return true;
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Failed to send digest email: ${error.message}`);
    return false;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
