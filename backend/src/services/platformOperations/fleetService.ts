/**
 * Read what the Fleet tab needs, and hand it to the pure assembler.
 *
 * This file does the I/O and nothing else: four bounded reads, no judgement. Every decision
 * about what a reading MEANS lives in `buildFleet.ts`, which has no database and can be
 * tested without one.
 *
 * It reads only; nothing here writes, enables, disables or stops anything. The Fleet tab's
 * buttons are answered by the Controls tab's endpoints, which are a separate phase.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import AiAgent from '../../models/AiAgent';
import CronScheduleConfig from '../../models/CronScheduleConfig';
import DeadLetterJob from '../../models/DeadLetterJob';
import { TIMER_SCAN } from '../../data/platformOperations/timerScan';
import { AgentActivity, DeadLetter, FleetReadings, LatestRun, RegistryAgent, buildFleet } from './buildFleet';
import { FleetPanels } from './fleetTypes';

/** The window the tab's "in the last N hours" numbers are measured over. */
export const DEFAULT_WINDOW_HOURS = 24;
/**
 * How far back we look to decide whether a job reports at all.
 *
 * Bounded on purpose. "Has this agent EVER logged" over an unbounded table is a full scan
 * per page load, and this page is meant to be opened when something is wrong — exactly when
 * the database is least able to absorb one. Thirty days is long enough that a daily or
 * weekly job still counts as reporting, and the number is printed on the page so nobody
 * reads "no report" as a stronger claim than it is.
 */
export const DEFAULT_LOOKBACK_DAYS = 30;

/** Shape of the per-agent aggregate query. Raw SQL, so the result is typed at the call site. */
interface ActivityRow {
  agent_id: string;
  runs_in_window: string;
  runs_in_lookback: string;
  last_fire_at: Date | null;
  last_success_at: Date | null;
}

interface LatestRunRow {
  agent_id: string;
  created_at: Date;
  duration_ms: number | null;
  result: string | null;
  trace_id: string | null;
}

/**
 * The registry's claim: every enabled cron agent, with the schedule actually in force.
 *
 * `cron_schedule_configs` is the governance table the scheduler re-reads on reload, so an
 * override there is what will really run. Showing the seeded value instead would put a
 * schedule on the page that no longer applies.
 */
async function readRegistry(): Promise<RegistryAgent[]> {
  const [agents, overrides] = await Promise.all([
    AiAgent.findAll({
      where: { trigger_type: 'cron', enabled: true },
      attributes: ['id', 'agent_name', 'schedule'],
      order: [['agent_name', 'ASC']],
    }),
    CronScheduleConfig.findAll({ attributes: ['agent_name', 'active_schedule', 'enabled'] }),
  ]);

  const override = new Map<string, string>();
  for (const o of overrides) {
    if (o.enabled && o.active_schedule) override.set(o.agent_name, o.active_schedule);
  }

  return agents
    .filter((a) => Boolean(a.schedule) || override.has(a.agent_name))
    .map((a): RegistryAgent => {
      const o = override.get(a.agent_name);
      return {
        id: a.id,
        agent_name: a.agent_name,
        schedule: o ?? (a.schedule as string),
        schedule_source: o ? 'override' : 'registry',
      };
    });
}

async function readActivity(ids: string[], since: Date, lookbackSince: Date): Promise<AgentActivity[]> {
  if (ids.length === 0) return [];
  // Two shapes this repo has been bitten by, both runtime-only failures that no type
  // check catches:
  //   `IN (:ids)` rather than `= ANY(:ids)` — Sequelize expands an array replacement into a
  //   comma list, which ANY() cannot take.
  //   `agent_id::text` rather than `agent_id` — agent_id is a uuid column and the expanded
  //   list arrives as text literals, so an uncast comparison dies with
  //   `operator does not exist: uuid = text`.
  const rows = await sequelize.query<ActivityRow>(
    `SELECT agent_id,
            COUNT(*) FILTER (WHERE created_at >= :since)         AS runs_in_window,
            COUNT(*)                                             AS runs_in_lookback,
            MAX(created_at)                                      AS last_fire_at,
            MAX(created_at) FILTER (WHERE result = 'success')     AS last_success_at
       FROM ai_agent_activity_logs
      WHERE agent_id::text IN (:ids)
        AND created_at >= :lookbackSince
      GROUP BY agent_id`,
    { type: QueryTypes.SELECT, replacements: { ids, since, lookbackSince } },
  );
  return rows.map((r): AgentActivity => ({
    agent_id: r.agent_id,
    runs_in_window: Number(r.runs_in_window),
    runs_in_lookback: Number(r.runs_in_lookback),
    last_fire_at: r.last_fire_at ? new Date(r.last_fire_at) : null,
    last_success_at: r.last_success_at ? new Date(r.last_success_at) : null,
  }));
}

/** The single most recent run per agent, in one query rather than one query per agent. */
async function readLatestRuns(ids: string[], lookbackSince: Date): Promise<LatestRun[]> {
  if (ids.length === 0) return [];
  const rows = await sequelize.query<LatestRunRow>(
    `SELECT DISTINCT ON (agent_id)
            agent_id, created_at, duration_ms, result, trace_id
       FROM ai_agent_activity_logs
      WHERE agent_id::text IN (:ids)
        AND created_at >= :lookbackSince
      ORDER BY agent_id, created_at DESC`,
    { type: QueryTypes.SELECT, replacements: { ids, lookbackSince } },
  );
  return rows.map((r): LatestRun => ({
    agent_id: r.agent_id,
    created_at: new Date(r.created_at),
    duration_ms: r.duration_ms === null ? null : Number(r.duration_ms),
    result: r.result,
    trace_id: r.trace_id,
  }));
}

/** Unresolved dead letters, the only record in this schema that carries an error class. */
async function readDeadLetters(): Promise<DeadLetter[]> {
  const rows = await DeadLetterJob.findAll({
    where: { resolved: false },
    attributes: ['job_name', 'error_class'],
    order: [['created_at', 'DESC']],
  });
  const newestPerJob = new Map<string, DeadLetter>();
  for (const r of rows) {
    if (!newestPerJob.has(r.job_name)) {
      newestPerJob.set(r.job_name, { job_name: r.job_name, error_class: r.error_class ?? null });
    }
  }
  return [...newestPerJob.values()];
}

/** Everything the Fleet tab renders. */
export async function getFleetPanels(options: {
  windowHours?: number;
  lookbackDays?: number;
  now?: Date;
} = {}): Promise<FleetPanels> {
  const now = options.now ?? new Date();
  const windowHours = options.windowHours ?? DEFAULT_WINDOW_HOURS;
  const lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const since = new Date(now.getTime() - windowHours * 3600_000);
  const lookbackSince = new Date(now.getTime() - lookbackDays * 86_400_000);

  const agents = await readRegistry();
  const ids = agents.map((a) => a.id);
  const [activity, latestRuns, deadLetters] = await Promise.all([
    readActivity(ids, since, lookbackSince),
    readLatestRuns(ids, lookbackSince),
    readDeadLetters(),
  ]);

  const readings: FleetReadings = {
    now, windowHours, lookbackDays, agents, activity, latestRuns, deadLetters,
    timerSites: TIMER_SCAN.sites,
  };
  return buildFleet(readings);
}
