import type { HoldReason, NudgeBrief, TriageTier } from '../../../services/internNudgeApi';

/**
 * Presentation rules for the Nudges view: the icon per tier, the order of the chart, the headline
 * sentence, and the small formatters the cards share.
 *
 * Kept out of the components for the ordinary reason - these are the parts worth testing and a
 * component test cannot assert a sentence it has to find inside a DOM - and for one specific one:
 * `ConsoleViewD`'s own tests mock `internNudgeApi` wholesale, so any runtime CONSTANT imported from
 * that module arrives `undefined`. This file is never mocked, so a tier icon read from here renders
 * in a test exactly as it renders in production. The same trap cost two debugging rounds on
 * `TRACK_ORDER` and is documented in `adminInternConsoleApi`'s header.
 */

/**
 * Fixed order, most urgent first. Assigned in this order and never cycled: a tier's colour and
 * position must not move because a filter changed how many tiers are on screen.
 */
export const TIER_ORDER: readonly TriageTier[] = [
  'blocked_waiting_on_ali', 'no_project_at_day_N', 'never_started_building',
  'overdue_backlog', 'quiet', 'on_track',
];

/**
 * One icon per tier.
 *
 * Identity is never carried by colour alone here: every tier pill shows an icon AND a word, so the
 * six bands stay distinguishable to a colourblind reader and in a printed or forced-colours view.
 */
export const TIER_ICON: Record<TriageTier, string> = {
  blocked_waiting_on_ali: 'ri-mail-unread-line',
  no_project_at_day_N: 'ri-inbox-unarchive-line',
  never_started_building: 'ri-forbid-2-line',
  overdue_backlog: 'ri-alarm-warning-line',
  quiet: 'ri-volume-mute-line',
  on_track: 'ri-checkbox-circle-line',
};

export const HOLD_ICON: Record<HoldReason, string> = {
  no_email: 'ri-mail-close-line',
  unsendable_text: 'ri-error-warning-line',
  paused: 'ri-pause-circle-line',
  messaged_today: 'ri-mail-check-line',
};

export interface TierSlice {
  tier: TriageTier;
  n: number;
  /** Percent of the total, 0 when the total is 0 - a NaN width renders as a full bar. */
  pct: number;
}

/**
 * The distribution behind the bar.
 *
 * Returns ALL six tiers including the empty ones, so the legend is a full scale rather than a list
 * of whatever happened to be present. A legend that silently drops a band teaches the reader that
 * the band does not exist.
 */
export function tierSlices(briefs: readonly NudgeBrief[]): TierSlice[] {
  const total = briefs.length;
  return TIER_ORDER.map((tier) => {
    const n = briefs.filter((b) => b.tier === tier).length;
    return { tier, n, pct: total > 0 ? (n / total) * 100 : 0 };
  });
}

/** Counts per hold reason, empty reasons omitted - these are chips, not a scale. */
export function holdCounts(holds: readonly HoldReason[]): Array<{ reason: HoldReason; n: number }> {
  const seen = new Map<HoldReason, number>();
  for (const r of holds) seen.set(r, (seen.get(r) ?? 0) + 1);
  return [...seen.entries()].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n);
}

/**
 * The sentence at the top, which is the whole point of the screen.
 *
 * Written as a count of PEOPLE rather than a percentage. Thirteen interns is a number a manager
 * holds in their head; "77% actionable" is not, and rounds away the person it is about.
 */
export function headline(sendCount: number, holdCount: number, failedCount: number): string {
  const total = sendCount + holdCount + failedCount;
  if (total === 0) return 'No interns on the roster to write to.';
  const parts: string[] = [];
  // The NOUN agrees with the total and the VERB with the count: "1 of 3 interns needs a message",
  // "3 of 3 interns need a message". Keying both off one number gets one of them wrong every time.
  const noun = total === 1 ? 'intern' : 'interns';
  const verb = sendCount === 1 ? 'needs' : 'need';
  parts.push(sendCount === 0
    ? 'Nobody needs a message right now'
    : `${sendCount} of ${total} ${noun} ${verb} a message`);
  if (holdCount > 0) parts.push(`${holdCount} held`);
  if (failedCount > 0) parts.push(`${failedCount} could not be generated`);
  return `${parts.join(', ')}.`;
}

/** Initials for the avatar. Two letters at most, from the first and last word of the name. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const first = words[0][0] ?? '';
  const last = words.length > 1 ? words[words.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

/** "today", "yesterday", "3 days ago" - in Central, because that is the manager's day. */
export function sinceLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'never';
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return 'unknown';
  const a = day(then);
  const b = day(now);
  if (a === b) return 'today';
  const diff = Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
  if (diff === 1) return 'yesterday';
  if (diff < 0) return 'scheduled ahead';
  return `${diff} days ago`;
}

/**
 * How a deadline should be coloured, by how much room is left.
 *
 * Three bands rather than a gradient, because a manager acts on "this week" and not on a hue.
 */
export function deadlineTone(daysLeft: number): 'alert' | 'warn' | 'ok' {
  if (daysLeft <= 3) return 'alert';
  if (daysLeft <= 7) return 'warn';
  return 'ok';
}

export interface MetricChip {
  icon: string;
  label: string;
  value: string;
  /** Drives the conditional colour. `null` means no judgement is being made about this number. */
  tone: 'alert' | 'warn' | 'ok' | null;
  title: string;
}

/**
 * The evidence row under each name.
 *
 * Every chip is a number the message already used, and every tone is a threshold stated here rather
 * than guessed at by eye. A chip with nothing behind it is omitted instead of rendering a zero that
 * reads as measured - "no artifacts" and "we never counted" are different facts.
 */
export function metricChips(b: NudgeBrief): MetricChip[] {
  const s = b.signals;
  const out: MetricChip[] = [];

  if (s.day !== null) {
    out.push({ icon: 'ri-calendar-line', label: 'day', value: String(s.day), tone: null, title: `Day ${s.day} of the internship` });
  }

  if (s.percentBuilt !== null) {
    out.push({
      icon: 'ri-progress-4-line', label: 'built', value: `${Math.round(s.percentBuilt)}%`,
      tone: s.percentBuilt >= 60 ? 'ok' : s.percentBuilt >= 25 ? 'warn' : 'alert',
      title: s.storiesTotal ? `${s.storiesVerified ?? 0} of ${s.storiesTotal} stories verified` : 'Share of the plan verified',
    });
  }

  if (s.daysSinceBuildWork !== null) {
    out.push({
      icon: 'ri-git-commit-line', label: 'last build', value: s.daysSinceBuildWork === 0 ? 'today' : `${s.daysSinceBuildWork}d`,
      tone: s.daysSinceBuildWork <= 3 ? 'ok' : s.daysSinceBuildWork <= 9 ? 'warn' : 'alert',
      title: 'Days since the last commit or verified story',
    });
  } else if (b.projectName) {
    out.push({
      icon: 'ri-git-commit-line', label: 'last build', value: 'never',
      tone: 'alert', title: 'No commit or verified story has ever been seen on this project',
    });
  }

  if (s.overdueTasks) {
    out.push({
      icon: 'ri-time-line', label: 'overdue', value: String(s.overdueTasks),
      tone: s.overdueTasks >= 5 ? 'alert' : 'warn', title: 'Tasks past their baseline due date',
    });
  }

  out.push({
    icon: 'ri-attachment-2', label: 'artifacts', value: String(s.artifacts),
    tone: s.artifacts > 0 ? 'ok' : 'warn', title: 'Published artifacts an employer could open',
  });

  out.push({
    icon: 'ri-book-open-line', label: 'training', value: `${s.trainingWeeksCompleted}/${s.trainingWeeksTotal}`,
    tone: s.gateCleared ? 'ok' : 'warn',
    title: s.gateCleared ? 'Weeks 1 to 3 cleared' : 'The weeks 1 to 3 gate is not cleared',
  });

  if (s.openQuestions > 0) {
    out.push({
      icon: 'ri-question-answer-line', label: 'waiting on you', value: String(s.openQuestions),
      tone: 'alert', title: 'Their questions with no answer from us yet',
    });
  }

  return out;
}
