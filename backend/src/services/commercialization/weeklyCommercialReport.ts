/**
 * C8.8 — the weekly commercialization report, assembled from the funnel.
 *
 * THE FAILURE THIS IS WRITTEN AGAINST, in the ticket's words: "reporting activity
 * instead of outcomes, or reporting a number the funnel cannot evidence."
 *
 * Those two are the same temptation wearing different clothes, and an empty funnel is
 * when it bites. Production today has zero strategic accounts, zero opportunities and
 * zero contracts — but 48,924 recorded sends. A weekly report with nothing to say will
 * reach for that number, and then week four's report says "49,110 emails sent" and
 * everybody stops reading, because it was never an outcome.
 *
 * So the report leads with outcomes and is ALLOWED TO BE SHORT. When nothing moved, it
 * says nothing moved. Activity figures appear only in a clearly subordinate section, and
 * `assertActivityNeverLeads` fails the build if that ever inverts.
 *
 * IT SENDS NOTHING BY DEFAULT. C8.8 puts the recipient list with Ali, so the job ships
 * dark: the runner no-ops unless COMMERCIAL_WEEKLY_REPORT_ENABLED=true, and the
 * recipients come from the same `admin_notification_emails` setting the existing
 * briefings use rather than from a list invented here.
 */
import { getFunnelSnapshot } from './funnelStageService';
import { getHypothesisHealth } from './hypothesisHealthService';

export interface ReportSection {
  key: string;
  heading: string;
  /** Outcome sections lead. Activity is subordinate and labeled as such. */
  kind: 'outcome' | 'decision' | 'activity';
  lines: string[];
  /** True when the section has nothing to report and says so rather than padding. */
  empty: boolean;
}

export interface WeeklyReport {
  asOf: string;
  /** The single sentence that opens the report. */
  headline: string;
  sections: ReportSection[];
  /** Carried from the funnel so an unevidenced number is never implied. */
  caveats: string[];
}

const n = (v: number | null): string => (v === null ? 'not measurable' : String(v));

/** The outcome sections, in the order the ticket lists them. */
async function outcomeSections(): Promise<{ sections: ReportSection[]; moved: number }> {
  const funnel = await getFunnelSnapshot();
  const health = await getHypothesisHealth();

  const stage = (key: string) => funnel.stages.find((s) => s.key === key);
  const reached = (key: string) => stage(key)?.accountsReached ?? null;

  let moved = 0;
  const count = (v: number | null) => { if ((v ?? 0) > 0) moved += 1; return v; };

  const pipeline: ReportSection = {
    key: 'pipeline',
    heading: 'Pipeline',
    kind: 'outcome',
    lines: [
      `Target accounts: ${n(count(reached('target')))}`,
      `Reached engagement: ${n(count(reached('engaged')))}`,
      `Pilots proposed: ${n(count(reached('pilot_proposed')))}`,
    ],
    empty: (reached('target') ?? 0) === 0,
  };

  const meetings: ReportSection = {
    key: 'meetings',
    heading: 'Meetings',
    kind: 'outcome',
    lines: [`Meetings booked with target accounts: ${n(count(reached('meeting_booked')))}`],
    empty: (reached('meeting_booked') ?? 0) === 0,
  };

  const revenue: ReportSection = {
    key: 'revenue',
    heading: 'Contracts and revenue',
    kind: 'outcome',
    lines: [
      `Contracts: ${n(count(reached('contract')))}`,
      `Expansions: ${n(count(reached('expansion')))}`,
    ],
    empty: (reached('contract') ?? 0) === 0,
  };

  const pilots: ReportSection = {
    key: 'pilots',
    heading: 'Pilots',
    kind: 'outcome',
    // `pilot_running` has no source at all. Saying "0 pilots" would be a number the
    // funnel cannot evidence, which is the second half of the named failure.
    lines: [
      stage('pilot_running')?.accountsReached === null
        ? 'Not measurable: nothing marks an engagement as paid, so a running pilot '
          + 'cannot be counted. This is an instrumentation gap, not a report of zero.'
        : `Pilots running: ${n(reached('pilot_running'))}`,
    ],
    empty: true,
  };

  const dying = health.hypotheses.filter(
    (h) => h.verdict === 'no_evidence' || h.verdict === 'past_deadline',
  );
  const hypotheses: ReportSection = {
    key: 'hypotheses',
    heading: 'Revenue hypotheses',
    kind: 'outcome',
    lines: dying.length
      ? dying.map((h) => `${h.label}: ${h.note}`)
      : ['Every registered hypothesis has evidence in flight.'],
    empty: dying.length === 0,
  };

  return { sections: [pipeline, meetings, revenue, pilots, hypotheses], moved };
}

/** Decisions waiting on a person. A report nobody must act on is a newsletter. */
function decisionSection(dyingCount: number): ReportSection {
  const lines: string[] = [];
  if (dyingCount > 0) {
    lines.push(`${dyingCount} revenue ${dyingCount === 1 ? 'hypothesis has' : 'hypotheses have'} `
      + 'no evidence in flight. Retiring one is a decision, and it is yours.');
  }
  return {
    key: 'decisions',
    heading: 'Decisions needed',
    kind: 'decision',
    lines: lines.length ? lines : ['None this week.'],
    empty: lines.length === 0,
  };
}

/**
 * Activity, clearly subordinate.
 *
 * Present because a week with no outcomes and no activity is a different situation from
 * a week with no outcomes and a lot of activity, and the second is worth knowing. Never
 * first, and never phrased as progress.
 */
function activitySection(sends: number | null, engaged: number | null): ReportSection {
  return {
    key: 'activity',
    heading: 'Activity, which is not progress',
    kind: 'activity',
    lines: [
      `Outbound recorded: ${n(sends)}`,
      `Of which produced a reply or an answered call: ${n(engaged)}`,
      'Neither figure is an outcome. They are here only so that a quiet week with no '
      + 'outreach reads differently from a quiet week with plenty.',
    ],
    empty: false,
  };
}

/** Build the week's report. Reads the funnel; takes no hand-entered figure. */
export async function buildWeeklyReport(now: Date = new Date()): Promise<WeeklyReport> {
  const funnel = await getFunnelSnapshot();
  const { sections: outcomes, moved } = await outcomeSections();
  const health = await getHypothesisHealth(now);

  const dying = health.hypotheses.filter(
    (h) => h.verdict === 'no_evidence' || h.verdict === 'past_deadline',
  ).length;

  const contacted = funnel.stages.find((s) => s.key === 'contacted')?.accountsReached ?? null;
  const engaged = funnel.stages.find((s) => s.key === 'engaged')?.accountsReached ?? null;

  const headline = moved === 0
    ? 'Nothing moved in the commercial funnel this week. No account advanced a stage, '
      + 'no proposal went out and no contract was signed.'
    : `${moved} part${moved === 1 ? '' : 's'} of the funnel moved this week.`;

  return {
    asOf: now.toISOString(),
    headline,
    sections: [...outcomes, decisionSection(dying), activitySection(contacted, engaged)],
    caveats: funnel.caveats,
  };
}

/* ------------------------------------------------------------------ *
 * Guards
 * ------------------------------------------------------------------ */

/** Outcomes lead. An activity section above an outcome section fails the build. */
export function assertActivityNeverLeads(report: WeeklyReport): void {
  const firstActivity = report.sections.findIndex((s) => s.kind === 'activity');
  const lastOutcome = report.sections.map((s) => s.kind).lastIndexOf('outcome');
  if (firstActivity !== -1 && firstActivity < lastOutcome) {
    throw new Error('an activity section appears above an outcome section; the ticket '
      + 'names reporting activity instead of outcomes as the failure mode');
  }
  if (report.sections[0]?.kind !== 'outcome') {
    throw new Error('the report does not open with an outcome section');
  }
}

/**
 * An empty week must say so in the headline.
 *
 * The alternative is a headline built from whatever number happened to be non-zero,
 * which is how the activity figure ends up leading by accident.
 */
export function assertEmptyWeekSaysSo(report: WeeklyReport): void {
  const outcomesMoved = report.sections
    .filter((s) => s.kind === 'outcome')
    .some((s) => !s.empty);
  if (!outcomesMoved && !/Nothing moved/.test(report.headline)) {
    throw new Error('no outcome moved but the headline does not say so');
  }
}

/** A stage the funnel cannot count must never be reported as a zero. */
export function assertNoUnevidencedZero(report: WeeklyReport): void {
  for (const s of report.sections) {
    for (const line of s.lines) {
      if (/\bNot measurable\b/i.test(line) && /: 0\b/.test(line)) {
        throw new Error(`"${line}" reports a zero for something it also calls not measurable`);
      }
    }
  }
}
