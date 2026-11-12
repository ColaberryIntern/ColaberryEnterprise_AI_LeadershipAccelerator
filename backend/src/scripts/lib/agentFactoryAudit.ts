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

/**
 * One domain's manager access, as COMPUTED by `agentManagerReach`, carrying the stored flag
 * alongside only so the report can say where the two now disagree.
 *
 * The first version of this audit read `agent_domain_projects.manager_can_reach` and reported
 * it as fact. That field was wrong on three of ten rows, and this audit repeated the error
 * confidently — so the stored value is no longer an input to any judgement here, just a thing
 * to contradict. See `agentManagerReach.ts` for what replaced it and why.
 *
 * Deliberately a structural type rather than an import of `ManagerReachVerdict`: this module is
 * the pure judgement layer and has no dependencies at all, while the reach computation has to
 * import the section gate to avoid drifting from it. The runner maps one to the other.
 */
export interface ManagerRow {
  readonly domain_key: string;
  /** The stored `manager_can_reach`. Reported only as a disagreement, never believed. */
  readonly recorded_can_reach: boolean;
  /** The computed answer: does the access chain actually admit them? */
  readonly can_reach: boolean;
  readonly blocker: string | null;
  /** Which login carries them, when one does. 'legacy' is a finding in itself. */
  readonly via: 'bridge' | 'legacy' | null;
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
  /** Domains where the stored `manager_can_reach` contradicts the computed answer. */
  readonly managerFlagWrong: readonly string[];
  /** Domains whose manager gets in ONLY through a legacy full-admin login. */
  readonly managersOnLegacyOnly: readonly string[];
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
    .filter((m) => !m.can_reach)
    .map((m) => m.domain_key);
  const managerFlagWrong = input.managers
    .filter((m) => m.can_reach !== m.recorded_can_reach)
    .map((m) => m.domain_key);
  // Reaching the page only through a legacy admin_users row means the scoped path is broken
  // and a near-full grant is what is holding the surface up. That reads as healthy in any
  // boolean, so it has to be its own line.
  const managersOnLegacyOnly = input.managers
    .filter((m) => m.can_reach && m.via === 'legacy')
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

  // Above the staffing and progress lines, because a wrong stored flag is worse than a known
  // gap: a gap is acted on, and a wrong flag is believed. This audit's own first version read
  // that field as fact and reported three managers as locked out who were not.
  if (managerFlagWrong.length > 0) {
    headlines.push(
      `The stored manager_can_reach flag is WRONG on ${managerFlagWrong.length} of `
      + `${input.managers.length} domains: ${managerFlagWrong.join(', ')}. Trust this `
      + 'computation, not the column.',
    );
  }

  if (managersOnLegacyOnly.length > 0) {
    headlines.push(
      `${managersOnLegacyOnly.length} managers reach their agent ONLY through a legacy `
      + `full-admin login: ${managersOnLegacyOnly.join(', ')}. The scoped path is broken for `
      + 'them and a near-full grant is holding it up.',
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
    managerFlagWrong,
    managersOnLegacyOnly,
    gates,
    gatesNeverUsed,
    headlines,
  };
}

/**
 * Fixed-width plain text. No colour and no unicode: this is read in a terminal and in email.
 *
 * `managers` is optional so the headline-only callers and the existing tests keep working, but
 * the runner always passes it: a blocked manager is only actionable next to the MECHANISM that
 * refuses them, and the stored prose that used to supply that was wrong.
 */
export function render(
  v: AuditVerdict,
  builds: readonly BuildRow[],
  managers: readonly ManagerRow[] = [],
): string {
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

  if (managers.length > 0) {
    out.push('');
    out.push('MANAGER ACCESS (computed from the access chain, not from manager_can_reach)');
    out.push('  domain                reach  via      mechanism');
    for (const m of [...managers].sort((a, b) => Number(a.can_reach) - Number(b.can_reach))) {
      const flag = m.can_reach ? 'YES  ' : 'NO   ';
      const via = (m.via ?? '-').padEnd(9);
      // The blocker CODE, not prose: it is the thing to act on, and a paragraph in this column
      // is how the stored field became unreadable enough to go stale unnoticed.
      const why = m.can_reach
        ? (m.via === 'legacy' ? 'legacy full-admin login (scoped path broken)' : 'scoped staff login')
        : String(m.blocker ?? 'unknown');
      out.push('  ' + m.domain_key.padEnd(21) + flag + ' ' + via + why);
      if (m.can_reach !== m.recorded_can_reach) {
        out.push('  ' + ''.padEnd(21) + `       <- stored flag says ${m.recorded_can_reach}, which is wrong`);
      }
    }
  }

  return out.join('\n');
}
