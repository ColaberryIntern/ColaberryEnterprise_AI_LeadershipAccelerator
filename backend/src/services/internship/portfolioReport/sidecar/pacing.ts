/**
 * pacing - PURE. "Day 50" needs a denominator.
 *
 *   program_day_total       the curriculum's length in days: published training weeks x 7. The
 *                           curriculum length is whatever weeks have published cards (12 as of Nov
 *                           2026), never a constant; null when no weeks are published.
 *   expected_training_week  weeks that should be COMPLETE by now, from the best source available:
 *                             cohort_schedule  the week the cohort's live sessions have reached (the
 *                                              roster's own pace; the class dashboard's measure)
 *                             day_count        floor((day - 1) / 7), capped at the curriculum
 *                           null when neither exists. `expected_basis` says which one was used.
 *   actual_training_week    weeks completed: the "training N/12 weeks" number the HTML shows.
 *   weeks_behind            expected - actual. Positive = behind, negative = ahead, null = unknown.
 */
import type { InternCard } from '../types';
import type { SidecarIntern } from './types';

export function pacing(c: InternCard): SidecarIntern['pacing'] {
  const t = c.training;
  const total = t.weeksTotal > 0 ? t.weeksTotal : null;
  let expected: number | null = null;
  let basis: SidecarIntern['pacing']['expected_basis'] = null;
  const scheduled = t.pace?.scheduledWeek;
  if (typeof scheduled === 'number') {
    expected = total !== null ? Math.min(total, scheduled) : scheduled;
    basis = 'cohort_schedule';
  } else if (c.day !== null && total !== null) {
    expected = Math.min(total, Math.floor((c.day - 1) / 7));
    basis = 'day_count';
  }
  return {
    day: c.day,
    program_day_total: total !== null ? total * 7 : null,
    program_day_total_basis: total !== null ? `${total} published training weeks x 7 days` : null,
    expected_training_week: expected,
    expected_basis: basis,
    actual_training_week: t.weeksCompleted,
    weeks_behind: expected !== null ? expected - t.weeksCompleted : null,
  };
}
