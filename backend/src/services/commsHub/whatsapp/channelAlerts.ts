import { env } from '../../../config/env';
import CommsHubSettings from '../../../models/CommsHubSettings';
import { mailSafe } from '../alerts/failureAlerts';
import { logActivity, WORKER_ACTOR } from '../activityLog';
import { sendStateStore } from './sendState';

/**
 * CH10.4 Alerts about the WhatsApp channel itself (the breaker opened, the plan's quota ran out, a
 * message looked sent twice). The CH7.5 queue is per message and per failure state, so it cannot
 * carry these; this path emails the hub's alert recipients and adds one admin alert.
 *
 * Once per key: the key is claimed on the settings row with one atomic UPDATE before anything is
 * sent, so a re-run or a second worker sends nothing twice. An alert that cannot be delivered is
 * logged with its class and never throws: it must not turn a hold into a crash.
 */
export interface ChannelAlert { key: string; title: string; description: string }

function log(level: 'info' | 'warn', event: string, ctx: Record<string, unknown>, errorClass?: string): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'comms_hub', event, outcome: level === 'info' ? 'success' : 'failure', ...(errorClass ? { error_class: errorClass } : {}), context: ctx });
  if (level === 'warn') console.error(line); else console.log(line);
}

export async function raiseChannelAlert(a: ChannelAlert): Promise<void> {
  try {
    if (!(await sendStateStore.claimAlert(a.key))) return;
    await logActivity(WORKER_ACTOR, 'whatsapp.alert', 'settings', null, { key: a.key, title: a.title });
    const { emitAlert } = await import('../../alertService');
    await emitAlert({ type: 'warning', severity: 4, title: mailSafe(a.title), description: mailSafe(a.description), sourceType: 'system', impactArea: 'communications', urgency: 'high', metadata: { key: a.key } });
    const recipients = ((await CommsHubSettings.findByPk(1))?.alert_recipients ?? []).filter((r) => typeof r === 'string' && r.includes('@'));
    if (!(env.mandrillApiKey || (env.smtpUser && env.smtpPass))) { log('warn', 'comms_hub_whatsapp_alert_no_mail', { key: a.key, recipients: recipients.length }, 'SmtpNotConfigured'); return; }
    const { sendAlertEmail } = await import('../../emailService');
    for (const to of recipients) {
      // eslint-disable-next-line no-await-in-loop
      await sendAlertEmail(to, { type: 'warning', severity: 4, title: mailSafe(a.title), description: mailSafe(a.description), impact_area: 'communications', source_type: 'system', urgency: 'high' });
    }
    log('info', 'comms_hub_whatsapp_alert_sent', { key: a.key, recipients: recipients.length });
  } catch (err) {
    log('warn', 'comms_hub_whatsapp_alert_failed', { key: a.key, message: String((err as Error)?.message ?? err).slice(0, 200) }, (err as Error)?.name ?? 'UnknownError');
  }
}
