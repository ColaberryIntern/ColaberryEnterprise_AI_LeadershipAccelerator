import cron from 'node-cron';
import { env } from '../../config/env';
import { guardedSendMail, resolveEmailRecipient } from '../emailService';
import { sendOnce, type ProviderResult } from '../email/idempotentSend';
import { isSwitchOn, SWITCHES, type Read } from './darkSwitches';
import { draftProblem, fromName, linkIn, MAX_TRIES, mergeBody, mergedProblem, nextAttemptAt } from './followUpRules';
import * as store from './followUpStore';

/**
 * Career Prep v27, CP10.3 (kit F8): sends the employers' follow-ups when they come due. Every 5 minutes (Central), at
 * most BATCH per pass.
 *
 * DARK: switch career_prep_employer_mail_enabled (darkSwitches.ts; absent or unreadable = OFF), read at the start of the
 * pass AND again for each row just before its send. Off: nothing reaches the mailer; due rows are marked `held`
 * ("held: employer email is switched off") and are never sent later behind anyone's back (the employer can schedule
 * again).
 * AT SEND TIME (not when it was scheduled): "only if they haven't replied" (followUpStore.ts says what a reply is): a reply
 * cancels it; the candidate still put forward to the client and the sender still a member, else cancelled; the stored
 * message re-checked and the merged one too (followUpRules.ts), else failed and never sent.
 * ONCE: sendOnce keyed (candidate address, subject, `employer_follow_up:<id>`), the id being the idempotency key the page
 * made. A row left `sending` by a pass that died is claimed again after STALE_MS; if the first try did reach Mandrill,
 * sendOnce answers already_sent and no second email goes.
 * FAILURE: each try counts (attempts). A failed try waits 5, then 15, then 45 minutes (followUpRules.RETRY_DELAYS_MIN);
 * after MAX_TRIES it is `failed` with the error class. A row that throws mid-pass is logged and left `sending`, so the
 * stale claim picks it up (still capped by MAX_TRIES). The mail transport's own socket timeouts bound each send.
 * SENT AS "<person> at <company> via Refactored.ai" from our address, Reply-To the employer member, plain text only, with
 * Mandrill metadata follow_up_id so opens and clicks come back to followUpTracking.ts. Test mode: the recipient redirect.
 */
export const BATCH = 20;
export const STALE_MS = 15 * 60_000;
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export type Outcome = 'sent' | 'retry' | 'failed' | 'cancelled' | 'held' | 'gone';

function log(level: 'info' | 'warn', event: string, context: Record<string, unknown>, errorClass?: string): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'backend', event,
    outcome: level === 'info' ? 'success' : 'failure', ...(errorClass ? { error_class: errorClass } : {}), context });
  if (level === 'warn') console.warn(line); else console.log(line);
}
const errClass = (e: unknown) => ((e as Error)?.name && (e as Error).name !== 'Error' ? (e as Error).name : 'UpstreamUnavailable');

async function deliver(id: string, c: store.SendContext, text: string): Promise<ProviderResult> {
  const to = String(c.to_email);
  const routed = await resolveEmailRecipient(to, c.subject);
  const info = await guardedSendMail({ from: `"${fromName(c.display_name, c.company)}" <${env.emailFrom}>`, to: routed.to, replyTo: String(c.member_email),
    subject: routed.subject, text,
    headers: { 'X-MC-Tags': 'employer-follow-up', 'X-MC-Metadata': JSON.stringify({ follow_up_id: id }), 'X-MC-Track': 'opens,clicks_textonly' } });
  return info?.messageId ? { ok: true, messageId: String(info.messageId) } : { ok: false, errorClass: 'SendBlocked', error: 'blocked by kill switch or dev guard' };
}

/** Why a claimed row must not be sent (and what it becomes), or null when it may go. */
function stopReason(c: store.SendContext): store.Finish | null {
  if (!c.member_email) return { status: 'cancelled', reason: 'sender_removed' };
  if (!c.put_forward) return { status: 'cancelled', reason: 'candidate_removed' };
  if (c.only_if === 'no_reply' && c.replied) return { status: 'cancelled', reason: 'replied' };
  if (!c.to_email || !EMAIL.test(c.to_email)) return { status: 'failed', reason: 'NoRecipient' };
  return null;
}

/** Send one claimed row (attempt = this try's number). Never throws for a send failure; a database error propagates. */
export async function sendClaimed(id: string, attempt: number, now: Date, read?: Read): Promise<Outcome> {
  const c = await store.sendContext(id);
  if (!c || c.status !== 'sending') return 'gone';
  const end = async (f: store.Finish, out: Outcome): Promise<Outcome> => ((await store.finish(id, f)) ? out : 'gone');
  if (!(await isSwitchOn(SWITCHES.employerMail, read))) return end({ status: 'held', reason: 'employer_mail_off' }, 'held');
  if (attempt > MAX_TRIES) return end({ status: 'failed', reason: 'Abandoned' }, 'failed');
  const stop = stopReason(c);
  if (stop) return end(stop, stop.status === 'cancelled' ? 'cancelled' : 'failed');
  const text = mergeBody(c.body, { fullName: c.full_name, bookingLink: c.booking_link });
  if (draftProblem({ subject: c.subject, body: c.body, bookingLink: c.booking_link }) || mergedProblem(text)) {
    log('warn', 'employer_follow_up_refused', { follow_up_id: id }, 'ContractViolation');
    return end({ status: 'failed', reason: 'ContractViolation' }, 'failed');
  }
  const res = await sendOnce({ recipient: String(c.to_email), subject: c.subject, businessEventId: `employer_follow_up:${id}` }, () => deliver(id, c, text))
    .catch((err: unknown) => ({ outcome: 'failed' as const, errorClass: errClass(err) }));
  if (res.outcome === 'sent' || (res.outcome === 'skipped' && res.reason === 'already_sent')) {
    const messageId = res.outcome === 'sent' ? res.messageId ?? null : null;
    return end({ status: 'sent', messageId, to: String(c.to_email), link: linkIn(text), now }, 'sent');
  }
  const errorClass = res.outcome === 'skipped' ? 'SendInFlight' : res.errorClass;
  log('warn', 'employer_follow_up_send_failed', { follow_up_id: id, attempt }, errorClass);
  const next = nextAttemptAt(attempt, now);
  return next ? end({ status: 'scheduled', nextAttemptAt: next, errorClass }, 'retry') : end({ status: 'failed', reason: errorClass }, 'failed');
}

export async function runFollowUpPass(now = new Date(), read?: Read): Promise<Record<Outcome, number>> {
  const out: Record<Outcome, number> = { sent: 0, retry: 0, failed: 0, cancelled: 0, held: 0, gone: 0 };
  if (!(await isSwitchOn(SWITCHES.employerMail, read))) {
    out.held = (await store.holdDue(now, BATCH)).length;
    if (out.held) log('info', 'employer_follow_up_held', { held: out.held, reason: 'held: employer email is switched off' });
    return out;
  }
  for (const r of await store.claimDue(now, new Date(now.getTime() - STALE_MS), BATCH)) {
    try {
      out[await sendClaimed(r.id, r.attempts, now, read)] += 1;
    } catch (err) {
      log('warn', 'employer_follow_up_item_failed', { follow_up_id: r.id }, errClass(err));
    }
  }
  if (out.sent || out.retry || out.failed || out.cancelled || out.held) log('info', 'employer_follow_up_pass_done', out);
  return out;
}

let started = false;
/** Every 5 minutes (boot/placementBoot.ts SCHEDULERS); each pass checks the switch itself. */
export function startFollowUpScheduler(): void {
  if (started) return;
  started = true;
  cron.schedule('*/5 * * * *', () => {
    runFollowUpPass().catch((err) => log('warn', 'employer_follow_up_pass_failed', {}, errClass(err)));
  }, { timezone: 'America/Chicago' });
}
