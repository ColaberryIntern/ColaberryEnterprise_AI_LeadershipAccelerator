/**
 * enterpriseIntakeEmails - the two automatic emails of the v2 intake (2026-11-21).
 *
 *  1. The interview reminder: a client who chose "do my AI interview later" gets their link at
 *     the time they picked. Transactional, from "Colaberry Enterprise AI", like the W32 sign-in
 *     link (they asked for it by scheduling). NEVER redirected in test mode, for the same reason
 *     as the sign-in link: it carries their working intake link.
 *  2. Ali's meeting brief: one visual summary of the client, led by the meeting date, to
 *     ali@colaberry.com. Internal, so it follows the normal test-mode redirect.
 *
 * These live here, not in emailService.ts (2,000+ lines; CLAUDE.md: never grow a file past the
 * ceiling), and reuse its one transport chokepoint (guardedSendMail: kill switch, dev guard).
 *
 * Failure handling: each sender THROWS when the send did not happen (no SMTP, kill switch, dev
 * guard, transport error), so the caller's claim is released and its capped retry applies.
 */
import { env } from '../../config/env';
import { emailHeaders, guardedSendMail, htmlToPlainText, resolveEmailRecipient } from '../emailService';
import { redactForLogs } from '../../utils/piiRedaction';

export const ALI_INBOX = 'ali@colaberry.com';

export class EmailNotSent extends Error {
  error_class = 'UpstreamUnavailable';
  constructor(reason: string) {
    super(`email not sent: ${reason}`);
    this.name = 'EmailNotSent';
  }
}

const escapeHtml = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

async function send(tag: string, options: { to: string; subject: string; html: string; neverRedirect: boolean }): Promise<void> {
  if (!env.mandrillApiKey) throw new EmailNotSent('SMTP not configured');
  const r = await resolveEmailRecipient(options.to, options.subject, { neverRedirect: options.neverRedirect });
  const info = await guardedSendMail({
    from: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    replyTo: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    to: r.to,
    subject: r.subject,
    html: options.html,
    text: htmlToPlainText(options.html),
    headers: emailHeaders(tag),
  });
  const response = String((info as { response?: string })?.response || '');
  if (response.startsWith('blocked_')) throw new EmailNotSent(response);
  console.log(JSON.stringify({ level: 'info', service: 'enterprise-intake-email', event: `${tag}_sent`, outcome: 'success',
    context: { to: redactForLogs(r.to), message_id: (info as { messageId?: string })?.messageId || null } }));
}

// --- 1. The interview reminder ---

export interface ReminderData {
  to: string;
  fullName: string;
  company: string;
  link: string;
  /** "Monday, November 23 at 9:00 AM Central", when their meeting with Ali is booked. */
  meetingWhen: string | null;
}

export const REMINDER_SUBJECT = 'Your 10-minute AI interview with Colaberry';

export function buildReminderHtml(d: ReminderData): string {
  const first = escapeHtml(String(d.fullName || '').trim().split(/\s+/)[0] || 'there');
  return [
    '<div style="font-family: arial, sans-serif; font-size: 15px; color: #1a202c; line-height: 1.6; max-width: 560px">',
    `<p>Hi ${first},</p>`,
    `<p>This is the time you picked for your AI interview about ${escapeHtml(d.company || 'your pilot')}. It takes about 10 minutes, and it replaces the discovery call: one person with the answers, instead of everyone in a meeting.</p>`,
    `<p><a href="${escapeHtml(d.link)}" style="display:inline-block;background:#2E6A86;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none">Start my interview</a></p>`,
    d.meetingWhen
      ? `<p>Your meeting with Ali Muwwakkil is on <strong>${escapeHtml(d.meetingWhen)}</strong>. We use your interview to research your company and draft your pilot options before then.</p>`
      : '<p>We use your interview to research your company and draft your pilot options before we meet.</p>',
    '<p style="color:#4a5568;font-size:13px">You can also add research of your own on the same page.</p>',
    '<p>Colaberry</p>',
    '</div>',
  ].join('\n');
}

export async function sendInterviewReminder(d: ReminderData): Promise<void> {
  await send('enterprise-interview-reminder', { to: d.to, subject: REMINDER_SUBJECT, html: buildReminderHtml(d), neverRedirect: true });
}

// --- 2. Ali's meeting brief (the HTML is built by enterpriseIntakeAliBrief) ---

export async function sendAliBrief(subject: string, html: string): Promise<void> {
  await send('enterprise-ali-brief', { to: ALI_INBOX, subject, html, neverRedirect: false });
}
