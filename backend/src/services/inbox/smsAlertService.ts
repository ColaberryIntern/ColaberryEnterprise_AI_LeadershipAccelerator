/**
 * SMS Alert Service for Inbox COS.
 * Sends text messages via T-Mobile email-to-SMS gateway.
 */
import nodemailer from 'nodemailer';

const LOG_PREFIX = '[InboxCOS][SMS]';

const URGENT_KEYWORDS = [
  'urgent', 'asap', 'deadline', 'emergency', 'immediate',
  'time-sensitive', 'critical', 'action required', 'past due',
  'overdue', 'final notice', 'last chance',
];

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function getSmsTo(): string | null {
  return process.env.INBOX_COS_SMS_TO || null;
}

async function sendSms(message: string): Promise<boolean> {
  const to = getSmsTo();
  if (!to) return false;

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'info@colaberry.com',
      to,
      subject: '',
      text: message.slice(0, 160),
    });
    console.log(`${LOG_PREFIX} SMS sent: ${message.slice(0, 50)}...`);
    return true;
  } catch (err: any) {
    console.error(`${LOG_PREFIX} SMS failed: ${err.message}`);
    return false;
  }
}

/**
 * Alert when a VIP emails any inbox.
 */
export async function alertVipEmail(vipName: string, subject: string, provider: string): Promise<void> {
  const providerLabel: Record<string, string> = {
    gmail_colaberry: 'Colaberry',
    gmail_personal: 'Personal',
    hotmail: 'Hotmail',
  };
  const inbox = providerLabel[provider] || provider;
  await sendSms(`VIP: ${vipName} emailed you (${inbox})\n${subject.slice(0, 80)}`);
}

/**
 * Alert when an email contains urgent keywords.
 */
export async function alertUrgentEmail(from: string, subject: string, matchedKeyword: string): Promise<void> {
  await sendSms(`URGENT: "${matchedKeyword}" detected\nFrom: ${from}\n${subject.slice(0, 60)}`);
}

/**
 * Check if an email body/subject contains urgent keywords.
 */
export function detectUrgentKeywords(subject: string, bodyText: string | null): string | null {
  const text = `${subject} ${bodyText || ''}`.toLowerCase();
  for (const kw of URGENT_KEYWORDS) {
    if (text.includes(kw)) return kw;
  }
  return null;
}

/**
 * Send ASK_USER summary via text.
 */
export async function alertAskUserPending(count: number, samples: Array<{ from: string; subject: string }>): Promise<void> {
  let msg = `${count} email(s) need your decision:\n`;
  for (const s of samples.slice(0, 3)) {
    msg += `- ${s.from}: ${s.subject.slice(0, 40)}\n`;
  }
  msg += 'Check Inbox COS to decide.';
  await sendSms(msg);
}

/**
 * Morning daily summary via text.
 */
export async function sendDailySummary(stats: {
  newEmails: number;
  inbox: number;
  automation: number;
  silentHold: number;
  pendingDrafts: number;
  vipEmails: number;
}): Promise<void> {
  await sendSms(
    `Good morning Ali. Overnight inbox:\n` +
    `${stats.newEmails} new | ${stats.inbox} need you | ${stats.automation} filtered\n` +
    `${stats.silentHold} held | ${stats.pendingDrafts} drafts | ${stats.vipEmails} VIP`
  );
}

export { sendSms };
