/**
 * Inbox COS Alert Service.
 *
 * REPURPOSED 2026-06-01: previously sent SMS via T-Mobile email-to-SMS
 * gateway (6825975784@tmomail.net). Ali asked to disable - the alerts
 * were too frequent and the VIP alerts duplicated the new
 * vipInboxWatcher -> Mandrill -> gmail push system.
 *
 * NEW: every alert now routes through Mandrill to alimuwwakkil@gmail.com.
 * Gmail's mobile push notification is the alert (same UX as the VIP
 * system). Subject line is engineered for lock-screen preview.
 *
 * Same callers, same alert content - just a different delivery rail.
 */
import nodemailer from 'nodemailer';

const LOG_PREFIX = '[InboxCOS][Alert]';
const ALERT_TO = process.env.INBOX_COS_ALERT_GMAIL || 'alimuwwakkil@gmail.com';

const URGENT_KEYWORDS = [
  'urgent', 'asap', 'deadline', 'emergency', 'immediate',
  'time-sensitive', 'critical', 'action required', 'past due',
  'overdue', 'final notice', 'last chance',
];

async function sendSms(message: string): Promise<boolean> {
  if (!process.env.MANDRILL_API_KEY) {
    console.warn(`${LOG_PREFIX} MANDRILL_API_KEY missing - alert dropped`);
    return false;
  }
  try {
    const transport = nodemailer.createTransport({
      host: 'smtp.mandrillapp.com',
      port: 587,
      auth: {
        user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com',
        pass: process.env.MANDRILL_API_KEY,
      },
    });
    // First line of the message becomes the subject (lock-screen preview).
    const firstLine = message.split('\n')[0].slice(0, 90);
    const restOfBody = message.split('\n').slice(1).join('\n').trim();
    await transport.sendMail({
      from: '"Inbox COS" <ali@colaberry.com>',
      to: ALERT_TO,
      subject: firstLine,
      text: message,
      html: `<div style="font-family:arial,sans-serif;line-height:1.55"><div style="background:#1c1917;color:white;padding:14px 18px;border-radius:6px"><div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Inbox COS Alert</div><div style="font-size:14px;margin-top:6px">${firstLine.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div></div>${restOfBody ? `<div style="background:#f8fafc;border-left:4px solid #1a365d;padding:12px 14px;margin-top:10px;font-size:13px;color:#475569;white-space:pre-wrap">${restOfBody.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>` : ''}<div style="margin-top:12px;font-size:11px;color:#94a3b8">Inbox COS alert. Same UX as VIP alerts: gmail push hits your phone. SMS path (T-Mobile email-to-SMS) was disabled 2026-06-01.</div></div>`,
      headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false', 'Importance': 'high' },
    });
    console.log(`${LOG_PREFIX} alert routed to gmail: ${firstLine.slice(0, 50)}...`);
    return true;
  } catch (err: any) {
    console.error(`${LOG_PREFIX} alert send failed: ${err.message}`);
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

/**
 * Alert when an InboxCOS sync or archive operation fails authentication.
 * Throttled to once per day per provider+kind so a stuck token doesn't
 * spam SMS every minute.
 */
const lastAuthAlertAt = new Map<string, number>();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function alertSyncFailure(
  provider: string,
  kind: 'sync' | 'archive',
  errorMessage: string
): Promise<void> {
  const key = `${provider}:${kind}`;
  const last = lastAuthAlertAt.get(key) || 0;
  if (Date.now() - last < ONE_DAY_MS) return; // throttled

  const isAuthError = /invalid_grant|invalid_credentials|unauthorized|expired/i.test(errorMessage);
  if (!isAuthError && kind === 'sync') return; // only alert on auth-class sync errors; non-auth sync errors are usually transient

  const providerLabel: Record<string, string> = {
    gmail_colaberry: 'Colaberry Gmail',
    gmail_personal:  'Personal Gmail',
    hotmail:         'Hotmail',
  };
  const inbox = providerLabel[provider] || provider;
  const action = kind === 'sync' ? 'sync' : 'auto-archive';
  const reason = isAuthError ? 'auth token expired' : 'error';

  const sent = await sendSms(
    `Inbox COS ${action} failed (${inbox}): ${reason}. Re-run scripts/inbox-auth-helper.js.`
  );
  if (sent) lastAuthAlertAt.set(key, Date.now());
}

export { sendSms };
