/**
 * One tick of the provider health loop: look at every occurrence that is on air or about to
 * be, ask the provider what it sees, and fold the answer in through the EXISTING command
 * service.
 *
 * It adds no state rules of its own. `applyProviderEvent` already decides that health may move
 * freely, that only the live/reconnecting pair may be entered this way, that a webhook can
 * never publish or end a broadcast, and that a stale delivery is ignored. Re-implementing any
 * of that here would be a second source of truth for the same question.
 *
 * MISS COUNTS LIVE IN MEMORY, DELIBERATELY. They exist to avoid reacting to a single blip, and
 * a process restart losing them costs at most one extra tick of patience — which errs toward
 * not flapping, the safe direction. Persisting them would add a write per occurrence per tick
 * to buy nothing.
 */
import { runProviderEvent } from './broadcastCommandService';
import { decideHealth, DEFAULT_MISS_THRESHOLD, Observation, ObservedState } from './broadcastHealthPolicy';
import type { ProviderHealth } from './broadcastStateMachine';

/** The occurrences worth observing. Terminal ones are never polled. */
export const OBSERVED_STATES: readonly ObservedState[] = ['backstage', 'live', 'reconnecting'];

export interface ObservableOccurrence {
  id: string;
  editorial_state: string;
  provider: string | null;
  provider_session_id: string | null;
}

export interface HealthRunnerDeps {
  /** Occurrences currently worth observing. Injected so a tick needs no database in tests. */
  loadObservable: () => Promise<ObservableOccurrence[]>;
  /** Ask the provider whether a stream is arriving. Rejection means unreadable, not absent. */
  observe: (occurrence: ObservableOccurrence) => Promise<boolean>;
  /** Fold a health event in. Defaults to the real command service. */
  applyEvent?: (occurrenceId: string, health: ProviderHealth, atMs: number) => Promise<unknown>;
  now?: () => number;
  threshold?: number;
  log?: (line: string) => void;
}

export interface TickResult {
  observed: number;
  reported: number;
  held: number;
  skipped: number;
  failed: number;
}

/** Consecutive non-live observations, per occurrence. Cleared when an occurrence goes quiet. */
const misses = new Map<string, number>();

/** Test-only: a tick's memory must not leak between cases. */
export function __resetHealthMemory(): void {
  misses.clear();
}

function logLine(event: string, context: Record<string, unknown>): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(), level: 'info', service: 'broadcast',
    event, outcome: 'success', context,
  });
}

/**
 * Run one tick. Never throws: a health loop that dies on one bad occurrence stops watching
 * every other class on the platform.
 */
export async function runHealthTick(deps: HealthRunnerDeps): Promise<TickResult> {
  const now = deps.now ?? (() => Date.now());
  const threshold = deps.threshold ?? DEFAULT_MISS_THRESHOLD;
  const log = deps.log ?? ((l: string) => console.warn(l));
  const applyEvent = deps.applyEvent
    ?? ((id: string, health: ProviderHealth, atMs: number) =>
      runProviderEvent(id, { health, occurredAtMs: atMs }, 0));

  const result: TickResult = { observed: 0, reported: 0, held: 0, skipped: 0, failed: 0 };

  let occurrences: ObservableOccurrence[];
  try {
    occurrences = await deps.loadObservable();
  } catch (err: any) {
    log(logLine('broadcast_health_tick_failed', { error: err?.message ?? 'unknown' }));
    return { ...result, failed: 1 };
  }

  // Stop tracking anything no longer on air, so the map cannot grow for the life of the
  // process. An occurrence that ended last week must not keep a counter forever.
  const liveIds = new Set(occurrences.map((o) => o.id));
  Array.from(misses.keys()).forEach((id) => { if (!liveIds.has(id)) misses.delete(id); });

  for (const occ of occurrences) {
    // An occurrence with no provider binding cannot be observed at all. That is L5.4's gap,
    // not a health fault, so it is skipped rather than reported as down.
    if (!occ.provider_session_id) {
      result.skipped += 1;
      continue;
    }

    result.observed += 1;
    let observation: Observation;
    try {
      observation = (await deps.observe(occ)) ? 'live' : 'absent';
    } catch {
      observation = 'unreadable';
    }

    const decision = decideHealth(
      observation,
      occ.editorial_state as ObservedState,
      misses.get(occ.id) ?? 0,
      threshold,
    );
    misses.set(occ.id, decision.misses);

    if (decision.report === null) { result.held += 1; continue; }

    try {
      await applyEvent(occ.id, decision.report, now());
      result.reported += 1;
      log(logLine('broadcast_health_reported', {
        occurrenceId: occ.id, health: decision.report, reason: decision.reason,
        from: occ.editorial_state,
      }));
    } catch (err: any) {
      // A failure to record health must not stop the loop reaching the next class.
      result.failed += 1;
      log(logLine('broadcast_health_apply_failed', {
        occurrenceId: occ.id, error: err?.message ?? 'unknown',
      }));
    }
  }

  return result;
}
