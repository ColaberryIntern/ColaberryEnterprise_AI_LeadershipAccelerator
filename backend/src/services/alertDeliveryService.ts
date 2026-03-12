// ─── Alert Delivery Service ─────────────────────────────────────────────────
// Routes alerts to configured delivery channels: dashboard, email, SMS, voice, WhatsApp.

import Alert from '../models/Alert';

/**
 * Deliver an alert through the specified channels.
 * Fallback chain for voice: voice fails → SMS → email
 */
export async function deliverAlert(alert: Alert, channels: string[]): Promise<void> {
  for (const channel of channels) {
    try {
      switch (channel) {
        case 'dashboard':
          // Dashboard delivery is implicit — alert exists in DB, UI polls
          break;

        case 'email':
          await deliverViaEmail(alert);
          break;

        case 'sms':
          await deliverViaSMS(alert);
          break;

        case 'voice':
          await deliverViaVoice(alert);
          break;

        case 'whatsapp':
          // WhatsApp placeholder — log for now
          console.log(`[AlertDelivery] WhatsApp delivery not yet configured. Alert: ${alert.title}`);
          break;

        default:
          console.warn(`[AlertDelivery] Unknown channel: ${channel}`);
      }
    } catch (err: any) {
      console.error(`[AlertDelivery] Failed to deliver alert ${alert.id} via ${channel}:`, err.message);
    }
  }
}

// ─── Email Delivery ─────────────────────────────────────────────────────────

async function deliverViaEmail(alert: Alert): Promise<void> {
  // Lazy import to avoid circular dependencies
  const { sendAlertEmail } = await import('./emailService');
  const { SystemSetting } = await import('../models');

  // Get admin notification emails from settings
  const setting = await SystemSetting.findOne({
    where: { key: 'admin_notification_emails' },
  });

  const recipients = setting?.getDataValue('value')
    ? String(setting.getDataValue('value')).split(',').map((e: string) => e.trim()).filter(Boolean)
    : [];

  if (recipients.length === 0) {
    console.log('[AlertDelivery] No admin email recipients configured. Skipping email delivery.');
    return;
  }

  for (const to of recipients) {
    await sendAlertEmail(to, alert).catch((err: any) => {
      console.error(`[AlertDelivery] Email to ${to} failed:`, err.message);
    });
  }
}

// ─── SMS Delivery ───────────────────────────────────────────────────────────

async function deliverViaSMS(alert: Alert): Promise<void> {
  const { SystemSetting } = await import('../models');
  const { sendSmsViaGhl } = await import('./ghlService');
  const { logCommunication } = await import('./communicationLogService');

  // Get the executive GHL contact ID from settings
  const setting = await SystemSetting.findOne({
    where: { key: 'executive_ghl_contact_id' },
  });

  const contactId = setting?.getDataValue('value') as string | undefined;
  if (!contactId) {
    console.log('[AlertDelivery] No executive_ghl_contact_id configured. Skipping SMS delivery.');
    return;
  }

  const severityLabel = formatSeverityLabel((alert as any).severity);
  const message = `[${severityLabel}] ${alert.title}${alert.description ? ': ' + alert.description.slice(0, 200) : ''}`;

  try {
    await sendSmsViaGhl(contactId, message);
    console.log(`[AlertDelivery] SMS sent for alert "${alert.title}"`);

    await logCommunication({
      channel: 'sms',
      delivery_mode: 'live',
      direction: 'outbound',
      to_address: contactId,
      subject: `Alert: ${alert.title}`,
      body: message,
      status: 'sent',
      provider: 'ghl',
      metadata: { alertId: alert.id, severity: severityLabel },
    }).catch(() => {});
  } catch (err: any) {
    console.error(`[AlertDelivery] SMS delivery failed:`, err.message);
    await logCommunication({
      channel: 'sms',
      delivery_mode: 'live',
      direction: 'outbound',
      to_address: contactId,
      subject: `Alert: ${alert.title}`,
      body: message,
      status: 'failed',
      provider: 'ghl',
      error_message: err.message,
      metadata: { alertId: alert.id, severity: severityLabel },
    }).catch(() => {});
    throw err;
  }
}

// ─── Voice Delivery ─────────────────────────────────────────────────────────

async function deliverViaVoice(alert: Alert): Promise<void> {
  const { SystemSetting } = await import('../models');
  const { triggerVoiceCall } = await import('./synthflowService');
  const { logCommunication } = await import('./communicationLogService');

  // Get the executive phone number from settings
  const setting = await SystemSetting.findOne({
    where: { key: 'executive_phone_number' },
  });

  const phone = setting?.getDataValue('value') as string | undefined;
  if (!phone) {
    console.log('[AlertDelivery] No executive_phone_number configured. Falling back to SMS.');
    await deliverViaSMS(alert);
    return;
  }

  const severityLabel = formatSeverityLabel((alert as any).severity);
  const ttsPrompt = `This is an urgent alert from Colaberry AI Operations. Severity: ${severityLabel}. ${alert.title}. ${alert.description || ''}`;

  try {
    await triggerVoiceCall({
      name: 'Executive Alert',
      phone,
      callType: 'welcome',
      prompt: ttsPrompt,
      context: {
        lead_name: 'Executive',
      },
    });
    console.log(`[AlertDelivery] Voice call triggered for alert "${alert.title}"`);

    await logCommunication({
      channel: 'voice',
      delivery_mode: 'live',
      direction: 'outbound',
      to_address: phone,
      subject: `Alert: ${alert.title}`,
      body: ttsPrompt,
      status: 'sent',
      provider: 'synthflow',
      metadata: { alertId: alert.id, severity: severityLabel },
    }).catch(() => {});
  } catch (err: any) {
    console.error(`[AlertDelivery] Voice call failed, falling back to SMS:`, err.message);

    await logCommunication({
      channel: 'voice',
      delivery_mode: 'live',
      direction: 'outbound',
      to_address: phone,
      subject: `Alert: ${alert.title}`,
      body: ttsPrompt,
      status: 'failed',
      provider: 'synthflow',
      error_message: err.message,
      metadata: { alertId: alert.id, severity: severityLabel },
    }).catch(() => {});

    // Fallback chain: voice → SMS → email
    try {
      await deliverViaSMS(alert);
    } catch {
      console.error('[AlertDelivery] SMS fallback also failed, trying email.');
      await deliverViaEmail(alert);
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatSeverityLabel(severity: number): string {
  if (severity >= 5) return 'CRITICAL';
  if (severity >= 4) return 'HIGH';
  if (severity >= 2) return 'IMPORTANT';
  return 'INFO';
}
