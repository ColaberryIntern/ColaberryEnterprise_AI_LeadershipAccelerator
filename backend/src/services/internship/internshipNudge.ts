import { guardedSendMail } from '../emailService';
import { sendOnce, type SendOnceResult } from '../email/idempotentSend';
import { isKillSwitchActive } from '../launchSafety';

/**
 * internshipNudge — the one message a manager can send an intern from the console.
 *
 * ── THE CALLER CHOOSES A TEMPLATE, NEVER THE WORDS ──────────────────────────────────────
 *
 * The route takes a key from `NUDGE_TEMPLATES` and nothing else. There is no parameter for a
 * subject, a body, HTML, or a "custom message", so there is no path from a request to the text a
 * student reads. That is structural rather than careful: a free-text field here would be an
 * unreviewed mail-merge pointed at students, reachable by anyone who can reach the console.
 *
 * The only caller-supplied string is an optional `note`, which is escaped and rendered as a short
 * line under the template's own copy, because "you have been quiet, is everything alright" lands
 * differently with one human sentence attached. It is length-capped and HTML-escaped.
 *
 * ── WHY IT CANNOT DOUBLE-SEND ───────────────────────────────────────────────────────────
 *
 * Every send goes through `sendOnce`, whose claim is enforced by unique indexes on
 * `email_send_ledger`. The business event is `internship-nudge-<template>-<applicationId>-<day>`:
 *
 *   - **without the day**, an intern could be nudged about going quiet exactly once, ever;
 *   - **with a timestamp**, every retry would be a new event and the ledger would protect nobody.
 *
 * A day is the honest granularity: a double-clicked button or a retried request is the same nudge,
 * and tomorrow's is genuinely a different one.
 *
 * The global kill switch is checked first, because a stop that does not stop outbound mail is a
 * flag, not a stop.
 */

export type NudgeTemplate = 'quiet_check_in' | 'weeks_1_3_reminder' | 'project_start';

interface Rendered { subject: string; html: string; text: string; }

/** HTML-escape the one caller-supplied string that reaches a student. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const NOTE_MAX = 400;

/**
 * The fixed set. Adding one is a code change in front of a reviewer, which is the point.
 *
 * No em dashes and no double sign-off, per the repo's outbound copy rules.
 */
export const NUDGE_TEMPLATES: Record<NudgeTemplate, (firstName: string) => Rendered> = {
  quiet_check_in: (firstName) => ({
    subject: 'Checking in on your internship',
    text: `Hi ${firstName},\n\nWe have not seen activity from you in a little while, and that is usually `
      + `a sign something is in the way rather than a sign of effort.\n\nIf you are stuck, say so and we `
      + `will help. If life got busy, tell us and we will work out a plan.\n\nReply to this email and `
      + 'someone will read it.',
    html: `<p>Hi ${esc(firstName)},</p><p>We have not seen activity from you in a little while, and that `
      + 'is usually a sign something is in the way rather than a sign of effort.</p><p>If you are stuck, '
      + 'say so and we will help. If life got busy, tell us and we will work out a plan.</p>'
      + '<p>Reply to this email and someone will read it.</p>',
  }),
  weeks_1_3_reminder: (firstName) => ({
    subject: 'Weeks 1 to 3 are what unlock your project',
    text: `Hi ${firstName},\n\nWeeks 1 to 3 of the curriculum are the gate for starting your build `
      + 'project. Clearing them is what opens that door.\n\nIf something in those weeks is blocking you, '
      + 'reply and tell us which part.',
    html: `<p>Hi ${esc(firstName)},</p><p>Weeks 1 to 3 of the curriculum are the gate for starting your `
      + 'build project. Clearing them is what opens that door.</p><p>If something in those weeks is '
      + 'blocking you, reply and tell us which part.</p>',
  }),
  project_start: (firstName) => ({
    subject: 'Ready to start your build project',
    text: `Hi ${firstName},\n\nYou have cleared the training gate, so your build project is ready to `
      + 'start. Open your portal and begin whenever you are ready.\n\nReply here if you want to talk '
      + 'through what to build.',
    html: `<p>Hi ${esc(firstName)},</p><p>You have cleared the training gate, so your build project is `
      + 'ready to start. Open your portal and begin whenever you are ready.</p><p>Reply here if you want '
      + 'to talk through what to build.</p>',
  }),
};

export function isNudgeTemplate(value: unknown): value is NudgeTemplate {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(NUDGE_TEMPLATES, value);
}

/** Append the manager's optional line, escaped and capped. */
export function renderNudge(template: NudgeTemplate, firstName: string, note?: string | null): Rendered {
  const base = NUDGE_TEMPLATES[template](firstName || 'there');
  const trimmed = (note ?? '').trim().slice(0, NOTE_MAX);
  if (!trimmed) return base;
  return {
    subject: base.subject,
    text: `${base.text}\n\n${trimmed}`,
    html: `${base.html}<p>${esc(trimmed)}</p>`,
  };
}

/** One nudge per template, per intern, per day. */
export function nudgeBusinessEventId(
  template: NudgeTemplate, applicationId: string, now: Date,
): string {
  return `internship-nudge-${template}-${applicationId}-${now.toISOString().slice(0, 10)}`;
}

export interface NudgeInput {
  applicationId: string;
  /** Resolved from the enrollment by the caller — never taken from the request body. */
  to: string;
  firstName?: string | null;
  template: NudgeTemplate;
  note?: string | null;
  /**
   * Render and return without sending. **Defaults to true**: a nudge that sends unless you opt out
   * is one forgotten flag away from mailing a student from a test run.
   */
  dryRun?: boolean;
  correlationId?: string | null;
  now?: Date;
}

export type NudgeResult =
  | { outcome: 'dry_run'; subject: string; to: string; businessEventId: string }
  | { outcome: 'skipped'; reason: string; idempotencyKey: string }
  | SendOnceResult;

export async function sendNudge(input: NudgeInput): Promise<NudgeResult> {
  if (!input.to) return { outcome: 'skipped', reason: 'no_recipient', idempotencyKey: '' };

  const now = input.now ?? new Date();
  const rendered = renderNudge(input.template, (input.firstName ?? '').trim(), input.note);
  const businessEventId = nudgeBusinessEventId(input.template, input.applicationId, now);

  // Checked BEFORE the dry-run branch so a dry run reports the stop too, rather than cheerfully
  // previewing a message the system would refuse to send.
  if (await isKillSwitchActive()) {
    return { outcome: 'skipped', reason: 'kill_switch_active', idempotencyKey: '' };
  }

  if (input.dryRun !== false) {
    return { outcome: 'dry_run', subject: rendered.subject, to: input.to, businessEventId };
  }

  return sendOnce(
    {
      recipient: input.to,
      subject: rendered.subject,
      businessEventId,
      correlationId: input.correlationId ?? undefined,
    },
    async () => {
      try {
        const info = await guardedSendMail({
          to: input.to,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          // Ali gets a copy of everything that goes out, per the standing rule.
          bcc: 'ali@colaberry.com',
        } as any);
        return { ok: true, messageId: (info as any)?.messageId };
      } catch (err: any) {
        return { ok: false, error: String(err?.message ?? err), errorClass: err?.name || 'MailTransportError' };
      }
    },
  );
}
