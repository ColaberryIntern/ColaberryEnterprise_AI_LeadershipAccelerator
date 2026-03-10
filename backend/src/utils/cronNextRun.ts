import { CronExpressionParser } from 'cron-parser';

/**
 * Calculate the next run time for a cron expression.
 * Returns null if the expression is invalid.
 */
export function calculateNextRun(schedule: string, _timezone?: string): Date | null {
  try {
    const expr = CronExpressionParser.parse(schedule);
    return expr.next().toDate();
  } catch {
    return null;
  }
}

/**
 * Format next run as a human-readable relative string, e.g. "12m from now".
 */
export function formatNextRun(schedule: string, timezone?: string): string | null {
  const next = calculateNextRun(schedule, timezone);
  if (!next) return null;

  const diffMs = next.getTime() - Date.now();
  if (diffMs < 0) return 'now';

  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return '<1m';
  if (diffMin < 60) return `${diffMin}m`;

  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
