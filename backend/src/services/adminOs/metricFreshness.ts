/**
 * How old a metric's newest input is, and whether that is old enough to say so
 * (Growth Journey Phase 6, T605).
 *
 * ─── WHY A REGISTRY NEEDS THIS AT ALL ───────────────────────────────────────
 *
 * `metricRegistry.ts` already refuses to let a metric render a plausible number
 * it cannot compute - `unavailable` and `invalid` are not zero. It had no way
 * to say the opposite failure: a number that CAN be computed, is computed
 * correctly, and is describing last Tuesday. The journey's figures are mostly
 * produced by two scheduled agents, both shipped disabled, so "the decision
 * rate is 0%" and "nothing has run since we turned it on" look identical on a
 * screen and mean completely different things to whoever is deciding whether
 * to widen a rollout.
 *
 * So each journey metric declares where its value comes from and how old it may
 * be, and this decides `fresh | stale | never` at read time. Pure: it takes the
 * timestamps and the clock, reads nothing, and never throws.
 *
 * ─── THREE VERDICTS, AND WHY 'never' IS NOT 'stale' ─────────────────────────
 *
 *   fresh   the newest input is within `max_age_hours`
 *   stale   there IS an input, and it is older than that
 *   never   there is no input at all - the agent has not run, or the window
 *           holds no rows
 *
 * `never` earns its own verdict because it is the state the whole Phase 6
 * launch sits in: dark, nothing has run, and every rate is legitimately
 * unknown. Collapsing it into `stale` would read as "this used to work", and a
 * reader deciding whether the system is healthy needs those apart.
 *
 * A source timestamp in the FUTURE is treated as `stale`, not `fresh`, and says
 * so: a clock skew between the app and the database is a reason to distrust the
 * age, and the safe direction for a freshness claim is downward.
 */

/** Where a metric's value comes from, and how old it may be before a reader should be told. */
export interface MetricFreshnessRule {
  /**
   * `live` - computed from rows at read time, so its age is the newest row's.
   * `nightly:<agent>` / `cron:<agent>` - produced by that scheduled agent, so
   * its age is the agent's last run, whatever the rows say.
   */
  source: 'live' | `nightly:${string}` | `cron:${string}`;
  max_age_hours: number;
}

export interface MetricFreshnessInputs {
  /** The newest row the metric read, if any. */
  sourceMaxAt?: Date | null;
  /** The declared agent's `last_run_at`, if the row exists and it has ever run. */
  agentLastRunAt?: Date | null;
}

export type MetricFreshnessVerdict = 'fresh' | 'stale' | 'never';

export interface MetricFreshness {
  verdict: MetricFreshnessVerdict;
  /** Hours between the relevant timestamp and `now`; null when there is none. */
  age_hours: number | null;
  /** Always present, always short, always says which timestamp was used. */
  reason: string;
  /** The rule's own source, echoed so a reader does not have to look it up. */
  source: MetricFreshnessRule['source'];
  max_age_hours: number;
}

const HOUR = 3_600_000;

/** The agent a `nightly:` / `cron:` rule names, or null for a live rule. */
export function freshnessAgentOf(rule: MetricFreshnessRule): string | null {
  const [kind, agent] = rule.source.split(':');
  return kind === 'live' ? null : (agent ?? null);
}

export function metricFreshness(
  rule: MetricFreshnessRule,
  inputs: MetricFreshnessInputs,
  now: Date = new Date(),
): MetricFreshness {
  const agent = freshnessAgentOf(rule);
  // A scheduled metric's age is its AGENT's last run, not its rows': rows written by hand, by a
  // backfill or by another service do not mean the agent produced this figure.
  const at = agent ? (inputs.agentLastRunAt ?? null) : (inputs.sourceMaxAt ?? null);
  const which = agent ? `${agent} last run` : 'newest row';
  const base = { source: rule.source, max_age_hours: rule.max_age_hours };

  if (!at) {
    return { ...base, verdict: 'never', age_hours: null, reason: agent ? `${agent} has never run` : 'no rows in the window' };
  }
  const ageMs = now.getTime() - at.getTime();
  if (ageMs < 0) {
    return { ...base, verdict: 'stale', age_hours: 0, reason: `${which} is in the future (clock skew), so the age is not trusted` };
  }
  const ageHours = Math.round((ageMs / HOUR) * 100) / 100;
  if (ageHours > rule.max_age_hours) {
    return { ...base, verdict: 'stale', age_hours: ageHours, reason: `${which} is ${ageHours}h old, past ${rule.max_age_hours}h` };
  }
  return { ...base, verdict: 'fresh', age_hours: ageHours, reason: `${which} is ${ageHours}h old, within ${rule.max_age_hours}h` };
}
