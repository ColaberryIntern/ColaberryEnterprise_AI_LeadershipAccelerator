/**
 * livePopulationReport - the monthly Colaberry Live figure (C8.10 AC3).
 *
 * "The figure is reportable monthly, so the C2.3 break-even becomes falsifiable." This
 * module is that report: one call, one month, two numbers and an honest state for each.
 *
 * ON THE 881. C8.10's brief says "The 881-learner figure is unfalsifiable until this
 * exists", which reads as though 881 were a claim about how many people share Colaberry
 * Live. It is not. It comes from C1.5r by way of C4.8, where it is tagged CALCULATED and
 * reads "Learners a license needs to cover its base" - a break-even REQUIREMENT, not a
 * population. Nothing has ever claimed 881 people watch anything. What this report makes
 * falsifiable is the other side of that comparison: the actual population, which until
 * now could not be counted at all. The distinction is preserved in `BREAK_EVEN` below
 * rather than smoothed over, because quietly reporting 881 as a target met or missed
 * would import an error the source never made.
 *
 * WHY THERE IS NO CRON. Criterion 3 asks for a figure that is reportable monthly, and
 * this makes any month reportable on demand through the admin API. A scheduled job was
 * considered and not built: the repo has no monthly schedule anywhere (the longest
 * cadence in `aiOpsScheduler` is weekly), so adding one would introduce a new cadence
 * class to carry a number that is currently unmeasurable for the reasons below. Logged as
 * an assumption rather than escalated, per the Autonomy Model - it is reversible and
 * local, and a schedule can be hung off `buildLivePopulationReport` unchanged.
 */
import {
  classifyPopulation, type PopulationVerdict,
} from './broadcastPopulationPolicy';
import {
  readMonthlyPopulation, monthWindow, REPORT_TIMEZONE, type WindowPopulation,
} from './broadcastPopulationService';
import { readDeliveredMinutes, type MinutesRead } from './cloudflareStreamMinutes';

/**
 * The C2.3 break-even, with its real provenance attached.
 *
 * Recorded here so a reader of this report cannot mistake it for something measured.
 */
export const BREAK_EVEN = {
  learners: 881,
  means: 'Learners a self-paced license needs to cover its cost base',
  source: 'C1.5r, carried into C4.8 tagged CALCULATED',
  isNotA: 'count of people who watch Colaberry Live',
} as const;

export interface LivePopulationReport {
  month: string;
  timezone: string;
  population: PopulationVerdict;
  /** Raw counts behind the verdict. Present even when the verdict refuses to publish. */
  observed: WindowPopulation;
  watchMinutes: number | null;
  deliveredMinutes: MinutesRead;
  breakEven: typeof BREAK_EVEN;
  headline: string;
  /** Only set when the population is genuinely measured. */
  breakEvenProgress: string | null;
}

/** Cloudflare's `date_leq` is inclusive; our windows are closed-open. Convert once, here. */
export function lastDayOf(exclusiveEnd: string): string {
  const d = new Date(`${exclusiveEnd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/**
 * Which month is "this month" in the house timezone?
 *
 * Resolved through `Intl` against REPORT_TIMEZONE rather than from the server's own clock,
 * because the container runs UTC: for the last five or six hours of every month, a naive
 * `new Date().getMonth()` would roll the default report over to the next month while it is
 * still the previous one in Texas, and the operator would be shown an empty month.
 */
export function currentReportMonth(nowMs: number): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIMEZONE, year: 'numeric', month: '2-digit',
  }).formatToParts(new Date(nowMs));
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
  return { year: get('year'), month: get('month') };
}

function headlineFor(
  monthLabel: string, v: PopulationVerdict, observed: WindowPopulation,
): string {
  if (v.state === 'no_airings') {
    return `Colaberry Live did not air in ${monthLabel}.`;
  }
  if (v.state === 'unmeasurable') {
    return `${observed.airings} airing(s) in ${monthLabel}, audience not recorded. `
      + 'The figure is unknown, not zero.';
  }
  if (v.learners === 0) {
    return `${observed.airings} airing(s) in ${monthLabel} and no learner watched. `
      + 'This is a measured zero.';
  }
  return `${v.learners} learner(s) shared Colaberry Live in ${monthLabel}, across `
    + `${observed.airings} airing(s).`;
}

/**
 * Build one month's report.
 *
 * The two halves fail independently on purpose. A Cloudflare outage must not take the
 * learner count down with it, and an empty telemetry month must not suppress the cost
 * figure - they answer different questions and an operator needs whichever one is
 * available.
 */
export async function buildLivePopulationReport(
  year: number, month: number,
  deps: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {},
): Promise<LivePopulationReport> {
  const window = monthWindow(year, month);
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  const observed = await readMonthlyPopulation(year, month);
  const population = classifyPopulation({
    airings: observed.airings,
    rawLearners: observed.learners,
    coverage: observed.coverage,
  });

  const deliveredMinutes = await readDeliveredMinutes(
    window.from, lastDayOf(window.to), deps,
  );

  // Watch minutes come from our own telemetry and are only meaningful when the population
  // is. Reporting watch time for a period the instrument slept through would restate the
  // same fabrication in a second unit.
  const watchMinutes = population.state === 'measured'
    ? Math.round(observed.watchSeconds / 60)
    : null;

  const breakEvenProgress = population.state === 'measured' && population.learners !== null
    ? `${population.learners} of the ${BREAK_EVEN.learners} learners a license needs to `
      + `cover its base (${BREAK_EVEN.source}). That target is a requirement, not a `
      + 'previously claimed population.'
    : null;

  return {
    month: monthLabel,
    timezone: REPORT_TIMEZONE,
    population,
    observed,
    watchMinutes,
    deliveredMinutes,
    breakEven: BREAK_EVEN,
    headline: headlineFor(monthLabel, population, observed),
    breakEvenProgress,
  };
}

/* ------------------------------------------------------------------ *
 * Guards
 * ------------------------------------------------------------------ */

/**
 * The report must never state a learner number it did not measure.
 *
 * Run over a built report, so it catches the assembly mistake rather than only the policy
 * mistake: `population.learners` can be null while `headline` still quotes a figure if
 * someone edits one without the other.
 */
export function assertReportNeverQuotesAnUnmeasuredCount(r: LivePopulationReport): void {
  if (r.population.learners === null) {
    if (/\b\d+ learner\(s\) shared\b/.test(r.headline)) {
      throw new Error('live population: the headline quotes a count the verdict refused to publish');
    }
    if (r.watchMinutes !== null) {
      throw new Error('live population: watch minutes were published without a measured population');
    }
    if (r.breakEvenProgress !== null) {
      throw new Error('live population: break-even progress was computed from an unmeasured count');
    }
  }
}

/** A cost figure that could not be read must not appear as zero cost. */
export function assertUnavailableMinutesAreNotZero(r: LivePopulationReport): void {
  if (!r.deliveredMinutes.ok && 'minutes' in r.deliveredMinutes) {
    throw new Error('live population: unavailable delivered minutes carried a number');
  }
}
