/* ------------------------------------------------------------------ */
/*  PaySimple webhook health                                           */
/*                                                                     */
/*  On 2026-08-12 every PaySimple webhook had been rejected with a     */
/*  signature failure for an unknown length of time. Nothing watched    */
/*  it, so the first signal was a colleague emailing to ask why a       */
/*  student's payment was missing from the dashboard. 39 consecutive    */
/*  rejections produced no alert.                                       */
/*                                                                     */
/*  This records the outcome of each delivery in a rolling in-memory    */
/*  window and decides when that pattern is worth waking someone for.   */
/*  Deliberately in-memory: the failure mode is sustained (days), the   */
/*  window only needs to outlive a scheduler tick, and this must never  */
/*  add a write to the webhook hot path or a schema migration.          */
/* ------------------------------------------------------------------ */

export type WebhookOutcome = 'accepted' | 'rejected_signature' | 'rejected_other';

interface Sample { at: number; outcome: WebhookOutcome }

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_SAMPLES = 500;          // hard cap so a flood can't grow this unbounded

const samples: Sample[] = [];

/** Record one webhook delivery outcome. Never throws - it is on the request path. */
export function recordWebhookOutcome(outcome: WebhookOutcome, nowMs: number = Date.now()): void {
  try {
    samples.push({ at: nowMs, outcome });
    if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
  } catch {
    /* health accounting must never break a webhook */
  }
}

/** Test seam: drop all recorded samples. */
export function resetWebhookHealth(): void {
  samples.length = 0;
}

export interface WebhookHealthSnapshot {
  total: number;
  accepted: number;
  rejectedSignature: number;
  rejectedOther: number;
  /** ms since the last ACCEPTED delivery, or null if none in the window. */
  msSinceLastAccepted: number | null;
}

export function webhookHealthSnapshot(nowMs: number = Date.now()): WebhookHealthSnapshot {
  const cutoff = nowMs - WINDOW_MS;
  const recent = samples.filter((s) => s.at >= cutoff);
  const lastAccepted = [...recent].reverse().find((s) => s.outcome === 'accepted');
  return {
    total: recent.length,
    accepted: recent.filter((s) => s.outcome === 'accepted').length,
    rejectedSignature: recent.filter((s) => s.outcome === 'rejected_signature').length,
    rejectedOther: recent.filter((s) => s.outcome === 'rejected_other').length,
    msSinceLastAccepted: lastAccepted ? nowMs - lastAccepted.at : null,
  };
}

export interface WebhookHealthVerdict {
  alert: boolean;
  severity: number;             // 1-10, matches alertService
  type: 'warning' | 'critical';
  title: string;
  description: string;
}

// Enough deliveries to distinguish a real outage from one odd request.
const MIN_SAMPLE = 5;
// Above this share of failures the integration is not working, not merely flaky.
const DEGRADED_RATE = 0.5;
const DEGRADED_MIN_SAMPLE = 10;

/**
 * Pure decision: is this pattern worth alerting on? Split out from the snapshot so the
 * thresholds are unit-testable without touching timers, the DB, or the alert pipeline.
 *
 * Total failure (nothing accepted at all) is CRITICAL: every payment silently fails to
 * activate, which is what happened on 2026-08-12. A partial failure rate is a WARNING -
 * real but not yet certainly systemic. Zero traffic is NOT an alert: PaySimple's retry
 * cadence is bursty and a quiet hour is normal, so alerting on silence would train
 * everyone to ignore this.
 */
export function evaluateWebhookHealth(s: WebhookHealthSnapshot): WebhookHealthVerdict {
  const ok: WebhookHealthVerdict = {
    alert: false, severity: 0, type: 'warning', title: '', description: '',
  };

  const rejected = s.rejectedSignature + s.rejectedOther;
  if (s.total === 0 || rejected === 0) return ok;

  if (s.accepted === 0 && rejected >= MIN_SAMPLE) {
    const sig = s.rejectedSignature >= s.rejectedOther;
    return {
      alert: true,
      severity: 9,
      type: 'critical',
      title: 'PaySimple webhook is rejecting every delivery',
      description:
        `${rejected} PaySimple webhook deliveries in the last hour were rejected and none succeeded. ` +
        `Payments are not being activated: a student who pays will stay on their old access level. ` +
        (sig
          ? 'The failures are signature verification, so check PAYSIMPLE_WEBHOOK_SECRET against the PaySimple dashboard and the digest encoding.'
          : 'The failures are not signature related, so check the webhook route and recent deploys.'),
    };
  }

  if (s.total >= DEGRADED_MIN_SAMPLE && rejected / s.total >= DEGRADED_RATE) {
    return {
      alert: true,
      severity: 6,
      type: 'warning',
      title: 'PaySimple webhook failure rate is elevated',
      description:
        `${rejected} of ${s.total} PaySimple webhook deliveries in the last hour were rejected ` +
        `(${Math.round((rejected / s.total) * 100)}%). Some payments may not be activating.`,
    };
  }

  return ok;
}
