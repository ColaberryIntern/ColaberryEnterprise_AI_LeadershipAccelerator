// ─── Dead-Letter Service (TBI T002 / P1-5) ────────────────────────────────
// Wraps a background-job runner so that after it fails MAX_CONSECUTIVE_FAILURES
// times in a row (CLAUDE.md Stall Detection's "same failure 3 times" threshold),
// a DeadLetterJob row is written with full context — instead of the bare
// console.error swallow most cron jobs in aiOpsScheduler.ts used before this.
//
// Cooldown/failure-count state is in-memory (module-scope Map), matching this
// repo's existing precedent (schedulerService.ts's SystemHealthMonitor alert
// cooldown, systemAutoResponseService.ts's safe-mode cooldown) rather than a
// new DB-backed counter — simplest option, logged as an assumption (Autonomy
// Model default resolution strategy). Resets on process restart, which is
// acceptable here: a restart is itself evidence the underlying condition may
// have changed, so re-counting from zero is the right behavior, not a gap.

import DeadLetterJob from '../models/DeadLetterJob';

const MAX_CONSECUTIVE_FAILURES = 3;

const failureCounts = new Map<string, number>();

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

export async function wrapWithDeadLetter(
  jobName: string,
  label: string,
  fn: () => Promise<any>,
): Promise<void> {
  try {
    await fn();
    failureCounts.delete(jobName);
  } catch (err: any) {
    const count = (failureCounts.get(jobName) ?? 0) + 1;
    failureCounts.set(jobName, count);

    console.error(`[DeadLetter] ${label} failed (${count}/${MAX_CONSECUTIVE_FAILURES} consecutive):`, err?.message || err);

    if (count >= MAX_CONSECUTIVE_FAILURES) {
      try {
        await DeadLetterJob.create({
          job_name: jobName,
          label,
          consecutive_failures: count,
          error_message: truncate(err?.message || String(err), 2000),
          error_class: err?.constructor?.name || err?.name || 'Error',
          error_stack: err?.stack ? truncate(err.stack, 4000) : null,
          context: { last_failed_at: new Date().toISOString() },
          resolved: false,
          resolved_at: null,
        } as any);
        console.error(`[DeadLetter] ${label}: wrote dead-letter row after ${count} consecutive failures.`);
      } catch (dlqErr: any) {
        // Telemetry must never break the job path (same swallow-safe contract as
        // emitAiEvent/emitToolCall) — the console.error above already recorded
        // the real failure regardless of whether this write succeeds.
        console.error(`[DeadLetter] Failed to write dead-letter row for ${label}:`, dlqErr?.message);
      }
      failureCounts.delete(jobName);
    }
  }
}
