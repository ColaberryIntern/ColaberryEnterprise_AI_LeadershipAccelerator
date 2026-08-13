/**
 * Incident Subscriber Bootstrap — BC #10099862873 (P1, item 3).
 *
 * Registers the dormant per-project "cognitive incident" email subscriber
 * (intelligence/systemStateEngine/incidents) at server boot. This is a
 * separate audience/system from the P0 ops-alert service (alertService.ts) —
 * cognitive incidents are about a student's own project's detected AI/system
 * anomalies, not platform operational health.
 *
 * Recipients (Kes's decision, 2026-07-16): a fixed staff distribution list
 * via SystemSetting `cognitive_incident_notification_emails`, mirroring the
 * existing `admin_notification_emails` pattern — not the enrolled student,
 * since there's no instructor/mentor field on Project to scope a per-student
 * send, and auto-emailing students about their own project's AI incidents is
 * a product decision this ticket doesn't cover.
 */
import { getSetting } from './settingsService';
import { env } from '../config/env';

export async function registerCognitiveIncidentSubscriber(): Promise<void> {
  try {
    const { registerIncidentSubscriber } = await import(
      '../intelligence/systemStateEngine/incidents/incidentFanoutEngine'
    );
    const { createEmailSubscriber } = await import(
      '../intelligence/systemStateEngine/incidents/subscribers/emailSubscriber'
    );
    const { sendRawEmail } = await import('./emailService');

    const configured = await getSetting('cognitive_incident_notification_emails');
    const recipients = (configured && String(configured).trim())
      ? String(configured).split(',').map((e) => e.trim()).filter(Boolean)
      : [env.emailFrom];

    registerIncidentSubscriber(
      createEmailSubscriber({
        id: 'cognitive-incident-email',
        recipients,
        send_fn: sendRawEmail,
        subject_prefix: '[Cognitive Incident]',
      })
    );

    console.log(`[IncidentSubscriberBootstrap] Registered cognitive incident email subscriber (${recipients.length} recipient(s))`);
  } catch (err: any) {
    console.error('[IncidentSubscriberBootstrap] Failed to register cognitive incident subscriber:', err.message);
  }
}
