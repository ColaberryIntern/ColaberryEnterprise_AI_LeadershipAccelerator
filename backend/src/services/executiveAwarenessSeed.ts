// ─── Executive Awareness Seed ────────────────────────────────────────────────
// Idempotent: creates default ExecutiveNotificationPolicy with scope='global'

import ExecutiveNotificationPolicy from '../models/ExecutiveNotificationPolicy';

export async function seedExecutiveNotificationPolicy(): Promise<void> {
  try {
    const existing = await ExecutiveNotificationPolicy.findOne({ where: { scope: 'global' } });
    if (existing) {
      console.log('[ExecutiveAwarenessSeed] Global policy already exists. Skipping.');
      return;
    }

    await ExecutiveNotificationPolicy.create({
      scope: 'global',
      quiet_hours_start: '22:00',
      quiet_hours_end: '07:00',
      quiet_hours_timezone: 'America/Chicago',
      weekend_policy: 'quiet_hours_only',
      severity_channel_map: {
        info: ['dashboard'],
        important: ['dashboard', 'email'],
        high: ['dashboard', 'email', 'sms'],
        critical: ['dashboard', 'email', 'sms', 'voice'],
      },
      rate_limits: {
        email: { max_per_hour: 10 },
        sms: { max_per_hour: 3 },
        voice: { max_per_hour: 1 },
      },
      cluster_window_minutes: 10,
      digest_morning_cron: '0 7 * * *',
      digest_evening_cron: '0 18 * * *',
      digest_enabled: true,
      acknowledgment_suppresses: true,
      severity_rules: {},
      enabled: true,
      updated_by: 'system',
    } as any);

    console.log('[ExecutiveAwarenessSeed] Created default global policy.');
  } catch (err: any) {
    console.error('[ExecutiveAwarenessSeed] Seed error:', err.message);
  }
}
