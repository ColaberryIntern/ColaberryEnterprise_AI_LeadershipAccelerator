/**
 * scheduledAgentHealth — decide, for an agent the catalog says is enabled and on a
 * schedule, whether it is actually running.
 *
 * Why this exists: `ai_agents` is a CATALOG, seeded by `agentRegistrySeed`, and the
 * schedulers implement only a subset of it. An agent can carry `enabled = true` and a
 * valid cron string and still be wired to nothing, so the admin surface reports
 * capability the platform has never once exercised. On 2026-10-22, of 142 enabled
 * agents carrying a schedule, 23 had ZERO execution rows in their entire history and
 * 4 more had run exactly once and stopped — including `AuditAgent`, `GovernanceAgent`,
 * `MonitorAgent`, `Executive_Briefing_Agent` and `CurriculumQAAgent`.
 *
 * BOTH SOURCES ARE INCOMPLETE, AND THEY FAIL IN OPPOSITE DIRECTIONS. Measured on
 * 2026-10-22 across all 142 scheduled agents, of which 65 disagree:
 *
 *   - `ai_agents.run_count` under-reports, because several registry runners never write
 *     back to their own row. `WorkforceResearchDirector` carried `run_count = 0` while
 *     `ai_agent_activity_logs` held 12 rows, the newest four days old.
 *   - `ai_agent_activity_logs` ALSO under-reports, because some runners never write an
 *     activity row at all. `AutonomousEngine` carried `run_count = 11774` with ZERO log
 *     rows; likewise `AICOOStrategicCycle` (3925), `MetaAgentLoop` (1960) and
 *     `CoryEvolutionCycle` (277).
 *
 * So neither column alone can convict an agent of never running, and a dead list built
 * on either one is wrong in the way that discredits the whole report: the first few
 * entries a reader checks are busy agents, and they stop reading. The rule here is
 * therefore asymmetric, and it is the single idea in this file:
 *
 *   EITHER SOURCE MAY EXONERATE AN AGENT. NEITHER MAY CONVICT IT ALONE.
 *
 * `never_ran` requires silence in BOTH. An agent one source calls busy while the other
 * has nothing to date it by is `unverifiable` — a real and separate defect, since its
 * telemetry is broken — and must not be laundered into either of the other answers.
 */

/** What the catalog claims, joined to what the execution log actually holds. */
export interface ScheduledAgentRow {
  agent_name: string;
  /** The cron string the catalog advertises. */
  schedule: string;
  /** Rows in `ai_agent_activity_logs` for this agent. Can be 0 for a busy agent. */
  execution_count: number;
  /** Newest `ai_agent_activity_logs.created_at`, or null when there is none. */
  last_execution_at: Date | string | null;
  /** `ai_agents.run_count`. Can be 0 for a busy agent. May exonerate, never convict. */
  run_count?: number | null;
}

export type AgentHealth =
  /** Executed inside the window. */
  | 'running'
  /** Has executed at some point, but not inside the window. */
  | 'stalled'
  /** Both sources silent. Declared, wired to nothing. */
  | 'never_ran'
  /** One source reports runs, the other cannot date them. Broken telemetry. */
  | 'unverifiable';

/**
 * How long an agent may go without an execution before it counts as stalled. Deliberately
 * generous: the slowest schedule in the catalog is weekly (`0 7 * * 0`), so a window
 * shorter than a week would flag healthy weekly agents every time it ran. 8 days gives a
 * weekly agent one full miss plus a day of slack before anyone is woken up.
 */
export const STALLED_AFTER_HOURS = 8 * 24;

function toMs(value: Date | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Classify one scheduled agent.
 *
 * Order matters. The execution log is consulted first because it is the only source
 * that carries a TIMESTAMP, and therefore the only one that can tell running from
 * stalled. `run_count` is consulted second and only ever to pull an agent OUT of
 * `never_ran` — it has no timestamp, so it can establish that an agent ran but never
 * that it ran recently.
 *
 * A row with executions but no usable timestamp is `stalled`, not `running`: something
 * ran, and we cannot show it was recent, so the honest answer is the one that asks a
 * human to look rather than the one that reports health we cannot evidence.
 */
export function classifyAgent(
  row: ScheduledAgentRow,
  now: Date = new Date(),
  stalledAfterHours: number = STALLED_AFTER_HOURS,
): AgentHealth {
  if (!Number.isFinite(row.execution_count) || row.execution_count <= 0) {
    // No activity row. Before calling it dead, let the other source speak: a positive
    // `run_count` means it has run, and the only honest thing left to say is that we
    // cannot date it. This is the clause that keeps AutonomousEngine's 11,774 runs off
    // the dead list.
    const rc = row.run_count;
    if (typeof rc === 'number' && Number.isFinite(rc) && rc > 0) return 'unverifiable';
    return 'never_ran';
  }
  const last = toMs(row.last_execution_at);
  if (last === null) return 'stalled';
  return now.getTime() - last > stalledAfterHours * 3600 * 1000 ? 'stalled' : 'running';
}

export interface HealthReport {
  running: ScheduledAgentRow[];
  stalled: ScheduledAgentRow[];
  never_ran: ScheduledAgentRow[];
  unverifiable: ScheduledAgentRow[];
  /** Agents whose `run_count` disagrees with the execution log, in either direction. */
  run_count_disagrees: Array<{ agent_name: string; run_count: number; execution_count: number }>;
}

/** Classify a whole fleet and collect the `run_count` disagreements worth printing. */
export function buildHealthReport(
  rows: ScheduledAgentRow[],
  now: Date = new Date(),
  stalledAfterHours: number = STALLED_AFTER_HOURS,
): HealthReport {
  const report: HealthReport = {
    running: [], stalled: [], never_ran: [], unverifiable: [], run_count_disagrees: [],
  };
  for (const row of rows) {
    report[classifyAgent(row, now, stalledAfterHours)].push(row);
    const rc = row.run_count;
    if (typeof rc === 'number' && rc !== row.execution_count) {
      report.run_count_disagrees.push({
        agent_name: row.agent_name, run_count: rc, execution_count: row.execution_count,
      });
    }
  }
  return report;
}
