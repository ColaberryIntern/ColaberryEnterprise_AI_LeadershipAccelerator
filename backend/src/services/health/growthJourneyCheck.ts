import { buildJourneyHealth } from '../growthJourney/health/journeyHealth';
import type { HealthCheck } from '../systemHealthService';

/**
 * The Growth Journey's entry in `/health/full` (Phase 6, T609).
 *
 * ─── NEVER CRITICAL, AND USUALLY NOT EVEN A WARNING ─────────────────────────
 *
 * `runFullSystemHealthCheck` derives `overall_status` from the severities its
 * checks push: one `critical` makes the whole platform critical, one `warning`
 * makes it degraded. The Growth Journey is dark - every one of its three crons
 * ships `enabled: false` and no operator has turned them on - so a check that
 * treated "nothing has run" as a fault would leave the platform permanently
 * degraded and teach everyone to ignore the page. This check therefore:
 *
 *   - never returns `critical`, whatever it finds. The journey withholding a
 *     message or failing to decide is not an outage of the platform, and the
 *     one thing it could do wrong that WOULD be urgent - send something - it
 *     cannot do at all while the flags are off;
 *   - returns `ok` for a correctly dark system. `disabled` crons, no receipts
 *     and no controls is the expected state today, not a problem;
 *   - returns `warning` only for the four things that mean a moving part has
 *     stopped while the system was meant to be running: a receipt the
 *     reconciler should have expired and has not, an enabled cron that is late,
 *     a ledger that would not answer, and receipts sitting in `failed`.
 *
 * ─── IT NEVER THROWS, AND SAYS SO WHEN IT CANNOT ANSWER ─────────────────────
 *
 * `Promise.allSettled` would swallow a rejection here and the journey would
 * simply be absent from the report - indistinguishable from "this check was
 * never added". So the catch pushes a `warning` naming the error class, which is
 * the one case where absence would have been misread as health.
 *
 * ─── THE METRIC IS THE NUMBER SOMEONE WOULD ACT ON ──────────────────────────
 *
 * `metric` is the count of receipts stuck in `pending_review` past the TTL the
 * reconciler uses. It is the only number here that means a human has to do
 * something, so it is the one the dashboards and the alert thresholds get.
 */
export async function checkGrowthJourney(checks: HealthCheck[]): Promise<void> {
  try {
    const health = await buildJourneyHealth({ now: new Date() });

    const stuck = health.stuck_pending_review.count;
    const lateCrons = health.crons.filter((c) => c.state === 'late').map((c) => c.agent);
    const failed = health.receipts.find((r) => r.status === 'failed')?.count ?? 0;
    const ledgerUnavailable = health.ledger_read !== 'ok';

    const problems: string[] = [];
    if (stuck > 0) problems.push(`${stuck} receipt(s) still pending review past ${health.stuck_pending_review.over_hours}h - the reconciler should have expired them`);
    if (lateCrons.length > 0) problems.push(`late cron(s): ${lateCrons.join(', ')}`);
    if (ledgerUnavailable) problems.push(`the event ledger answered ${health.ledger_read}, so refusal counts are unavailable`);
    if (failed > 0) problems.push(`${failed} receipt(s) in failed`);
    // A truncated read is the same class of thing as an unreadable ledger: the
    // report is not wrong, it is INCOMPLETE, and the numbers below it are floors.
    // Saying so here is what stops a floor being read off the dashboard as a total.
    if (health.truncated.length > 0) problems.push(`these reads hit their row cap and report a floor, not a total: ${health.truncated.join(', ')}`);

    const dark = health.crons.every((c) => c.state === 'disabled');
    const detail = problems.length > 0
      ? problems.join('; ')
      : dark
        ? 'Dark as configured: all three journey crons are disabled, nothing is scheduled and nothing has sent.'
        : 'Journey crons on time, no stuck receipts, ledger readable.';

    checks.push({
      name: 'growth_journey',
      severity: problems.length > 0 ? 'warning' : 'ok',
      detail,
      metric: stuck,
    });
  } catch (err: any) {
    checks.push({
      name: 'growth_journey',
      severity: 'warning',
      detail: `Check failed: ${err?.name ?? 'Error'}`,
    });
  }
}
