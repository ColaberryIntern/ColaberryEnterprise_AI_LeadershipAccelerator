/**
 * send - the only path from a brief to an inbox.
 *
 * ## The text that is sent is the text that was shown
 *
 * `sendBrief` takes the body the manager approved and sends THAT, rather than regenerating from the
 * database at send time. Regenerating would be a hair fresher and would mean a manager can approve
 * one message and deliver a different one, which is the single thing this screen must never do.
 * The body is therefore passed in, and `expectedGeneratedAt` guards against sending a brief that
 * was composed so long ago it no longer describes the person.
 *
 * ## Idempotency
 *
 * `business_event_id = intern-brief-<enrollment>-<CT date>` claims one brief per intern per day in
 * `email_send_ledger`, so a double click, a retried request and a second manager all collapse into
 * one send. It is deliberately a different prefix from `agent-nudge-`, so the weekday agent run and
 * a hand-sent brief do not cancel each other out: they are different messages and a manager sending
 * one by hand should not silently consume that day's automatic nudge.
 */
import { guardedSendMail } from '../../emailService';
import { sendOnce, type SendOnceResult } from '../../email/idempotentSend';
import { isKillSwitchActive } from '../../launchSafety';
import { briefProblems } from './types';
import type { NudgeBrief } from './types';

/** How stale an approved brief may be before we refuse to send it. */
export const MAX_BRIEF_AGE_MS = 60 * 60 * 1000;

export type BriefSendOutcome =
  | { enrollmentId: string; email: string; outcome: 'dry_run'; subject: string; businessEventId: string }
  | { enrollmentId: string; email: string; outcome: 'skipped'; reason: string }
  | { enrollmentId: string; email: string; outcome: 'sent'; subject: string; messageId?: string }
  | { enrollmentId: string; email: string; outcome: 'failed'; errorClass: string; error: string };

export function briefEventId(enrollmentId: string, now: Date): string {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  return `intern-brief-${enrollmentId}-${day}`;
}

function log(event: string, outcome: string, context: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'intern-nudge-brief',
    event,
    outcome,
    context,
  }));
}

/** Plain text to the minimal HTML the mailer wants. Escaped first, so a body can never inject markup. */
export function bodyToHtml(body: string): string {
  const esc = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const link = (s: string) => s.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1">$1</a>');
  const paras = esc.split(/\n{2,}/).map((p) => `<p>${link(p).replace(/\n/g, '<br/>')}</p>`).join('\n');
  return `<div style="font-family:arial,sans-serif;font-size:14px;color:#2d3748;line-height:1.6">${paras}</div>`;
}

export interface SendBriefInput {
  readonly brief: NudgeBrief;
  /** The body as shown on screen, which may have been edited by the manager before sending. */
  readonly body: string;
  readonly subject: string;
  readonly dryRun: boolean;
  readonly now?: Date;
}

export async function sendBrief({ brief, body, subject, dryRun, now = new Date() }: SendBriefInput): Promise<BriefSendOutcome> {
  const email = brief.email ?? '';
  const base = { enrollmentId: brief.enrollmentId, email };

  if (!email) return { ...base, outcome: 'skipped', reason: 'no_recipient' };

  // The sender's own guards, applied before anything leaves. An edited body is re-checked here,
  // because the manager may have introduced a dash or a bracket the generated text did not have.
  const problems = briefProblems(body);
  if (problems.length) return { ...base, outcome: 'skipped', reason: `body_rejected: ${problems.join('; ')}` };

  if (Date.now() - Date.parse(brief.generatedAt) > MAX_BRIEF_AGE_MS) {
    return { ...base, outcome: 'skipped', reason: 'brief_too_old: regenerate it so it still describes them' };
  }

  // Checked before the dry-run branch: a preview that renders a message the system would refuse to
  // send is worse than no preview.
  if (await isKillSwitchActive()) return { ...base, outcome: 'skipped', reason: 'kill_switch_active' };

  const businessEventId = briefEventId(brief.enrollmentId, now);
  if (dryRun) return { ...base, outcome: 'dry_run', subject, businessEventId };

  const result: SendOnceResult = await sendOnce(
    { recipient: email, subject, businessEventId },
    async () => {
      try {
        const info = await guardedSendMail({
          to: email,
          subject,
          html: bodyToHtml(body),
          text: body,
          // Ali gets a copy of everything that goes out. The BCC is also what later makes
          // "have we answered them" answerable, because it is ingested as our last outbound.
          bcc: 'ali@colaberry.com',
        } as any);
        return { ok: true, messageId: (info as any)?.messageId };
      } catch (err: any) {
        return { ok: false, error: String(err?.message ?? err), errorClass: err?.name || 'MailTransportError' };
      }
    },
  );

  if (result.outcome === 'sent') {
    log('intern_brief_sent', 'success', { enrollment_id: brief.enrollmentId, tier: brief.tier, business_event_id: businessEventId });
    return { ...base, outcome: 'sent', subject, messageId: result.messageId };
  }
  if (result.outcome === 'skipped') return { ...base, outcome: 'skipped', reason: result.reason };

  log('intern_brief_failed', 'failure', { enrollment_id: brief.enrollmentId, error_class: result.errorClass, business_event_id: businessEventId });
  return { ...base, outcome: 'failed', errorClass: result.errorClass, error: result.error };
}
