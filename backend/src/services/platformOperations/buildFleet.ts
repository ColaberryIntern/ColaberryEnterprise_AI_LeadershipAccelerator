/**
 * Turn raw registry, activity and scan readings into the four Fleet panels.
 *
 * Pure: no database, no clock of its own, no I/O. Everything it needs arrives as arguments,
 * including `now`, so every judgement this file makes — fired or not, silent or not, which
 * tone a row wears — is reproducible in a test without a Postgres container. The reading is
 * done by `fleetService.ts`; the deciding is done here.
 */
import { calculateExpectedIntervalMs } from '../../utils/cronNextRun';
import { TimerSite } from './timerScanTypes';
import {
  Coverage, FleetCoverage, FleetPanels, LastRunRow, LiveFleetRow, SilentRow, Tone,
  UntrackedTimerRow,
} from './fleetTypes';

/** One enabled cron row of `ai_agents`, with its override already applied. */
export interface RegistryAgent {
  id: string;
  agent_name: string;
  schedule: string;
  schedule_source: 'override' | 'registry';
}

/** The activity log, already aggregated per agent. */
export interface AgentActivity {
  agent_id: string;
  runs_in_window: number;
  runs_in_lookback: number;
  last_fire_at: Date | null;
  last_success_at: Date | null;
}

/** The single most recent run of an agent, for the "Last run, per job" table. */
export interface LatestRun {
  agent_id: string;
  created_at: Date;
  duration_ms: number | null;
  result: string | null;
  trace_id: string | null;
}

/** An unresolved dead-letter record, which is the only place a job's error class is written. */
export interface DeadLetter {
  job_name: string;
  error_class: string | null;
}

export interface FleetReadings {
  now: Date;
  windowHours: number;
  lookbackDays: number;
  agents: RegistryAgent[];
  activity: AgentActivity[];
  latestRuns: LatestRun[];
  deadLetters: DeadLetter[];
  timerSites: readonly TimerSite[];
}

/** A job overdue by this many times its own cadence is reported as silent. */
export const SILENT_OVERDUE_FACTOR = 2;

/**
 * A cron expression as a person would say it: "every 5 min", "daily at 02:00".
 *
 * The design template writes schedules in words ("every 5 min", "nightly"), and it is right
 * to. A five-field cron expression is punctuation that wraps in the middle of a table cell
 * and tells a reader nothing they did not already have to decode. The raw expression is
 * still carried alongside, because it is the value a person edits.
 *
 * (No cron expression appears in this comment on purpose: the slash-star-slash sequence
 * would close the block early, which is exactly how this file failed to compile once.)
 *
 * Anything this cannot read confidently comes back as the raw expression rather than a
 * confident-sounding guess.
 */
export function humanSchedule(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  // EXACTLY five. node-cron also accepts a six-field form whose FIRST field is seconds, so
  // a `length >= 5` check read "every 5 seconds" as "every 5 min" — off by sixty, on the
  // one screen whose whole job is saying how often things run. Six fields fall through to
  // the raw expression, which is at least true.
  if (parts.length !== 5) return cron;
  const [min, hour, dom, mon, dow] = parts;
  const everyField = (f: string): number | null => {
    const m = /^\*\/(\d+)$/.exec(f);
    return m ? Number(m[1]) : null;
  };

  // */N * * * *  — every N minutes
  const everyMin = everyField(min);
  if (everyMin && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return everyMin === 1 ? 'every minute' : `every ${everyMin} min`;
  }
  // M */N * * *  — every N hours
  const everyHour = everyField(hour);
  if (everyHour && /^\d+$/.test(min) && dom === '*' && mon === '*' && dow === '*') {
    return everyHour === 1 ? 'hourly' : `every ${everyHour} hours`;
  }
  // M * * * *  — hourly at a fixed minute
  if (/^\d+$/.test(min) && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return 'hourly';
  }
  // M H * * *  — daily at a time
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && mon === '*' && dow === '*') {
    return `daily at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  }
  // M H * * D  — weekly
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && mon === '*' && /^[0-6]$/.test(dow)) {
    const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][Number(dow)];
    return `${day}s at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  }
  // A list of minutes, e.g. 10,25,40,55 * * * *
  if (/^[\d,]+$/.test(min) && min.includes(',') && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return `${min.split(',').length} times an hour`;
  }
  return cron;
}

/** "19 hours", "2 days", "4 min" — the phrase the pill prints. */
export function humanDuration(ms: number): string {
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'under a minute';
  if (min < 60) return `${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.floor(hours / 24);
  return `${days} days`;
}

function byId<T extends { agent_id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.agent_id, r]));
}

/**
 * Panel A — Live fleet. The registry's claim, against what actually fired.
 *
 * Three outcomes, not two. The template draws fired and not-fired; the data forces a third,
 * because a job that has reported nothing at all in the lookback is not evidence of death —
 * it is evidence that we are not watching. Those rows are amber and say so, rather than
 * joining the red ones and overstating what we know.
 */
export function buildLive(r: FleetReadings): LiveFleetRow[] {
  const activity = byId(r.activity);
  return r.agents
    .map((a): LiveFleetRow => {
      const act = activity.get(a.id);
      const runs = act?.runs_in_window ?? 0;
      const coverage: Coverage = (act?.runs_in_lookback ?? 0) > 0 ? 'reporting' : 'never_reported';
      let status: string;
      let tone: Tone;
      if (runs > 0) {
        status = 'Fired';
        tone = 'ok';
      } else if (coverage === 'never_reported') {
        status = 'No report ever';
        tone = 'warn';
      } else {
        status = 'Has not fired';
        tone = 'bad';
      }
      return {
        agent_name: a.agent_name,
        schedule: a.schedule,
        schedule_label: humanSchedule(a.schedule),
        schedule_source: a.schedule_source,
        runs_in_window: runs,
        last_fire_at: act?.last_fire_at ? act.last_fire_at.toISOString() : null,
        coverage,
        status,
        tone,
      };
    })
    // Worst first: a person opening this card should not have to scroll to find the problem.
    .sort((x, y) => toneRank(x.tone) - toneRank(y.tone) || x.agent_name.localeCompare(y.agent_name));
}

function toneRank(t: Tone): number {
  return t === 'bad' ? 0 : t === 'warn' ? 1 : t === 'off' ? 2 : 3;
}

/**
 * Panel B — Untracked timers. A clock in the source with nothing watching it.
 *
 * Two ways to qualify, and they are different problems. A site that reports under no name
 * can never appear in the registry or the activity log, so no health check can ever see it.
 * A site that names something the registry does not hold is worse in one way: it believes it
 * is being watched, and `instrumentCronJob` quietly logs nothing when the lookup misses.
 */
export function buildUntracked(r: FleetReadings): UntrackedTimerRow[] {
  const known = new Set(r.agents.map((a) => a.agent_name));
  const rows: UntrackedTimerRow[] = [];
  for (const site of r.timerSites) {
    const anonymous = !site.reportsAs;
    if (!anonymous && known.has(site.reportsAs as string)) continue;
    const reason = anonymous ? 'reports under no name' as const : 'name is not in the registry' as const;
    rows.push({
      location: `${site.file}:${site.line}`,
      kind: site.kind,
      schedule: site.schedule,
      reports_as: site.reportsAs,
      reason,
      proposed_row: {
        agent_name: site.reportsAs ?? `[name this timer: ${site.file.split('/').pop()}:${site.line}]`,
        trigger_type: 'cron',
        schedule: site.schedule,
        enabled: false,
        reason: anonymous
          ? 'Wrap the body in instrumentCronJob with this name, then enable the row.'
          : 'The code already reports under this name, but no registry row receives it.',
      },
      status: anonymous ? 'Needs a row' : 'Names a missing row',
      tone: 'warn',
    });
  }
  return rows.sort((a, b) => a.location.localeCompare(b.location));
}

/**
 * Panel C — Last run, per job.
 *
 * `error_class` is `none` on success and `unclassified` on a failure we have no class for,
 * because `ai_agent_activity_logs` stores a message and a stack but no class. Only
 * `dead_letter_jobs` carries one, and only after a job has failed past the retry limit. An
 * `unclassified` row is therefore a gap in the record, and prints as one rather than blank.
 */
export function buildRuns(r: FleetReadings): LastRunRow[] {
  const latest = byId(r.latestRuns);
  const classes = new Map(r.deadLetters.map((d) => [d.job_name, d.error_class]));
  return r.agents
    .map((a): LastRunRow => {
      const run = latest.get(a.id);
      if (!run) {
        return {
          agent_name: a.agent_name,
          schedule: a.schedule,
          schedule_label: humanSchedule(a.schedule),
          last_fire_at: null,
          duration_ms: null,
          outcome: 'No record',
          error_class: 'no record',
          trace_id: null,
          tone: 'warn',
        };
      }
      const failed = run.result === 'failed';
      return {
        agent_name: a.agent_name,
        schedule: a.schedule,
        schedule_label: humanSchedule(a.schedule),
        last_fire_at: run.created_at.toISOString(),
        duration_ms: run.duration_ms,
        outcome: failed ? 'Failed' : 'OK',
        error_class: failed ? (classes.get(a.agent_name) || 'unclassified') : 'none',
        trace_id: run.trace_id,
        tone: failed ? 'bad' : 'ok',
      };
    })
    .sort((x, y) => toneRank(x.tone) - toneRank(y.tone) || x.agent_name.localeCompare(y.agent_name));
}

/**
 * Panel D — Silent since. A job whose last SUCCESS is older than its own schedule allows.
 *
 * Last success, not last run. `cronInstrumentation` stamps `last_run_at` on a failure too,
 * so a job failing every five minutes looks perfectly punctual by last-run and is exactly
 * the outage this panel exists to name.
 *
 * A job we have never seen succeed is left out rather than reported as infinitely silent:
 * it is already standing in Live fleet as "No report ever", and saying it twice in two
 * different ways would double-count one problem.
 */
export function buildSilent(r: FleetReadings): SilentRow[] {
  const activity = byId(r.activity);
  const rows: SilentRow[] = [];
  for (const a of r.agents) {
    const act = activity.get(a.id);
    if (!act?.last_success_at) continue;
    const interval = calculateExpectedIntervalMs(a.schedule);
    if (interval === null) continue; // an expression we cannot read gives us nothing to compare
    const silentFor = r.now.getTime() - act.last_success_at.getTime();
    const factor = silentFor / interval;
    if (factor < SILENT_OVERDUE_FACTOR) continue;
    rows.push({
      agent_name: a.agent_name,
      schedule: a.schedule,
      schedule_label: humanSchedule(a.schedule),
      expected_interval_ms: interval,
      last_success_at: act.last_success_at.toISOString(),
      silent_for_ms: silentFor,
      overdue_factor: Math.floor(factor),
      status: `Silent ${humanDuration(silentFor)}`,
      tone: factor >= SILENT_OVERDUE_FACTOR * 2 ? 'bad' : 'warn',
    });
  }
  return rows.sort((a, b) => (b.silent_for_ms ?? 0) - (a.silent_for_ms ?? 0));
}

export function buildCoverage(r: FleetReadings, live: LiveFleetRow[], untracked: UntrackedTimerRow[]): FleetCoverage {
  return {
    lookback_days: r.lookbackDays,
    registry_cron_agents: r.agents.length,
    reporting: live.filter((l) => l.coverage === 'reporting').length,
    never_reported: live.filter((l) => l.coverage === 'never_reported').length,
    timer_sites: r.timerSites.length,
    untracked_sites: untracked.length,
  };
}

export function buildFleet(r: FleetReadings): FleetPanels {
  const live = buildLive(r);
  const untracked = buildUntracked(r);
  return {
    window_hours: r.windowHours,
    generated_at: r.now.toISOString(),
    coverage: buildCoverage(r, live, untracked),
    live,
    untracked,
    runs: buildRuns(r),
    silent: buildSilent(r),
  };
}
