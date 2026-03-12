// ─── Alert Delivery Service ─────────────────────────────────────────────────
// Routes alerts to configured delivery channels: dashboard, email, SMS, WhatsApp.

import Alert from '../models/Alert';

/**
 * Deliver an alert through the specified channels.
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
  // Use existing SMS path if available; for now log
  console.log(`[AlertDelivery] SMS delivery for alert "${alert.title}" (severity: ${alert.severity}) — SMS provider not yet integrated`);
}
