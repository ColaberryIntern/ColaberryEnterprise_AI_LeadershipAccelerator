/**
 * The Agent Factory audit: does the board still match production?
 *
 * ## Why this exists
 *
 * On 12 November 2026 an audit of the Agent Factory list found 34 open tickets, every one
 * of them assigned to Ali, 16 overdue and six of those by 25 to 28 days. That was not the
 * finding. The finding was underneath it: **the path from "built" to "working employee"
 * had never been completed once, by anyone.** Every table that records a step of it held
 * zero rows — no build authorization, no capability confirmation, no change request, no
 * tool grant, no tool request of any kind.
 *
 * Nobody had hidden that. It simply was not a number anyone looked at. The board recorded
 * INTENT and nothing compared it with what production could show, so the list drifted for
 * a month while reading as busy.
 *
 * So this is the comparison, as a command. The rule it exists to serve: **a ticket stays
 * on the list only if it changes one of these numbers.**
 *
 * ## Why the verdict is computed and not written
 *
 * A report that prints counts and leaves the reader to judge them is the thing that
 * already failed. Zero rows in `agent_domain_build_authorizations` is not a statistic, it
 * is "every Release 2 is locked and has been since 18 October" — and that sentence is what
 * someone acts on. `assess()` is pure and tested, so the judgement is reproducible rather
 * than a matter of who happens to read the table.
 *
 * ## A trap this module is deliberately shaped around
 *
 * A zero can mean "nothing happened" or "we are counting the wrong thing", and those look
 * identical in a report. `agent_runs` taught that during this audit: it holds two rows,
 * from August, for one unrelated agent, so reading it as a run log would have said every
 * scheduled agent had never run. Each gate here therefore names the table it measured, so
 * a surprising zero can be checked rather than believed.
 */

export interface BuildRow {
  readonly domain_key: string;
  readonly intended_builder: string | null;
  readonly tasks: number;
  readonly complete: number;
  readonly in_progress: number;
  readonly verified: number;
}

export interface ManagerRow {
  readonly domain_key: string;
  readonly manager_can_reach: boolean;
  readonly manager_blocker: string | null;
}

/** One governance step, and how many times it has ever happened. */
export interface SpineRow {
  readonly step: string;
  readonly table_name: string;
  readonly rows: number;
}

export interface AuditInput {
  readonly builds: readonly BuildRow[];
  readonly managers: readonly ManagerRow[];
  readonly spine: readonly SpineRow[];
}

export interface Gate {
  readonly step: string;
  readonly table_name: string;
  readonly rows: number;
  /** True when this step has never once been completed. */
  readonly neverUsed: boolean;
}

export interface AuditVerdict {
  readonly assignedBuilds: number;
  readonly unassignedDomains: readonly string[];
  readonly totalTasks: number;
  readonly completeTasks: number;
  /** Whole percent, floored. Reported only for domains that HAVE a builder. */
  readonly percentComplete: number;
  readonly managersBlocked: readonly string[];
  readonly gates: readonly Gate[];
  readonly gatesNeverUsed: readonly Gate[];
  /** The one-line statements a reader acts on, most severe first. */
  readonly headlines: readonly string[];
}

/** A domain with no builder is not progress at 0%, it is unstaffed. Different problem. */
function isAssigned(b: BuildRow): boolean {
  return !!(b.intended_builder && b.intended_builder.trim());
}

/**
 * Judge the measured rows. PURE — no database, no clock, no environment — so the same
 * input always yields the same verdict and the tests can drive the interesting cases
 * (every gate cold, a gate warming up, a domain losing its builder) without a database.
 */
export function assess(input: AuditInput): AuditVerdict {
  const assigned = input.builds.filter(isAssigned);
  const unassignedDomains = input.builds.filter((b) => !isAssigned(b)).map((b) => b.domain_key);

  const totalTasks = assigned.reduce((n, b) => n + b.tasks, 0);
  const completeTasks = assigned.reduce((n, b) => n + b.complete, 0);
  // Floored, and guarded: an empty board is 0% rather than NaN, which would render as a
  // blank cell and read like a missing measurement instead of an empty one.
  const percentComplete = totalTasks > 0 ? Math.floor((completeTasks / totalTasks) * 100) : 0;

  const managersBlocked = input.managers
    .filter((m) => !m.manager_can_reach)
    .map((m) => m.domain_key);

  const gates: Gate[] = input.spine.map((s) => ({
    step: s.step,
    table_name: s.table_name,
    rows: s.rows,
    neverUsed: s.rows === 0,
  }));
  const gatesNeverUsed = gates.filter((g) => g.neverUsed);

  const headlines: string[] = [];

  // Most severe first, and the order is deliberate: a cold gate outranks slow progress,
  // because progress toward a gate nobody can pass is not progress.
  if (gatesNeverUsed.length === gates.length && gates.length > 0) {
    headlines.push(
      `The build-to-employee path has never completed once: all ${gates.length} governance `
      + 'steps have zero records.',
    );
  } else if (gatesNeverUsed.length > 0) {
    headlines.push(
      `${gatesNeverUsed.length} of ${gates.length} governance steps have never been used: `
      + `${gatesNeverUsed.map((g) => g.step).join(', ')}.`,
    );
  }

  if (managersBlocked.length > 0) {
    headlines.push(
      `${managersBlocked.length} of ${input.managers.length} managers cannot reach their `
      + `builder's agent: ${managersBlocked.join(', ')}.`,
    );
  }

  if (unassignedDomains.length > 0) {
    headlines.push(
      `${unassignedDomains.length} domains have no builder: ${unassignedDomains.join(', ')}.`,
    );
  }

  headlines.push(
    `${assigned.length} staffed builds: ${completeTasks} of ${totalTasks} tasks complete `
    + `(${percentComplete}%).`,
  );

  return {
    assignedBuilds: assigned.length,
    unassignedDomains,
    totalTasks,
    completeTasks,
    percentComplete,
    managersBlocked,
    gates,
    gatesNeverUsed,
    headlines,
  };
}

/** Fixed-width plain text. No colour and no unicode: this is read in a terminal and in email. */
export function render(v: AuditVerdict, builds: readonly BuildRow[]): string {
  const out: string[] = [];
  out.push('AGENT FACTORY AUDIT');
  out.push('');
  out.push('WHAT MATTERS');
  for (const h of v.headlines) out.push('  - ' + h);
  out.push('');

  out.push('BUILDS');
  out.push('  domain                builder                    tasks  done  in-prog');
  for (const b of [...builds].sort((x, y) => y.complete - x.complete)) {
    const builder = isAssigned(b) ? String(b.intended_builder) : '(UNASSIGNED)';
    out.push(
      '  ' + b.domain_key.padEnd(21) + builder.slice(0, 25).padEnd(27)
      + String(b.tasks).padStart(5) + String(b.complete).padStart(6)
      + String(b.in_progress).padStart(9),
    );
  }
  out.push('');

  out.push('GOVERNANCE STEPS (times ever completed)');
  for (const g of v.gates) {
    // The table is named on every line so a surprising zero can be checked rather than
    // believed. See the `agent_runs` note in this file's header.
    out.push(
      '  ' + (g.neverUsed ? 'NEVER  ' : String(g.rows).padStart(5) + '  ')
      + g.step.padEnd(28) + g.table_name,
    );
  }
  return out.join('\n');
}
