/**
 * delta - PURE. What changed since the previous report, which a single snapshot cannot say:
 * recovering or decaying is the most useful signal for deciding who to write to.
 *
 * Every field is a difference of two values the reports themselves carried, or a count over a list
 * that is complete for the period. When either side is unknown the field is null, never 0:
 *   verified_since_last   stories_verified now - then (both must be known)
 *   commits_since_last    commits dated after the previous report; null when that report is older
 *                         than the commit window, because older commits are not in the data
 *   artifacts_since_last  artifacts published after the previous report (the artifact list is complete)
 *   days_quiet_change     days_since_build_work now - then (positive = quieter, negative = recovering)
 *   tier_changed_from     the previous tier when it differs, else null
 */
import type { InternCard } from '../types';
import type { PreviousSnapshot, SidecarIntern, TriageTier } from './types';

const DAY = 86400000;

export function delta(
  c: InternCard,
  current: Pick<SidecarIntern, 'stories_verified' | 'days_since_build_work' | 'triage'>,
  previous: PreviousSnapshot | null,
  nowMs: number,
  commitWindowDays: number,
): SidecarIntern['delta'] {
  if (!previous) return null;
  const then = previous.interns.find((x) => x.enrollment_id === c.enrollmentId) ?? null;
  const since = Date.parse(previous.generated_at);
  const diff = (a: number | null, b: number | null | undefined): number | null => (a !== null && b !== null && b !== undefined ? a - b : null);
  const commitsCovered = Number.isFinite(since) && nowMs - since <= commitWindowDays * DAY;
  return {
    previous_report_date: previous.report_date,
    verified_since_last: then ? diff(current.stories_verified, then.stories_verified) : null,
    commits_since_last: then && c.project && commitsCovered ? c.project.commitsRecent.filter((x) => Date.parse(x.date) > since).length : null,
    artifacts_since_last: then && Number.isFinite(since) ? c.artifacts.published.filter((a) => Date.parse(a.at) > since).length : null,
    days_quiet_change: then ? diff(current.days_since_build_work, then.days_since_build_work) : null,
    tier_changed_from: then && then.tier !== current.triage.tier ? (then.tier as TriageTier) : null,
  };
}
