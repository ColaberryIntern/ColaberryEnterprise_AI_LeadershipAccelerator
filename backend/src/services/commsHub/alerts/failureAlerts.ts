import { env } from '../../../config/env';
import {
  ALERT_RETRY_DELAYS_MS, ALERT_SEND_TIMEOUT_MS, ALERT_WINDOW_MS, ALERTS_PER_TICK, DASHBOARD, MAX_ALERT_ATTEMPTS,
  type AlertContent, type AlertContext, type AlertOutcome, type AlertRepo, type AlertSenders, type ClaimedAlert,
} from './types';

/**
 * CH7.5 failure alerts. When a message ends failed or partially_failed, the people in the hub's
 * settings are emailed, and the admin alerts list gets one entry, through the existing alert path
 * (alertService.emitAlert and emailService.sendAlertEmail). One alert per message per failure state
 * change per recipient: the store's unique key makes queueing idempotent, so re-running a tick
 * sends nothing twice; a Retry that fails again is a new state change and alerts again.
 *
 * Failure path: each send has a 30 s timeout; a failed send is tried again after 1 minute, then 5
 * minutes, then marked failed with its error class (and logged). An email with no mail transport
 * configured is failed at once, never reported as sent. A crash mid-send leaves the row `sending`;
 * after the lease it is tried again. Two cases can repeat an email (at-least-once, not exactly-once,
 * because SMTP has no idempotency key): the provider accepted it but the result was never recorded
 * (a crash), or a send passed the 30 s timeout and still completed late (it is retried a minute
 * later). Alerts never touch the messages themselves, and a message that ended cancelled (for
 * example, stopped because its event was cancelled) is not alerted.
 */
export interface AlertDeps {
  repo: AlertRepo;
  senders: AlertSenders;
  log: (level: 'info' | 'warn' | 'error', event: string, ctx: Record<string, unknown>) => void;
}
export interface AlertTickResult { queued: number; sent: number; retried: number; failed: number }

/**
 * The alert email puts the title into its subject AND its HTML unescaped (emailService.sendAlertEmail),
 * and the title holds organizer-entered text. HTML entities would show literally in the subject, so
 * the characters that matter are neutralized instead: no tags, and & reads as "and".
 */
export const mailSafe = (s: string): string => s.replace(/[<>]/g, '').replace(/&/g, 'and').replace(/["']/g, '');

export function alertContent(a: ClaimedAlert, ctx: AlertContext): AlertContent {
  const total = ctx.sent + ctx.not_sent;
  const what = a.failure_state === 'failed' ? 'did not send' : 'only partly sent';
  const reach = total > 0 ? `${ctx.sent} of ${total} recipient${total === 1 ? '' : 's'} received it.` : 'No recipient received it.';
  const link = `${env.frontendUrl.replace(/\/+$/, '')}/admin/comms-hub/schedule`;
  return {
    title: `Communications Hub: ${ctx.title} ${what}`,
    description: `${reach} Open Schedule and history in the Communications Hub to see who missed it and retry: ${link}`,
    severity: a.failure_state === 'failed' ? 4 : 3,
    state: a.failure_state, message_id: a.message_id, state_event_id: a.state_event_id,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(`no answer after ${ms} ms`), { name: 'TimeoutError' })), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

async function sendOne(deps: AlertDeps, a: ClaimedAlert, now: Date): Promise<AlertOutcome> {
  const ctx = await deps.repo.context(a);
  if (!ctx) return { kind: 'failed', error: 'message_gone: the message no longer exists' };
  const content = alertContent(a, ctx);
  if (a.recipient !== DASHBOARD && !deps.senders.emailReady()) return { kind: 'failed', error: 'SmtpNotConfigured: no mail transport is configured' };
  try {
    await withTimeout(a.recipient === DASHBOARD ? deps.senders.dashboard(content) : deps.senders.email(a.recipient, content), ALERT_SEND_TIMEOUT_MS);
    return { kind: 'sent' };
  } catch (err) {
    const e = err as Error;
    const error = `${e?.name ?? 'Error'}: ${e?.message ?? String(err)}`.slice(0, 500);
    const delay = ALERT_RETRY_DELAYS_MS[a.attempt - 1];
    return a.attempt < MAX_ALERT_ATTEMPTS && delay !== undefined ? { kind: 'retry', at: new Date(now.getTime() + delay), error } : { kind: 'failed', error };
  }
}

/** One pass: queue alerts for new failure state changes, then send what is due. Each alert is settled on its own. */
export async function runFailureAlerts(deps: AlertDeps, now: Date = new Date()): Promise<AlertTickResult> {
  const result: AlertTickResult = { queued: 0, sent: 0, retried: 0, failed: 0 };
  result.queued = await deps.repo.queue(await deps.repo.recipients(), new Date(now.getTime() - ALERT_WINDOW_MS), now);
  for (const a of await deps.repo.claim(now, ALERTS_PER_TICK)) {
    const out = await sendOne(deps, a, now);
    await deps.repo.settle(a, out, now);
    const who = a.recipient === DASHBOARD ? DASHBOARD : 'email';
    if (out.kind === 'sent') { result.sent += 1; deps.log('info', 'comms_hub_alert_sent', { outcome: 'success', alert_id: a.id, message_id: a.message_id, to: who, attempt: a.attempt }); }
    else {
      if (out.kind === 'retry') result.retried += 1; else result.failed += 1;
      deps.log(out.kind === 'retry' ? 'warn' : 'error', out.kind === 'retry' ? 'comms_hub_alert_retry' : 'comms_hub_alert_failed', {
        outcome: 'failure', alert_id: a.id, message_id: a.message_id, to: who, attempt: a.attempt, error_class: out.error.split(':')[0],
      });
    }
  }
  return result;
}

/** The existing alert path, loaded lazily (the email stack must not load at boot through the worker). */
export const defaultAlertSenders: AlertSenders = {
  async dashboard(c) {
    const { emitAlert } = await import('../../alertService');
    // emitAlert folds a new alert into an open one with the same title, and fans out to alert
    // subscriptions whose email puts the title into HTML unescaped. So the title carries the state
    // change's reference (one dashboard alert per state change) and is mail-safe like the email path.
    await emitAlert({
      type: 'warning', severity: c.severity, title: mailSafe(`${c.title} (ref ${c.state_event_id.slice(0, 8)})`), description: mailSafe(c.description), sourceType: 'system',
      impactArea: 'communications', entityType: 'comms_hub_message', entityId: c.message_id, urgency: 'high',
      metadata: { state_event_id: c.state_event_id, failure_state: c.state },
    });
  },
  async email(to, c) {
    const { sendAlertEmail } = await import('../../emailService');
    await sendAlertEmail(to, { type: 'warning', severity: c.severity, title: mailSafe(c.title), description: mailSafe(c.description), impact_area: 'communications', source_type: 'system', urgency: 'high' });
  },
  // The same condition emailService uses to build its transport (Mandrill, else SMTP user + password).
  emailReady: () => Boolean(env.mandrillApiKey || (env.smtpUser && env.smtpPass)),
};
