/**
 * cronRegistryRatchet — rows→verdict. The whole invariant as two pure functions.
 *
 * ── The defect this exists to catch ─────────────────────────────────────────────────
 * An agent is scheduled by an entry in SCHEDULE_REGISTRY (aiOpsScheduler.ts) or by an
 * instrumentCronJob() call elsewhere, and is *described* by a seed row in
 * agentRegistrySeed.ts whose `trigger_type: 'cron'` + `schedule` are what the admin
 * dashboard shows. Nothing in production compares the two. When they disagree:
 *
 *   - a seed row saying `trigger_type: 'cron'` with no cron site registering that name is
 *     an agent the dashboard shows as scheduled and which no timer ever fires. runAgent()
 *     (aiOrchestrator.ts:177-180) does AiAgent.findOne({ where: { agent_name } }) and returns
 *     null on a miss, so the failure is silent in both directions;
 *   - a *registered* name with no seed row runs, but instrumentCronJob() tracks its
 *     run_count/error_count against a row that does not exist, so it is permanently
 *     invisible to every health, staleness and trust surface built on ai_agents;
 *   - a name present on both sides with two different schedules means the schedule the
 *     dashboard advertises is not the schedule that fires, and a cron_schedule_configs
 *     override keyed on one label silently fails to move the other;
 *   - a *registered* name whose seed row declares a non-cron trigger and/or an empty
 *     schedule is the same harm from the other side: the dashboard renders that seed row,
 *     so it tells a reader this agent has no schedule while timers fire it. Invariants (i)
 *     and (iii) both miss it by construction — (i) only looks at rows that say `cron`, and
 *     (iii) only compares rows where BOTH sides carry a non-empty schedule — so without
 *     (iv) a row can deny having a schedule and nothing complains;
 *   - one agentName on several registry entries is several timers reporting run_count and
 *     error_count into a single ai_agents row. Nothing is unreachable, but the counters are
 *     pooled: a silent failure in one duty is indistinguishable from the others succeeding,
 *     and a cron_schedule_configs override keyed on that name moves whichever entry the
 *     loop reaches first. seedRows are asserted unique by the suite; registry rows were not.
 *
 * ── Why registration is a resolved SET and never a prefix ──────────────────────────
 * `registeredNames` must be every name a timer can actually fire, fully resolved: the two
 * scheduler registries, every instrumentCronJob() string literal, every resolved name
 * constant, and every template-literal site expanded through its real data (`Intel_` ×
 * the nine registered intel source slugs). This function does no prefix matching at all.
 * A `startsWith('Intel_')` test cleared any seed row beginning with those six characters
 * whether or not a source of that slug existed, which is a route to a false all-clear.
 *
 * ── Why a ratchet and not a pass/fail ──────────────────────────────────────────────
 * The lists already disagree in many measured places, so a plain assertion would be red on
 * arrival and deleted within a week. The baselines in cronRegistryBaseline.ts freeze
 * today's disagreements, each with the one-line reason it is there, and the guard fails on
 * anything NOT in them (new rot) AND on any baseline entry that has STOPPED disagreeing
 * (the entry must then be deleted). That second half is what makes this a ratchet rather
 * than an allowlist: the baseline can only ever shrink.
 */
import type { RegistryRow, SeedRow } from './cronRegistrySourceParser';

export interface Reconciliation {
  /** Seed rows advertising cron that no resolved registration can fire. */
  cronSeedRowsWithNoRegistration: string[];
  /** Resolved registrations — registry entries AND cron sites — with no ai_agents row. */
  scheduledNamesWithNoSeedRow: string[];
  /** `name|registrySchedule|seedSchedule` so a change to either side breaks the baseline. */
  scheduleDisagreements: string[];
  /** Registered names whose seed row denies carrying a schedule, as
   *  `name|triggerType|seedSchedule|firingSchedules` — every field that would have to change
   *  for the contradiction to end, so the ratchet forces the entry to be re-described. */
  registeredRowsDenyingSchedule: string[];
  /** One agentName on several registry entries, as `name|registries|everySchedule` (schedules
   *  listed per row, not deduplicated, so two rows sharing a schedule are still visible). */
  duplicateRegistryNames: string[];
}
export interface RatchetResult {
  newViolations: string[];
  healedBaselineEntries: string[];
}

/**
 * Rejects the shapes that `isolatedModules` lets reach runtime unannounced. ts-jest
 * transpiles without type checking, so a renamed, moved or deleted baseline export arrives
 * here as `undefined` and `new Set(undefined)` is an empty set — i.e. a dropped fixture
 * would have reported perfect health. An empty-string entry is rejected for the same
 * reason: it can never be observed, so it would be reported as "healed" forever instead of
 * as the typo it is.
 */
function requireNamedList(value: unknown, label: string): ReadonlyArray<string> {
  if (!Array.isArray(value)) {
    throw new Error(`ratchet: ${label} must be an array, got ${value === null ? 'null' : typeof value}`);
  }
  const bad = value.findIndex((v) => typeof v !== 'string' || v.trim() === '');
  if (bad >= 0) {
    throw new Error(`ratchet: ${label}[${bad}] must be a non-empty string, got ${JSON.stringify(value[bad])}`);
  }
  return value as ReadonlyArray<string>;
}

/** The whole invariant, as one pure function over the three resolved inputs. */
export function reconcile(
  seedRows: SeedRow[],
  registryRows: RegistryRow[],
  registeredNames: ReadonlyArray<string>,
): Reconciliation {
  const registered = new Set(requireNamedList(registeredNames, 'registeredNames'));
  const seedByName = new Map(seedRows.map((r) => [r.agentName, r]));

  const cronSeedRowsWithNoRegistration = seedRows
    .filter((r) => r.triggerType === 'cron' && !registered.has(r.agentName))
    .map((r) => r.agentName);

  const scheduledNamesWithNoSeedRow = [...registered].filter((n) => !seedByName.has(n));

  const scheduleDisagreements = registryRows
    .filter((r) => {
      const seed = seedByName.get(r.agentName);
      return !!seed && !!seed.schedule && !!r.hardcodedSchedule && seed.schedule !== r.hardcodedSchedule;
    })
    .map((r) => `${r.agentName}|${r.hardcodedSchedule}|${seedByName.get(r.agentName)!.schedule}`);

  /** Every schedule that actually fires this name. A name registered only by an
   *  instrumentCronJob() call has no registry row to read a cron expression from, and saying
   *  so is honest; inventing one would be worse. */
  const firingSchedules = (name: string): string => {
    const rows = registryRows.filter((r) => r.agentName === name);
    return rows.length ? rows.map((r) => r.hardcodedSchedule).sort().join(',') : 'instrumentCronJob';
  };

  const registeredRowsDenyingSchedule = [...registered]
    .map((name) => seedByName.get(name))
    .filter((seed): seed is SeedRow => !!seed && (seed.triggerType !== 'cron' || seed.schedule.trim() === ''))
    .map((seed) => `${seed.agentName}|${seed.triggerType}|${seed.schedule}|${firingSchedules(seed.agentName)}`);

  // Grouped over ALL registry rows rather than per registry, so the same name in two
  // different registries — two timers, one counter, same harm — is caught as well. The
  // registry labels are part of the entry, so moving a duplicate between registries is a
  // change the ratchet reports instead of absorbing.
  const countByName = new Map<string, number>();
  for (const r of registryRows) countByName.set(r.agentName, (countByName.get(r.agentName) ?? 0) + 1);
  const duplicateRegistryNames = [...countByName]
    .filter(([, count]) => count > 1)
    .map(([name]) => {
      const rows = registryRows.filter((r) => r.agentName === name);
      const registries = [...new Set(rows.map((r) => r.registry))].sort().join('+');
      return `${name}|${registries}|${rows.map((r) => r.hardcodedSchedule).sort().join(',')}`;
    });

  return {
    cronSeedRowsWithNoRegistration: [...new Set(cronSeedRowsWithNoRegistration)].sort(),
    scheduledNamesWithNoSeedRow: [...new Set(scheduledNamesWithNoSeedRow)].sort(),
    scheduleDisagreements: [...new Set(scheduleDisagreements)].sort(),
    registeredRowsDenyingSchedule: [...new Set(registeredRowsDenyingSchedule)].sort(),
    duplicateRegistryNames: [...new Set(duplicateRegistryNames)].sort(),
  };
}

/**
 * The ratchet. `newViolations` are observations absent from the baseline — new rot, and the
 * reason this guard exists. `healedBaselineEntries` are baseline entries that are no longer
 * observed — either fixed, or renamed/deleted — and they fail too, because a baseline that
 * is never pruned is an allowlist.
 */
export function ratchet(observed: ReadonlyArray<string>, baseline: ReadonlyArray<string>): RatchetResult {
  const live = new Set(requireNamedList(observed, 'observed'));
  const frozen = new Set(requireNamedList(baseline, 'baseline'));
  return {
    newViolations: [...live].filter((o) => !frozen.has(o)).sort(),
    healedBaselineEntries: [...frozen].filter((b) => !live.has(b)).sort(),
  };
}
