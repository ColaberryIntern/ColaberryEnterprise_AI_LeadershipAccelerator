/**
 * Ops Alert Subscription Seed — BC #10099862873 (P0).
 *
 * Implements Ali's channel decision (BC #10095928858, 2026-07-15): email for
 * every alert, plus the existing Synthflow voice call ONLY for critical
 * severity — mirrors systemHealthService's existing pattern so true criticals
 * still reach Ali without voice-spam on lower tiers.
 *
 * Idempotent: keyed on (alert_type, impact_area) and safe to re-run on every
 * boot — updates channels/min_severity on the existing row rather than
 * duplicating it.
 */
import AlertSubscription from '../models/AlertSubscription';

interface OpsAlertSubscriptionEntry {
  alert_type: string;
  impact_area: string;
  min_severity: number;
  channels: string[];
}

// NOTE: matchSubscriptions() in alertService.ts is additive — every matching
// subscription's channels are delivered independently. A critical alert
// matches BOTH rows below, so email must live on exactly one of them or Ali
// gets the same email twice. Row 1 (email) covers every severity including
// critical; row 2 (voice) adds the voice call on top for critical only.
const OPS_ALERT_SUBSCRIPTIONS: OpsAlertSubscriptionEntry[] = [
  { alert_type: '*', impact_area: '*', min_severity: 1, channels: ['dashboard', 'email'] },
  { alert_type: 'critical', impact_area: '*', min_severity: 1, channels: ['voice'] },
];

export async function seedOpsAlertSubscriptions(): Promise<void> {
  for (const entry of OPS_ALERT_SUBSCRIPTIONS) {
    const existing = await AlertSubscription.findOne({
      where: { alert_type: entry.alert_type, impact_area: entry.impact_area },
    });

    if (existing) {
      await existing.update({
        min_severity: entry.min_severity,
        channels: entry.channels,
        enabled: true,
      });
    } else {
      await AlertSubscription.create({ ...entry, enabled: true });
      console.log(
        `[OpsAlertSubscriptionSeed] Created subscription: type=${entry.alert_type} area=${entry.impact_area} channels=${entry.channels.join(',')}`
      );
    }
  }
}
