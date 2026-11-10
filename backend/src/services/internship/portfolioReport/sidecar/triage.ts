/**
 * triage - PURE. One tier per intern, decided by the FIRST rule that matches, plus one sentence
 * naming the fact that decided it. The order is the order of what Ali should act on:
 *
 *   no_project_at_day_N     no project at all (a day-50 intern with nothing to build)
 *   never_started_building  a project, but no commit and no verified story, ever
 *   blocked_waiting_on_ali  their latest email is waiting on a reply from Ali (the HTML's "You owe a reply")
 *   overdue_backlog         OVERDUE_BACKLOG_TASKS or more tasks past their due date
 *   quiet                   no build work for STUCK_GAP_DAYS+ days, or none in the 21-day window
 *   on_track                none of the above
 *
 * The spec's hard case: "Day 50 with no project must NOT share a tier with a productive builder who
 * went quiet 5 days" - the first is no_project_at_day_N, the second quiet.
 *
 * `no_project_at_day_N` is a fixed value an agent can switch on; the day itself is in `reason` and
 * in `pacing.day`. Every input is a field the HTML already renders.
 */
import { STUCK_GAP_DAYS } from '../timeline';
import type { InternCard } from '../types';
import type { TriageTier } from './types';

/** "Backlog" means more than one slipped task: 3+ (an assumption, logged in the PR; tune here). */
export const OVERDUE_BACKLOG_TASKS = 3;

export function triage(c: InternCard): { tier: TriageTier; reason: string } {
  const p = c.project;
  if (!p) return { tier: 'no_project_at_day_N', reason: `Day ${c.day ?? 'unknown'} of the internship with no project.` };
  const everBuilt = p.lastCommitDays !== null || p.lastVerifiedDays !== null || (p.tasksDone ?? 0) > 0;
  if (!everBuilt) return { tier: 'never_started_building', reason: `Has the project "${p.name}" but no commit and no verified story, ever.` };
  if (c.emails.awaitingReply) {
    return { tier: 'blocked_waiting_on_ali', reason: `Their email "${c.emails.awaitingSubject ?? ''}" from ${String(c.emails.lastTheyWrote ?? '').slice(0, 10)} has no reply from Ali yet.` };
  }
  if (p.overdue >= OVERDUE_BACKLOG_TASKS) return { tier: 'overdue_backlog', reason: `${p.overdue} tasks are past their due date.` };
  const q = c.timeline.quietNow;
  if (q === null) return { tier: 'quiet', reason: `No commit or verified story in the last ${c.timeline.windowDays} days.` };
  if (q >= STUCK_GAP_DAYS) return { tier: 'quiet', reason: `No commit or verified story in ${q} days.` };
  return { tier: 'on_track', reason: q === 0 ? 'Build work today.' : `Build work ${q} day${q === 1 ? '' : 's'} ago, nothing waiting on Ali, ${p.overdue} overdue.` };
}
