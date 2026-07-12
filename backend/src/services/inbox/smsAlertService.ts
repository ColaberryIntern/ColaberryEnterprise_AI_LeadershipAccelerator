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
 * TONE-DOWN 2026-06-05 (per Ali approval, CC-20260603-v7da):
 *   - Dropped the noisiest keyword "urgent" (was 74/wk of false positives
 *     on promo email bodies). 4 keywords now, all narrow.
 *   - URGENT classifier now matches subject ONLY (not body). Cuts promo
 *     emails like "last chance: 30% off" from tripping the alert.
 *   - 24h dedupe per (sender, keyword) backed by inbox_alert_log DB table.
 *   - alertSyncFailure() moved from in-process Map throttle to DB-backed
 *     dedupe so container restarts don't re-fire the same auth failure.
 */
import nodemailer from 'nodemailer';
import { sequelize } from '../../config/database';
import { QueryTypes } from 'sequelize';
import { inboxCosAlertsEnabled } from './inboxAlertsConfig';

const LOG_PREFIX = '[InboxCOS][Alert]';
const ALERT_TO = process.env.INBOX_COS_ALERT_GMAIL || 'alimuwwakkil@gmail.com';

// Narrowed 2026-06-05 from 12 to 4. Dropped "urgent" (74/wk noise from
// promo bodies), "immediate" (14/wk - vague), "time-sensitive", "critical",
// "overdue", "past due", "final notice", "last chance" - all of those
// trip on routine marketing emails. The 4 remaining are subject-only
// signals that strongly indicate the sender expects a response.
const URGENT_KEYWORDS = [
  'asap', 'deadline', 'emergency', 'action required',
];

// 24h dedupe window for URGENT alerts. Backed by inbox_alert_log.
const URGENT_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;
// 7d dedupe window for auth-expired notices. Once we tell Ali the gmail
// token died, don't tell him again until 7 days later or he resolves it.
const AUTH_FAILURE_DEDUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

async function sendSms(message: string): Promise<boolean> {
  if (!inboxCosAlertsEnabled()) {
    console.log(`${LOG_PREFIX} alerts disabled (INBOX_COS_ALERTS_ENABLED!=true) - dropped`);
    return false;
  }
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
 * DB-backed dedupe check. Returns true if a matching alert was sent within
 * the window; the caller should suppress the new alert. Returns false (no
 * matching recent alert) on lookup error so we err on the side of sending.
 */
async function wasRecentlySent(alertKind: string, dedupKey: string, windowMs: number): Promise<boolean> {
  try {
    const [rows] = await sequelize.query(
      `SELECT 1 FROM inbox_alert_log
       WHERE alert_kind = :kind AND dedup_key = :key
         AND sent_at > NOW() - (:ms || ' milliseconds')::interval
       LIMIT 1`,
      { type: QueryTypes.RAW, replacements: { kind: alertKind, key: dedupKey, ms: String(windowMs) } }
    ) as [any[], unknown];
    return Array.isArray(rows) && rows.length > 0;
  } catch (err: any) {
    console.error(`${LOG_PREFIX} dedupe lookup failed: ${err.message} - allowing send`);
    return false;
  }
}

async function recordSent(alertKind: string, dedupKey: string): Promise<void> {
  try {
    await sequelize.query(
      `INSERT INTO inbox_alert_log (alert_kind, dedup_key) VALUES (:kind, :key)`,
      { type: QueryTypes.INSERT, replacements: { kind: alertKind, key: dedupKey } }
    );
  } catch (err: any) {
    console.error(`${LOG_PREFIX} dedupe write failed: ${err.message}`);
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
 * Alert when an email contains urgent keywords. Per-sender per-keyword
 * 24h dedupe so a chatty sender doesn't trip the same alert repeatedly.
 */
export async function alertUrgentEmail(from: string, subject: string, matchedKeyword: string): Promise<void> {
  const dedupKey = `${from.toLowerCase()}|${matchedKeyword.toLowerCase()}`;
  if (await wasRecentlySent('urgent_keyword', dedupKey, URGENT_DEDUP_WINDOW_MS)) {
    console.log(`${LOG_PREFIX} URGENT suppressed (24h dedupe): ${dedupKey}`);
    return;
  }
  const sent = await sendSms(`URGENT: "${matchedKeyword}" detected\nFrom: ${from}\n${subject.slice(0, 60)}`);
  if (sent) await recordSent('urgent_keyword', dedupKey);
}

/**
 * Check if an email subject contains urgent keywords.
 *
 * CHANGED 2026-06-05: subject-only match (body removed). Body matches
 * were hitting promo emails ("last chance" coupons, "final notice"
 * billing pings). The signal we want lives in the subject.
 */
export function detectUrgentKeywords(subject: string, _bodyText: string | null): string | null {
  const text = subject.toLowerCase();
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
 *
 * CHANGED 2026-06-05: persisted dedupe via inbox_alert_log so container
 * restarts (frequent during deploys) don't wipe the throttle. 7-day
 * window per (provider, kind) so the same auth-expired notice doesn't
 * fire on every cron tick after a deploy.
 */
export async function alertSyncFailure(
  provider: string,
  kind: 'sync' | 'archive',
  errorMessage: string
): Promise<void> {
  const isAuthError = /invalid_grant|invalid_credentials|unauthorized|expired/i.test(errorMessage);
  if (!isAuthError && kind === 'sync') return; // only alert on auth-class sync errors; non-auth sync errors are usually transient

  const dedupKey = `${provider}|${kind}`;
  if (await wasRecentlySent('auth_failure', dedupKey, AUTH_FAILURE_DEDUP_WINDOW_MS)) {
    console.log(`${LOG_PREFIX} auth-failure suppressed (7d dedupe): ${dedupKey}`);
    return;
  }

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
  if (sent) await recordSent('auth_failure', dedupKey);
}

export { sendSms };
