/**
 * The contract for the Fleet tab of /admin/system/operations.
 *
 * One question: what is running, and is it alive? Four panels answer it, and each row is
 * shaped so the page renders it without deciding anything. The page does not compute a
 * status, pick a colour, or work out whether silence is bad — all of that is decided here,
 * once, where the data is, and shipped as plain fields.
 */

/** The four status tones the design template defines. A row picks one; it never invents one. */
export type Tone = 'ok' | 'bad' | 'warn' | 'off';

/**
 * Whether a job has EVER reported a run.
 *
 * This distinction is the honest heart of the tab. `ai_agent_activity_logs` only receives a
 * row when a runner calls `instrumentCronJob`. A registry entry with no log rows is
 * therefore ambiguous in a way we cannot resolve from data: either it has genuinely never
 * fired, or it fires faithfully and reports nothing. Collapsing those two into "dead" would
 * put a red row against jobs that are working, and collapsing them into "fine" would hide
 * the ones that are not. So we say which of the two cases we are in and let a person judge.
 *
 * `never_reported` means "nothing within the lookback" (`FleetCoverage.lookback_days`), not
 * "nothing ever" — the log is read over a bounded window so one page load cannot aggregate
 * the whole table.
 */
export type Coverage = 'reporting' | 'never_reported';

/** One row of "Live fleet": what the registry claims, against what actually fired. */
export interface LiveFleetRow {
  agent_name: string;
  /** The schedule in force: the `cron_schedule_configs` override when one exists. */
  schedule: string;
  /** The same schedule as a person would say it. Falls back to the raw expression. */
  schedule_label: string;
  schedule_source: 'override' | 'registry';
  runs_in_window: number;
  last_fire_at: string | null;
  coverage: Coverage;
  /** The word printed on the pill. */
  status: string;
  tone: Tone;
}

/** The registry row an untracked timer would need, offered for a person to accept or reject. */
export interface ProposedRegistryRow {
  agent_name: string;
  trigger_type: 'cron';
  schedule: string | null;
  enabled: false;
  reason: string;
}

/** One row of "Untracked timers": a clock in the source with nothing watching it. */
export interface UntrackedTimerRow {
  /** `backend/src/server.ts:214` — where a person goes to look at it. */
  location: string;
  kind: 'cron' | 'interval';
  schedule: string | null;
  /** The name it reports under, when it reports at all. */
  reports_as: string | null;
  /** Why it is here: it names nothing, or it names something the registry does not hold. */
  reason: 'reports under no name' | 'name is not in the registry';
  proposed_row: ProposedRegistryRow;
  status: string;
  tone: Tone;
}

/** One row of "Last run, per job": what the logs would have told you. */
export interface LastRunRow {
  agent_name: string;
  schedule: string;
  schedule_label: string;
  last_fire_at: string | null;
  duration_ms: number | null;
  outcome: 'OK' | 'Failed' | 'No record';
  /**
   * `none` on success. On failure this is the `dead_letter_jobs.error_class` when the job
   * has failed past the retry limit, and `unclassified` otherwise — because
   * `ai_agent_activity_logs` records a message and a stack but no error class. An
   * `unclassified` count is a coverage gap, not a clean result.
   */
  error_class: string;
  trace_id: string | null;
  tone: Tone;
}

/** One row of "Silent since": a job whose last SUCCESS is older than its schedule allows. */
export interface SilentRow {
  agent_name: string;
  schedule: string;
  schedule_label: string;
  /** What the schedule implies, in ms. `null` when the expression is one we cannot read. */
  expected_interval_ms: number | null;
  last_success_at: string | null;
  silent_for_ms: number | null;
  /** How far past its own cadence it is, e.g. `19` for nineteen times its interval. */
  overdue_factor: number | null;
  status: string;
  tone: Tone;
}

/**
 * What this page can and cannot see, stated on the page itself.
 *
 * The design template's rule is that every card states the basis of its numbers. This is the
 * basis for the whole tab: a reader who knows 48 of 122 timers report under no name reads
 * "everything fired" very differently from one who does not.
 */
export interface FleetCoverage {
  /** How far back the activity log is read when deciding whether a job reports at all. */
  lookback_days: number;
  /** Enabled cron rows in `ai_agents` — the registry's claim. */
  registry_cron_agents: number;
  /** Of those, how many have ever written an activity log row. */
  reporting: number;
  never_reported: number;
  /** Timer call sites found in the source by the committed scan. */
  timer_sites: number;
  /** Of those, how many are watched by nothing. */
  untracked_sites: number;
}

/** Everything the Fleet tab renders, in one response. */
export interface FleetPanels {
  /** The window every "in the last N hours" number on this tab is measured over. */
  window_hours: number;
  generated_at: string;
  coverage: FleetCoverage;
  live: LiveFleetRow[];
  untracked: UntrackedTimerRow[];
  runs: LastRunRow[];
  silent: SilentRow[];
}
