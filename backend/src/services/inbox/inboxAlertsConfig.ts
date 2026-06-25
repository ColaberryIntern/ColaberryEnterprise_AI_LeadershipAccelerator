/**
 * Inbox COS alerts master switch.
 *
 * 2026-06-24 (CC-20260624-q4m1): Ali asked to turn ALL inbox COS alerts off —
 * they were flooding his inbox without adding value. Rather than rip out each
 * sender, every alert path now consults this single gate. Alerts are OFF by
 * default and only fire when INBOX_COS_ALERTS_ENABLED is explicitly "true".
 *
 * Covered paths (each calls inboxCosAlertsEnabled() before sending):
 *   - smsAlertService.sendSms()  → VIP, urgent-keyword, ask-user, daily
 *     summary, meeting-prep, sync-failure pushes
 *   - askUserDigestService.sendPendingDigests() → 4-hour ASK_USER digest
 *   - missedOpportunitiesEmailService.runMissedOpportunitiesReport() → 8pm CT
 */
export function inboxCosAlertsEnabled(): boolean {
  return String(process.env.INBOX_COS_ALERTS_ENABLED || '').toLowerCase() === 'true';
}
